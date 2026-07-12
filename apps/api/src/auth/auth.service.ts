import { Injectable, UnauthorizedException, BadRequestException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../prisma/prisma.service';
import { OtpService } from './otp.service';
import { DEFAULTS } from '@aqualedger/config';
import { loginSchema, activateSchema, resetPinSchema } from '@aqualedger/validation';
import type { AuthUser, FarmAccess } from '@aqualedger/contracts';

@Injectable()
export class AuthService {
  constructor(
    private prisma: PrismaService,
    private jwt: JwtService,
    private config: ConfigService,
    private otp: OtpService,
  ) {}

  async login(phoneNumber: string, pin: string, userAgent?: string, ipAddress?: string) {
    const parsed = loginSchema.safeParse({ phoneNumber, pin });
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.errors[0]?.message || 'Invalid login');
    }

    const user = await this.prisma.user.findFirst({
      where: { phoneNumber, status: { in: ['ACTIVE', 'PENDING_ACTIVATION'] } },
      include: {
        farmUsers: {
          where: { status: 'ACTIVE' },
          include: { farm: true },
        },
      },
    });

    if (!user) {
      throw new UnauthorizedException('Phone number or PIN is incorrect');
    }

    if (user.lockedUntil && user.lockedUntil > new Date()) {
      throw new UnauthorizedException('Too many attempts. Please try again later.');
    }

    const valid = await bcrypt.compare(pin, user.pinHash);
    if (!valid) {
      const attempts = user.loginAttempts + 1;
      const update: { loginAttempts: number; lockedUntil?: Date } = { loginAttempts: attempts };
      if (attempts >= DEFAULTS.maxLoginAttempts) {
        update.lockedUntil = new Date(Date.now() + DEFAULTS.loginLockoutMinutes * 60 * 1000);
      }
      await this.prisma.user.update({ where: { id: user.id }, data: update });
      throw new UnauthorizedException('Phone number or PIN is incorrect');
    }

    if (user.status === 'PENDING_ACTIVATION') {
      throw new UnauthorizedException('Please activate your account first');
    }

    await this.prisma.user.update({
      where: { id: user.id },
      data: { loginAttempts: 0, lockedUntil: null, lastLoginAt: new Date() },
    });

    const tokens = await this.createTokens(user.id, user.organizationId, user.role, user.phoneNumber);
    await this.createSession(user.id, tokens.refreshToken, userAgent, ipAddress);

    return {
      user: this.mapUser(user),
      ...tokens,
    };
  }

  async activate(phoneNumber: string, activationCode: string, pin: string, displayName: string) {
    const parsed = activateSchema.safeParse({ phoneNumber, activationCode, pin, displayName });
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.errors[0]?.message);
    }

    const user = await this.prisma.user.findFirst({
      where: { phoneNumber, status: 'PENDING_ACTIVATION' },
    });

    if (!user || user.activationCode !== activationCode) {
      throw new BadRequestException('Invalid activation code');
    }

    const pinHash = await bcrypt.hash(pin, 12);
    await this.prisma.user.update({
      where: { id: user.id },
      data: { pinHash, displayName, status: 'ACTIVE', activationCode: null },
    });

    return { message: 'Account activated successfully' };
  }

  async resetPin(phoneNumber: string, otp: string, newPin: string) {
    const parsed = resetPinSchema.safeParse({ phoneNumber, otp, newPin });
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.errors[0]?.message);
    }

    const valid = await this.otp.verify(phoneNumber, otp);
    if (!valid) {
      throw new BadRequestException('Invalid or expired OTP');
    }

    const user = await this.prisma.user.findFirst({ where: { phoneNumber, status: 'ACTIVE' } });
    if (!user) {
      throw new BadRequestException('User not found');
    }

    const pinHash = await bcrypt.hash(newPin, 12);
    await this.prisma.user.update({
      where: { id: user.id },
      data: { pinHash, loginAttempts: 0, lockedUntil: null },
    });

    await this.prisma.session.deleteMany({ where: { userId: user.id } });
    return { message: 'PIN reset successfully' };
  }

  async requestOtp(phoneNumber: string) {
    const user = await this.prisma.user.findFirst({ where: { phoneNumber } });
    if (!user) {
      return { message: 'If this number is registered, an OTP has been sent' };
    }
    await this.otp.send(phoneNumber);
    return { message: 'If this number is registered, an OTP has been sent' };
  }

  async refresh(refreshToken: string) {
    const session = await this.prisma.session.findUnique({
      where: { refreshToken },
      include: { user: true },
    });

    if (!session || session.expiresAt < new Date()) {
      throw new UnauthorizedException('Session expired. Please log in again.');
    }

    const tokens = await this.createTokens(
      session.user.id,
      session.user.organizationId,
      session.user.role,
      session.user.phoneNumber,
    );

    await this.prisma.session.update({
      where: { id: session.id },
      data: { refreshToken: tokens.refreshToken, expiresAt: this.getRefreshExpiry() },
    });

    return tokens;
  }

  async logout(refreshToken?: string) {
    if (refreshToken) {
      await this.prisma.session.deleteMany({ where: { refreshToken } });
    }
    return { message: 'Logged out successfully' };
  }

  async getMe(userId: string): Promise<AuthUser> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: {
        farmUsers: {
          where: { status: 'ACTIVE' },
          include: { farm: true },
        },
      },
    });
    if (!user) throw new UnauthorizedException();
    return this.mapUser(user);
  }

  private async createTokens(userId: string, organizationId: string, role: string, phoneNumber: string) {
    const payload = { sub: userId, organizationId, role, phoneNumber };
    const accessToken = this.jwt.sign(payload, {
      secret: this.config.get('JWT_SECRET'),
      expiresIn: this.config.get('JWT_ACCESS_EXPIRES') || '15m',
    });
    const refreshToken = this.jwt.sign(payload, {
      secret: this.config.get('JWT_REFRESH_SECRET'),
      expiresIn: this.config.get('JWT_REFRESH_EXPIRES') || '7d',
    });
    return { accessToken, refreshToken };
  }

  private async createSession(
    userId: string,
    refreshToken: string,
    userAgent?: string,
    ipAddress?: string,
  ) {
    await this.prisma.session.create({
      data: {
        userId,
        refreshToken,
        userAgent,
        ipAddress,
        expiresAt: this.getRefreshExpiry(),
      },
    });
  }

  private getRefreshExpiry(): Date {
    const days = 7;
    return new Date(Date.now() + days * 24 * 60 * 60 * 1000);
  }

  private mapUser(user: {
    id: string;
    organizationId: string;
    phoneNumber: string;
    displayName: string;
    role: 'OWNER' | 'SUPERVISOR';
    preferredLanguage: 'en' | 'te';
    status: 'ACTIVE' | 'INACTIVE' | 'PENDING_ACTIVATION';
    farmUsers: Array<{ farmId: string; role: 'OWNER' | 'SUPERVISOR'; farm: { name: string; timezone: string } }>;
  }): AuthUser {
    const farms: FarmAccess[] = user.farmUsers.map((fu) => ({
      farmId: fu.farmId,
      farmName: fu.farm.name,
      role: fu.role as FarmAccess['role'],
      timezone: fu.farm.timezone,
    }));
    return {
      id: user.id,
      organizationId: user.organizationId,
      phoneNumber: user.phoneNumber,
      displayName: user.displayName,
      role: user.role as AuthUser['role'],
      preferredLanguage: user.preferredLanguage as AuthUser['preferredLanguage'],
      status: user.status as AuthUser['status'],
      farms,
    };
  }
}
