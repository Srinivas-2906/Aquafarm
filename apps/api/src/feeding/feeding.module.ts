import { Module, forwardRef } from '@nestjs/common';
import { FeedingService } from './feeding.service';
import { FeedingController } from './feeding.controller';
import { AuditModule } from '../audit/audit.module';
import { InventoryModule } from '../inventory/inventory.module';

@Module({
  imports: [AuditModule, forwardRef(() => InventoryModule)],
  providers: [FeedingService],
  controllers: [FeedingController],
  exports: [FeedingService],
})
export class FeedingModule {}
