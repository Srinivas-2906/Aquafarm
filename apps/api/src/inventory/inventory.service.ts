import { Injectable, BadRequestException, NotFoundException, Inject, forwardRef } from '@nestjs/common';
import { InventoryTransaction } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { FeedProductsService } from '../feed-products/feed-products.service';
import { getTransactionDirection, decimalToString, sumDecimals, parseDateOnly, getFarmToday } from '../common/utils/date.utils';
import { inventoryTransactionSchema, setFarmInventoryTotalSchema, setProductInventorySchema, addFarmStockEntrySchema, updateFarmStockEntrySchema } from '@aqualedger/validation';
import { v4 as uuidv4 } from 'uuid';
import { formatInTimeZone, toZonedTime } from 'date-fns-tz';

@Injectable()
export class InventoryService {
  constructor(
    private prisma: PrismaService,
    private audit: AuditService,
    @Inject(forwardRef(() => FeedProductsService))
    private feedProducts: FeedProductsService,
  ) {}

  async getProductBalance(feedProductId: string): Promise<string> {
    const transactions = await this.prisma.inventoryTransaction.findMany({
      where: { feedProductId, status: 'CONFIRMED' },
    });

    let balance = 0;
    for (const t of transactions) {
      const qty = parseFloat(t.quantityKg.toString());
      balance += t.direction === 'IN' ? qty : -qty;
    }
    return balance.toFixed(3);
  }

  async getFarmTotal(farmId: string) {
    const summary = await this.getSummary(farmId);
    const totalStockKg = sumDecimals(summary.map((p) => p.currentStockKg));
    const total = parseFloat(totalStockKg);
    const latestTx = await this.prisma.inventoryTransaction.findFirst({
      where: {
        farmId,
        status: 'CONFIRMED',
        type: { in: ['MANUAL_ADJUSTMENT_IN', 'MANUAL_ADJUSTMENT_OUT'] },
      },
      orderBy: [{ transactionDate: 'desc' }, { createdAt: 'desc' }],
    });

    return {
      farmId,
      totalStockKg,
      numberOfBags: Math.max(0, Math.floor(total / 25)),
      asOfDate: latestTx
        ? latestTx.transactionDate.toISOString().split('T')[0]
        : null,
    };
  }

  async setFarmTotal(
    input: Record<string, unknown>,
    userId: string,
    organizationId: string,
  ) {
    const parsed = setFarmInventoryTotalSchema.safeParse(input);
    if (!parsed.success) {
      const message = parsed.error.errors.map((e) => e.message).join(', ');
      throw new BadRequestException(message || 'Invalid inventory total');
    }

    const { farmId } = parsed.data;
    const bagWeight = 25;
    const quantityKg =
      parsed.data.numberOfBags !== undefined
        ? (parsed.data.numberOfBags * bagWeight).toFixed(3)
        : parsed.data.quantityKg!;
    const numberOfBags = parsed.data.numberOfBags;

    const farm = await this.prisma.farm.findFirst({
      where: { id: farmId, organizationId, status: 'ACTIVE' },
    });
    if (!farm) {
      throw new NotFoundException('Farm not found');
    }

    const transactionDate =
      parsed.data.transactionDate ?? getFarmToday(farm.timezone).toISOString().split('T')[0];

    await this.feedProducts.findByFarm(farmId);

    const products = await this.prisma.feedProduct.findMany({
      where: { farmId, status: 'ACTIVE' },
      orderBy: { feedCode: 'asc' },
    });
    if (!products.length) {
      throw new BadRequestException('No feed products found for this farm');
    }

    const current = await this.getFarmTotal(farmId);
    const target = parseFloat(quantityKg);
    if (Math.abs(target - parseFloat(current.totalStockKg)) < 0.001) {
      return current;
    }

    const primary = products[0];
    const adjustmentRemarks =
      numberOfBags !== undefined
        ? `Manual stock adjustment (${numberOfBags} bags × ${bagWeight} kg)`
        : 'Manual farm stock adjustment';

    for (const product of products) {
      if (product.id === primary.id) continue;

      const balance = parseFloat(await this.getProductBalance(product.id));
      if (Math.abs(balance) < 0.001) continue;

      await this.createTransaction(
        {
          clientTransactionId: uuidv4(),
          farmId,
          feedProductId: product.id,
          type: balance > 0 ? 'MANUAL_ADJUSTMENT_OUT' : 'MANUAL_ADJUSTMENT_IN',
          quantityKg: Math.abs(balance).toFixed(3),
          transactionDate,
          remarks: 'Manual farm stock adjustment',
        },
        userId,
        organizationId,
      );
    }

    const primaryBalance = parseFloat(await this.getProductBalance(primary.id));
    const delta = target - primaryBalance;
    if (Math.abs(delta) >= 0.001) {
      await this.createTransaction(
        {
          clientTransactionId: uuidv4(),
          farmId,
          feedProductId: primary.id,
          type: delta > 0 ? 'MANUAL_ADJUSTMENT_IN' : 'MANUAL_ADJUSTMENT_OUT',
          quantityKg: Math.abs(delta).toFixed(3),
          transactionDate,
          remarks: adjustmentRemarks,
          ...(numberOfBags !== undefined && numberOfBags > 0 ? { numberOfBags } : {}),
        },
        userId,
        organizationId,
      );
    }

    return this.getFarmTotal(farmId);
  }

