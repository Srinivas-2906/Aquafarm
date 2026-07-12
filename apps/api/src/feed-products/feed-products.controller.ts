import { Controller, Get, Param, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { FeedProductsService } from './feed-products.service';
import { JwtAuthGuard } from '../common/guards/auth.guards';

@ApiTags('feed-products')
@Controller()
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class FeedProductsController {
  constructor(private feedProducts: FeedProductsService) {}

  @Get('farms/:farmId/feed-products')
  async findByFarm(@Param('farmId') farmId: string) {
    return this.feedProducts.findByFarm(farmId);
  }
}
