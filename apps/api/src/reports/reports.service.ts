import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { FeedingService } from '../feeding/feeding.service';
import { parseDateOnly, sumDecimals } from '../common/utils/date.utils';
import * as path from 'path';
import * as fs from 'fs';
import PDFDocument from 'pdfkit';
import ExcelJS from 'exceljs';

@Injectable()
export class ReportsService {
  constructor(
    private prisma: PrismaService,
    private feeding: FeedingService,
  ) {}

  async generateFeedingReport(filters: {
    farmId: string;
    pondId?: string;
    feedProductId?: string;
    feedProductIds?: string[];
    dateFrom: string;
    dateTo: string;
    userId: string;
    organizationId: string;
  }) {
    const where: Record<string, unknown> = {
      farmId: filters.farmId,
      status: { in: ['CONFIRMED', 'PENDING_OWNER_APPROVAL'] },
      feedingDate: {
        gte: parseDateOnly(filters.dateFrom),
        lte: parseDateOnly(filters.dateTo),
      },
    };
    if (filters.pondId) where.pondId = filters.pondId;
    const feedIds = filters.feedProductIds?.length
      ? filters.feedProductIds
      : filters.feedProductId
        ? [filters.feedProductId]
        : [];
    if (feedIds.length) {
      where.OR = [
        { feedProductId: { in: feedIds } },
        { meals: { some: { feedProductId: { in: feedIds } } } },
      ];
    }

    const entries = await this.prisma.feedingEntry.findMany({
      where,
      include: {
        meals: { orderBy: { mealNumber: 'asc' } },
        pond: true,
        feedProduct: true,
        cultureCycle: true,
      },
      orderBy: [{ feedingDate: 'asc' }, { pond: { code: 'asc' } }],
    });

    const products = await this.prisma.feedProduct.findMany({
      where: { farmId: filters.farmId, status: 'ACTIVE' },
      select: { id: true, feedCode: true },
    });
    const codeById = new Map(products.map((p) => [p.id, p.feedCode]));

    const farm = await this.prisma.farm.findUnique({ where: { id: filters.farmId } });
    const pond = filters.pondId
      ? await this.prisma.pond.findUnique({ where: { id: filters.pondId } })
      : null;

    const rows = await Promise.all(
      entries.map(async (e) => {
        const tdf = sumDecimals(e.meals.map((m) => m.feedQuantityKg));
        const cumulative = await this.feeding.getCumulativeFeed(
          e.cultureCycleId,
          e.feedingDate,
          ['CONFIRMED', 'PENDING_OWNER_APPROVAL'],
        );
        const codes = new Set<string>();
        codes.add(e.feedProduct.feedCode);
        for (const m of e.meals) {
          if (!m.feedProductId) continue;
          const code = codeById.get(m.feedProductId);
          if (code) codes.add(code);
        }
        const feedCode = codes.size <= 1 ? [...codes][0] : [...codes].sort().join(', ');
        const mealMap: Record<number, string> = {};
        e.meals.forEach((m) => {
          mealMap[m.mealNumber] = m.feedQuantityKg.toString();
        });
        return {
          date: e.feedingDate.toISOString().split('T')[0],
          doc: e.doc,
          feedCode,
          meal1: mealMap[1] || '',
          meal2: mealMap[2] || '',
          meal3: mealMap[3] || '',
          meal4: mealMap[4] || '',
          meal5: mealMap[5] || '',
          tdf,
          cumulative,
          checkTray: e.meals.map((m) => m.checkTrayRemainingPercentage).filter(Boolean).join(', '),
          remarks: e.remarks || '',
          pondName: e.pond.name,
        };
      }),
    );

    const reportDir = path.join(process.cwd(), 'reports');
    if (!fs.existsSync(reportDir)) fs.mkdirSync(reportDir, { recursive: true });

    const reportId = crypto.randomUUID();
    const pdfPath = path.join(reportDir, `${reportId}.pdf`);
    const xlsxPath = path.join(reportDir, `${reportId}.xlsx`);

    await this.generatePdf(pdfPath, {
      farmName: farm?.name || 'Farm',
      pondName: pond?.name,
      dateFrom: filters.dateFrom,
      dateTo: filters.dateTo,
      rows,
    });

    await this.generateExcel(xlsxPath, rows);

    await this.prisma.generatedReport.create({
      data: {
        id: reportId,
        organizationId: filters.organizationId,
        farmId: filters.farmId,
        reportType: 'FEEDING_DATE_RANGE',
        filtersJson: filters as object,
        filePath: pdfPath,
        generatedByUserId: filters.userId,
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      },
    });

    return {
      id: reportId,
      rows,
      summary: {
        totalEntries: rows.length,
        periodTotalKg: sumDecimals(rows.map((r) => r.tdf)),
      },
      downloadUrls: {
        pdf: `/reports/${reportId}/download?format=pdf`,
        excel: `/reports/${reportId}/download?format=excel`,
      },
    };
  }

