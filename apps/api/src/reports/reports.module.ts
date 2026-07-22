import { Module } from '@nestjs/common';
import { ReportsService } from './reports.service';
import { ReportsController } from './reports.controller';
import { InventoryReportsController } from './inventory-reports.controller';
import { FeedingModule } from '../feeding/feeding.module';

@Module({
  imports: [FeedingModule],
  providers: [ReportsService],
  controllers: [ReportsController, InventoryReportsController],
})
export class ReportsModule {}
