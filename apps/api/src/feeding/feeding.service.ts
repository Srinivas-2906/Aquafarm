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
import { feedingEntrySchema, feedingMealUpdateSchema, feedingMealsSyncSchema } from '@aqualedger/validation';
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
    organizationId: string,
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
    if (entry.organizationId !== organizationId) {
      throw new ForbiddenException('You do not have permission for this action');
    }
    if (userRole !== UserRole.OWNER) {
      const access = await this.prisma.farmUser.findFirst({
        where: { farmId: entry.farmId, userId, status: 'ACTIVE' },
        select: { id: true },
      });
      if (!access) throw new ForbiddenException('You do not have access to this farm');
    }
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
    if (farm.organizationId !== organizationId) {
      throw new ForbiddenException('You do not have access to this farm');
    }

    const cycle = await this.prisma.cultureCycle.findUnique({
      where: { id: data.cultureCycleId },
    });
    if (!cycle || cycle.status !== 'ACTIVE') {
      throw new BadRequestException('No active culture cycle for this pond');
    }

    const feedingDate = parseDateOnly(data.feedingDate);
    const stockingDate = await this.syncCycleStockingAndDocs(cycle.id, feedingDate);
    const doc = calculateDoc(stockingDate, feedingDate);
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
            feedProductId: m.feedProductId ?? data.feedProductId,
            checkTrayRemainingPercentage: m.checkTrayRemainingPercentage,
            appetiteStatus: m.appetiteStatus,
            remarks: m.remarks,
          })),
        },
      },
      include: {
        meals: { orderBy: { mealNumber: 'asc' }, include: { feedProduct: true } },
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
      await this.resyncFeedConsumed(entry, userId);
    }

    return this.mapEntry(entry, userRole, farm.timezone);
  }

  async addMeal(
    entryId: string,
    meal: {
      mealNumber: number;
      feedQuantityKg: string;
      feedProductId?: string;
      actualTime?: string;
      checkTrayRemainingPercentage?: string;
      appetiteStatus?: string;
      remarks?: string;
    },
    userId: string,
    userRole: UserRole,
    organizationId: string,
  ) {
    const entry = await this.prisma.feedingEntry.findUnique({
      where: { id: entryId },
      include: { meals: true, farm: true, pond: true, feedProduct: true, enteredBy: true },
    });
    if (!entry) throw new NotFoundException('Entry not found');
    if (entry.organizationId !== organizationId) {
      throw new ForbiddenException('You do not have permission for this action');
    }
    if (userRole !== UserRole.OWNER) {
      const access = await this.prisma.farmUser.findFirst({
        where: { farmId: entry.farmId, userId, status: 'ACTIVE' },
        select: { id: true },
      });
      if (!access) throw new ForbiddenException('You do not have access to this farm');
    }
    if (entry.status === 'VOIDED') {
      throw new BadRequestException('Cannot add meals to a voided entry');
    }

    this.checkEditPermission(entry, userRole, entry.farm.timezone);

    const existingMeal = entry.meals.find((m) => m.mealNumber === meal.mealNumber);
    if (existingMeal) {
      throw new ConflictException(`Meal ${meal.mealNumber} already exists`);
    }

    let feedProductId = meal.feedProductId ?? entry.feedProductId;
    if (meal.feedProductId) {
      const product = await this.prisma.feedProduct.findFirst({
        where: {
          id: meal.feedProductId,
          farmId: entry.farmId,
          organizationId,
          status: 'ACTIVE',
        },
      });
      if (!product) throw new BadRequestException('Select a valid feed code');
      feedProductId = product.id;
    }

    await this.prisma.feedingMeal.create({
      data: {
        feedingEntryId: entryId,
        mealNumber: meal.mealNumber,
        feedQuantityKg: meal.feedQuantityKg,
        feedProductId,
        actualTime: meal.actualTime || new Date().toTimeString().slice(0, 5),
        checkTrayRemainingPercentage: meal.checkTrayRemainingPercentage as never,
        appetiteStatus: meal.appetiteStatus as never,
        remarks: meal.remarks,
      },
    });

    const updated = await this.prisma.feedingEntry.update({
      where: { id: entryId },
      data: { version: { increment: 1 } },
      include: {
        meals: { orderBy: { mealNumber: 'asc' }, include: { feedProduct: true } },
        pond: true,
        feedProduct: true,
        enteredBy: true,
        farm: true,
      },
    });

    if (entry.status === 'CONFIRMED') {
      await this.resyncFeedConsumed(updated, userId);
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
    organizationId: string,
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
    if (entry.organizationId !== organizationId) {
      throw new ForbiddenException('You do not have permission for this action');
    }
    if (userRole !== UserRole.OWNER) {
      const access = await this.prisma.farmUser.findFirst({
        where: { farmId: entry.farmId, userId, status: 'ACTIVE' },
        select: { id: true },
      });
      if (!access) throw new ForbiddenException('You do not have access to this farm');
    }
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

    const mealUpdateData: Record<string, unknown> = {};
    if (parsed.data.feedQuantityKg !== undefined) {
      mealUpdateData.feedQuantityKg = parsed.data.feedQuantityKg;
    }
    if (parsed.data.feedProductId !== undefined) {
      const product = await this.prisma.feedProduct.findFirst({
        where: {
          id: parsed.data.feedProductId,
          farmId: entry.farmId,
          organizationId,
          status: 'ACTIVE',
        },
      });
      if (!product) throw new BadRequestException('Select a valid feed code');
      mealUpdateData.feedProductId = parsed.data.feedProductId;
    }
    if (parsed.data.actualTime !== undefined) mealUpdateData.actualTime = parsed.data.actualTime;
    if (parsed.data.checkTrayRemainingPercentage !== undefined) {
      mealUpdateData.checkTrayRemainingPercentage = parsed.data.checkTrayRemainingPercentage;
    }
    if (parsed.data.appetiteStatus !== undefined) {
      mealUpdateData.appetiteStatus = parsed.data.appetiteStatus;
    }
    if (parsed.data.remarks !== undefined) mealUpdateData.remarks = parsed.data.remarks;

    await this.prisma.feedingMeal.update({
      where: { id: mealId },
      data: mealUpdateData as never,
    });

    const updated = await this.prisma.feedingEntry.update({
      where: { id: entryId },
      data: { version: { increment: 1 } },
      include: {
        meals: { orderBy: { mealNumber: 'asc' }, include: { feedProduct: true } },
        pond: true,
        feedProduct: true,
        enteredBy: true,
        farm: true,
      },
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

  async clearAllMeals(
    entryId: string,
    userId: string,
    userRole: UserRole,
    organizationId: string,
  ): Promise<null> {
    const entry = await this.prisma.feedingEntry.findUnique({
      where: { id: entryId },
      include: { meals: true, farm: true, pond: true, feedProduct: true, enteredBy: true },
    });
    if (!entry) throw new NotFoundException('Entry not found');
    if (entry.organizationId !== organizationId) {
      throw new ForbiddenException('You do not have permission for this action');
    }
    if (userRole !== UserRole.OWNER) {
      const access = await this.prisma.farmUser.findFirst({
        where: { farmId: entry.farmId, userId, status: 'ACTIVE' },
        select: { id: true },
      });
      if (!access) throw new ForbiddenException('You do not have access to this farm');
    }
    if (entry.status === 'VOIDED') {
      throw new BadRequestException('Cannot edit meals on a voided entry');
    }

    this.checkEditPermission(entry, userRole, entry.farm.timezone);

    const previousMeals = entry.meals.map((meal) => ({
      id: meal.id,
      mealNumber: meal.mealNumber,
      feedQuantityKg: meal.feedQuantityKg.toString(),
      feedProductId: meal.feedProductId,
      actualTime: meal.actualTime,
    }));

    if (entry.status === 'CONFIRMED') {
      await this.inventory.reverseFeedConsumed(entryId, userId, 'All feeds removed');
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.checkTrayObservation.updateMany({
        where: { feedingEntryId: entryId },
        data: { feedingMealId: null },
      });
      await tx.inventoryTransaction.updateMany({
        where: { feedingEntryId: entryId },
        data: { feedingEntryId: null },
      });
      await tx.feedingMeal.deleteMany({ where: { feedingEntryId: entryId } });
      await tx.feedingEntry.delete({ where: { id: entryId } });
    });

    await this.audit.log({
      organizationId: entry.organizationId,
      farmId: entry.farmId,
      userId,
      entityType: 'FEEDING_ENTRY',
      entityId: entryId,
      action: 'UPDATE',
      previousValue: { meals: previousMeals },
      newValue: { meals: [] },
      reason: 'All feeds removed',
    });

    return null;
  }

  async syncMeals(
    entryId: string,
    input: Record<string, unknown>,
    userId: string,
    userRole: UserRole,
    organizationId: string,
  ): Promise<FeedingEntryDto | null> {
    const parsed = feedingMealsSyncSchema.safeParse(input);
    if (!parsed.success) {
      const message = parsed.error.errors.map((e) => e.message).join(', ');
      throw new BadRequestException(message || 'Invalid meals sync');
    }

    const entry = await this.prisma.feedingEntry.findUnique({
      where: { id: entryId },
      include: { meals: true, farm: true, pond: true, feedProduct: true, enteredBy: true },
    });
    if (!entry) throw new NotFoundException('Entry not found');
    if (entry.organizationId !== organizationId) {
      throw new ForbiddenException('You do not have permission for this action');
    }
    if (userRole !== UserRole.OWNER) {
      const access = await this.prisma.farmUser.findFirst({
        where: { farmId: entry.farmId, userId, status: 'ACTIVE' },
        select: { id: true },
      });
      if (!access) throw new ForbiddenException('You do not have access to this farm');
    }
    if (entry.status === 'VOIDED') {
      throw new BadRequestException('Cannot edit meals on a voided entry');
    }

    this.checkEditPermission(entry, userRole, entry.farm.timezone);

    const payloadMeals = parsed.data.meals;
    const payloadIds = new Set(
      payloadMeals.map((meal) => meal.id).filter((id): id is string => !!id),
    );
    const existingIds = new Set(entry.meals.map((meal) => meal.id));
    for (const id of payloadIds) {
      if (!existingIds.has(id)) {
        throw new BadRequestException('One or more meals do not belong to this entry');
      }
    }

    if (payloadMeals.length === 0) {
      return this.clearAllMeals(entryId, userId, userRole, organizationId);
    }

    const productIds = [...new Set(payloadMeals.map((meal) => meal.feedProductId))];
    const products = await this.prisma.feedProduct.findMany({
      where: {
        id: { in: productIds },
        farmId: entry.farmId,
        organizationId,
        status: 'ACTIVE',
      },
      select: { id: true },
    });
    if (products.length !== productIds.length) {
      throw new BadRequestException('Select a valid feed code');
    }

    const previousMealsForAudit = entry.meals.map((meal) => ({
      id: meal.id,
      mealNumber: meal.mealNumber,
      feedQuantityKg: meal.feedQuantityKg.toString(),
      feedProductId: meal.feedProductId,
      actualTime: meal.actualTime,
    }));

    await this.prisma.$transaction(async (tx) => {
      const mealsToDelete = entry.meals.filter((meal) => !payloadIds.has(meal.id));
      for (const meal of mealsToDelete) {
        await tx.checkTrayObservation.updateMany({
          where: { feedingMealId: meal.id },
          data: { feedingMealId: null },
        });
        await tx.feedingMeal.delete({ where: { id: meal.id } });
      }

      const mealsToKeep = entry.meals.filter((meal) => payloadIds.has(meal.id));
      for (let index = 0; index < mealsToKeep.length; index += 1) {
        await tx.feedingMeal.update({
          where: { id: mealsToKeep[index].id },
          data: { mealNumber: 100 + index },
        });
      }

      for (let index = 0; index < payloadMeals.length; index += 1) {
        const meal = payloadMeals[index];
        const mealNumber = index + 1;
        const actualTime = meal.actualTime || new Date().toTimeString().slice(0, 5);
        if (meal.id) {
          await tx.feedingMeal.update({
            where: { id: meal.id },
            data: {
              mealNumber,
              feedQuantityKg: meal.feedQuantityKg,
              feedProductId: meal.feedProductId,
              actualTime,
            },
          });
        } else {
          await tx.feedingMeal.create({
            data: {
              feedingEntryId: entryId,
              mealNumber,
              feedQuantityKg: meal.feedQuantityKg,
              feedProductId: meal.feedProductId,
              actualTime,
            },
          });
        }
      }

      await tx.feedingEntry.update({
        where: { id: entryId },
        data: { version: { increment: 1 } },
      });
    });

    const updated = await this.prisma.feedingEntry.findUnique({
      where: { id: entryId },
      include: {
        meals: { orderBy: { mealNumber: 'asc' }, include: { feedProduct: true } },
        pond: true,
        feedProduct: true,
        enteredBy: true,
        farm: true,
      },
    });
    if (!updated) throw new NotFoundException('Entry not found');

    await this.resyncFeedConsumed(updated, userId);

    await this.audit.log({
      organizationId: entry.organizationId,
      farmId: entry.farmId,
      userId,
      entityType: 'FEEDING_ENTRY',
      entityId: entryId,
      action: 'UPDATE',
      previousValue: { meals: previousMealsForAudit },
      newValue: {
        meals: updated.meals.map((meal) => ({
          id: meal.id,
          mealNumber: meal.mealNumber,
          feedQuantityKg: meal.feedQuantityKg.toString(),
          feedProductId: meal.feedProductId,
          actualTime: meal.actualTime,
        })),
      },
    });

    return this.mapEntry(updated, userRole, entry.farm.timezone);
  }

  private async syncCycleStockingAndDocs(cycleId: string, feedingDate: Date): Promise<Date> {
    const cycle = await this.prisma.cultureCycle.findUnique({ where: { id: cycleId } });
    if (!cycle) throw new BadRequestException('No active culture cycle for this pond');

    let stockingDate = cycle.stockingDate;
    if (feedingDate < stockingDate) {
      stockingDate = feedingDate;
      await this.prisma.cultureCycle.update({
        where: { id: cycleId },
        data: { stockingDate },
      });
    }

    const entries = await this.prisma.feedingEntry.findMany({
      where: { cultureCycleId: cycleId, status: { not: 'VOIDED' } },
      select: { id: true, feedingDate: true, doc: true },
    });

    await Promise.all(
      entries.map((entry) => {
        const doc = calculateDoc(stockingDate, entry.feedingDate);
        if (entry.doc === doc) return Promise.resolve();
        return this.prisma.feedingEntry.update({
          where: { id: entry.id },
          data: { doc },
        });
      }),
    );

    return stockingDate;
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
      meals: Array<{ feedProductId: string | null; feedQuantityKg: { toString(): string } }>;
    },
    userId: string,
  ) {
    if (entry.status !== 'CONFIRMED') return;

    await this.inventory.reverseFeedConsumed(entry.id, userId, 'Feeding correction');

    const byProduct = new Map<string, number>();
    for (const meal of entry.meals) {
      const productId = meal.feedProductId ?? entry.feedProductId;
      const qty = parseFloat(meal.feedQuantityKg.toString());
      if (qty <= 0) continue;
      byProduct.set(productId, (byProduct.get(productId) ?? 0) + qty);
    }

    const txDate = entry.feedingDate.toISOString().split('T')[0];
    for (const [feedProductId, qty] of byProduct) {
      await this.inventory.createFeedConsumed({
        farmId: entry.farmId,
        organizationId: entry.organizationId,
        feedProductId,
        pondId: entry.pondId,
        feedingEntryId: entry.id,
        quantityKg: qty.toFixed(3),
        transactionDate: txDate,
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
          meals: { orderBy: { mealNumber: 'asc' }, include: { feedProduct: true } },
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

  async findOne(id: string, userId: string, userRole: UserRole, organizationId: string) {
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
    if (entry.organizationId !== organizationId) {
      throw new ForbiddenException('You do not have permission for this action');
    }
    if (userRole !== UserRole.OWNER) {
      const access = await this.prisma.farmUser.findFirst({
        where: { farmId: entry.farmId, userId, status: 'ACTIVE' },
        select: { id: true },
      });
      if (!access) throw new ForbiddenException('You do not have access to this farm');
    }
    return this.mapEntry(entry, userRole, entry.farm.timezone);
  }

  async void(id: string, reason: string, userId: string, userRole: UserRole, organizationId: string) {
    if (userRole !== UserRole.OWNER) {
      throw new ForbiddenException('Only the owner can void entries');
    }

    const entry = await this.prisma.feedingEntry.findUnique({
      where: { id },
      include: { meals: true, farm: true, pond: true, feedProduct: true, enteredBy: true },
    });
    if (!entry) throw new NotFoundException('Entry not found');
    if (entry.organizationId !== organizationId) {
      throw new ForbiddenException('You do not have permission for this action');
    }
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

  async getFarmFeedUsedByCode(farmId: string) {
    const meals = await this.prisma.feedingMeal.findMany({
      where: {
        feedingEntry: {
          farmId,
          status: { not: 'VOIDED' },
        },
      },
      select: {
        feedQuantityKg: true,
        feedProductId: true,
        feedProduct: { select: { feedCode: true } },
        feedingEntry: {
          select: {
            feedProductId: true,
            feedProduct: { select: { feedCode: true } },
            pond: { select: { id: true, name: true, code: true } },
          },
        },
      },
    });

    const feedCodeOrder = ['1C', '2C', '20', '3S', '3SP', '3P'];
    const byProduct = new Map<
      string,
      {
        feedProductId: string;
        feedCode: string;
        totalUsedKg: number;
        byPond: Map<
          string,
          { pondId: string; pondName: string; pondCode: string; usedKg: number }
        >;
      }
    >();

    for (const meal of meals) {
      const productId = meal.feedProductId ?? meal.feedingEntry.feedProductId;
      if (!productId) continue;

      const feedCode =
        meal.feedProduct?.feedCode ?? meal.feedingEntry.feedProduct?.feedCode ?? '—';
      const qty = parseFloat(meal.feedQuantityKg.toString());
      if (qty <= 0) continue;

      if (!byProduct.has(productId)) {
        byProduct.set(productId, {
          feedProductId: productId,
          feedCode,
          totalUsedKg: 0,
          byPond: new Map(),
        });
      }

      const item = byProduct.get(productId)!;
      item.totalUsedKg += qty;

      const pond = meal.feedingEntry.pond;
      if (!item.byPond.has(pond.id)) {
        item.byPond.set(pond.id, {
          pondId: pond.id,
          pondName: pond.name,
          pondCode: pond.code,
          usedKg: 0,
        });
      }
      item.byPond.get(pond.id)!.usedKg += qty;
    }

    return Array.from(byProduct.values())
      .sort((a, b) => feedCodeOrder.indexOf(a.feedCode) - feedCodeOrder.indexOf(b.feedCode))
      .map((item) => ({
        feedProductId: item.feedProductId,
        feedCode: item.feedCode,
        totalUsedKg: item.totalUsedKg.toFixed(3),
        byPond: Array.from(item.byPond.values())
          .sort((a, b) => a.pondCode.localeCompare(b.pondCode))
          .map((pond) => ({
            pondId: pond.pondId,
            pondName: pond.pondName,
            pondCode: pond.pondCode,
            feedUsedKg: pond.usedKg.toFixed(3),
          })),
      }));
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
        feedProductId: string | null;
        checkTrayRemainingPercentage: string | null;
        appetiteStatus: string | null;
        remarks: string | null;
        feedProduct?: { feedCode: string } | null;
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
        feedProductId: m.feedProductId,
        feedCode: m.feedProduct?.feedCode ?? entry.feedProduct.feedCode,
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
