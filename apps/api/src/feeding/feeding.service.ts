import {
  Injectable,
  BadRequestException,
  ForbiddenException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { InventoryService } from '../inventory/inventory.service';
import {
  calculateDoc,
  isDateEditableBySupervisor,
  isLateOfflineSubmission,
  sumDecimals,
  decimalToString,
  getFarmToday,
} from '../common/utils/date.utils';
import { feedingEntrySchema } from '@aqualedger/validation';
import type { FeedingEntryDto } from '@aqualedger/contracts';
import { UserRole, FeedingEntryStatus, SubmissionType } from '@prisma/client';
import { v4 as uuidv4 } from 'uuid';

@Injectable()
export class FeedingService {
  constructor(
    private prisma: PrismaService,
    private audit: AuditService,
    private inventory: InventoryService,
  ) {}

  async create(
    input: Record<string, unknown>,
    userId: string,
    userRole: UserRole,
    organizationId: string,
  ) {
    const parsed = feedingEntrySchema.safeParse(input);
    if (!parsed.success) {
      const message = parsed.error.errors.map((e) => e.message).join(', ');
      throw new BadRequestException(message || 'Invalid feeding entry');
    }
    const data = parsed.data;

    const existing = await this.prisma.feedingEntry.findUnique({
      where: { clientEntryId: data.clientEntryId },
      include: { meals: true, pond: true, feedProduct: true, enteredBy: true, farm: true },
    });
    if (existing) {
      return this.mapEntry(existing, userRole, existing.farm.timezone);
    }

    const farm = await this.prisma.farm.findUnique({ where: { id: data.farmId } });
    if (!farm) throw new NotFoundException('Farm not found');

    const cycle = await this.prisma.cultureCycle.findUnique({
      where: { id: data.cultureCycleId },
    });
    if (!cycle || cycle.status !== 'ACTIVE') {
      throw new BadRequestException('No active culture cycle for this pond');
    }

    const feedingDate = new Date(data.feedingDate);
    if (feedingDate < cycle.stockingDate) {
      throw new BadRequestException('Feeding date cannot be before stocking date');
    }

    const doc = calculateDoc(cycle.stockingDate, feedingDate);
    const isLate = isLateOfflineSubmission(feedingDate, farm.timezone);
    const isSupervisor = userRole === UserRole.SUPERVISOR;

    if (isSupervisor && !isDateEditableBySupervisor(feedingDate, farm.timezone) && !isLate) {
      throw new ForbiddenException(
        'This entry is older than two days. Only the owner can make changes.',
      );
    }

    const duplicate = await this.prisma.feedingEntry.findFirst({
      where: {
        pondId: data.pondId,
        feedingDate,
        status: { not: 'VOIDED' },
      },
    });
    if (duplicate) {
      throw new ConflictException('A feeding entry already exists for this pond and date');
    }

    let status: FeedingEntryStatus = 'CONFIRMED';
    let submissionType: SubmissionType = 'NORMAL';
    if (isLate && isSupervisor) {
      status = 'PENDING_OWNER_APPROVAL';
      submissionType = 'LATE_OFFLINE_SUBMISSION';
    }

    const entry = await this.prisma.feedingEntry.create({
      data: {
        clientEntryId: data.clientEntryId,
        organizationId,
        farmId: data.farmId,
        pondId: data.pondId,
        cultureCycleId: data.cultureCycleId,
        feedingDate,
        doc,
        feedProductId: data.feedProductId,
        status,
        submissionType,
        syncStatus: 'SYNCED',
        remarks: data.remarks,
        enteredByUserId: userId,
        deviceCreatedAt: data.deviceCreatedAt ? new Date(data.deviceCreatedAt) : new Date(),
        meals: {
          create: data.meals.map((m) => ({
            mealNumber: m.mealNumber,
            scheduledTime: m.scheduledTime,
            actualTime: m.actualTime || new Date().toTimeString().slice(0, 5),
            feedQuantityKg: m.feedQuantityKg,
            checkTrayRemainingPercentage: m.checkTrayRemainingPercentage,
            appetiteStatus: m.appetiteStatus,
            remarks: m.remarks,
          })),
        },
      },
      include: {
        meals: true,
        pond: true,
        feedProduct: true,
        enteredBy: true,
        farm: true,
      },
    });

    await this.audit.log({
      organizationId,
      farmId: data.farmId,
      userId,
      entityType: 'FEEDING_ENTRY',
      entityId: entry.id,
      action: 'CREATE',
      newValue: { feedingDate: data.feedingDate, doc, meals: data.meals },
    });

    if (status === 'CONFIRMED') {
      const tdf = sumDecimals(data.meals.map((m) => m.feedQuantityKg));
      await this.inventory.createFeedConsumed({
        farmId: data.farmId,
        organizationId,
        feedProductId: data.feedProductId,
        pondId: data.pondId,
        feedingEntryId: entry.id,
        quantityKg: tdf,
        transactionDate: data.feedingDate,
        userId,
        clientTransactionId: uuidv4(),
      });
    }

    return this.mapEntry(entry, userRole, farm.timezone);
  }

  async addMeal(
    entryId: string,
    meal: {
      mealNumber: number;
      feedQuantityKg: string;
      actualTime?: string;
      checkTrayRemainingPercentage?: string;
      appetiteStatus?: string;
      remarks?: string;
    },
    userId: string,
    userRole: UserRole,
  ) {
    const entry = await this.prisma.feedingEntry.findUnique({
      where: { id: entryId },
      include: { meals: true, farm: true, pond: true, feedProduct: true, enteredBy: true },
    });
    if (!entry) throw new NotFoundException('Entry not found');
    if (entry.status === 'VOIDED') {
      throw new BadRequestException('Cannot add meals to a voided entry');
    }

    this.checkEditPermission(entry, userRole, entry.farm.timezone);

    const existingMeal = entry.meals.find((m) => m.mealNumber === meal.mealNumber);
    if (existingMeal) {
      throw new ConflictException(`Meal ${meal.mealNumber} already exists`);
    }

    await this.prisma.feedingMeal.create({
      data: {
        feedingEntryId: entryId,
        mealNumber: meal.mealNumber,
        feedQuantityKg: meal.feedQuantityKg,
        actualTime: meal.actualTime || new Date().toTimeString().slice(0, 5),
        checkTrayRemainingPercentage: meal.checkTrayRemainingPercentage as never,
        appetiteStatus: meal.appetiteStatus as never,
        remarks: meal.remarks,
      },
    });

    const updated = await this.prisma.feedingEntry.update({
      where: { id: entryId },
      data: { version: { increment: 1 } },
      include: { meals: true, pond: true, feedProduct: true, enteredBy: true, farm: true },
    });

    if (entry.status === 'CONFIRMED') {
      const oldTdf = sumDecimals(entry.meals.map((m) => m.feedQuantityKg));
      const newTdf = sumDecimals(updated.meals.map((m) => m.feedQuantityKg));
      const diff = parseFloat(newTdf) - parseFloat(oldTdf);
      if (diff > 0) {
        await this.inventory.createFeedConsumed({
          farmId: entry.farmId,
          organizationId: entry.organizationId,
          feedProductId: entry.feedProductId,
          pondId: entry.pondId,
          feedingEntryId: entry.id,
          quantityKg: diff.toFixed(3),
          transactionDate: entry.feedingDate.toISOString().split('T')[0],
          userId,
          clientTransactionId: uuidv4(),
        });
      }
    }

    await this.audit.log({
      organizationId: entry.organizationId,
      farmId: entry.farmId,
      userId,
      entityType: 'FEEDING_MEAL',
      entityId: entryId,
      action: 'CREATE',
      newValue: meal as Record<string, unknown>,
    });

    return this.mapEntry(updated, userRole, entry.farm.timezone);
  }

  async findAll(filters: {
    farmId: string;
    pondId?: string;
    dateFrom?: string;
    dateTo?: string;
    status?: string;
    page?: number;
    pageSize?: number;
    userRole: UserRole;
    timezone: string;
  }) {
    const page = filters.page || 1;
    const pageSize = filters.pageSize || 50;
    const where: Record<string, unknown> = { farmId: filters.farmId };
    if (filters.pondId) where.pondId = filters.pondId;
    if (filters.status) where.status = filters.status;
    if (filters.dateFrom || filters.dateTo) {
      where.feedingDate = {};
      if (filters.dateFrom) (where.feedingDate as Record<string, Date>).gte = new Date(filters.dateFrom);
      if (filters.dateTo) (where.feedingDate as Record<string, Date>).lte = new Date(filters.dateTo);
    }

    const [entries, total] = await Promise.all([
      this.prisma.feedingEntry.findMany({
        where,
        include: {
          meals: { orderBy: { mealNumber: 'asc' } },
          pond: true,
          feedProduct: true,
          enteredBy: true,
          farm: true,
        },
        orderBy: [{ feedingDate: 'desc' }, { pond: { code: 'asc' } }],
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.feedingEntry.count({ where }),
    ]);

    const mapped = await Promise.all(
      entries.map((e) => this.mapEntry(e, filters.userRole, filters.timezone)),
    );

    return { data: mapped, total, page, pageSize, totalPages: Math.ceil(total / pageSize) };
  }

  async findOne(id: string, userRole: UserRole) {
    const entry = await this.prisma.feedingEntry.findUnique({
      where: { id },
      include: {
        meals: { orderBy: { mealNumber: 'asc' } },
        pond: true,
        feedProduct: true,
        enteredBy: true,
        farm: true,
      },
    });
    if (!entry) throw new NotFoundException('Entry not found');
    return this.mapEntry(entry, userRole, entry.farm.timezone);
  }

  async void(id: string, reason: string, userId: string, userRole: UserRole) {
    if (userRole !== UserRole.OWNER) {
      throw new ForbiddenException('Only the owner can void entries');
    }

    const entry = await this.prisma.feedingEntry.findUnique({
      where: { id },
      include: { meals: true, farm: true, pond: true, feedProduct: true, enteredBy: true },
    });
    if (!entry) throw new NotFoundException('Entry not found');
    if (entry.status === 'VOIDED') {
      throw new BadRequestException('Entry is already voided');
    }

    const updated = await this.prisma.feedingEntry.update({
      where: { id },
      data: {
        status: 'VOIDED',
        voidedAt: new Date(),
        voidedByUserId: userId,
        voidReason: reason,
        version: { increment: 1 },
      },
      include: { meals: true, pond: true, feedProduct: true, enteredBy: true, farm: true },
    });

    if (entry.status === 'CONFIRMED') {
      const tdf = sumDecimals(entry.meals.map((m) => m.feedQuantityKg));
      await this.inventory.reverseFeedConsumed(entry.id, userId, reason);
    }

    await this.audit.log({
      organizationId: entry.organizationId,
      farmId: entry.farmId,
      userId,
      entityType: 'FEEDING_ENTRY',
      entityId: id,
      action: 'VOID',
      previousValue: { status: entry.status },
      newValue: { status: 'VOIDED' },
      reason,
    });

    return this.mapEntry(updated, userRole, entry.farm.timezone);
  }

  async getCumulativeFeed(cultureCycleId: string, upToDate?: Date): Promise<string> {
    const where: Record<string, unknown> = {
      cultureCycleId,
      status: 'CONFIRMED',
    };
    if (upToDate) {
      where.feedingDate = { lte: upToDate };
    }

    const entries = await this.prisma.feedingEntry.findMany({
      where,
      include: { meals: true },
    });

    const allMeals = entries.flatMap((e) => e.meals.map((m) => m.feedQuantityKg));
    return sumDecimals(allMeals);
  }

  async getPondTodayStatuses(farmId: string, timezone: string) {
    const today = getFarmToday(timezone);
    const todayStr = today.toISOString().split('T')[0];

    const ponds = await this.prisma.pond.findMany({
      where: { farmId, status: 'ACTIVE' },
      orderBy: { code: 'asc' },
    });

    return Promise.all(
      ponds.map(async (pond) => {
        const cycle = await this.prisma.cultureCycle.findFirst({
          where: { pondId: pond.id, status: 'ACTIVE' },
        });

        const entry = await this.prisma.feedingEntry.findFirst({
          where: {
            pondId: pond.id,
            feedingDate: today,
            status: { not: 'VOIDED' },
          },
          include: {
            meals: { orderBy: { mealNumber: 'desc' } },
            feedProduct: { select: { feedCode: true } },
          },
        });

        const doc = cycle ? calculateDoc(cycle.stockingDate, today) : null;
        const mealsEntered = entry?.meals.length ?? 0;
        const todayTotal = entry
          ? sumDecimals(entry.meals.map((m) => m.feedQuantityKg))
          : '0.000';
        const lastMeal = entry?.meals[0];

        return {
          pondId: pond.id,
          pondName: pond.name,
          pondCode: pond.code,
          doc,
          mealsEntered,
          usualMealsPerDay: cycle?.usualMealsPerDay ?? 4,
          todayTotalFeedKg: todayTotal,
          lastMealTime: lastMeal?.actualTime ?? null,
          lastMealQuantityKg: lastMeal ? decimalToString(lastMeal.feedQuantityKg) : null,
          feedCode: entry?.feedProduct?.feedCode ?? null,
          entryId: entry?.id ?? null,
          syncStatus: entry?.syncStatus ?? null,
          isComplete: mealsEntered >= (cycle?.usualMealsPerDay ?? 4),
          hasEntryToday: !!entry,
        };
      }),
    );
  }

  private checkEditPermission(
    entry: { feedingDate: Date; status: FeedingEntryStatus },
    userRole: UserRole,
    timezone: string,
  ) {
    if (userRole === UserRole.OWNER) return;
    if (entry.status === 'PENDING_OWNER_APPROVAL') {
      throw new ForbiddenException('This entry is waiting for owner approval');
    }
    if (!isDateEditableBySupervisor(entry.feedingDate, timezone)) {
      throw new ForbiddenException(
        'This entry is older than two days. Only the owner can make changes.',
      );
    }
  }

  private async mapEntry(
    entry: {
      id: string;
      clientEntryId: string;
      farmId: string;
      pondId: string;
      cultureCycleId: string;
      feedingDate: Date;
      doc: number;
      feedProductId: string;
      status: FeedingEntryStatus;
      submissionType: SubmissionType;
      syncStatus: string;
      remarks: string | null;
      enteredByUserId: string;
      version: number;
      deviceCreatedAt: Date | null;
      serverCreatedAt: Date;
      updatedAt: Date;
      meals: Array<{
        id: string;
        mealNumber: number;
        scheduledTime: string | null;
        actualTime: string | null;
        feedQuantityKg: { toString(): string };
        checkTrayRemainingPercentage: string | null;
        appetiteStatus: string | null;
        remarks: string | null;
      }>;
      pond: { name: string };
      feedProduct: { feedCode: string };
      enteredBy: { displayName: string };
      farm?: { timezone: string };
    },
    userRole: UserRole,
    timezone: string,
  ): Promise<FeedingEntryDto> {
    const tdf = sumDecimals(entry.meals.map((m) => m.feedQuantityKg));
    const cumulative = await this.getCumulativeFeed(entry.cultureCycleId, entry.feedingDate);
    const isEditable =
      userRole === UserRole.OWNER ||
      (entry.status !== 'PENDING_OWNER_APPROVAL' &&
        isDateEditableBySupervisor(entry.feedingDate, timezone));
    const isLocked = !isEditable;

    return {
      id: entry.id,
      clientEntryId: entry.clientEntryId,
      farmId: entry.farmId,
      pondId: entry.pondId,
      pondName: entry.pond.name,
      cultureCycleId: entry.cultureCycleId,
      feedingDate: entry.feedingDate.toISOString().split('T')[0],
      doc: entry.doc,
      feedProductId: entry.feedProductId,
      feedCode: entry.feedProduct.feedCode,
      status: entry.status as FeedingEntryDto['status'],
      submissionType: entry.submissionType as FeedingEntryDto['submissionType'],
      syncStatus: entry.syncStatus as FeedingEntryDto['syncStatus'],
      remarks: entry.remarks,
      meals: entry.meals.map((m) => ({
        id: m.id,
        mealNumber: m.mealNumber,
        scheduledTime: m.scheduledTime,
        actualTime: m.actualTime,
        feedQuantityKg: decimalToString(m.feedQuantityKg),
        checkTrayRemainingPercentage: m.checkTrayRemainingPercentage as FeedingEntryDto['meals'][0]['checkTrayRemainingPercentage'],
        appetiteStatus: m.appetiteStatus as FeedingEntryDto['meals'][0]['appetiteStatus'],
        remarks: m.remarks,
      })),
      totalDailyFeedKg: tdf,
      cumulativeFeedKg: cumulative,
      enteredByUserId: entry.enteredByUserId,
      enteredByName: entry.enteredBy.displayName,
      version: entry.version,
      isEditable,
      isLocked,
      lockMessage: isLocked
        ? 'This entry is older than two days. Only the owner can make changes.'
        : undefined,
      deviceCreatedAt: entry.deviceCreatedAt?.toISOString() ?? null,
      serverCreatedAt: entry.serverCreatedAt.toISOString(),
      updatedAt: entry.updatedAt.toISOString(),
    };
  }
}
