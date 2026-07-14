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
  sumDecimals,
  decimalToString,
  getFarmToday,
  parseDateOnly,
} from '../common/utils/date.utils';
import { feedingEntrySchema, feedingMealUpdateSchema } from '@aqualedger/validation';
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

  async updateEntry(
    entryId: string,
    input: Record<string, unknown>,
    userId: string,
    userRole: UserRole,
  ) {
    const feedProductId = input.feedProductId;
    if (typeof feedProductId !== 'string' || !feedProductId) {
      throw new BadRequestException('feedProductId is required');
    }

    const entry = await this.prisma.feedingEntry.findUnique({
      where: { id: entryId },
      include: { meals: true, farm: true, feedProduct: true, pond: true, enteredBy: true },
    });
    if (!entry) throw new NotFoundException('Entry not found');
    if (entry.status === 'VOIDED') throw new BadRequestException('Cannot edit a voided entry');

    this.checkEditPermission(entry, userRole, entry.farm.timezone);

    const product = await this.prisma.feedProduct.findFirst({
      where: { id: feedProductId, farmId: entry.farmId, organizationId: entry.organizationId, status: 'ACTIVE' },
    });
    if (!product) throw new NotFoundException('Feed product not found');

    if (entry.feedProductId === feedProductId) {
      const mapped = await this.prisma.feedingEntry.findUnique({
        where: { id: entryId },
        include: { meals: { orderBy: { mealNumber: 'asc' } }, pond: true, feedProduct: true, enteredBy: true, farm: true },
      });
      if (!mapped) throw new NotFoundException('Entry not found');
      return this.mapEntry(mapped, userRole, entry.farm.timezone);
    }

    // Inventory correction: reverse previous consumption and apply to new feed product.
    if (entry.status === 'CONFIRMED') {
      const tdf = sumDecimals(entry.meals.map((m) => m.feedQuantityKg));
      await this.inventory.reverseFeedConsumed(entry.id, userId, 'Feed code correction');
      await this.inventory.createFeedConsumed({
        farmId: entry.farmId,
        organizationId: entry.organizationId,
        feedProductId,
        pondId: entry.pondId,
        feedingEntryId: entry.id,
        quantityKg: tdf,
        transactionDate: entry.feedingDate.toISOString().split('T')[0],
        userId,
        clientTransactionId: uuidv4(),
      });
    }

    const updated = await this.prisma.feedingEntry.update({
      where: { id: entryId },
      data: { feedProductId, version: { increment: 1 } },
      include: { meals: { orderBy: { mealNumber: 'asc' } }, pond: true, feedProduct: true, enteredBy: true, farm: true },
    });

    await this.audit.log({
      organizationId: entry.organizationId,
      farmId: entry.farmId,
      userId,
      entityType: 'FEEDING_ENTRY',
      entityId: entryId,
      action: 'UPDATE',
      previousValue: { feedProductId: entry.feedProductId },
      newValue: { feedProductId },
    });

    return this.mapEntry(updated, userRole, entry.farm.timezone);
  }

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

    const feedingDate = parseDateOnly(data.feedingDate);
    const doc = calculateDoc(cycle.stockingDate, feedingDate);
    const isSupervisor = userRole === UserRole.SUPERVISOR;

    if (isSupervisor && !isDateEditableBySupervisor(feedingDate, farm.timezone)) {
      throw new ForbiddenException(
        'Supervisors can only enter or change feeding for today and yesterday. Ask the owner for older dates.',
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

    const status: FeedingEntryStatus = 'CONFIRMED';
    const submissionType: SubmissionType = 'NORMAL';

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

  async updateMeal(
    entryId: string,
    mealId: string,
    input: Record<string, unknown>,
    userId: string,
    userRole: UserRole,
  ) {
    const parsed = feedingMealUpdateSchema.safeParse(input);
    if (!parsed.success) {
      const message = parsed.error.errors.map((e) => e.message).join(', ');
      throw new BadRequestException(message || 'Invalid meal update');
    }

    const entry = await this.prisma.feedingEntry.findUnique({
      where: { id: entryId },
      include: { meals: true, farm: true, pond: true, feedProduct: true, enteredBy: true },
    });
    if (!entry) throw new NotFoundException('Entry not found');
    if (entry.status === 'VOIDED') {
      throw new BadRequestException('Cannot edit meals on a voided entry');
    }

    this.checkEditPermission(entry, userRole, entry.farm.timezone);

    const meal = entry.meals.find((m) => m.id === mealId);
    if (!meal) throw new NotFoundException('Meal not found');

    const previousValue = {
      feedQuantityKg: meal.feedQuantityKg.toString(),
      actualTime: meal.actualTime,
      checkTrayRemainingPercentage: meal.checkTrayRemainingPercentage,
      appetiteStatus: meal.appetiteStatus,
      remarks: meal.remarks,
    };

    await this.prisma.feedingMeal.update({
      where: { id: mealId },
      data: {
        feedQuantityKg: parsed.data.feedQuantityKg,
        actualTime: parsed.data.actualTime,
        checkTrayRemainingPercentage: parsed.data.checkTrayRemainingPercentage as never,
        appetiteStatus: parsed.data.appetiteStatus as never,
        remarks: parsed.data.remarks,
      },
    });

    const updated = await this.prisma.feedingEntry.update({
      where: { id: entryId },
      data: { version: { increment: 1 } },
      include: { meals: true, pond: true, feedProduct: true, enteredBy: true, farm: true },
    });

    await this.resyncFeedConsumed(updated, userId);

    await this.audit.log({
      organizationId: entry.organizationId,
      farmId: entry.farmId,
      userId,
      entityType: 'FEEDING_MEAL',
      entityId: mealId,
      action: 'UPDATE',
      previousValue,
      newValue: parsed.data as Record<string, unknown>,
    });

    return this.mapEntry(updated, userRole, entry.farm.timezone);
  }

  private async resyncFeedConsumed(
    entry: {
      id: string;
      farmId: string;
      organizationId: string;
      feedProductId: string;
      pondId: string;
      feedingDate: Date;
      status: FeedingEntryStatus;
      meals: Array<{ feedQuantityKg: { toString(): string } }>;
    },
    userId: string,
  ) {
    if (entry.status !== 'CONFIRMED') return;

    const confirmed = await this.prisma.inventoryTransaction.findMany({
      where: { feedingEntryId: entry.id, type: 'FEED_CONSUMED', status: 'CONFIRMED' },
    });

    for (const _ of confirmed) {
      await this.inventory.reverseFeedConsumed(entry.id, userId, 'Feeding correction');
    }

    const totalTdf = sumDecimals(entry.meals.map((m) => m.feedQuantityKg));
    if (parseFloat(totalTdf) > 0) {
      await this.inventory.createFeedConsumed({
        farmId: entry.farmId,
        organizationId: entry.organizationId,
        feedProductId: entry.feedProductId,
        pondId: entry.pondId,
        feedingEntryId: entry.id,
        quantityKg: totalTdf,
        transactionDate: entry.feedingDate.toISOString().split('T')[0],
        userId,
        clientTransactionId: uuidv4(),
      });
    }
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
      if (filters.dateFrom) (where.feedingDate as Record<string, Date>).gte = parseDateOnly(filters.dateFrom);
      if (filters.dateTo) (where.feedingDate as Record<string, Date>).lte = parseDateOnly(filters.dateTo);
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

  async getCumulativeFeed(
    cultureCycleId: string,
    upToDate?: Date,
    statuses: FeedingEntryStatus[] = ['CONFIRMED'],
  ): Promise<string> {
    const where: Record<string, unknown> = {
      cultureCycleId,
      status: { in: statuses },
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

  async getFarmTotalFeedUsed(farmId: string): Promise<string> {
    const result = await this.prisma.feedingMeal.aggregate({
      where: {
        feedingEntry: {
          farmId,
          status: { not: 'VOIDED' },
        },
      },
      _sum: { feedQuantityKg: true },
    });

    if (!result._sum.feedQuantityKg) return '0.000';
    return decimalToString(result._sum.feedQuantityKg);
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
        'Supervisors can only enter or change feeding for today and yesterday. Ask the owner for older dates.',
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
        ? 'Supervisors can only change feeding for today and yesterday. Ask the owner for older dates.'
        : undefined,
      deviceCreatedAt: entry.deviceCreatedAt?.toISOString() ?? null,
      serverCreatedAt: entry.serverCreatedAt.toISOString(),
      updatedAt: entry.updatedAt.toISOString(),
    };
  }
}