  async getFarmStockEntries(farmId: string) {
    const farmTotal = await this.getFarmTotal(farmId);
    const entries = await this.prisma.inventoryTransaction.findMany({
      where: {
        farmId,
        status: 'CONFIRMED',
        direction: 'IN',
        numberOfBags: { not: null },
        type: { in: ['FEED_RECEIVED', 'MANUAL_ADJUSTMENT_IN'] },
      },
      include: { feedProduct: true },
      orderBy: [{ transactionDate: 'desc' }, { createdAt: 'desc' }],
    });

    const totalBags = entries.reduce((sum, entry) => sum + (entry.numberOfBags ?? 0), 0);

    return {
      farmId,
      totalStockKg: farmTotal.totalStockKg,
      totalBags,
      entries: entries.map((entry) => ({
        id: entry.id,
        transactionDate: entry.transactionDate.toISOString().split('T')[0],
        feedProductId: entry.feedProductId,
        feedCode: entry.feedProduct?.feedCode ?? '',
        numberOfBags: entry.numberOfBags ?? 0,
        quantityKg: decimalToString(entry.quantityKg),
      })),
    };
  }

  async addFarmStockEntry(
    input: Record<string, unknown>,
    userId: string,
    organizationId: string,
  ) {
    const parsed = addFarmStockEntrySchema.safeParse(input);
    if (!parsed.success) {
      const message = parsed.error.errors.map((e) => e.message).join(', ');
      throw new BadRequestException(message || 'Invalid stock entry');
    }

    const { farmId, feedProductId, transactionDate, numberOfBags } = parsed.data;

    const farm = await this.prisma.farm.findFirst({
      where: { id: farmId, organizationId, status: 'ACTIVE' },
    });
    if (!farm) {
      throw new NotFoundException('Farm not found');
    }

    await this.feedProducts.findByFarm(farmId);

    const product = await this.prisma.feedProduct.findFirst({
      where: { id: feedProductId, farmId, organizationId, status: 'ACTIVE' },
    });
    if (!product) {
      throw new BadRequestException('Select a feed code');
    }

    const bagWeight = parseFloat(product.bagWeightKg.toString()) || 25;
    const quantityKg = (numberOfBags * bagWeight).toFixed(3);

    const tx = await this.createTransaction(
      {
        clientTransactionId: uuidv4(),
        farmId,
        feedProductId: product.id,
        type: 'FEED_RECEIVED',
        quantityKg,
        transactionDate,
        numberOfBags,
        remarks: 'Farm stock entry',
      },
      userId,
      organizationId,
    );

    return {
      id: tx.id,
      transactionDate: tx.transactionDate,
      feedProductId: product.id,
      feedCode: product.feedCode,
      numberOfBags,
      quantityKg: tx.quantityKg,
    };
  }

