import { Injectable, NotFoundException } from '@nestjs/common';
import { ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { FeedingService } from '../feeding/feeding.service';
import { InventoryService } from '../inventory/inventory.service';
import { AuditService } from '../audit/audit.service';
import { sumDecimals } from '../common/utils/date.utils';

@Injectable()
export class ApprovalsService {
  constructor(
    private prisma: PrismaService,
    private feeding: FeedingService,
    private inventory: InventoryService,
    private audit: AuditService,
  ) {}

  async findPending(farmId: string) {
    const entries = await this.prisma.feedingEntry.findMany({
      where: { farmId, status: 'PENDING_OWNER_APPROVAL' },
      include: {
        meals: { orderBy: { mealNumber: 'asc' } },
        pond: true,
        feedProduct: true,
        enteredBy: true,
      },
      orderBy: { serverCreatedAt: 'desc' },
    });

    return entries.map((e) => ({
      id: e.id,
      type: 'FEEDING_ENTRY' as const,
      supervisorName: e.enteredBy.displayName,
      pondName: e.pond.name,
      entryDate: e.feedingDate.toISOString().split('T')[0],
      deviceCreatedAt: e.deviceCreatedAt?.toISOString() ?? null,
      serverCreatedAt: e.serverCreatedAt.toISOString(),
      totalFeedKg: sumDecimals(e.meals.map((m) => m.feedQuantityKg)),
      meals: e.meals.map((m) => ({
        id: m.id,
        mealNumber: m.mealNumber,
        feedQuantityKg: m.feedQuantityKg.toString(),
        actualTime: m.actualTime,
        scheduledTime: m.scheduledTime,
        checkTrayRemainingPercentage: m.checkTrayRemainingPercentage,
        appetiteStatus: m.appetiteStatus,
        remarks: m.remarks,
      })),
      submissionType: e.submissionType,
      reason: 'Late offline submission — entry date is outside supervisor edit window',
    }));
  }

  async approve(entryId: string, userId: string, organizationId: string) {
    const entry = await this.prisma.feedingEntry.findUnique({
      where: { id: entryId },
      include: { meals: true },
    });
    if (!entry) throw new NotFoundException('Entry not found');
    if (entry.organizationId !== organizationId) {
      throw new ForbiddenException('You do not have permission for this action');
    }
    if (entry.status !== 'PENDING_OWNER_APPROVAL') {
      throw new NotFoundException('Entry is not pending approval');
    }

    await this.prisma.feedingEntry.update({
      where: { id: entryId },
      data: { status: 'CONFIRMED', approvedByUserId: userId },
    });

    const tdf = sumDecimals(entry.meals.map((m) => m.feedQuantityKg));
    await this.inventory.createFeedConsumed({
      farmId: entry.farmId,
      organizationId: entry.organizationId,
      feedProductId: entry.feedProductId,
      pondId: entry.pondId,
      feedingEntryId: entry.id,
      quantityKg: tdf,
      transactionDate: entry.feedingDate.toISOString().split('T')[0],
      userId,
      clientTransactionId: crypto.randomUUID(),
    });

    await this.audit.log({
      organizationId,
      farmId: entry.farmId,
      userId,
      entityType: 'FEEDING_ENTRY',
      entityId: entryId,
      action: 'APPROVE',
    });

    return { message: 'Entry approved' };
  }

  async reject(entryId: string, reason: string, userId: string, organizationId: string) {
    const entry = await this.prisma.feedingEntry.findUnique({ where: { id: entryId } });
    if (!entry) throw new NotFoundException('Entry not found');
    if (entry.organizationId !== organizationId) {
      throw new ForbiddenException('You do not have permission for this action');
    }

    await this.prisma.feedingEntry.update({
      where: { id: entryId },
      data: { status: 'VOIDED', voidedAt: new Date(), voidedByUserId: userId, voidReason: reason },
    });

    await this.audit.log({
      organizationId,
      farmId: entry.farmId,
      userId,
      entityType: 'FEEDING_ENTRY',
      entityId: entryId,
      action: 'REJECT',
      reason,
    });

    return { message: 'Entry rejected' };
  }
}
