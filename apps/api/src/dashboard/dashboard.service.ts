import { Injectable } from '@nestjs/common';
import { FeedingService } from '../feeding/feeding.service';
import { InventoryService } from '../inventory/inventory.service';
import { sumDecimals } from '../common/utils/date.utils';

@Injectable()
export class DashboardService {
  constructor(
    private feeding: FeedingService,
    private inventory: InventoryService,
  ) {}

  async getOwnerDashboard(farmId: string, timezone: string) {
    const [pondStatuses, farmTotal, totalFeedUsed] = await Promise.all([
      this.feeding.getPondTodayStatuses(farmId, timezone),
      this.inventory.getFarmTotal(farmId),
      this.feeding.getFarmTotalFeedUsed(farmId),
    ]);

    const totalFeedToday = sumDecimals(
      pondStatuses.map((p) => p.todayTotalFeedKg),
    );

    return {
      activePonds: pondStatuses.length,
      totalFeedTodayKg: totalFeedToday,
      totalFeedUsedKg: totalFeedUsed,
      currentFeedStockKg: farmTotal.totalStockKg,
      pendingApprovals: 0,
      unsyncedRecords: 0,
      lowStockProducts: 0,
      pondStatuses,
      attentionItems: [],
    };
  }
}
