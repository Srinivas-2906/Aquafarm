import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { AuditService } from './audit.service';
import { JwtAuthGuard, RolesGuard } from '../common/guards/auth.guards';
import { Roles, CurrentUser } from '../common/decorators/auth.decorators';
import { UserRole } from '@prisma/client';

@ApiTags('audit')
@Controller('audit-logs')
@UseGuards(JwtAuthGuard, RolesGuard)
@ApiBearerAuth()
export class AuditController {
  constructor(private audit: AuditService) {}

  @Get()
  @Roles(UserRole.OWNER)
  async findAll(
    @CurrentUser('organizationId') organizationId: string,
    @Query('farmId') farmId?: string,
    @Query('userId') userId?: string,
    @Query('entityType') entityType?: string,
    @Query('dateFrom') dateFrom?: string,
    @Query('dateTo') dateTo?: string,
    @Query('page') page?: number,
    @Query('pageSize') pageSize?: number,
  ) {
    return this.audit.findAll({
      organizationId,
      farmId,
      userId,
      entityType,
      dateFrom,
      dateTo,
      page: page ? Number(page) : 1,
      pageSize: pageSize ? Number(pageSize) : 50,
    });
  }
}
