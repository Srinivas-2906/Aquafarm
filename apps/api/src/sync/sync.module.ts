import { Module } from '@nestjs/common';
import { SyncService } from './sync.service';
import { SyncController } from './sync.controller';
import { FeedingModule } from '../feeding/feeding.module';
import { InventoryModule } from '../inventory/inventory.module';

@Module({
  imports: [FeedingModule, InventoryModule],
  providers: [SyncService],
  controllers: [SyncController],
})
export class SyncModule {}
