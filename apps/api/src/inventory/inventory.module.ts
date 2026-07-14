import { Module, forwardRef } from '@nestjs/common';
import { InventoryService } from './inventory.service';
import { InventoryController } from './inventory.controller';
import { AuditModule } from '../audit/audit.module';
import { FeedProductsModule } from '../feed-products/feed-products.module';

@Module({
  imports: [AuditModule, forwardRef(() => FeedProductsModule)],
  providers: [InventoryService],
  controllers: [InventoryController],
  exports: [InventoryService],
})
export class InventoryModule {}
