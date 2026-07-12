import { z } from 'zod';
import {
  AppetiteStatus,
  CheckTrayOption,
  InventoryTransactionType,
  UserRole,
} from '@aqualedger/types';

const phoneRegex = /^[6-9]\d{9}$/;
const pinRegex = /^\d{6}$/;
const decimalKg = z
  .string()
  .regex(/^\d+(\.\d{1,3})?$/, 'Enter a valid quantity in kg')
  .refine((v) => parseFloat(v) > 0, 'Quantity must be greater than zero');

export const loginSchema = z.object({
  phoneNumber: z.string().regex(phoneRegex, 'Enter a valid 10-digit phone number'),
  pin: z.string().regex(pinRegex, 'PIN must be 6 digits'),
});

export const activateSchema = z.object({
  phoneNumber: z.string().regex(phoneRegex),
  activationCode: z.string().min(4),
  pin: z.string().regex(pinRegex),
  displayName: z.string().min(2).max(100),
});

export const resetPinSchema = z.object({
  phoneNumber: z.string().regex(phoneRegex),
  otp: z.string().length(6),
  newPin: z.string().regex(pinRegex),
});

export const createUserSchema = z.object({
  phoneNumber: z.string().regex(phoneRegex),
  displayName: z.string().min(2).max(100),
  role: z.nativeEnum(UserRole),
});

export const feedingMealSchema = z.object({
  mealNumber: z.number().int().min(1).max(10),
  scheduledTime: z.string().optional(),
  actualTime: z.string().optional(),
  feedQuantityKg: decimalKg,
  checkTrayRemainingPercentage: z.nativeEnum(CheckTrayOption).optional(),
  appetiteStatus: z.nativeEnum(AppetiteStatus).optional(),
  remarks: z.string().max(500).optional(),
});

const entityId = z.string().min(1).max(100);

export const feedingEntrySchema = z.object({
  clientEntryId: z.string().uuid(),
  farmId: entityId,
  pondId: z.string().uuid(),
  cultureCycleId: entityId,
  feedingDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  feedProductId: z.string().uuid(),
  meals: z.array(feedingMealSchema).min(1, 'Enter the feed quantity for at least one meal'),
  remarks: z.string().max(1000).optional(),
  deviceCreatedAt: z.string().datetime().optional(),
  version: z.number().int().optional(),
});

export const feedingEntryUpdateSchema = feedingEntrySchema.partial().extend({
  version: z.number().int(),
});

export const voidEntrySchema = z.object({
  reason: z.string().min(3).max(500),
});

export const inventoryTransactionSchema = z.object({
  clientTransactionId: z.string().uuid(),
  farmId: entityId,
  feedProductId: z.string().uuid(),
  type: z.nativeEnum(InventoryTransactionType),
  quantityKg: decimalKg,
  transactionDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  pondId: z.string().uuid().optional(),
  feedingEntryId: z.string().uuid().optional(),
  remarks: z.string().max(1000).optional(),
  supplierName: z.string().max(200).optional(),
  referenceNumber: z.string().max(100).optional(),
  numberOfBags: z.number().int().positive().optional(),
});

export const pondSchema = z.object({
  name: z.string().min(1).max(100),
  code: z.string().min(1).max(20),
  type: z.enum(['POND', 'TANK']),
  area: z.string().optional(),
  areaUnit: z.string().optional(),
  capacity: z.string().optional(),
});

export const cultureCycleSchema = z.object({
  pondId: z.string().uuid(),
  cycleName: z.string().min(1).max(100),
  stockingDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  species: z.string().min(1).max(100),
  seedCount: z.number().int().positive().optional(),
  stockingDensity: z.string().optional(),
  initialAverageWeight: z.string().optional(),
  expectedHarvestDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  usualMealsPerDay: z.number().int().min(1).max(10).default(4),
});

export const feedProductSchema = z.object({
  brandName: z.string().min(1).max(100),
  feedCode: z.string().min(1).max(20),
  pelletSize: z.string().max(50).optional(),
  bagWeightKg: z.string().regex(/^\d+(\.\d{1,3})?$/),
  supplierName: z.string().max(200).optional(),
  lowStockThresholdKg: z.string().optional(),
});

export const reportFilterSchema = z.object({
  farmId: entityId,
  reportType: z.string(),
  pondId: z.string().uuid().optional(),
  cultureCycleId: entityId.optional(),
  feedProductId: z.string().uuid().optional(),
  userId: z.string().uuid().optional(),
  dateFrom: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  dateTo: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
});

export const syncOperationSchema = z.object({
  clientOperationId: z.string().uuid(),
  entityType: z.enum(['FEEDING_ENTRY', 'INVENTORY_TRANSACTION', 'FEEDING_MEAL']),
  operationType: z.enum(['CREATE', 'UPDATE']),
  payload: z.record(z.unknown()),
  clientVersion: z.number().int().optional(),
});

export const syncBatchSchema = z.object({
  deviceId: z.string().uuid(),
  farmId: entityId,
  operations: z.array(syncOperationSchema).min(1),
});

export const approvalActionSchema = z.object({
  reason: z.string().max(500).optional(),
  correctedPayload: z.record(z.unknown()).optional(),
});

export type LoginInput = z.infer<typeof loginSchema>;
export type FeedingEntryInput = z.infer<typeof feedingEntrySchema>;
export type InventoryTransactionInput = z.infer<typeof inventoryTransactionSchema>;
export type SyncBatchInput = z.infer<typeof syncBatchSchema>;
