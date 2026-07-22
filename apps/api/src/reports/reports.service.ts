import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { FeedingService } from '../feeding/feeding.service';
import { parseDateOnly, sumDecimals, formatDisplayDate } from '../common/utils/date.utils';
import { groupMealsByFeedSlot } from '../common/utils/feed.utils';
import PDFDocument from 'pdfkit';
import ExcelJS from 'exceljs';
import { PassThrough } from 'stream';

type InventoryReportFilters = {
  farmId: string;
  dateFrom: string;
  dateTo: string;
  feedProductIds?: string[];
};

type InventorySummaryRow = {
  date: string;
  feedCode: string;
  addedKg: string;
  consumedKg: string;
};

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
    const farmAccess = await this.prisma.farm.findFirst({
      where: { id: filters.farmId, organizationId: filters.organizationId },
      select: { id: true },
    });
    if (!farmAccess) throw new ForbiddenException('You do not have access to this farm');

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
        groupMealsByFeedSlot(e.meals).forEach((slotMeals, index) => {
          mealMap[index + 1] = sumDecimals(slotMeals.map((m) => m.feedQuantityKg));
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

    const reportId = crypto.randomUUID();

    await this.prisma.generatedReport.create({
      data: {
        id: reportId,
        organizationId: filters.organizationId,
        farmId: filters.farmId,
        reportType: 'FEEDING_DATE_RANGE',
        filtersJson: filters as object,
        filePath: null,
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

  async renderReport(reportId: string, organizationId: string, format: 'pdf' | 'excel'): Promise<Buffer> {
    const report = await this.getReport(reportId, organizationId);
    if (report.reportType === 'FEEDING_DATE_RANGE') {
      const filters = report.filtersJson as unknown as {
        farmId: string;
        pondId?: string;
        feedProductId?: string;
        feedProductIds?: string[];
        dateFrom: string;
        dateTo: string;
      };

      const { farmName, pondName, rows } = await this.buildFeedingRows({
        ...filters,
        organizationId,
      });

      if (format === 'excel') {
        return this.generateFeedingExcelBuffer(rows);
      }
      return this.generateFeedingPdfBuffer({
        farmName,
        pondName,
        dateFrom: filters.dateFrom,
        dateTo: filters.dateTo,
        rows,
      });
    }

    if (report.reportType === 'INVENTORY_SUMMARY') {
      const filters = report.filtersJson as unknown as InventoryReportFilters;
      const { farmName, rows } = await this.buildInventorySummaryRows({
        ...filters,
        organizationId,
      });

      if (format === 'excel') {
        return this.generateInventoryExcelBuffer(rows, filters);
      }
      return this.generateInventoryPdfBuffer({
        farmName,
        dateFrom: filters.dateFrom,
        dateTo: filters.dateTo,
        rows,
      });
    }

    throw new NotFoundException('Unsupported report type');
  }

  async generateInventoryReport(filters: InventoryReportFilters & { userId: string; organizationId: string }) {
    await this.assertFarmAccess(filters.farmId, filters.organizationId);

    const { farmName, rows } = await this.buildInventorySummaryRows(filters);

    const reportId = crypto.randomUUID();

    await this.prisma.generatedReport.create({
      data: {
        id: reportId,
        organizationId: filters.organizationId,
        farmId: filters.farmId,
        reportType: 'INVENTORY_SUMMARY',
        filtersJson: filters as object,
        filePath: null,
        generatedByUserId: filters.userId,
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      },
    });

    const totalAddedKg = sumDecimals(rows.map((r) => r.addedKg));
    const totalConsumedKg = sumDecimals(rows.map((r) => r.consumedKg));

    return {
      id: reportId,
      rows,
      summary: {
        feedCodes: rows.length,
        totalAddedKg,
        totalConsumedKg,
      },
      downloadUrls: {
        pdf: `/reports/inventory/${reportId}/download?format=pdf`,
        excel: `/reports/inventory/${reportId}/download?format=excel`,
      },
      farmName,
    };
  }

  generateShareText(farmName: string, date: string, rows: Array<{ pondName: string; tdf: string }>, totalStock: string, pending: number) {
    const lines = rows.map((r) => `${r.pondName} — ${r.tdf} kg`).join('\n');
    return `Daily Feeding Summary\nFarm: ${farmName}\nDate: ${date}\n\n${lines}\n\nTotal Feed: ${sumDecimals(rows.map((r) => r.tdf))} kg\nFeed Stock Remaining: ${totalStock} kg\nPending Entries: ${pending}`;
  }

  private async buildFeedingRows(filters: {
    farmId: string;
    pondId?: string;
    feedProductId?: string;
    feedProductIds?: string[];
    dateFrom: string;
    dateTo: string;
    organizationId: string;
  }) {
    const farmAccess = await this.prisma.farm.findFirst({
      where: { id: filters.farmId, organizationId: filters.organizationId },
      select: { id: true, name: true },
    });
    if (!farmAccess) throw new ForbiddenException('You do not have access to this farm');

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
        groupMealsByFeedSlot(e.meals).forEach((slotMeals, index) => {
          mealMap[index + 1] = sumDecimals(slotMeals.map((m) => m.feedQuantityKg));
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

    return {
      farmName: farmAccess.name || 'Farm',
      pondName: pond?.name,
      rows,
    };
  }

  private async assertFarmAccess(farmId: string, organizationId: string) {
    const farmAccess = await this.prisma.farm.findFirst({
      where: { id: farmId, organizationId },
      select: { id: true },
    });
    if (!farmAccess) throw new ForbiddenException('You do not have access to this farm');
  }

  private async buildInventorySummaryRows(filters: InventoryReportFilters & { organizationId: string }) {
    const farm = await this.prisma.farm.findFirst({
      where: { id: filters.farmId, organizationId: filters.organizationId },
    });
    if (!farm) throw new ForbiddenException('You do not have access to this farm');

    const dateFrom = parseDateOnly(filters.dateFrom);
    const dateTo = parseDateOnly(filters.dateTo);
    const feedCodeOrder = ['1C', '2C', '20', '3S', '3SP', '3P'];

    const txs = await this.prisma.inventoryTransaction.findMany({
      where: {
        farmId: filters.farmId,
        status: 'CONFIRMED',
        transactionDate: {
          gte: dateFrom,
          lte: dateTo,
        },
        type: { in: ['FEED_RECEIVED', 'OPENING_BALANCE', 'FEED_CONSUMED'] },
        ...(filters.feedProductIds?.length ? { feedProductId: { in: filters.feedProductIds } } : {}),
      },
      include: { feedProduct: { select: { feedCode: true } } },
      orderBy: [{ transactionDate: 'desc' }, { createdAt: 'desc' }],
    });

    const buckets = new Map<string, { added: number; consumed: number }>();

    for (const t of txs) {
      const date = t.transactionDate.toISOString().split('T')[0];
      const feedCode = t.feedProduct.feedCode;
      const key = `${date}|${feedCode}`;
      const entry = buckets.get(key) ?? { added: 0, consumed: 0 };
      const qty = parseFloat(t.quantityKg.toString());

      switch (t.type) {
        case 'FEED_RECEIVED':
        case 'OPENING_BALANCE':
          entry.added += qty;
          break;
        case 'FEED_CONSUMED':
          entry.consumed += qty;
          break;
      }

      buckets.set(key, entry);
    }

    const rows: InventorySummaryRow[] = [...buckets.entries()]
      .map(([key, totals]) => {
        const [date, feedCode] = key.split('|');
        return {
          date,
          feedCode,
          addedKg: totals.added.toFixed(3),
          consumedKg: totals.consumed.toFixed(3),
        };
      })
      .filter((row) => parseFloat(row.addedKg) > 0 || parseFloat(row.consumedKg) > 0)
      .sort((a, b) => {
        const byDate = b.date.localeCompare(a.date);
        if (byDate !== 0) return byDate;
        return feedCodeOrder.indexOf(a.feedCode) - feedCodeOrder.indexOf(b.feedCode);
      });

    return {
      farmName: farm.name || 'Farm',
      rows,
    };
  }

  private async generateFeedingPdfBuffer(
    data: {
      farmName: string;
      pondName?: string;
      dateFrom: string;
      dateTo: string;
      rows: Array<Record<string, string | number>>;
    },
  ) {
    return new Promise<Buffer>((resolve, reject) => {
      const doc = new PDFDocument({ margin: 40, size: 'A4', layout: 'landscape' });
      const stream = new PassThrough();
      const chunks: Buffer[] = [];
      stream.on('data', (chunk) => chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)));
      stream.on('finish', () => resolve(Buffer.concat(chunks)));
      stream.on('error', reject);
      doc.pipe(stream);

      doc.fontSize(16).text('Feeding Management Report', { align: 'center' });
      doc.fontSize(10).text(`Farm: ${data.farmName}`, { align: 'center' });
      if (data.pondName) doc.text(`Pond/Tank: ${data.pondName}`, { align: 'center' });
      doc.text(`Period: ${formatDisplayDate(data.dateFrom)} to ${formatDisplayDate(data.dateTo)}`, { align: 'center' });
      doc.moveDown();

      const headers = ['Date', 'DOC', 'Code', 'M1', 'M2', 'M3', 'M4', 'M5'];
      const colWidths = [55, 30, 35, 40, 40, 40, 40, 40];
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
          formatDisplayDate(String(row.date)),
          row.doc,
          row.feedCode,
          row.meal1, row.meal2, row.meal3, row.meal4, row.meal5,
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
    });
  }

  private async generateFeedingExcelBuffer(rows: Array<Record<string, string | number>>): Promise<Buffer> {
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
      { header: 'Pond/Tank', key: 'pondName', width: 15 },
    ];

    for (const row of rows) {
      const added = sheet.addRow({
        ...row,
        date: formatDisplayDate(String(row.date)),
      });
      ['meal1', 'meal2', 'meal3', 'meal4', 'meal5', 'doc'].forEach((key) => {
        const cell = added.getCell(key);
        if (cell.value && cell.value !== '') {
          cell.value = parseFloat(String(cell.value));
          cell.numFmt = '0.000';
        }
      });
    }

    const buffer = await workbook.xlsx.writeBuffer();
    return Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer as ArrayBuffer);
  }

  private async generateInventoryPdfBuffer(data: {
    farmName: string;
    dateFrom: string;
    dateTo: string;
    rows: InventorySummaryRow[];
  }) {
    return new Promise<Buffer>((resolve, reject) => {
      const doc = new PDFDocument({ margin: 40, size: 'A4', layout: 'landscape' });
      const stream = new PassThrough();
      const chunks: Buffer[] = [];
      stream.on('data', (chunk) => chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)));
      stream.on('finish', () => resolve(Buffer.concat(chunks)));
      stream.on('error', reject);
      doc.pipe(stream);

      doc.fontSize(16).text('Inventory Report', { align: 'center' });
      doc.fontSize(10).text(`Farm: ${data.farmName}`, { align: 'center' });
      doc.text(`Period: ${formatDisplayDate(data.dateFrom)} to ${formatDisplayDate(data.dateTo)}`, { align: 'center' });
      doc.moveDown();

      const headers = ['Date', 'Code', 'Feed Added (kg)', 'Feed Consumed (kg)'];
      const colWidths = [70, 45, 90, 90];
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
          formatDisplayDate(row.date),
          row.feedCode,
          row.addedKg,
          row.consumedKg,
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
    });
  }

  private async generateInventoryExcelBuffer(
    rows: InventorySummaryRow[],
    filters: InventoryReportFilters,
  ): Promise<Buffer> {
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('Inventory Summary');

    sheet.columns = [
      { header: 'Date', key: 'date', width: 12 },
      { header: 'Feed Code', key: 'feedCode', width: 10 },
      { header: 'Feed Added (kg)', key: 'addedKg', width: 16 },
      { header: 'Feed Consumed (kg)', key: 'consumedKg', width: 18 },
    ];

    for (const row of rows) {
      const added = sheet.addRow({
        ...row,
        date: formatDisplayDate(row.date),
      });
      ['addedKg', 'consumedKg'].forEach((key) => {
        const cell = added.getCell(key);
        cell.value = parseFloat(String(cell.value));
        cell.numFmt = '0.000';
      });
    }

    sheet.getCell('A1').note = `Period: ${filters.dateFrom} to ${filters.dateTo}`;

    const buffer = await workbook.xlsx.writeBuffer();
    return Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer as ArrayBuffer);
  }
}
