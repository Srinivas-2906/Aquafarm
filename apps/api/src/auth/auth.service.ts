import { Injectable, UnauthorizedException, BadRequestException, ForbiddenException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../prisma/prisma.service';
import { OtpService } from './otp.service';
import { DEFAULTS } from '@aqualedger/config';
import { loginSchema, activateSchema, inviteSupervisorSchema, resetPinSchema, setPinSchema } from '@aqualedger/validation';
import type { AuthUser, FarmAccess } from '@aqualedger/contracts';
import { isSelectableFarm } from '../common/constants/farm.constants';

@Injectable()
export class AuthService {
  constructor(
    private prisma: PrismaService,
    private jwt: JwtService,
    private config: ConfigService,
    private otp: OtpService,
  ) {}

  private async syncSupervisorFarmAccess(userId: string, organizationId: string) {
    const orgFarms = (await this.prisma.farm.findMany({
      where: { organizationId, status: 'ACTIVE' },
      select: { id: true, status: true },
    })).filter(isSelectableFarm);

    const farmIds = orgFarms.map((f) => f.id);
    if (farmIds.length === 0) return;

    await this.prisma.$transaction(async (tx) => {
      await Promise.all(
        farmIds.map((farmId) =>
          tx.farmUser.upsert({
            where: { farmId_userId: { farmId, userId } },
            update: { role: 'SUPERVISOR', status: 'ACTIVE' },
            create: { farmId, userId, role: 'SUPERVISOR', status: 'ACTIVE' },
          }),
        ),
      );

      // If supervisor had access to farms outside the org active farms, deactivate so lists stay consistent.
      await tx.farmUser.updateMany({
        where: {
          userId,
          status: 'ACTIVE',
          farmId: { notIn: farmIds },
        },
        data: { status: 'INACTIVE' },
      });
    });
  }

  async inviteSupervisor(
    data: { farmId: string; phoneNumber: string; pin: string },
    owner: { userId: string; organizationId: string },
  ) {
    const parsed = inviteSupervisorSchema.safeParse(data);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.errors[0]?.message || 'Invalid invite');
    }

    // Keep supervisor farms aligned with the organization's farms (same farms owner sees).
    // We validate the selected farmId belongs to this organization and is selectable.
    const orgFarms = (await this.prisma.farm.findMany({
      where: { organizationId: owner.organizationId, status: 'ACTIVE' },
    })).filter(isSelectableFarm);

    const orgFarmIds = new Set(orgFarms.map((f) => f.id));
    if (!orgFarmIds.has(parsed.data.farmId)) {
      throw new ForbiddenException('Not allowed to invite for this farm');
    }

    const pinHash = await bcrypt.hash(parsed.data.pin, 12);
    const existing = await this.prisma.user.findFirst({
      where: { organizationId: owner.organizationId, phoneNumber: parsed.data.phoneNumber },
      include: {
        farmUsers: {
          where: { status: 'ACTIVE' },
          include: { farm: true },
        },
      },
    });

    if (existing?.role === 'OWNER') {
      throw new BadRequestException('Cannot invite an owner account with this phone number');
    }

    const user = await this.prisma.$transaction(async (tx) => {
      const u = existing
        ? await tx.user.update({
            where: { id: existing.id },
            data: {
              pinHash,
              mustChangePin: true,
              status: 'ACTIVE',
              activationCode: null,
              loginAttempts: 0,
              lockedUntil: null,
            },
          })
        : await tx.user.create({
            data: {
              organizationId: owner.organizationId,
              phoneNumber: parsed.data.phoneNumber,
              displayName: 'Supervisor',
              role: 'SUPERVISOR',
              pinHash,
              mustChangePin: true,
              status: 'ACTIVE',
            },
          });

      // Ensure supervisor has access to the same farms the owner can see.
      const farmIds = [...orgFarmIds];
      await Promise.all(
        farmIds.map((farmId) =>
          tx.farmUser.upsert({
            where: { farmId_userId: { farmId, userId: u.id } },
            update: { role: 'SUPERVISOR', status: 'ACTIVE' },
            create: { farmId, userId: u.id, role: 'SUPERVISOR', status: 'ACTIVE' },
          }),
        ),
      );

      // If supervisor had access to farms the owner doesn't, deactivate them so lists match.
      await tx.farmUser.updateMany({
        where: {
          userId: u.id,
          status: 'ACTIVE',
          farmId: { notIn: farmIds },
        },
        data: { status: 'INACTIVE' },
      });

      return u;
    });

    // Re-fetch with farmUsers to ensure consistent response
    const finalUser = await this.prisma.user.findUnique({
      where: { id: user.id },
      include: {
        farmUsers: {
          where: { status: 'ACTIVE' },
          include: { farm: true },
        },
      },
    });
    if (!finalUser) throw new BadRequestException('User not found');

    return {
      message: 'Supervisor invited successfully',
      user: this.mapUser(finalUser),
    };
  }

  async setPin(userId: string, newPin: string) {
    const parsed = setPinSchema.safeParse({ newPin });
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.errors[0]?.message || 'Invalid PIN');
    }

    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new UnauthorizedException();

    const pinHash = await bcrypt.hash(parsed.data.newPin, 12);
    await this.prisma.user.update({
      where: { id: userId },
      data: { pinHash, mustChangePin: false, loginAttempts: 0, lockedUntil: null },
    });

    return { message: 'PIN updated successfully' };
  }

  async signupOwner(
    input: {
      organizationName: string;
      ownerName: string;
      phoneNumber: string;
      pin: string;
      confirmPin: string;
    },
    userAgent?: string,
    ipAddress?: string,
  ) {
    if (input.pin !== input.confirmPin) {
      throw new BadRequestException('PIN and confirm PIN do not match');
    }

    const parsedLogin = loginSchema.safeParse({ phoneNumber: input.phoneNumber, pin: input.pin });
    if (!parsedLogin.success) {
      throw new BadRequestException(parsedLogin.error.errors[0]?.message || 'Invalid signup');
    }
    if (!input.organizationName?.trim() || input.organizationName.trim().length < 2) {
      throw new BadRequestException('Organization name is required');
    }
    if (!input.ownerName?.trim() || input.ownerName.trim().length < 2) {
      throw new BadRequestException('Owner name is required');
    }

    const existingOrgCount = await this.prisma.organization.count();
    if (existingOrgCount > 0 && this.config.get('ALLOW_OWNER_SIGNUP_ON_EXISTING_ORG') !== 'true') {
      throw new ForbiddenException('Owner signup is already completed for this deployment');
    }

    const pinHash = await bcrypt.hash(parsedLogin.data.pin, 12);

    const { orgId, ownerId } = await this.prisma.$transaction(async (tx) => {
      const org = await tx.organization.create({
        data: {
          name: input.organizationName.trim(),
          timezone: 'Asia/Kolkata',
          pondTerm: 'Tank',
          status: 'ACTIVE',
        },
      });

      const existingUser = await tx.user.findFirst({
        where: { organizationId: org.id, phoneNumber: parsedLogin.data.phoneNumber },
      });
      if (existingUser) {
        throw new BadRequestException('Phone number is already registered');
      }

      const owner = await tx.user.create({
        data: {
          organizationId: org.id,
          phoneNumber: parsedLogin.data.phoneNumber,
          displayName: input.ownerName.trim(),
          role: 'OWNER',
          pinHash,
          status: 'ACTIVE',
          mustChangePin: false,
        },
      });

      // Create a starter farm so the owner can use the app immediately after signup.
      const farm = await tx.farm.create({
        data: {
          organizationId: org.id,
          name: 'My Farm',
          timezone: org.timezone,
          status: 'ACTIVE',
        },
      });

      await tx.farmUser.create({
        data: {
          farmId: farm.id,
          userId: owner.id,
          role: 'OWNER',
          status: 'ACTIVE',
        },
      });

      return { orgId: org.id, ownerId: owner.id };
    });

    const user = await this.prisma.user.findUnique({
      where: { id: ownerId },
      include: {
        farmUsers: {
          where: { status: 'ACTIVE' },
          include: { farm: true },
        },
      },
    });
    if (!user) throw new UnauthorizedException();

    const tokens = await this.createTokens(user.id, orgId, user.role, user.phoneNumber);
    await this.createSession(user.id, tokens.refreshToken, userAgent, ipAddress);

    return {
      user: this.mapUser(user),
      ...tokens,
    };
  }

  async requestPinReset(phoneNumber: string, message?: string) {
    if (!/^[6-9]\d{9}$/.test(phoneNumber)) {
      throw new BadRequestException('Enter a valid 10-digit phone number');
    }

    await this.prisma.pinResetRequest.create({
      data: {
        phoneNumber,
        message: message?.trim() || null,
      },
    });

    return {
      message: 'Request submitted. Admin will reset your PIN and contact you shortly.',
    };
  }

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

    if (user.role === 'SUPERVISOR') {
      await this.syncSupervisorFarmAccess(user.id, user.organizationId);
    }

    const refreshed = user.role === 'SUPERVISOR'
      ? await this.prisma.user.findUnique({
          where: { id: user.id },
          include: {
            farmUsers: {
              where: { status: 'ACTIVE' },
              include: { farm: true },
            },
          },
        })
      : user;

    if (!refreshed) throw new UnauthorizedException();

    const tokens = await this.createTokens(user.id, user.organizationId, user.role, user.phoneNumber);
    await this.createSession(user.id, tokens.refreshToken, userAgent, ipAddress);

    return {
      user: this.mapUser(refreshed),
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
    mustChangePin: boolean;
    farmUsers: Array<{ farmId: string; role: 'OWNER' | 'SUPERVISOR'; farm: { id: string; name: string; timezone: string; status: string } }>;
  }): AuthUser {
    const farms: FarmAccess[] = user.farmUsers
      .filter((fu) => isSelectableFarm(fu.farm))
      .map((fu) => ({
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
      mustChangePin: user.mustChangePin,
      farms,
    };
  }
}
