import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { DashboardService } from './dashboard.service';
import { FarmAccessGuard, JwtAuthGuard } from '../common/guards/auth.guards';
import { PrismaService } from '../prisma/prisma.service';
import { RequireFarmAccess } from '../common/decorators/auth.decorators';

@ApiTags('dashboard')
@Controller('dashboard')
@UseGuards(JwtAuthGuard, FarmAccessGuard)
@ApiBearerAuth()
export class DashboardController {
  constructor(
    private dashboard: DashboardService,
    private prisma: PrismaService,
  ) {}

  @Get()
  @RequireFarmAccess()
  async getDashboard(@Query('farmId') farmId: string) {
    const farm = await this.prisma.farm.findUnique({ where: { id: farmId } });
    return this.dashboard.getOwnerDashboard(farmId, farm?.timezone || 'Asia/Kolkata');
  }

  @Get('pond-status')
  @RequireFarmAccess()
  async pondStatus(@Query('farmId') farmId: string) {
    const farm = await this.prisma.farm.findUnique({ where: { id: farmId } });
    const feeding = this.dashboard['feeding'] as { getPondTodayStatuses: (f: string, t: string) => Promise<unknown> };
    return feeding.getPondTodayStatuses(farmId, farm?.timezone || 'Asia/Kolkata');
  }
}
