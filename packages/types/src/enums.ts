export enum UserRole {
  OWNER = 'OWNER',
  SUPERVISOR = 'SUPERVISOR',
}

export enum UserStatus {
  ACTIVE = 'ACTIVE',
  INACTIVE = 'INACTIVE',
  PENDING_ACTIVATION = 'PENDING_ACTIVATION',
}

export enum PondType {
  POND = 'POND',
  TANK = 'TANK',
}

export enum CultureCycleStatus {
  PLANNED = 'PLANNED',
  ACTIVE = 'ACTIVE',
  COMPLETED = 'COMPLETED',
  CANCELLED = 'CANCELLED',
}

export enum FeedingEntryStatus {
  DRAFT = 'DRAFT',
  CONFIRMED = 'CONFIRMED',
  PENDING_OWNER_APPROVAL = 'PENDING_OWNER_APPROVAL',
  VOIDED = 'VOIDED',
}

export enum SubmissionType {
  NORMAL = 'NORMAL',
  LATE_OFFLINE_SUBMISSION = 'LATE_OFFLINE_SUBMISSION',
}

export enum SyncStatus {
  SYNCED = 'SYNCED',
  PENDING = 'PENDING',
  FAILED = 'FAILED',
  LOCAL_ONLY = 'LOCAL_ONLY',
}

export enum InventoryTransactionType {
  OPENING_BALANCE = 'OPENING_BALANCE',
  FEED_RECEIVED = 'FEED_RECEIVED',
  FEED_CONSUMED = 'FEED_CONSUMED',
  DAMAGED = 'DAMAGED',
  WASTAGE = 'WASTAGE',
  MANUAL_ADJUSTMENT_IN = 'MANUAL_ADJUSTMENT_IN',
  MANUAL_ADJUSTMENT_OUT = 'MANUAL_ADJUSTMENT_OUT',
  REVERSAL = 'REVERSAL',
}

export enum InventoryTransactionStatus {
  CONFIRMED = 'CONFIRMED',
  PENDING_APPROVAL = 'PENDING_APPROVAL',
  REVERSED = 'REVERSED',
}

export enum AppetiteStatus {
  EXCELLENT = 'EXCELLENT',
  NORMAL = 'NORMAL',
  SLOW = 'SLOW',
  POOR = 'POOR',
  FEED_REMAINING = 'FEED_REMAINING',
}

export enum CheckTrayOption {
  FULLY_CONSUMED = 'FULLY_CONSUMED',
  LESS_THAN_5 = 'LESS_THAN_5',
  BETWEEN_5_10 = 'BETWEEN_5_10',
  BETWEEN_10_25 = 'BETWEEN_10_25',
  MORE_THAN_25 = 'MORE_THAN_25',
  NOT_CHECKED = 'NOT_CHECKED',
}

export enum AuditAction {
  CREATE = 'CREATE',
  UPDATE = 'UPDATE',
  VOID = 'VOID',
  APPROVE = 'APPROVE',
  REJECT = 'REJECT',
  REVERSE = 'REVERSE',
  DEACTIVATE = 'DEACTIVATE',
  CONFLICT_RESOLVE = 'CONFLICT_RESOLVE',
}

export enum ReportType {
  DAILY_FEEDING = 'DAILY_FEEDING',
  FEEDING_DATE_RANGE = 'FEEDING_DATE_RANGE',
  POND_FEEDING = 'POND_FEEDING',
  DOC_WISE_FEEDING = 'DOC_WISE_FEEDING',
  CUMULATIVE_FEED = 'CUMULATIVE_FEED',
  FEED_CODE_USAGE = 'FEED_CODE_USAGE',
  INVENTORY_SUMMARY = 'INVENTORY_SUMMARY',
  INVENTORY_TRANSACTIONS = 'INVENTORY_TRANSACTIONS',
  SUPERVISOR_ACTIVITY = 'SUPERVISOR_ACTIVITY',
  AUDIT_REPORT = 'AUDIT_REPORT',
}

export enum Language {
  EN = 'en',
  TE = 'te',
}

export type DecimalString = string;

export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

export interface ApiError {
  statusCode: number;
  message: string;
  error?: string;
  correlationId?: string;
}

export interface ConflictResponse {
  statusCode: 409;
  message: string;
  serverVersion: number;
  clientVersion: number;
  serverData: Record<string, unknown>;
  clientData: Record<string, unknown>;
}
