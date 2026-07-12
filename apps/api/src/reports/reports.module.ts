import { Module } from '@nestjs/common';
import { ReportsService } from './reports.service';
import { ReportsController } from './reports.controller';
import { FeedingModule } from '../feeding/feeding.module';

@Module({
  imports: [FeedingModule],
  providers: [ReportsService],
  controllers: [ReportsController],
})
export class ReportsModule {}
