import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { FarmsService } from './farms.service';
import { FarmAccessGuard, JwtAuthGuard } from '../common/guards/auth.guards';
import { CurrentUser, RequireFarmAccess } from '../common/decorators/auth.decorators';
import { UserRole } from '@prisma/client';

@ApiTags('farms')
@Controller('farms')
@UseGuards(JwtAuthGuard, FarmAccessGuard)
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
  @RequireFarmAccess()
  async findOne(@Param('farmId') farmId: string) {
    return this.farms.findOne(farmId);
  }

  // Anyone can create a farm (owner or supervisor).
  @Post()
  async create(
    @Body() body: Record<string, unknown>,
    @CurrentUser('sub') userId: string,
    @CurrentUser('organizationId') organizationId: string,
    @CurrentUser('role') role: UserRole,
  ) {
    return this.farms.create({
      input: body,
      userId,
      organizationId,
      userRole: role,
    });
  }
}
