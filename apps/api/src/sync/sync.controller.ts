import { Body, Controller, Get, Post, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { SyncService } from './sync.service';
import { FarmAccessGuard, JwtAuthGuard } from '../common/guards/auth.guards';
import { CurrentUser, RequireFarmAccess } from '../common/decorators/auth.decorators';
import { UserRole } from '@prisma/client';

@ApiTags('sync')
@Controller('sync')
@UseGuards(JwtAuthGuard, FarmAccessGuard)
@ApiBearerAuth()
export class SyncController {
  constructor(private sync: SyncService) {}

  @Post('batch')
  async batch(
    @Body() body: Record<string, unknown>,
    @CurrentUser('sub') userId: string,
    @CurrentUser('role') role: UserRole,
    @CurrentUser('organizationId') organizationId: string,
  ) {
    return this.sync.processBatch(body, userId, role, organizationId);
  }

  @Get('status')
  @RequireFarmAccess()
  async status(
    @Query('farmId') farmId: string,
    @CurrentUser('sub') userId: string,
  ) {
    return this.sync.getStatus(farmId, userId);
  }
}
