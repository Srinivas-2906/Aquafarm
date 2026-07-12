import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { calculateDoc } from '../common/utils/date.utils';

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
        let doc: number | undefined;
        if (activeCycle) {
          const today = new Date();
          doc = calculateDoc(activeCycle.stockingDate, today);
        }
        return {
          id: pond.id,
          farmId: pond.farmId,
          name: pond.name,
          code: pond.code,
          type: pond.type,
          area: pond.area?.toString() ?? null,
          status: pond.status,
          activeCycle: activeCycle
            ? {
                id: activeCycle.id,
                pondId: activeCycle.pondId,
                cycleName: activeCycle.cycleName,
                stockingDate: activeCycle.stockingDate.toISOString().split('T')[0],
                species: activeCycle.species,
                usualMealsPerDay: activeCycle.usualMealsPerDay,
                status: activeCycle.status,
                doc,
              }
            : null,
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
}
