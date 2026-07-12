import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { DashboardService } from './dashboard.service';
import { JwtAuthGuard } from '../common/guards/auth.guards';
import { PrismaService } from '../prisma/prisma.service';

@ApiTags('dashboard')
@Controller('dashboard')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class DashboardController {
  constructor(
    private dashboard: DashboardService,
    private prisma: PrismaService,
  ) {}

  @Get()
  async getDashboard(@Query('farmId') farmId: string) {
    const farm = await this.prisma.farm.findUnique({ where: { id: farmId } });
    return this.dashboard.getOwnerDashboard(farmId, farm?.timezone || 'Asia/Kolkata');
  }

  @Get('pond-status')
  async pondStatus(@Query('farmId') farmId: string) {
    const farm = await this.prisma.farm.findUnique({ where: { id: farmId } });
    const feeding = this.dashboard['feeding'] as { getPondTodayStatuses: (f: string, t: string) => Promise<unknown> };
    return feeding.getPondTodayStatuses(farmId, farm?.timezone || 'Asia/Kolkata');
  }
}
