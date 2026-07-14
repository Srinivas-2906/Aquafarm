import {
  AppetiteStatus,
  CheckTrayOption,
  CultureCycleStatus,
  FeedingEntryStatus,
  InventoryTransactionStatus,
  InventoryTransactionType,
  Language,
  PondType,
  SubmissionType,
  SyncStatus,
  UserRole,
  UserStatus,
} from '@aqualedger/types';

export interface AuthUser {
  id: string;
  organizationId: string;
  phoneNumber: string;
  displayName: string;
  role: UserRole;
  preferredLanguage: Language;
  status: UserStatus;
  mustChangePin: boolean;
  farms: FarmAccess[];
}

export interface FarmAccess {
  farmId: string;
  farmName: string;
  role: UserRole;
  timezone: string;
}

export interface LoginResponse {
  user: AuthUser;
  accessToken: string;
}

export interface FarmDto {
  id: string;
  organizationId: string;
  name: string;
  location: string | null;
  timezone: string;
  status: string;
}

export interface PondDto {
  id: string;
  farmId: string;
  name: string;
  code: string;
  type: PondType;
  area: string | null;
  status: string;
  activeCycle?: CultureCycleDto | null;
}

export interface CultureCycleDto {
  id: string;
  pondId: string;
  cycleName: string;
  stockingDate: string;
  species: string;
  usualMealsPerDay: number;
  status: CultureCycleStatus;
  doc?: number;
}

export interface FeedProductDto {
  id: string;
  farmId: string;
  brandName: string;
  feedCode: string;
  pelletSize: string | null;
  bagWeightKg: string;
  supplierName: string | null;
  lowStockThresholdKg?: string | null;
  status: string;
  currentStockKg?: string;
  equivalentBags?: number;
  isLowStock?: boolean;
}

export interface FeedingMealDto {
  id: string;
  mealNumber: number;
  scheduledTime: string | null;
  actualTime: string | null;
  feedQuantityKg: string;
  checkTrayRemainingPercentage: CheckTrayOption | null;
  appetiteStatus: AppetiteStatus | null;
  remarks: string | null;
}

export interface FeedingEntryDto {
  id: string;
  clientEntryId: string;
  farmId: string;
  pondId: string;
  pondName?: string;
  cultureCycleId: string;
  feedingDate: string;
  doc: number;
  feedProductId: string;
  feedCode?: string;
  status: FeedingEntryStatus;
  submissionType: SubmissionType;
  syncStatus: SyncStatus;
  remarks: string | null;
  meals: FeedingMealDto[];
  totalDailyFeedKg: string;
  cumulativeFeedKg: string;
  enteredByUserId: string;
  enteredByName?: string;
  version: number;
  isEditable: boolean;
  isLocked: boolean;
  lockMessage?: string;
  deviceCreatedAt: string | null;
  serverCreatedAt: string;
  updatedAt: string;
}

export interface InventoryTransactionDto {
  id: string;
  clientTransactionId: string;
  farmId: string;
  feedProductId: string;
  feedCode?: string;
  type: InventoryTransactionType;
  quantityKg: string;
  transactionDate: string;
  remarks: string | null;
  status: InventoryTransactionStatus;
  syncStatus: SyncStatus;
  enteredByName?: string;
  createdAt: string;
}

export interface InventorySummaryDto {
  feedProductId: string;
  feedCode: string;
  brandName: string;
  bagWeightKg: string;
  currentStockKg: string;
  equivalentBags: number;
  receivedThisMonthKg: string;
  consumedThisMonthKg: string;
  damagedThisMonthKg: string;
  consumedTodayKg: string;
  isLowStock: boolean;
}

export interface FarmInventoryTotalDto {
  farmId: string;
  totalStockKg: string;
}

export interface PondTodayStatusDto {
  pondId: string;
  pondName: string;
  pondCode: string;
  doc: number | null;
  mealsEntered: number;
  usualMealsPerDay: number;
  todayTotalFeedKg: string;
  lastMealTime: string | null;
  lastMealQuantityKg: string | null;
  feedCode: string | null;
  entryId: string | null;
  syncStatus: SyncStatus | null;
  isComplete: boolean;
  hasEntryToday: boolean;
}

export interface DashboardSummaryDto {
  activePonds: number;
  totalFeedTodayKg: string;
  totalFeedUsedKg: string;
  currentFeedStockKg: string;
  pendingApprovals: number;
  unsyncedRecords: number;
  lowStockProducts: number;
  pondStatuses: PondTodayStatusDto[];
  attentionItems: AttentionItemDto[];
}

export interface AttentionItemDto {
  type: string;
  title: string;
  description: string;
  entityId?: string;
  severity: 'info' | 'warning' | 'danger';
}

export interface AuditLogDto {
  id: string;
  userId: string;
  userName: string;
  entityType: string;
  entityId: string;
  action: string;
  previousValue: Record<string, unknown> | null;
  newValue: Record<string, unknown> | null;
  reason: string | null;
  serverTimestamp: string;
}

export interface ApprovalItemDto {
  id: string;
  type: 'FEEDING_ENTRY' | 'INVENTORY_TRANSACTION';
  supervisorName: string;
  pondName: string;
  entryDate: string;
  deviceCreatedAt: string | null;
  serverCreatedAt: string;
  totalFeedKg?: string;
  meals?: FeedingMealDto[];
  existingEntry?: FeedingEntryDto | null;
  submissionType: SubmissionType;
  reason: string;
}

export interface SyncOperationResult {
  clientOperationId: string;
  status: 'SUCCESS' | 'CONFLICT' | 'FAILED' | 'PENDING_APPROVAL';
  entityId?: string;
  failureReason?: string;
  serverData?: Record<string, unknown>;
}

export interface SyncBatchResponse {
  results: SyncOperationResult[];
  syncedCount: number;
  failedCount: number;
  pendingApprovalCount: number;
}

export interface SyncStatusDto {
  pendingCount: number;
  failedCount: number;
  lastSyncAt: string | null;
}
