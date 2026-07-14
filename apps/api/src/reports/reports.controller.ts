import {
  Body,
  Controller,
  Get,
  Post,
  Param,
  Query,
  Res,
  UseGuards,
  NotFoundException,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { Response } from 'express';
import * as fs from 'fs';
import { ReportsService } from './reports.service';
import { JwtAuthGuard, RolesGuard } from '../common/guards/auth.guards';
import { Roles, CurrentUser } from '../common/decorators/auth.decorators';
import { UserRole } from '@prisma/client';

@ApiTags('reports')
@Controller('reports')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.OWNER)
@ApiBearerAuth()
export class ReportsController {
  constructor(private reports: ReportsService) {}

  @Post('generate')
  async generate(
    @Body() body: {
      farmId: string;
      pondId?: string;
      feedProductId?: string;
      dateFrom: string;
      dateTo: string;
      reportType?: string;
    },
    @CurrentUser('sub') userId: string,
    @CurrentUser('organizationId') organizationId: string,
  ) {
    return this.reports.generateFeedingReport({
      ...body,
      userId,
      organizationId,
    });
  }

  @Get(':id')
  async getReport(
    @Param('id') id: string,
    @CurrentUser('organizationId') organizationId: string,
  ) {
    return this.reports.getReport(id, organizationId);
  }

  @Get(':id/download')
  async download(
    @Param('id') id: string,
    @Query('format') format: 'pdf' | 'excel' = 'pdf',
    @Res() res: Response,
    @CurrentUser('organizationId') organizationId: string,
  ) {
    await this.reports.getReport(id, organizationId);
    const filePath = this.reports.getReportFilePath(id, format);
    if (!fs.existsSync(filePath)) {
      throw new NotFoundException('Report file not found');
    }
    const contentType =
      format === 'pdf'
        ? 'application/pdf'
        : 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
    const filename = `feeding-report-${id}.${format === 'pdf' ? 'pdf' : 'xlsx'}`;
    res.setHeader('Content-Type', contentType);
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    fs.createReadStream(filePath).pipe(res);
  }
}
