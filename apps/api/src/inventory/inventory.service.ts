import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { getTransactionDirection, decimalToString, sumDecimals } from '../common/utils/date.utils';
import { inventoryTransactionSchema } from '@aqualedger/validation';
import { v4 as uuidv4 } from 'uuid';

@Injectable()
export class InventoryService {
  constructor(
    private prisma: PrismaService,
    private audit: AuditService,
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

  async getSummary(farmId: string) {
    const products = await this.prisma.feedProduct.findMany({
      where: { farmId, status: 'ACTIVE' },
    });

    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const today = now.toISOString().split('T')[0];

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
        transactionDate: new Date(data.transactionDate),
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
      where: { feedingEntryId: params.feedingEntryId, type: 'FEED_CONSUMED', status: 'CONFIRMED' },
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
    const original = await this.prisma.inventoryTransaction.findFirst({
      where: { feedingEntryId, type: 'FEED_CONSUMED', status: 'CONFIRMED' },
    });
    if (!original) return;

    const reversal = await this.prisma.inventoryTransaction.create({
      data: {
        clientTransactionId: uuidv4(),
        organizationId: original.organizationId,
        farmId: original.farmId,
        feedProductId: original.feedProductId,
        pondId: original.pondId,
        feedingEntryId,
        type: 'REVERSAL',
        direction: 'IN',
        quantityKg: original.quantityKg,
        transactionDate: original.transactionDate,
        remarks: `Reversal: ${reason}`,
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
