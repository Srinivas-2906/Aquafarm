import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class FarmsService {
  constructor(private prisma: PrismaService) {}

  async findAllForUser(userId: string, organizationId: string) {
    const farmUsers = await this.prisma.farmUser.findMany({
      where: { userId, status: 'ACTIVE' },
      include: { farm: true },
    });

    if (farmUsers.length > 0) {
      return farmUsers.map((fu) => ({
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
    return farms.map((f) => ({
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
}
