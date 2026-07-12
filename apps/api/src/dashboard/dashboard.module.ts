import { Module } from '@nestjs/common';
import { DashboardService } from './dashboard.service';
import { DashboardController } from './dashboard.controller';
import { FeedingModule } from '../feeding/feeding.module';
import { InventoryModule } from '../inventory/inventory.module';

@Module({
  imports: [FeedingModule, InventoryModule],
  providers: [DashboardService],
  controllers: [DashboardController],
})
export class DashboardModule {}
