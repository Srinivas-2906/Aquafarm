import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { InventoryService } from '../inventory/inventory.service';

@Injectable()
export class FeedProductsService {
  constructor(
    private prisma: PrismaService,
    private inventory: InventoryService,
  ) {}

  async findByFarm(farmId: string) {
    const products = await this.prisma.feedProduct.findMany({
      where: { farmId, status: 'ACTIVE' },
      orderBy: { feedCode: 'asc' },
    });

    return Promise.all(
      products.map(async (p) => {
        const stock = await this.inventory.getProductBalance(p.id);
        const bagWeight = parseFloat(p.bagWeightKg.toString());
        const stockKg = parseFloat(stock);
        const threshold = p.lowStockThresholdKg
          ? parseFloat(p.lowStockThresholdKg.toString())
          : 100;
        return {
          id: p.id,
          farmId: p.farmId,
          brandName: p.brandName,
          feedCode: p.feedCode,
          pelletSize: p.pelletSize,
          bagWeightKg: p.bagWeightKg.toString(),
          supplierName: p.supplierName,
          status: p.status,
          currentStockKg: stock,
          equivalentBags: bagWeight > 0 ? Math.floor(stockKg / bagWeight) : 0,
          isLowStock: stockKg < threshold,
        };
      }),
    );
  }
}