  async updateFarmStockEntry(
    entryId: string,
    input: Record<string, unknown>,
    userId: string,
    organizationId: string,
  ) {
    const parsed = updateFarmStockEntrySchema.safeParse(input);
    if (!parsed.success) {
      const message = parsed.error.errors.map((e) => e.message).join(', ');
      throw new BadRequestException(message || 'Invalid stock entry');
    }

    const original = await this.prisma.inventoryTransaction.findFirst({
      where: { id: entryId, organizationId, status: 'CONFIRMED' },
      include: { feedProduct: true },
    });
    if (!original) {
      throw new NotFoundException('Stock entry not found');
    }
    if (!original.numberOfBags) {
      throw new BadRequestException('This stock entry cannot be edited');
    }
    if (original.feedingEntryId) {
      throw new BadRequestException('This stock entry cannot be edited');
    }
    if (!['FEED_RECEIVED', 'MANUAL_ADJUSTMENT_IN'].includes(original.type)) {
      throw new BadRequestException('This stock entry cannot be edited');
    }

    const { feedProductId, transactionDate, numberOfBags } = parsed.data;
    const originalDate = original.transactionDate.toISOString().split('T')[0];
    const unchanged =
      original.feedProductId === feedProductId &&
      original.numberOfBags === numberOfBags &&
      originalDate === transactionDate;

    if (unchanged) {
      return {
        id: original.id,
        transactionDate: originalDate,
        feedProductId: original.feedProductId,
        feedCode: original.feedProduct?.feedCode ?? '',
        numberOfBags: original.numberOfBags,
        quantityKg: decimalToString(original.quantityKg),
      };
    }

    const product = await this.prisma.feedProduct.findFirst({
      where: {
        id: feedProductId,
        farmId: original.farmId,
        organizationId,
        status: 'ACTIVE',
      },
    });
    if (!product) {
      throw new BadRequestException('Select a feed code');
    }

    await this.reverseStockEntry(original, userId, 'Stock entry edited');

    const bagWeight = parseFloat(product.bagWeightKg.toString()) || 25;
    const quantityKg = (numberOfBags * bagWeight).toFixed(3);
    const remarks =
      original.type === 'MANUAL_ADJUSTMENT_IN'
        ? original.remarks ?? 'Manual stock adjustment'
        : 'Farm stock entry';

    const tx = await this.createTransaction(
      {
        clientTransactionId: uuidv4(),
        farmId: original.farmId,
        feedProductId: product.id,
        type: original.type,
        quantityKg,
        transactionDate,
        numberOfBags,
        remarks,
      },
      userId,
      organizationId,
    );

    return {
      id: tx.id,
      transactionDate: tx.transactionDate,
      feedProductId: product.id,
      feedCode: product.feedCode,
      numberOfBags,
      quantityKg: tx.quantityKg,
    };
  }

  async setProductStock(
    input: Record<string, unknown>,
    userId: string,
    organizationId: string,
  ) {
    const parsed = setProductInventorySchema.safeParse(input);
    if (!parsed.success) {
      const message = parsed.error.errors.map((e) => e.message).join(', ');
      throw new BadRequestException(message || 'Invalid inventory update');
    }

    const { farmId, feedProductId } = parsed.data;
    const farm = await this.prisma.farm.findFirst({
      where: { id: farmId, organizationId, status: 'ACTIVE' },
    });
    if (!farm) throw new NotFoundException('Farm not found');

    const product = await this.prisma.feedProduct.findFirst({
      where: { id: feedProductId, farmId, organizationId, status: 'ACTIVE' },
    });
    if (!product) throw new NotFoundException('Feed product not found');

    const bagWeight = parseFloat(product.bagWeightKg.toString()) || 25;
    const targetKg =
      parsed.data.numberOfBags !== undefined
        ? (parsed.data.numberOfBags * bagWeight).toFixed(3)
        : parsed.data.quantityKg!;

    const current = parseFloat(await this.getProductBalance(feedProductId));
    const delta = parseFloat(targetKg) - current;
    if (Math.abs(delta) < 0.001) {
      const summary = await this.getSummary(farmId);
      return summary.find((item) => item.feedProductId === feedProductId) ?? summary[0];
    }

    const today = getFarmToday(farm.timezone).toISOString().split('T')[0];
    await this.createTransaction(
      {
        clientTransactionId: uuidv4(),
        farmId,
        feedProductId,
        type: delta > 0 ? 'MANUAL_ADJUSTMENT_IN' : 'MANUAL_ADJUSTMENT_OUT',
        quantityKg: Math.abs(delta).toFixed(3),
        transactionDate: today,
        remarks:
          parsed.data.numberOfBags !== undefined
            ? `Manual stock adjustment (${parsed.data.numberOfBags} bags × ${bagWeight} kg)`
            : 'Manual stock adjustment',
        numberOfBags: parsed.data.numberOfBags,
      },
      userId,
      organizationId,
    );

    const summary = await this.getSummary(farmId);
    const updated = summary.find((item) => item.feedProductId === feedProductId);
    if (!updated) throw new NotFoundException('Feed product not found');
    return updated;
  }

