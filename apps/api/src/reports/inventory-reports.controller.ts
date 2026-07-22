import {
  Body,
  Controller,
  Get,
  Post,
  Param,
  Query,
  Res,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { Response } from 'express';
import { ReportsService } from './reports.service';
import { FarmAccessGuard, JwtAuthGuard } from '../common/guards/auth.guards';
import { RequireFarmAccess, CurrentUser } from '../common/decorators/auth.decorators';

@ApiTags('reports')
@Controller('reports/inventory')
@UseGuards(JwtAuthGuard, FarmAccessGuard)
@ApiBearerAuth()
export class InventoryReportsController {
  constructor(private reports: ReportsService) {}

  @Post('generate')
  @RequireFarmAccess()
  async generate(
    @Body() body: {
      farmId: string;
      feedProductIds?: string[];
      dateFrom: string;
      dateTo: string;
    },
    @CurrentUser('sub') userId: string,
    @CurrentUser('organizationId') organizationId: string,
  ) {
    return this.reports.generateInventoryReport({
      ...body,
      userId,
      organizationId,
    });
  }

  @Get(':id/download')
  async download(
    @Param('id') id: string,
    @Query('format') format: 'pdf' | 'excel' = 'pdf',
    @Res() res: Response,
    @CurrentUser('organizationId') organizationId: string,
  ) {
    await this.reports.getReport(id, organizationId);
    const contentType =
      format === 'pdf'
        ? 'application/pdf'
        : 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
    const filename = `inventory-report-${id}.${format === 'pdf' ? 'pdf' : 'xlsx'}`;
    res.setHeader('Content-Type', contentType);
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);

    const buffer = await this.reports.renderReport(id, organizationId, format);
    res.send(buffer);
  }
}
