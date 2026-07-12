import { Module, forwardRef } from '@nestjs/common';
import { FeedProductsService } from './feed-products.service';
import { FeedProductsController } from './feed-products.controller';
import { InventoryModule } from '../inventory/inventory.module';
import { AuditModule } from '../audit/audit.module';

@Module({
  imports: [forwardRef(() => InventoryModule), AuditModule],
  providers: [FeedProductsService],
  controllers: [FeedProductsController],
  exports: [FeedProductsService],
})
export class FeedProductsModule {}
