import { Body, Controller, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { PondsService } from './ponds.service';
import { FarmAccessGuard, JwtAuthGuard } from '../common/guards/auth.guards';
import { CurrentUser, RequireFarmAccess } from '../common/decorators/auth.decorators';

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

  // Anyone with access to the farm can add tanks/ponds.
  @Post('farms/:farmId/ponds')
  @UseGuards(FarmAccessGuard)
  @RequireFarmAccess()
  async create(
    @Param('farmId') farmId: string,
    @Body() body: Record<string, unknown>,
    @CurrentUser('organizationId') organizationId: string,
  ) {
    return this.ponds.create({ farmId, organizationId, input: body });
  }

  @Patch('farms/:farmId/ponds/:pondId')
  @UseGuards(FarmAccessGuard)
  @RequireFarmAccess()
  async update(
    @Param('farmId') farmId: string,
    @Param('pondId') pondId: string,
    @Body() body: Record<string, unknown>,
    @CurrentUser('organizationId') organizationId: string,
  ) {
    return this.ponds.update({ farmId, pondId, organizationId, input: body });
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

  @Post('ponds/:pondId/culture-cycle')
  async ensureActiveCycle(
    @Param('pondId') pondId: string,
    @Body() body: Record<string, unknown>,
    @CurrentUser('organizationId') organizationId: string,
  ) {
    return this.ponds.ensureActiveCycle(pondId, organizationId, body);
  }
}