  async getReport(reportId: string, organizationId?: string) {
    const report = await this.prisma.generatedReport.findUnique({
      where: { id: reportId },
    });
    if (!report) throw new NotFoundException('Report not found');
    if (organizationId && report.organizationId !== organizationId) {
      throw new ForbiddenException();
    }
    return report;
  }

  getReportFilePath(reportId: string, format: 'pdf' | 'excel'): string {
    const ext = format === 'pdf' ? 'pdf' : 'xlsx';
    return path.join(process.cwd(), 'reports', `${reportId}.${ext}`);
  }

  generateShareText(farmName: string, date: string, rows: Array<{ pondName: string; tdf: string }>, totalStock: string, pending: number) {
    const lines = rows.map((r) => `${r.pondName} — ${r.tdf} kg`).join('\n');
    return `Daily Feeding Summary\nFarm: ${farmName}\nDate: ${date}\n\n${lines}\n\nTotal Feed: ${sumDecimals(rows.map((r) => r.tdf))} kg\nFeed Stock Remaining: ${totalStock} kg\nPending Entries: ${pending}`;
  }

  private async generatePdf(
    filePath: string,
    data: {
      farmName: string;
      pondName?: string;
      dateFrom: string;
      dateTo: string;
      rows: Array<Record<string, string | number>>;
    },
  ) {
    return new Promise<void>((resolve, reject) => {
      const doc = new PDFDocument({ margin: 40, size: 'A4', layout: 'landscape' });
      const stream = fs.createWriteStream(filePath);
      doc.pipe(stream);

      doc.fontSize(16).text('Feeding Management Report', { align: 'center' });
      doc.fontSize(10).text(`Farm: ${data.farmName}`, { align: 'center' });
      if (data.pondName) doc.text(`Pond/Tank: ${data.pondName}`, { align: 'center' });
      doc.text(`Period: ${data.dateFrom} to ${data.dateTo}`, { align: 'center' });
      doc.moveDown();

      const headers = ['Date', 'DOC', 'Code', 'M1', 'M2', 'M3', 'M4', 'M5', 'TDF', 'Cum.', 'Tray', 'Remarks'];
      const colWidths = [55, 30, 35, 40, 40, 40, 40, 40, 45, 45, 50, 80];
      let x = 40;
      doc.fontSize(8).font('Helvetica-Bold');
      headers.forEach((h, i) => {
        doc.text(h, x, doc.y, { width: colWidths[i], continued: false });
        x += colWidths[i];
      });
      doc.moveDown(0.5);
      doc.font('Helvetica');

      for (const row of data.rows) {
        x = 40;
        const values = [
          row.date, row.doc, row.feedCode,
          row.meal1, row.meal2, row.meal3, row.meal4, row.meal5,
          row.tdf, row.cumulative, row.checkTray, row.remarks,
        ];
        const y = doc.y;
        values.forEach((v, i) => {
          doc.text(String(v ?? ''), x, y, { width: colWidths[i], continued: false });
          x += colWidths[i];
        });
        doc.moveDown(0.4);
        if (doc.y > 520) {
          doc.addPage();
        }
      }

      doc.fontSize(8).text(`Generated: ${new Date().toISOString()}`, 40, doc.page.height - 40);
      doc.end();
      stream.on('finish', resolve);
      stream.on('error', reject);
    });
  }

  private async generateExcel(filePath: string, rows: Array<Record<string, string | number>>) {
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('Feeding Report');

    sheet.columns = [
      { header: 'Date', key: 'date', width: 12 },
      { header: 'DOC', key: 'doc', width: 6 },
      { header: 'Feed Code', key: 'feedCode', width: 10 },
      { header: 'Meal 1', key: 'meal1', width: 10 },
      { header: 'Meal 2', key: 'meal2', width: 10 },
      { header: 'Meal 3', key: 'meal3', width: 10 },
      { header: 'Meal 4', key: 'meal4', width: 10 },
      { header: 'Meal 5', key: 'meal5', width: 10 },
      { header: 'TDF', key: 'tdf', width: 10 },
      { header: 'Cumulative', key: 'cumulative', width: 12 },
      { header: 'Check Tray', key: 'checkTray', width: 15 },
      { header: 'Remarks', key: 'remarks', width: 25 },
      { header: 'Pond/Tank', key: 'pondName', width: 15 },
    ];

    for (const row of rows) {
      const added = sheet.addRow(row);
      ['meal1', 'meal2', 'meal3', 'meal4', 'meal5', 'tdf', 'cumulative', 'doc'].forEach((key) => {
        const cell = added.getCell(key);
        if (cell.value && cell.value !== '') {
          cell.value = parseFloat(String(cell.value));
          cell.numFmt = '0.000';
        }
      });
    }

    await workbook.xlsx.writeFile(filePath);
  }
}
