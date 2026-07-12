import { Injectable } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../prisma/prisma.service';
import { BadRequestException } from '@nestjs/common';
import { UserRole } from '@prisma/client';

@Injectable()
export class UsersService {
  constructor(private prisma: PrismaService) {}

  async createSupervisor(
    organizationId: string,
    farmId: string,
    phoneNumber: string,
    displayName: string,
  ) {
    const existing = await this.prisma.user.findFirst({
      where: { organizationId, phoneNumber },
    });
    if (existing) {
      throw new BadRequestException('Phone number already registered');
    }

    const activationCode = Math.random().toString(36).substring(2, 8).toUpperCase();
    const tempPin = await bcrypt.hash('000000', 12);

    const user = await this.prisma.user.create({
      data: {
        organizationId,
        phoneNumber,
        displayName,
        role: UserRole.SUPERVISOR,
        pinHash: tempPin,
        status: 'PENDING_ACTIVATION',
        activationCode,
        farmUsers: {
          create: { farmId, role: UserRole.SUPERVISOR },
        },
      },
    });

    return { id: user.id, activationCode, message: 'Supervisor created. Share activation code.' };
  }

  async deactivate(userId: string) {
    await this.prisma.user.update({
      where: { id: userId },
      data: { status: 'INACTIVE' },
    });
    await this.prisma.session.deleteMany({ where: { userId } });
    return { message: 'User deactivated' };
  }

  async listSupervisors(organizationId: string) {
    return this.prisma.user.findMany({
      where: { organizationId, role: UserRole.SUPERVISOR },
      select: {
        id: true,
        phoneNumber: true,
        displayName: true,
        status: true,
        lastLoginAt: true,
        createdAt: true,
      },
    });
  }
}
