import { Body, Controller, Get, Post, Param, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { UsersService } from './users.service';
import { JwtAuthGuard, RolesGuard } from '../common/guards/auth.guards';
import { Roles, CurrentUser } from '../common/decorators/auth.decorators';
import { UserRole } from '@prisma/client';

@ApiTags('users')
@Controller('users')
@UseGuards(JwtAuthGuard, RolesGuard)
@ApiBearerAuth()
export class UsersController {
  constructor(private users: UsersService) {}

  @Get('supervisors')
  @Roles(UserRole.OWNER)
  async list(@CurrentUser('organizationId') organizationId: string) {
    return this.users.listSupervisors(organizationId);
  }

  @Post('supervisors')
  @Roles(UserRole.OWNER)
  async create(
    @Body() body: { phoneNumber: string; displayName: string; farmId: string },
    @CurrentUser('organizationId') organizationId: string,
  ) {
    return this.users.createSupervisor(
      organizationId,
      body.farmId,
      body.phoneNumber,
      body.displayName,
    );
  }

  @Post(':id/deactivate')
  @Roles(UserRole.OWNER)
  async deactivate(@Param('id') id: string) {
    return this.users.deactivate(id);
  }
}
