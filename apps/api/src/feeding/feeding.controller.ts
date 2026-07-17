import {
  Body,
  Controller,
  Get,
  Post,
  Patch,
  Param,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { FeedingService } from './feeding.service';
import { FarmAccessGuard, JwtAuthGuard } from '../common/guards/auth.guards';
import { CurrentUser, RequireFarmAccess } from '../common/decorators/auth.decorators';
import { UserRole } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

@ApiTags('feeding')
@Controller('feeding-entries')
@UseGuards(JwtAuthGuard, FarmAccessGuard)
@ApiBearerAuth()
export class FeedingController {
  constructor(
    private feeding: FeedingService,
    private prisma: PrismaService,
  ) {}

  @Get()
  @RequireFarmAccess()
  async findAll(
    @Query('farmId') farmId: string,
    @Query('pondId') pondId: string,
    @Query('dateFrom') dateFrom: string,
    @Query('dateTo') dateTo: string,
    @Query('status') status: string,
    @Query('page') page: string,
    @Query('pageSize') pageSize: string,
    @CurrentUser('role') role: UserRole,
  ) {
    const farm = await this.prisma.farm.findUnique({ where: { id: farmId } });
    return this.feeding.findAll({
      farmId,
      pondId,
      dateFrom,
      dateTo,
      status,
      page: page ? Number(page) : 1,
      pageSize: pageSize ? Number(pageSize) : 50,
      userRole: role,
      timezone: farm?.timezone || 'Asia/Kolkata',
    });
  }

  @Get(':id')
  async findOne(
    @Param('id') id: string,
    @CurrentUser('sub') userId: string,
    @CurrentUser('role') role: UserRole,
    @CurrentUser('organizationId') organizationId: string,
  ) {
    return this.feeding.findOne(id, userId, role, organizationId);
  }

  @Patch(':id')
  async updateEntry(
    @Param('id') id: string,
    @Body() body: Record<string, unknown>,
    @CurrentUser('sub') userId: string,
    @CurrentUser('role') role: UserRole,
    @CurrentUser('organizationId') organizationId: string,
  ) {
    return this.feeding.updateEntry(id, body, userId, role, organizationId);
  }

  @Post()
  @RequireFarmAccess()
  async create(
    @Body() body: Record<string, unknown>,
    @CurrentUser('sub') userId: string,
    @CurrentUser('role') role: UserRole,
    @CurrentUser('organizationId') organizationId: string,
  ) {
    return this.feeding.create(body, userId, role, organizationId);
  }

  @Post(':id/meals')
  async addMeal(
    @Param('id') id: string,
    @Body() meal: Record<string, unknown>,
    @CurrentUser('sub') userId: string,
    @CurrentUser('role') role: UserRole,
    @CurrentUser('organizationId') organizationId: string,
  ) {
    return this.feeding.addMeal(id, meal as never, userId, role, organizationId);
  }

  @Patch(':id/meals/:mealId')
  async updateMeal(
    @Param('id') id: string,
    @Param('mealId') mealId: string,
    @Body() meal: Record<string, unknown>,
    @CurrentUser('sub') userId: string,
    @CurrentUser('role') role: UserRole,
    @CurrentUser('organizationId') organizationId: string,
  ) {
    return this.feeding.updateMeal(id, mealId, meal, userId, role, organizationId);
  }

  @Post(':id/void')
  async void(
    @Param('id') id: string,
    @Body('reason') reason: string,
    @CurrentUser('sub') userId: string,
    @CurrentUser('role') role: UserRole,
    @CurrentUser('organizationId') organizationId: string,
  ) {
    return this.feeding.void(id, reason, userId, role, organizationId);
  }
}
