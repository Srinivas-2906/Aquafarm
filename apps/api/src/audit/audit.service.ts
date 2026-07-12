import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class AuditService {
  constructor(private prisma: PrismaService) {}

  async log(params: {
    organizationId: string;
    farmId?: string;
    userId: string;
    entityType: string;
    entityId: string;
    action: 'CREATE' | 'UPDATE' | 'VOID' | 'APPROVE' | 'REJECT' | 'REVERSE' | 'DEACTIVATE' | 'CONFLICT_RESOLVE';
    previousValue?: Record<string, unknown> | null;
    newValue?: Record<string, unknown> | null;
    reason?: string;
    deviceTimestamp?: Date;
    ipAddress?: string;
    userAgent?: string;
  }) {
    return this.prisma.auditLog.create({
      data: {
        organizationId: params.organizationId,
        farmId: params.farmId,
        userId: params.userId,
        entityType: params.entityType,
        entityId: params.entityId,
        action: params.action,
        previousValueJson: params.previousValue ? (params.previousValue as object) : undefined,
        newValueJson: params.newValue ? (params.newValue as object) : undefined,
        reason: params.reason,
        deviceTimestamp: params.deviceTimestamp,
        ipAddress: params.ipAddress,
        userAgent: params.userAgent,
      },
    });
  }

  async findAll(filters: {
    organizationId: string;
    farmId?: string;
    userId?: string;
    entityType?: string;
    dateFrom?: string;
    dateTo?: string;
    page?: number;
    pageSize?: number;
  }) {
    const page = filters.page || 1;
    const pageSize = filters.pageSize || 50;
    const where: Record<string, unknown> = { organizationId: filters.organizationId };
    if (filters.farmId) where.farmId = filters.farmId;
    if (filters.userId) where.userId = filters.userId;
    if (filters.entityType) where.entityType = filters.entityType;
    if (filters.dateFrom || filters.dateTo) {
      where.serverTimestamp = {};
      if (filters.dateFrom) (where.serverTimestamp as Record<string, Date>).gte = new Date(filters.dateFrom);
      if (filters.dateTo) (where.serverTimestamp as Record<string, Date>).lte = new Date(filters.dateTo + 'T23:59:59');
    }

    const [data, total] = await Promise.all([
      this.prisma.auditLog.findMany({
        where,
        include: { user: { select: { displayName: true } } },
        orderBy: { serverTimestamp: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.auditLog.count({ where }),
    ]);

    return {
      data: data.map((log) => ({
        id: log.id,
        userId: log.userId,
        userName: log.user.displayName,
        entityType: log.entityType,
        entityId: log.entityId,
        action: log.action,
        previousValue: log.previousValueJson as Record<string, unknown> | null,
        newValue: log.newValueJson as Record<string, unknown> | null,
        reason: log.reason,
        serverTimestamp: log.serverTimestamp.toISOString(),
      })),
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize),
    };
  }
}
