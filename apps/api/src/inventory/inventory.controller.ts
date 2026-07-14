import { Body, Controller, Get, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { InventoryService } from './inventory.service';
import { JwtAuthGuard } from '../common/guards/auth.guards';
import { CurrentUser } from '../common/decorators/auth.decorators';

@ApiTags('inventory')
@Controller('inventory')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class InventoryController {
  constructor(private inventory: InventoryService) {}

  @Get('summary')
  async summary(@Query('farmId') farmId: string) {
    return this.inventory.getSummary(farmId);
  }

  @Get('total')
  async total(@Query('farmId') farmId: string) {
    return this.inventory.getFarmTotal(farmId);
  }

  @Patch('total')
  async setTotal(
    @Body() body: Record<string, unknown>,
    @CurrentUser('sub') userId: string,
    @CurrentUser('organizationId') organizationId: string,
  ) {
    return this.inventory.setFarmTotal(body, userId, organizationId);
  }

  @Get('transactions')
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
  async create(
    @Body() body: Record<string, unknown>,
    @CurrentUser('sub') userId: string,
    @CurrentUser('organizationId') organizationId: string,
  ) {
    return this.inventory.createTransaction(body, userId, organizationId);
  }
}
