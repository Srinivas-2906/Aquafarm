import { Body, Controller, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import { FeedProductsService } from './feed-products.service';
import { JwtAuthGuard, RolesGuard } from '../common/guards/auth.guards';
import { CurrentUser, Roles } from '../common/decorators/auth.decorators';

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

  @Get('feed-products/:id')
  async findOne(@Param('id') id: string) {
    return this.feedProducts.findOne(id);
  }

  @Post('farms/:farmId/feed-products')
  @UseGuards(RolesGuard)
  @Roles(UserRole.OWNER)
  async create(
    @Param('farmId') farmId: string,
    @Body() body: Record<string, unknown>,
    @CurrentUser('organizationId') organizationId: string,
    @CurrentUser('sub') userId: string,
  ) {
    return this.feedProducts.create(farmId, organizationId, userId, body);
  }

  @Patch('feed-products/:id')
  @UseGuards(RolesGuard)
  @Roles(UserRole.OWNER)
  async update(
    @Param('id') id: string,
    @Body() body: Record<string, unknown>,
    @CurrentUser('organizationId') organizationId: string,
    @CurrentUser('sub') userId: string,
  ) {
    return this.feedProducts.update(id, organizationId, userId, body);
  }
}
