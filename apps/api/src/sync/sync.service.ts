import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { FeedingService } from '../feeding/feeding.service';
import { InventoryService } from '../inventory/inventory.service';
import { syncBatchSchema } from '@aqualedger/validation';
import { BadRequestException } from '@nestjs/common';
import { UserRole } from '@prisma/client';

@Injectable()
export class SyncService {
  constructor(
    private prisma: PrismaService,
    private feeding: FeedingService,
    private inventory: InventoryService,
  ) {}

  async processBatch(
    input: Record<string, unknown>,
    userId: string,
    userRole: UserRole,
    organizationId: string,
  ) {
    const parsed = syncBatchSchema.safeParse(input);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.errors[0]?.message);
    }
    const { deviceId, farmId, operations } = parsed.data;

    const results = [];
    let syncedCount = 0;
    let failedCount = 0;
    let pendingApprovalCount = 0;

    for (const op of operations) {
      try {
        const existing = await this.prisma.syncOperation.findUnique({
          where: { clientOperationId: op.clientOperationId },
        });
        if (existing?.status === 'SUCCESS') {
          results.push({
            clientOperationId: op.clientOperationId,
            status: 'SUCCESS' as const,
            entityId: existing.id,
          });
          syncedCount++;
          continue;
        }

        let entityId: string | undefined;
        let status: 'SUCCESS' | 'PENDING_APPROVAL' = 'SUCCESS';

        if (op.entityType === 'FEEDING_ENTRY' && op.operationType === 'CREATE') {
          const entry = await this.feeding.create(
            op.payload as Record<string, unknown>,
            userId,
            userRole,
            organizationId,
          );
          entityId = entry.id;
          if (entry.status === 'PENDING_OWNER_APPROVAL') {
            status = 'PENDING_APPROVAL';
            pendingApprovalCount++;
          } else {
            syncedCount++;
          }
        } else if (op.entityType === 'INVENTORY_TRANSACTION') {
          const tx = await this.inventory.createTransaction(
            op.payload as Record<string, unknown>,
            userId,
            organizationId,
          );
          entityId = tx.id;
          syncedCount++;
        }

        await this.prisma.syncOperation.upsert({
          where: { clientOperationId: op.clientOperationId },
          create: {
            clientOperationId: op.clientOperationId,
            organizationId,
            farmId,
            userId,
            deviceId,
            entityType: op.entityType,
            operationType: op.operationType,
            payloadJson: op.payload as object,
            clientVersion: op.clientVersion,
            status: status === 'SUCCESS' ? 'SUCCESS' : 'PENDING',
            processedAt: new Date(),
          },
          update: {
            status: status === 'SUCCESS' ? 'SUCCESS' : 'PENDING',
            processedAt: new Date(),
          },
        });

        results.push({ clientOperationId: op.clientOperationId, status, entityId });
      } catch (err) {
        failedCount++;
        const message = err instanceof Error ? err.message : 'Unknown error';
        results.push({
          clientOperationId: op.clientOperationId,
          status: 'FAILED' as const,
          failureReason: message,
        });
      }
    }

    return { results, syncedCount, failedCount, pendingApprovalCount };
  }

  async getStatus(farmId: string, userId: string) {
    const pending = await this.prisma.syncOperation.count({
      where: { farmId, userId, status: 'PENDING' },
    });
    const failed = await this.prisma.syncOperation.count({
      where: { farmId, userId, status: 'FAILED' },
    });
    const last = await this.prisma.syncOperation.findFirst({
      where: { farmId, userId, status: 'SUCCESS' },
      orderBy: { processedAt: 'desc' },
    });

    return {
      pendingCount: pending,
      failedCount: failed,
      lastSyncAt: last?.processedAt?.toISOString() ?? null,
    };
  }
}
