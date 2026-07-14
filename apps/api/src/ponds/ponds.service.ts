import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { calculateDoc } from '../common/utils/date.utils';
import { pondSchema } from '@aqualedger/validation';

@Injectable()
export class PondsService {
  constructor(private prisma: PrismaService) {}

  async findByFarm(farmId: string) {
    const ponds = await this.prisma.pond.findMany({
      where: { farmId, status: 'ACTIVE' },
      orderBy: { code: 'asc' },
    });

    const result = await Promise.all(
      ponds.map(async (pond) => {
        const activeCycle = await this.prisma.cultureCycle.findFirst({
          where: { pondId: pond.id, status: 'ACTIVE' },
        });
        return {
          id: pond.id,
          farmId: pond.farmId,
          name: pond.name,
          code: pond.code,
          type: pond.type,
          area: pond.area?.toString() ?? null,
          status: pond.status,
          activeCycle: activeCycle ? this.mapActiveCycle(activeCycle) : null,
        };
      }),
    );
    return result;
  }

  async findOne(pondId: string) {
    const pond = await this.prisma.pond.findUnique({ where: { id: pondId } });
    if (!pond) return null;
    const activeCycle = await this.prisma.cultureCycle.findFirst({
      where: { pondId, status: 'ACTIVE' },
    });
    return { ...pond, area: pond.area?.toString(), activeCycle };
  }

  async create(params: {
    farmId: string;
    organizationId: string;
    input: Record<string, unknown>;
  }) {
    const parsed = pondSchema.safeParse(params.input);
    if (!parsed.success) {
      const message = parsed.error.errors.map((e) => e.message).join(', ');
      throw new BadRequestException(message || 'Invalid tank');
    }

    const farm = await this.prisma.farm.findFirst({
      where: { id: params.farmId, organizationId: params.organizationId, status: 'ACTIVE' },
    });
    if (!farm) throw new NotFoundException('Farm not found');

    const pond = await this.prisma.pond.create({
      data: {
        organizationId: params.organizationId,
        farmId: params.farmId,
        name: parsed.data.name,
        code: parsed.data.code,
        type: parsed.data.type,
        area: parsed.data.area,
        areaUnit: parsed.data.areaUnit,
        capacity: parsed.data.capacity,
        status: 'ACTIVE',
      },
    });

    const activeCycle = await this.createDefaultCycle({
      organizationId: params.organizationId,
      farmId: params.farmId,
      pondId: pond.id,
      pondName: pond.name,
    });

    return {
      id: pond.id,
      farmId: pond.farmId,
      name: pond.name,
      code: pond.code,
      type: pond.type,
      area: pond.area?.toString() ?? null,
      status: pond.status,
      activeCycle: this.mapActiveCycle(activeCycle),
    };
  }

  async ensureActiveCycle(pondId: string, organizationId: string) {
    const pond = await this.prisma.pond.findFirst({
      where: { id: pondId, organizationId, status: 'ACTIVE' },
    });
    if (!pond) throw new NotFoundException('Tank not found');

    const existing = await this.prisma.cultureCycle.findFirst({
      where: { pondId, status: 'ACTIVE' },
    });
    if (existing) return this.mapActiveCycle(existing);

    const activeCycle = await this.createDefaultCycle({
      organizationId,
      farmId: pond.farmId,
      pondId: pond.id,
      pondName: pond.name,
    });
    return this.mapActiveCycle(activeCycle);
  }

  private async createDefaultCycle(params: {
    organizationId: string;
    farmId: string;
    pondId: string;
    pondName: string;
  }) {
    const stockingDate = new Date();
    stockingDate.setHours(0, 0, 0, 0);

    return this.prisma.cultureCycle.create({
      data: {
        organizationId: params.organizationId,
        farmId: params.farmId,
        pondId: params.pondId,
        cycleName: `${params.pondName} - Vannamei`,
        stockingDate,
        species: 'Vannamei',
        usualMealsPerDay: 4,
        status: 'ACTIVE',
      },
    });
  }

  private mapActiveCycle(activeCycle: {
    id: string;
    pondId: string;
    cycleName: string;
    stockingDate: Date;
    species: string;
    usualMealsPerDay: number;
    status: string;
  }) {
    const today = new Date();
    return {
      id: activeCycle.id,
      pondId: activeCycle.pondId,
      cycleName: activeCycle.cycleName,
      stockingDate: activeCycle.stockingDate.toISOString().split('T')[0],
      species: activeCycle.species,
      usualMealsPerDay: activeCycle.usualMealsPerDay,
      status: activeCycle.status,
      doc: calculateDoc(activeCycle.stockingDate, today),
    };
  }
}
