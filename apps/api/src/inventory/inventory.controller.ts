import { Body, Controller, Get, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { InventoryService } from './inventory.service';
import { FarmAccessGuard, JwtAuthGuard } from '../common/guards/auth.guards';
import { CurrentUser, RequireFarmAccess } from '../common/decorators/auth.decorators';

@ApiTags('inventory')
@Controller('inventory')
@UseGuards(JwtAuthGuard, FarmAccessGuard)
@ApiBearerAuth()
export class InventoryController {
  constructor(private inventory: InventoryService) {}

  @Get('summary')
  @RequireFarmAccess()
  async summary(@Query('farmId') farmId: string) {
    return this.inventory.getSummary(farmId);
  }

  @Get('total')
  @RequireFarmAccess()
  async total(@Query('farmId') farmId: string) {
    return this.inventory.getFarmTotal(farmId);
  }

  @Get('entries')
  @RequireFarmAccess()
  async entries(@Query('farmId') farmId: string) {
    return this.inventory.getFarmStockEntries(farmId);
  }

  @Post('entries')
  @RequireFarmAccess()
  async addEntry(
    @Body() body: Record<string, unknown>,
    @CurrentUser('sub') userId: string,
    @CurrentUser('organizationId') organizationId: string,
  ) {
    return this.inventory.addFarmStockEntry(body, userId, organizationId);
  }

  @Patch('total')
  @RequireFarmAccess()
  async setTotal(
    @Body() body: Record<string, unknown>,
    @CurrentUser('sub') userId: string,
    @CurrentUser('organizationId') organizationId: string,
  ) {
    return this.inventory.setFarmTotal(body, userId, organizationId);
  }

  @Patch('product')
  @RequireFarmAccess()
  async setProduct(
    @Body() body: Record<string, unknown>,
    @CurrentUser('sub') userId: string,
    @CurrentUser('organizationId') organizationId: string,
  ) {
    return this.inventory.setProductStock(body, userId, organizationId);
  }

  @Get('transactions')
  @RequireFarmAccess()
  async transactions(
    @Query('farmId') farmId: string,
    @Query('page') page: string,
    @Query('pageSize') pageSize: string,
  ) {
    return this.inventory.findTransactions(
      farmId,
      page ? Number(page) : 1,
      pageSize ? Number(pageSize) : 50,
    );
  }

  @Post('transactions')
  @RequireFarmAccess()
  async create(
    @Body() body: Record<string, unknown>,
    @CurrentUser('sub') userId: string,
    @CurrentUser('organizationId') organizationId: string,
  ) {
    return this.inventory.createTransaction(body, userId, organizationId);
  }
}
