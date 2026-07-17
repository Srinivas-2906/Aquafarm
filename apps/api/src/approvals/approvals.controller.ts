import { Body, Controller, Get, Post, Param, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { ApprovalsService } from './approvals.service';
import { FarmAccessGuard, JwtAuthGuard, RolesGuard } from '../common/guards/auth.guards';
import { RequireFarmAccess, Roles, CurrentUser } from '../common/decorators/auth.decorators';
import { UserRole } from '@prisma/client';

@ApiTags('approvals')
@Controller('approvals')
@UseGuards(JwtAuthGuard, RolesGuard, FarmAccessGuard)
@Roles(UserRole.OWNER)
@ApiBearerAuth()
export class ApprovalsController {
  constructor(private approvals: ApprovalsService) {}

  @Get()
  @RequireFarmAccess()
  async findPending(@Query('farmId') farmId: string) {
    return this.approvals.findPending(farmId);
  }

  @Post(':id/approve')
  async approve(
    @Param('id') id: string,
    @CurrentUser('sub') userId: string,
    @CurrentUser('organizationId') organizationId: string,
  ) {
    return this.approvals.approve(id, userId, organizationId);
  }

  @Post(':id/reject')
  async reject(
    @Param('id') id: string,
    @Body('reason') reason: string,
    @CurrentUser('sub') userId: string,
    @CurrentUser('organizationId') organizationId: string,
  ) {
    return this.approvals.reject(id, reason, userId, organizationId);
  }
}
