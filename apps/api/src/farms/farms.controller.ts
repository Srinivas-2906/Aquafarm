import { Controller, Get, Param, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { FarmsService } from './farms.service';
import { JwtAuthGuard } from '../common/guards/auth.guards';
import { CurrentUser } from '../common/decorators/auth.decorators';

@ApiTags('farms')
@Controller('farms')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class FarmsController {
  constructor(private farms: FarmsService) {}

  @Get()
  async findAll(
    @CurrentUser('sub') userId: string,
    @CurrentUser('organizationId') organizationId: string,
  ) {
    return this.farms.findAllForUser(userId, organizationId);
  }

  @Get(':farmId')
  async findOne(@Param('farmId') farmId: string) {
    return this.farms.findOne(farmId);
  }
}
