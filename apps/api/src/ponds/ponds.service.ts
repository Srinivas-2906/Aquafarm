import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { calculateDoc, getFarmToday, parseDateOnly } from '../common/utils/date.utils';
import { pondSchema, pondUpdateSchema } from '@aqualedger/validation';

@Injectable()
export class PondsService {
  constructor(private prisma: PrismaService) {}

  async findByFarm(farmId: string) {
    const farm = await this.prisma.farm.findUnique({ where: { id: farmId } });
    const timezone = farm?.timezone || 'Asia/Kolkata';
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
          activeCycle: activeCycle ? this.mapActiveCycle(activeCycle, timezone) : null,
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
      stockingDate: getFarmToday(farm.timezone),
    });

    return {
      id: pond.id,
      farmId: pond.farmId,
      name: pond.name,
      code: pond.code,
      type: pond.type,
      area: pond.area?.toString() ?? null,
      status: pond.status,
      activeCycle: this.mapActiveCycle(activeCycle, farm.timezone),
    };
  }

  async update(params: {
    farmId: string;
    pondId: string;
    organizationId: string;
    input: Record<string, unknown>;
  }) {
    const parsed = pondUpdateSchema.safeParse(params.input);
    if (!parsed.success) {
      const message = parsed.error.errors.map((e) => e.message).join(', ');
      throw new BadRequestException(message || 'Invalid tank update');
    }

    const pond = await this.prisma.pond.findFirst({
      where: {
        id: params.pondId,
        farmId: params.farmId,
        organizationId: params.organizationId,
        status: 'ACTIVE',
      },
    });
    if (!pond) throw new NotFoundException('Tank not found');

    const updated = await this.prisma.pond.update({
      where: { id: pond.id },
      data: { name: parsed.data.name },
    });

    await this.prisma.cultureCycle.updateMany({
      where: { pondId: pond.id, status: 'ACTIVE' },
      data: { cycleName: `${parsed.data.name} - Vannamei` },
    });

    const activeCycle = await this.prisma.cultureCycle.findFirst({
      where: { pondId: pond.id, status: 'ACTIVE' },
    });

    const farm = await this.prisma.farm.findUnique({ where: { id: params.farmId } });
    const timezone = farm?.timezone || 'Asia/Kolkata';

    return {
      id: updated.id,
      farmId: updated.farmId,
      name: updated.name,
      code: updated.code,
      type: updated.type,
      area: updated.area?.toString() ?? null,
      status: updated.status,
      activeCycle: activeCycle ? this.mapActiveCycle(activeCycle, timezone) : null,
    };
  }

  async ensureActiveCycle(
    pondId: string,
    organizationId: string,
    input?: Record<string, unknown>,
  ) {
    const pond = await this.prisma.pond.findFirst({
      where: { id: pondId, organizationId, status: 'ACTIVE' },
    });
    if (!pond) throw new NotFoundException('Tank not found');

    const farm = await this.prisma.farm.findUnique({ where: { id: pond.farmId } });
    const timezone = farm?.timezone || 'Asia/Kolkata';

    const requestedStock =
      typeof input?.stockingDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(input.stockingDate)
        ? parseDateOnly(input.stockingDate)
        : null;

    const existing = await this.prisma.cultureCycle.findFirst({
      where: { pondId, status: 'ACTIVE' },
    });

    if (existing) {
      if (requestedStock && requestedStock < existing.stockingDate) {
        await this.prisma.cultureCycle.update({
          where: { id: existing.id },
          data: { stockingDate: requestedStock },
        });
        const entries = await this.prisma.feedingEntry.findMany({
          where: { cultureCycleId: existing.id, status: { not: 'VOIDED' } },
          select: { id: true, feedingDate: true, doc: true },
        });
        await Promise.all(
          entries.map((entry) => {
            const doc = calculateDoc(requestedStock, entry.feedingDate);
            if (entry.doc === doc) return Promise.resolve();
            return this.prisma.feedingEntry.update({
              where: { id: entry.id },
              data: { doc },
            });
          }),
        );
        const refreshed = await this.prisma.cultureCycle.findUnique({ where: { id: existing.id } });
        return this.mapActiveCycle(refreshed!, timezone);
      }
      return this.mapActiveCycle(existing, timezone);
    }

    const activeCycle = await this.createDefaultCycle({
      organizationId,
      farmId: pond.farmId,
      pondId: pond.id,
      pondName: pond.name,
      stockingDate: requestedStock ?? getFarmToday(timezone),
    });
    return this.mapActiveCycle(activeCycle, timezone);
  }

  private async createDefaultCycle(params: {
    organizationId: string;
    farmId: string;
    pondId: string;
    pondName: string;
    stockingDate: Date;
  }) {
    return this.prisma.cultureCycle.create({
      data: {
        organizationId: params.organizationId,
        farmId: params.farmId,
        pondId: params.pondId,
        cycleName: `${params.pondName} - Vannamei`,
        stockingDate: params.stockingDate,
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
  }, farmTimezone: string) {
    const today = getFarmToday(farmTimezone);
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