  async getSummary(farmId: string) {
    const farm = await this.prisma.farm.findFirst({ where: { id: farmId, status: 'ACTIVE' } });
    if (!farm) throw new NotFoundException('Farm not found');

    const products = await this.prisma.feedProduct.findMany({
      where: { farmId, status: 'ACTIVE' },
    });

    const feedCodeOrder = ['1C', '2C', '20', '3S', '3SP', '3P'];
    products.sort(
      (a, b) => feedCodeOrder.indexOf(a.feedCode) - feedCodeOrder.indexOf(b.feedCode),
    );

    const now = new Date();
    const zonedNow = toZonedTime(now, farm.timezone);
    const today = formatInTimeZone(zonedNow, farm.timezone, 'yyyy-MM-dd');
    const monthStart = parseDateOnly(formatInTimeZone(zonedNow, farm.timezone, 'yyyy-MM-01'));

    return Promise.all(
      products.map(async (p) => {
        const allTx = await this.prisma.inventoryTransaction.findMany({
          where: { feedProductId: p.id, status: 'CONFIRMED' },
        });

        let balance = 0;
        let receivedMonth = 0;
        let consumedMonth = 0;
        let damagedMonth = 0;
        let consumedToday = 0;

        for (const t of allTx) {
          const qty = parseFloat(t.quantityKg.toString());
          const isIn = t.direction === 'IN';
          balance += isIn ? qty : -qty;

          const txDate = t.transactionDate;
          if (txDate >= monthStart) {
            if (t.type === 'FEED_RECEIVED' || t.type === 'OPENING_BALANCE') receivedMonth += qty;
            if (t.type === 'FEED_CONSUMED') consumedMonth += qty;
            if (t.type === 'DAMAGED' || t.type === 'WASTAGE') damagedMonth += qty;
          }
          if (t.transactionDate.toISOString().split('T')[0] === today && t.type === 'FEED_CONSUMED') {
            consumedToday += qty;
          }
        }

        const bagWeight = parseFloat(p.bagWeightKg.toString());
        const threshold = p.lowStockThresholdKg
          ? parseFloat(p.lowStockThresholdKg.toString())
          : 100;

        return {
          feedProductId: p.id,
          feedCode: p.feedCode,
          brandName: p.brandName,
          bagWeightKg: p.bagWeightKg.toString(),
          currentStockKg: balance.toFixed(3),
          equivalentBags: bagWeight > 0 ? Math.floor(balance / bagWeight) : 0,
          receivedThisMonthKg: receivedMonth.toFixed(3),
          consumedThisMonthKg: consumedMonth.toFixed(3),
          damagedThisMonthKg: damagedMonth.toFixed(3),
          consumedTodayKg: consumedToday.toFixed(3),
          isLowStock: balance < threshold,
        };
      }),
    );
  }

  async createTransaction(
    input: Record<string, unknown>,
    userId: string,
    organizationId: string,
  ) {
    const parsed = inventoryTransactionSchema.safeParse(input);
    if (!parsed.success) {
      const message = parsed.error.errors.map((e) => e.message).join(', ');
      throw new BadRequestException(message || 'Invalid inventory transaction');
    }
    const data = parsed.data;

    const existing = await this.prisma.inventoryTransaction.findUnique({
      where: { clientTransactionId: data.clientTransactionId },
    });
    if (existing) return this.mapTransaction(existing);

    const direction = getTransactionDirection(data.type);

    const tx = await this.prisma.inventoryTransaction.create({
      data: {
        clientTransactionId: data.clientTransactionId,
        organizationId,
        farmId: data.farmId,
        feedProductId: data.feedProductId,
        pondId: data.pondId,
        feedingEntryId: data.feedingEntryId,
        type: data.type,
        direction,
        quantityKg: data.quantityKg,
        transactionDate: parseDateOnly(data.transactionDate),
        remarks: data.remarks,
        supplierName: data.supplierName,
        referenceNumber: data.referenceNumber,
        numberOfBags: data.numberOfBags,
        createdByUserId: userId,
        status: 'CONFIRMED',
        syncStatus: 'SYNCED',
      },
      include: { feedProduct: true, createdBy: true },
    });

    await this.audit.log({
      organizationId,
      farmId: data.farmId,
      userId,
      entityType: 'INVENTORY_TRANSACTION',
      entityId: tx.id,
      action: 'CREATE',
      newValue: data as Record<string, unknown>,
    });

    return this.mapTransaction(tx);
  }

