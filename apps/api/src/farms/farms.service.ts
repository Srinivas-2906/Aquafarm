import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { farmSchema, farmUpdateSchema } from '@aqualedger/validation';
import { isSelectableFarm } from '../common/constants/farm.constants';

@Injectable()
export class FarmsService {
  constructor(private prisma: PrismaService) {}

  async findAllForUser(userId: string, organizationId: string) {
    const farmUsers = await this.prisma.farmUser.findMany({
      where: { userId, status: 'ACTIVE' },
      include: { farm: true },
    });

    if (farmUsers.length > 0) {
      return farmUsers
        .filter((fu) => isSelectableFarm(fu.farm))
        .map((fu) => ({
          id: fu.farm.id,
          organizationId: fu.farm.organizationId,
          name: fu.farm.name,
          location: fu.farm.location,
          timezone: fu.farm.timezone,
          status: fu.farm.status,
        }));
    }

    const farms = await this.prisma.farm.findMany({
      where: { organizationId, status: 'ACTIVE' },
    });
    return farms
      .filter((f) => isSelectableFarm(f))
      .map((f) => ({
      id: f.id,
      organizationId: f.organizationId,
      name: f.name,
      location: f.location,
      timezone: f.timezone,
      status: f.status,
    }));
  }

  async findOne(farmId: string) {
    return this.prisma.farm.findUnique({ where: { id: farmId } });
  }

  async create(params: {
    organizationId: string;
    userId: string;
    userRole: 'OWNER' | 'SUPERVISOR';
    input: Record<string, unknown>;
  }) {
    const parsed = farmSchema.safeParse(params.input);
    if (!parsed.success) {
      const message = parsed.error.errors.map((e) => e.message).join(', ');
      throw new BadRequestException(message || 'Invalid farm');
    }

    const org = await this.prisma.organization.findUnique({ where: { id: params.organizationId } });
    if (!org) throw new NotFoundException('Organization not found');

    const farm = await this.prisma.farm.create({
      data: {
        organizationId: params.organizationId,
        name: parsed.data.name,
        location: parsed.data.location ?? null,
        timezone: parsed.data.timezone ?? 'Asia/Kolkata',
        status: 'ACTIVE',
        farmUsers: {
          create: {
            userId: params.userId,
            role: params.userRole,
            status: 'ACTIVE',
          },
        },
      },
    });

    return {
      id: farm.id,
      organizationId: farm.organizationId,
      name: farm.name,
      location: farm.location,
      timezone: farm.timezone,
      status: farm.status,
    };
  }

  async update(params: {
    farmId: string;
    organizationId: string;
    input: Record<string, unknown>;
  }) {
    const parsed = farmUpdateSchema.safeParse(params.input);
    if (!parsed.success) {
      const message = parsed.error.errors.map((e) => e.message).join(', ');
      throw new BadRequestException(message || 'Invalid farm');
    }

    const farm = await this.prisma.farm.findFirst({
      where: { id: params.farmId, organizationId: params.organizationId },
    });
    if (!farm || !isSelectableFarm(farm)) {
      throw new NotFoundException('Farm not found');
    }

    const updated = await this.prisma.farm.update({
      where: { id: params.farmId },
      data: {
        ...(parsed.data.name !== undefined ? { name: parsed.data.name } : {}),
        ...(parsed.data.location !== undefined ? { location: parsed.data.location || null } : {}),
        ...(parsed.data.timezone !== undefined ? { timezone: parsed.data.timezone } : {}),
      },
    });

    return {
      id: updated.id,
      organizationId: updated.organizationId,
      name: updated.name,
      location: updated.location,
      timezone: updated.timezone,
      status: updated.status,
    };
  }

  async archive(params: { farmId: string; organizationId: string }) {
    const farm = await this.prisma.farm.findFirst({
      where: { id: params.farmId, organizationId: params.organizationId },
    });
    if (!farm || !isSelectableFarm(farm)) {
      throw new NotFoundException('Farm not found');
    }

    await this.prisma.$transaction([
      this.prisma.farm.update({
        where: { id: params.farmId },
        data: { status: 'INACTIVE' },
      }),
      this.prisma.farmUser.updateMany({
        where: { farmId: params.farmId },
        data: { status: 'INACTIVE' },
      }),
    ]);

    return { id: farm.id, archived: true as const };
  }
}
