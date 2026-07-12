import { db, getDeviceId, type PendingOperation } from './db';
import { api } from './api';
import { v4 as uuidv4 } from 'uuid';

export async function saveFeedingLocally(
  entry: Record<string, unknown>,
  farmId: string,
): Promise<{ clientEntryId: string; localStatus: string }> {
  const clientEntryId = (entry.clientEntryId as string) || uuidv4();
  const clientOperationId = uuidv4();

  const localEntry = {
    ...entry,
    id: clientEntryId,
    clientEntryId,
    localStatus: 'LOCAL_ONLY' as const,
    syncStatus: 'PENDING' as const,
    serverCreatedAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  await db.feedingEntries.put(localEntry as never);
  await db.pendingOperations.add({
    id: clientOperationId,
    clientOperationId,
    entityType: 'FEEDING_ENTRY',
    operationType: 'CREATE',
    payload: { ...entry, clientEntryId, farmId },
    status: 'PENDING_SYNC',
    createdAt: new Date().toISOString(),
  });

  if (navigator.onLine) {
    try {
      await syncPendingOperations(farmId);
      return { clientEntryId, localStatus: 'SYNCED' };
    } catch {
      return { clientEntryId, localStatus: 'PENDING_SYNC' };
    }
  }

  return { clientEntryId, localStatus: 'LOCAL_ONLY' };
}

export async function syncPendingOperations(farmId: string): Promise<{
  synced: number;
  failed: number;
  pendingApproval: number;
}> {
  const pending = await db.pendingOperations
    .where('status')
    .anyOf(['PENDING_SYNC', 'FAILED'])
    .toArray();

  if (pending.length === 0) return { synced: 0, failed: 0, pendingApproval: 0 };

  for (const op of pending) {
    await db.pendingOperations.update(op.id, { status: 'SYNCING' });
  }

  try {
    const result = await api.post<{
      results: Array<{ clientOperationId: string; status: string; failureReason?: string }>;
      syncedCount: number;
      failedCount: number;
      pendingApprovalCount: number;
    }>('/sync/batch', {
      deviceId: getDeviceId(),
      farmId,
      operations: pending.map((op) => ({
        clientOperationId: op.clientOperationId,
        entityType: op.entityType,
        operationType: op.operationType,
        payload: op.payload,
      })),
    });

    for (const r of result.results) {
      const op = pending.find((p) => p.clientOperationId === r.clientOperationId);
      if (!op) continue;

      if (r.status === 'SUCCESS') {
        await db.pendingOperations.update(op.id, { status: 'SYNCED' });
      } else if (r.status === 'PENDING_APPROVAL') {
        await db.pendingOperations.update(op.id, { status: 'PENDING_APPROVAL' });
      } else {
        await db.pendingOperations.update(op.id, {
          status: 'FAILED',
          failureReason: r.failureReason,
        });
      }
    }

    await db.syncMetadata.put({
      key: 'lastSyncAt',
      value: new Date().toISOString(),
    });

    return {
      synced: result.syncedCount,
      failed: result.failedCount,
      pendingApproval: result.pendingApprovalCount,
    };
  } catch (err) {
    for (const op of pending) {
      await db.pendingOperations.update(op.id, {
        status: 'FAILED',
        failureReason: err instanceof Error ? err.message : 'Sync failed',
      });
    }
    throw err;
  }
}

export async function getPendingCount(): Promise<number> {
  return db.pendingOperations
    .where('status')
    .anyOf(['PENDING_SYNC', 'FAILED', 'SYNCING'])
    .count();
}

export function getSyncStatusLabel(
  status: PendingOperation['status'] | string,
  t: (key: string) => string,
): string {
  const map: Record<string, string> = {
    LOCAL_ONLY: t('sync.savedOnPhone'),
    PENDING_SYNC: t('sync.waiting'),
    SYNCING: t('sync.sending'),
    SYNCED: t('sync.sent'),
    FAILED: t('sync.failed'),
    PENDING_APPROVAL: t('sync.ownerReview'),
  };
  return map[status] || status;
}
