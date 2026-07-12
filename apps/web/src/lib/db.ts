import Dexie, { type Table } from 'dexie';
import type { AuthUser, FeedingEntryDto, PondTodayStatusDto } from '@aqualedger/contracts';

export interface PendingOperation {
  id: string;
  clientOperationId: string;
  entityType: 'FEEDING_ENTRY' | 'INVENTORY_TRANSACTION' | 'FEEDING_MEAL';
  operationType: 'CREATE' | 'UPDATE';
  payload: Record<string, unknown>;
  status: 'PENDING_SYNC' | 'SYNCING' | 'SYNCED' | 'FAILED' | 'PENDING_APPROVAL';
  failureReason?: string;
  createdAt: string;
}

export interface LocalFeedingEntry extends FeedingEntryDto {
  localStatus: 'LOCAL_ONLY' | 'PENDING_SYNC' | 'SYNCED' | 'FAILED';
}

export class AquaLedgerDB extends Dexie {
  userProfile!: Table<AuthUser>;
  pondStatuses!: Table<PondTodayStatusDto & { farmId: string; updatedAt: string }>;
  feedingEntries!: Table<LocalFeedingEntry>;
  pendingOperations!: Table<PendingOperation>;
  syncMetadata!: Table<{ key: string; value: string }>;

  constructor() {
    super('AquaLedgerDB');
    this.version(1).stores({
      userProfile: 'id',
      pondStatuses: 'pondId, farmId',
      feedingEntries: 'id, clientEntryId, farmId, pondId, feedingDate',
      pendingOperations: 'id, clientOperationId, status',
      syncMetadata: 'key',
    });
  }
}

export const db = new AquaLedgerDB();

export function getDeviceId(): string {
  let id = localStorage.getItem('deviceId');
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem('deviceId', id);
  }
  return id;
}
