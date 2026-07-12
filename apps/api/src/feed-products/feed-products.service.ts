import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { InventoryService } from '../inventory/inventory.service';
import { AuditService } from '../audit/audit.service';
import { feedProductSchema, feedProductUpdateSchema } from '@aqualedger/validation';

@Injectable()
export class FeedProductsService {
  constructor(
    private prisma: PrismaService,
    private inventory: InventoryService,
    private audit: AuditService,
  ) {}

  async findByFarm(farmId: string) {
    const products = await this.prisma.feedProduct.findMany({
      where: { farmId, status: 'ACTIVE' },
      orderBy: { feedCode: 'asc' },
    });

    return Promise.all(products.map((product) => this.mapProduct(product)));
  }

  async findOne(id: string) {
    const product = await this.prisma.feedProduct.findUnique({ where: { id } });
    if (!product || product.status !== 'ACTIVE') {
      throw new NotFoundException('Feed product not found');
    }
    return this.mapProduct(product);
  }

  async create(
    farmId: string,
    organizationId: string,
    userId: string,
    input: Record<string, unknown>,
  ) {
    const parsed = feedProductSchema.safeParse(input);
    if (!parsed.success) {
      const message = parsed.error.errors.map((e) => e.message).join(', ');
      throw new BadRequestException(message || 'Invalid feed product');
    }

    const farm = await this.prisma.farm.findFirst({
      where: { id: farmId, organizationId, status: 'ACTIVE' },
    });
    if (!farm) {
      throw new NotFoundException('Farm not found');
    }

    const existing = await this.prisma.feedProduct.findUnique({
      where: { farmId_feedCode: { farmId, feedCode: parsed.data.feedCode } },
    });
    if (existing?.status === 'ACTIVE') {
      throw new BadRequestException('A feed with this code already exists');
    }

    const product = await this.prisma.feedProduct.create({
      data: {
        organizationId,
        farmId,
        brandName: parsed.data.brandName,
        feedCode: parsed.data.feedCode,
        pelletSize: parsed.data.pelletSize,
        bagWeightKg: parsed.data.bagWeightKg,
        supplierName: parsed.data.supplierName,
        lowStockThresholdKg: parsed.data.lowStockThresholdKg,
        status: 'ACTIVE',
      },
    });

    await this.audit.log({
      organizationId,
      farmId,
      userId,
      entityType: 'FEED_PRODUCT',
      entityId: product.id,
      action: 'CREATE',
      newValue: parsed.data as Record<string, unknown>,
    });

    return this.mapProduct(product);
  }

  async update(
    id: string,
    organizationId: string,
    userId: string,
    input: Record<string, unknown>,
  ) {
    const parsed = feedProductUpdateSchema.safeParse(input);
    if (!parsed.success) {
      const message = parsed.error.errors.map((e) => e.message).join(', ');
      throw new BadRequestException(message || 'Invalid feed product');
    }
    if (!Object.keys(parsed.data).length) {
      throw new BadRequestException('No changes provided');
    }

    const existing = await this.prisma.feedProduct.findFirst({
      where: { id, organizationId, status: 'ACTIVE' },
    });
    if (!existing) {
      throw new NotFoundException('Feed product not found');
    }

    if (parsed.data.feedCode && parsed.data.feedCode !== existing.feedCode) {
      const duplicate = await this.prisma.feedProduct.findUnique({
        where: { farmId_feedCode: { farmId: existing.farmId, feedCode: parsed.data.feedCode } },
      });
      if (duplicate && duplicate.id !== id && duplicate.status === 'ACTIVE') {
        throw new BadRequestException('A feed with this code already exists');
      }
    }

    const previousValue = {
      brandName: existing.brandName,
      feedCode: existing.feedCode,
      pelletSize: existing.pelletSize,
      bagWeightKg: existing.bagWeightKg.toString(),
      supplierName: existing.supplierName,
      lowStockThresholdKg: existing.lowStockThresholdKg?.toString() ?? null,
    };

    const product = await this.prisma.feedProduct.update({
      where: { id },
      data: {
        brandName: parsed.data.brandName,
        feedCode: parsed.data.feedCode,
        pelletSize: parsed.data.pelletSize,
        bagWeightKg: parsed.data.bagWeightKg,
        supplierName: parsed.data.supplierName,
        lowStockThresholdKg: parsed.data.lowStockThresholdKg,
      },
    });

    await this.audit.log({
      organizationId,
      farmId: existing.farmId,
      userId,
      entityType: 'FEED_PRODUCT',
      entityId: product.id,
      action: 'UPDATE',
      previousValue,
      newValue: parsed.data as Record<string, unknown>,
    });

    return this.mapProduct(product);
  }

  private async mapProduct(product: {
    id: string;
    farmId: string;
    brandName: string;
    feedCode: string;
    pelletSize: string | null;
    bagWeightKg: { toString(): string };
    supplierName: string | null;
    lowStockThresholdKg: { toString(): string } | null;
    status: string;
  }) {
    const stock = await this.inventory.getProductBalance(product.id);
    const bagWeight = parseFloat(product.bagWeightKg.toString());
    const stockKg = parseFloat(stock);
    const threshold = product.lowStockThresholdKg
      ? parseFloat(product.lowStockThresholdKg.toString())
      : 100;

    return {
      id: product.id,
      farmId: product.farmId,
      brandName: product.brandName,
      feedCode: product.feedCode,
      pelletSize: product.pelletSize,
      bagWeightKg: product.bagWeightKg.toString(),
      supplierName: product.supplierName,
      lowStockThresholdKg: product.lowStockThresholdKg?.toString() ?? null,
      status: product.status,
      currentStockKg: stock,
      equivalentBags: bagWeight > 0 ? Math.floor(stockKg / bagWeight) : 0,
      isLowStock: stockKg < threshold,
    };
  }
}
