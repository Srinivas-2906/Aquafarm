import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { FeedingService } from '../feeding/feeding.service';
import { InventoryService } from '../inventory/inventory.service';
import { sumDecimals } from '../common/utils/date.utils';

@Injectable()
export class DashboardService {
  constructor(
    private prisma: PrismaService,
    private feeding: FeedingService,
    private inventory: InventoryService,
  ) {}

  async getOwnerDashboard(farmId: string, timezone: string) {
    const pondStatuses = await this.feeding.getPondTodayStatuses(farmId, timezone);
    const inventorySummary = await this.inventory.getSummary(farmId);

    const totalFeedToday = sumDecimals(
      pondStatuses.map((p) => p.todayTotalFeedKg),
    );
    const totalStock = sumDecimals(
      inventorySummary.map((p) => p.currentStockKg),
    );
    const lowStockProducts = inventorySummary.filter((p) => p.isLowStock).length;

    const pendingApprovals = await this.prisma.feedingEntry.count({
      where: { farmId, status: 'PENDING_OWNER_APPROVAL' },
    });

    const unsyncedRecords = await this.prisma.feedingEntry.count({
      where: { farmId, syncStatus: { in: ['PENDING', 'FAILED'] } },
    });

    const missingTanks = pondStatuses.filter((p) => !p.hasEntryToday);
    const attentionItems = [];

    for (const tank of missingTanks) {
      attentionItems.push({
        type: 'MISSING_FEEDING',
        title: `${tank.pondName} — no feeding today`,
        description: 'No feeding entry recorded for today',
        entityId: tank.pondId,
        severity: 'warning' as const,
      });
    }

    if (pendingApprovals > 0) {
      attentionItems.push({
        type: 'PENDING_APPROVAL',
        title: `${pendingApprovals} entries need approval`,
        description: 'Late offline submissions waiting for review',
        severity: 'warning' as const,
      });
    }

    for (const product of inventorySummary.filter((p) => p.isLowStock)) {
      attentionItems.push({
        type: 'LOW_STOCK',
        title: `${product.feedCode} running low`,
        description: `Only ${product.currentStockKg} kg remaining`,
        entityId: product.feedProductId,
        severity: 'danger' as const,
      });
    }

    return {
      activePonds: pondStatuses.length,
      totalFeedTodayKg: totalFeedToday,
      currentFeedStockKg: totalStock,
      pendingApprovals,
      unsyncedRecords,
      lowStockProducts,
      pondStatuses,
      attentionItems,
    };
  }
}
