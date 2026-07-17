import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { join } from 'path';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { APP_GUARD } from '@nestjs/core';
import { PrismaModule } from './prisma/prisma.module';
import { HealthModule } from './health/health.module';
import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';
import { OrganizationsModule } from './organizations/organizations.module';
import { FarmsModule } from './farms/farms.module';
import { PondsModule } from './ponds/ponds.module';
import { CultureCyclesModule } from './culture-cycles/culture-cycles.module';
import { FeedProductsModule } from './feed-products/feed-products.module';
import { FeedingModule } from './feeding/feeding.module';
import { InventoryModule } from './inventory/inventory.module';
import { ReportsModule } from './reports/reports.module';
import { AuditModule } from './audit/audit.module';
import { SyncModule } from './sync/sync.module';
import { ApprovalsModule } from './approvals/approvals.module';
import { DashboardModule } from './dashboard/dashboard.module';
import { DebugModule } from './debug/debug.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: [
        join(process.cwd(), '../../.env'),
        join(process.cwd(), '.env'),
        '.env',
      ],
    }),
    ThrottlerModule.forRoot([{ ttl: 60000, limit: 100 }]),
    PrismaModule,
    HealthModule,
    AuthModule,
    UsersModule,
    OrganizationsModule,
    FarmsModule,
    PondsModule,
    CultureCyclesModule,
    FeedProductsModule,
    FeedingModule,
    InventoryModule,
    ReportsModule,
    AuditModule,
    SyncModule,
    ApprovalsModule,
    DashboardModule,
    ...(process.env.DEBUG_ENABLED === 'true' && process.env.NODE_ENV !== 'production' ? [DebugModule] : []),
  ],
  providers: [
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
  ],
})
export class AppModule {}