  async createFeedConsumed(params: {
    farmId: string;
    organizationId: string;
    feedProductId: string;
    pondId: string;
    feedingEntryId: string;
    quantityKg: string;
    transactionDate: string;
    userId: string;
    clientTransactionId: string;
  }) {
    const existing = await this.prisma.inventoryTransaction.findFirst({
      where: {
        feedingEntryId: params.feedingEntryId,
        feedProductId: params.feedProductId,
        type: 'FEED_CONSUMED',
        status: 'CONFIRMED',
      },
    });

    if (existing) {
      const existingQty = parseFloat(existing.quantityKg.toString());
      const newQty = parseFloat(params.quantityKg);
      if (newQty <= existingQty) return existing;
      params.quantityKg = (newQty - existingQty).toFixed(3);
      params.clientTransactionId = uuidv4();
    }

    return this.createTransaction(
      {
        clientTransactionId: params.clientTransactionId,
        farmId: params.farmId,
        feedProductId: params.feedProductId,
        type: 'FEED_CONSUMED',
        quantityKg: params.quantityKg,
        transactionDate: params.transactionDate,
        pondId: params.pondId,
        feedingEntryId: params.feedingEntryId,
      },
      params.userId,
      params.organizationId,
    );
  }

  async reverseFeedConsumed(feedingEntryId: string, userId: string, reason: string) {
    const originals = await this.prisma.inventoryTransaction.findMany({
      where: { feedingEntryId, type: 'FEED_CONSUMED', status: 'CONFIRMED' },
    });
    if (!originals.length) return;

    for (const original of originals) {
      await this.reverseStockEntry(original, userId, reason, { feedingEntryId });
    }
  }

  private async reverseStockEntry(
    original: Pick<
      InventoryTransaction,
      | 'id'
      | 'organizationId'
      | 'farmId'
      | 'feedProductId'
      | 'direction'
      | 'quantityKg'
      | 'transactionDate'
      | 'numberOfBags'
      | 'pondId'
    >,
    userId: string,
    reason: string,
    extra?: { feedingEntryId?: string },
  ) {
    const reversalDirection = original.direction === 'IN' ? 'OUT' : 'IN';
    const reversal = await this.prisma.inventoryTransaction.create({
      data: {
        clientTransactionId: uuidv4(),
        organizationId: original.organizationId,
        farmId: original.farmId,
        feedProductId: original.feedProductId,
        pondId: original.pondId ?? undefined,
        feedingEntryId: extra?.feedingEntryId,
        type: 'REVERSAL',
        direction: reversalDirection,
        quantityKg: original.quantityKg,
        transactionDate: original.transactionDate,
        remarks: `Reversal: ${reason}`,
        numberOfBags: original.numberOfBags,
        createdByUserId: userId,
        status: 'CONFIRMED',
        reversedTransactionId: original.id,
      },
    });

    await this.prisma.inventoryTransaction.update({
      where: { id: original.id },
      data: { status: 'REVERSED' },
    });

    await this.audit.log({
      organizationId: original.organizationId,
      farmId: original.farmId,
      userId,
      entityType: 'INVENTORY_TRANSACTION',
      entityId: reversal.id,
      action: 'REVERSE',
      reason,
    });

    return reversal;
  }

  async findTransactions(farmId: string, page = 1, pageSize = 50) {
    const [data, total] = await Promise.all([
      this.prisma.inventoryTransaction.findMany({
        where: { farmId },
        include: { feedProduct: true, createdBy: true },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.inventoryTransaction.count({ where: { farmId } }),
    ]);

    return {
      data: data.map((t) => this.mapTransaction(t)),
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize),
    };
  }

  private mapTransaction(t: {
    id: string;
    clientTransactionId: string;
    farmId: string;
    feedProductId: string;
    type: string;
    quantityKg: { toString(): string };
    transactionDate: Date;
    remarks: string | null;
    status: string;
    syncStatus: string;
    createdAt: Date;
    feedProduct?: { feedCode: string };
    createdBy?: { displayName: string };
  }) {
    return {
      id: t.id,
      clientTransactionId: t.clientTransactionId,
      farmId: t.farmId,
      feedProductId: t.feedProductId,
      feedCode: t.feedProduct?.feedCode,
      type: t.type,
      quantityKg: decimalToString(t.quantityKg),
      transactionDate: t.transactionDate.toISOString().split('T')[0],
      remarks: t.remarks,
      status: t.status,
      syncStatus: t.syncStatus,
      enteredByName: t.createdBy?.displayName,
      createdAt: t.createdAt.toISOString(),
    };
  }
}
