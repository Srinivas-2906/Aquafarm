import { Controller, Get, Param, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { PondsService } from './ponds.service';
import { JwtAuthGuard } from '../common/guards/auth.guards';

@ApiTags('ponds')
@Controller()
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class PondsController {
  constructor(private ponds: PondsService) {}

  @Get('farms/:farmId/ponds')
  async findByFarm(@Param('farmId') farmId: string) {
    return this.ponds.findByFarm(farmId);
  }

  @Get('ponds/:pondId')
  async findOne(@Param('pondId') pondId: string) {
    return this.ponds.findOne(pondId);
  }

  @Get('ponds/:pondId/culture-cycle')
  async getActiveCycle(@Param('pondId') pondId: string) {
    const pond = await this.ponds.findOne(pondId);
    return pond?.activeCycle || null;
  }
}
