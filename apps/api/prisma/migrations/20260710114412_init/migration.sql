-- CreateEnum
CREATE TYPE "EntityStatus" AS ENUM ('ACTIVE', 'INACTIVE');

-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('OWNER', 'SUPERVISOR');

-- CreateEnum
CREATE TYPE "UserStatus" AS ENUM ('ACTIVE', 'INACTIVE', 'PENDING_ACTIVATION');

-- CreateEnum
CREATE TYPE "PondType" AS ENUM ('POND', 'TANK');

-- CreateEnum
CREATE TYPE "CultureCycleStatus" AS ENUM ('PLANNED', 'ACTIVE', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "FeedingEntryStatus" AS ENUM ('DRAFT', 'CONFIRMED', 'PENDING_OWNER_APPROVAL', 'VOIDED');

-- CreateEnum
CREATE TYPE "SubmissionType" AS ENUM ('NORMAL', 'LATE_OFFLINE_SUBMISSION');

-- CreateEnum
CREATE TYPE "SyncStatus" AS ENUM ('SYNCED', 'PENDING', 'FAILED', 'LOCAL_ONLY');

-- CreateEnum
CREATE TYPE "InventoryTransactionType" AS ENUM ('OPENING_BALANCE', 'FEED_RECEIVED', 'FEED_CONSUMED', 'DAMAGED', 'WASTAGE', 'MANUAL_ADJUSTMENT_IN', 'MANUAL_ADJUSTMENT_OUT', 'REVERSAL');

-- CreateEnum
CREATE TYPE "InventoryTransactionStatus" AS ENUM ('CONFIRMED', 'PENDING_APPROVAL', 'REVERSED');

-- CreateEnum
CREATE TYPE "TransactionDirection" AS ENUM ('IN', 'OUT');

-- CreateEnum
CREATE TYPE "AppetiteStatus" AS ENUM ('EXCELLENT', 'NORMAL', 'SLOW', 'POOR', 'FEED_REMAINING');

-- CreateEnum
CREATE TYPE "CheckTrayOption" AS ENUM ('FULLY_CONSUMED', 'LESS_THAN_5', 'BETWEEN_5_10', 'BETWEEN_10_25', 'MORE_THAN_25', 'NOT_CHECKED');

-- CreateEnum
CREATE TYPE "AuditAction" AS ENUM ('CREATE', 'UPDATE', 'VOID', 'APPROVE', 'REJECT', 'REVERSE', 'DEACTIVATE', 'CONFLICT_RESOLVE');

-- CreateEnum
CREATE TYPE "SyncOperationStatus" AS ENUM ('PENDING', 'SUCCESS', 'FAILED', 'CONFLICT');

-- CreateEnum
CREATE TYPE "ReportType" AS ENUM ('DAILY_FEEDING', 'FEEDING_DATE_RANGE', 'POND_FEEDING', 'DOC_WISE_FEEDING', 'CUMULATIVE_FEED', 'FEED_CODE_USAGE', 'INVENTORY_SUMMARY', 'INVENTORY_TRANSACTIONS', 'SUPERVISOR_ACTIVITY', 'AUDIT_REPORT');

-- CreateEnum
CREATE TYPE "Language" AS ENUM ('en', 'te');

-- CreateTable
CREATE TABLE "Organization" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "timezone" TEXT NOT NULL DEFAULT 'Asia/Kolkata',
    "pondTerm" TEXT NOT NULL DEFAULT 'Tank',
    "status" "EntityStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Organization_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "phoneNumber" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "role" "UserRole" NOT NULL,
    "pinHash" TEXT NOT NULL,
    "preferredLanguage" "Language" NOT NULL DEFAULT 'en',
    "status" "UserStatus" NOT NULL DEFAULT 'ACTIVE',
    "activationCode" TEXT,
    "loginAttempts" INTEGER NOT NULL DEFAULT 0,
    "lockedUntil" TIMESTAMP(3),
    "lastLoginAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Session" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "refreshToken" TEXT NOT NULL,
    "userAgent" TEXT,
    "ipAddress" TEXT,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Farm" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "location" TEXT,
    "timezone" TEXT NOT NULL DEFAULT 'Asia/Kolkata',
    "status" "EntityStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Farm_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FarmUser" (
    "id" TEXT NOT NULL,
    "farmId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "role" "UserRole" NOT NULL,
    "status" "EntityStatus" NOT NULL DEFAULT 'ACTIVE',

    CONSTRAINT "FarmUser_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Pond" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "farmId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "type" "PondType" NOT NULL DEFAULT 'TANK',
    "area" DECIMAL(12,3),
    "areaUnit" TEXT,
    "capacity" DECIMAL(12,3),
    "status" "EntityStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Pond_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CultureCycle" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "farmId" TEXT NOT NULL,
    "pondId" TEXT NOT NULL,
    "cycleName" TEXT NOT NULL,
    "stockingDate" DATE NOT NULL,
    "species" TEXT NOT NULL,
    "seedCount" INTEGER,
    "stockingDensity" DECIMAL(12,3),
    "initialAverageWeight" DECIMAL(12,3),
    "expectedHarvestDate" DATE,
    "usualMealsPerDay" INTEGER NOT NULL DEFAULT 4,
    "status" "CultureCycleStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CultureCycle_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FeedProduct" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "farmId" TEXT NOT NULL,
    "brandName" TEXT NOT NULL,
    "feedCode" TEXT NOT NULL,
    "pelletSize" TEXT,
    "bagWeightKg" DECIMAL(12,3) NOT NULL,
    "supplierName" TEXT,
    "lowStockThresholdKg" DECIMAL(12,3),
    "status" "EntityStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FeedProduct_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FeedingEntry" (
    "id" TEXT NOT NULL,
    "clientEntryId" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "farmId" TEXT NOT NULL,
    "pondId" TEXT NOT NULL,
    "cultureCycleId" TEXT NOT NULL,
    "feedingDate" DATE NOT NULL,
    "doc" INTEGER NOT NULL,
    "feedProductId" TEXT NOT NULL,
    "status" "FeedingEntryStatus" NOT NULL DEFAULT 'CONFIRMED',
    "submissionType" "SubmissionType" NOT NULL DEFAULT 'NORMAL',
    "syncStatus" "SyncStatus" NOT NULL DEFAULT 'SYNCED',
    "remarks" TEXT,
    "enteredByUserId" TEXT NOT NULL,
    "approvedByUserId" TEXT,
    "deviceCreatedAt" TIMESTAMP(3),
    "serverCreatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "voidedAt" TIMESTAMP(3),
    "voidedByUserId" TEXT,
    "voidReason" TEXT,

    CONSTRAINT "FeedingEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FeedingMeal" (
    "id" TEXT NOT NULL,
    "feedingEntryId" TEXT NOT NULL,
    "mealNumber" INTEGER NOT NULL,
    "scheduledTime" TEXT,
    "actualTime" TEXT,
    "feedQuantityKg" DECIMAL(12,3) NOT NULL,
    "checkTrayRemainingPercentage" "CheckTrayOption",
    "appetiteStatus" "AppetiteStatus",
    "remarks" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FeedingMeal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CheckTrayObservation" (
    "id" TEXT NOT NULL,
    "feedingEntryId" TEXT NOT NULL,
    "feedingMealId" TEXT,
    "trayNumber" INTEGER,
    "checkedAt" TIMESTAMP(3),
    "remainingPercentage" "CheckTrayOption",
    "observation" TEXT,
    "imageUrl" TEXT,
    "createdByUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CheckTrayObservation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InventoryTransaction" (
    "id" TEXT NOT NULL,
    "clientTransactionId" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "farmId" TEXT NOT NULL,
    "feedProductId" TEXT NOT NULL,
    "pondId" TEXT,
    "feedingEntryId" TEXT,
    "type" "InventoryTransactionType" NOT NULL,
    "direction" "TransactionDirection" NOT NULL,
    "quantityKg" DECIMAL(12,3) NOT NULL,
    "transactionDate" DATE NOT NULL,
    "remarks" TEXT,
    "supplierName" TEXT,
    "referenceNumber" TEXT,
    "numberOfBags" INTEGER,
    "createdByUserId" TEXT NOT NULL,
    "approvedByUserId" TEXT,
    "status" "InventoryTransactionStatus" NOT NULL DEFAULT 'CONFIRMED',
    "syncStatus" "SyncStatus" NOT NULL DEFAULT 'SYNCED',
    "reversedTransactionId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "InventoryTransaction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "farmId" TEXT,
    "userId" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "action" "AuditAction" NOT NULL,
    "previousValueJson" JSONB,
    "newValueJson" JSONB,
    "reason" TEXT,
    "deviceTimestamp" TIMESTAMP(3),
    "serverTimestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ipAddress" TEXT,
    "userAgent" TEXT,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SyncOperation" (
    "id" TEXT NOT NULL,
    "clientOperationId" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "farmId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "deviceId" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "operationType" TEXT NOT NULL,
    "payloadJson" JSONB NOT NULL,
    "clientVersion" INTEGER,
    "serverVersion" INTEGER,
    "status" "SyncOperationStatus" NOT NULL DEFAULT 'PENDING',
    "failureReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processedAt" TIMESTAMP(3),

    CONSTRAINT "SyncOperation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GeneratedReport" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "farmId" TEXT NOT NULL,
    "reportType" "ReportType" NOT NULL,
    "filtersJson" JSONB NOT NULL,
    "filePath" TEXT,
    "generatedByUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3),

    CONSTRAINT "GeneratedReport_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "User_organizationId_idx" ON "User"("organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "User_organizationId_phoneNumber_key" ON "User"("organizationId", "phoneNumber");

-- CreateIndex
CREATE UNIQUE INDEX "Session_refreshToken_key" ON "Session"("refreshToken");

-- CreateIndex
CREATE INDEX "Session_userId_idx" ON "Session"("userId");

-- CreateIndex
CREATE INDEX "Farm_organizationId_idx" ON "Farm"("organizationId");

-- CreateIndex
CREATE INDEX "FarmUser_userId_idx" ON "FarmUser"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "FarmUser_farmId_userId_key" ON "FarmUser"("farmId", "userId");

-- CreateIndex
CREATE INDEX "Pond_farmId_idx" ON "Pond"("farmId");

-- CreateIndex
CREATE INDEX "Pond_organizationId_farmId_idx" ON "Pond"("organizationId", "farmId");

-- CreateIndex
CREATE UNIQUE INDEX "Pond_farmId_code_key" ON "Pond"("farmId", "code");

-- CreateIndex
CREATE INDEX "CultureCycle_pondId_status_idx" ON "CultureCycle"("pondId", "status");

-- CreateIndex
CREATE INDEX "CultureCycle_farmId_idx" ON "CultureCycle"("farmId");

-- CreateIndex
CREATE INDEX "FeedProduct_farmId_idx" ON "FeedProduct"("farmId");

-- CreateIndex
CREATE UNIQUE INDEX "FeedProduct_farmId_feedCode_key" ON "FeedProduct"("farmId", "feedCode");

-- CreateIndex
CREATE UNIQUE INDEX "FeedingEntry_clientEntryId_key" ON "FeedingEntry"("clientEntryId");

-- CreateIndex
CREATE INDEX "FeedingEntry_farmId_feedingDate_idx" ON "FeedingEntry"("farmId", "feedingDate");

-- CreateIndex
CREATE INDEX "FeedingEntry_pondId_feedingDate_idx" ON "FeedingEntry"("pondId", "feedingDate");

-- CreateIndex
CREATE INDEX "FeedingEntry_cultureCycleId_feedingDate_idx" ON "FeedingEntry"("cultureCycleId", "feedingDate");

-- CreateIndex
CREATE INDEX "FeedingEntry_status_serverCreatedAt_idx" ON "FeedingEntry"("status", "serverCreatedAt");

-- CreateIndex
CREATE UNIQUE INDEX "FeedingEntry_pondId_feedingDate_key" ON "FeedingEntry"("pondId", "feedingDate");

-- CreateIndex
CREATE INDEX "FeedingMeal_feedingEntryId_idx" ON "FeedingMeal"("feedingEntryId");

-- CreateIndex
CREATE UNIQUE INDEX "FeedingMeal_feedingEntryId_mealNumber_key" ON "FeedingMeal"("feedingEntryId", "mealNumber");

-- CreateIndex
CREATE UNIQUE INDEX "InventoryTransaction_clientTransactionId_key" ON "InventoryTransaction"("clientTransactionId");

-- CreateIndex
CREATE INDEX "InventoryTransaction_farmId_feedProductId_transactionDate_idx" ON "InventoryTransaction"("farmId", "feedProductId", "transactionDate");

-- CreateIndex
CREATE INDEX "InventoryTransaction_feedProductId_transactionDate_idx" ON "InventoryTransaction"("feedProductId", "transactionDate");

-- CreateIndex
CREATE INDEX "InventoryTransaction_feedingEntryId_idx" ON "InventoryTransaction"("feedingEntryId");

-- CreateIndex
CREATE INDEX "AuditLog_farmId_serverTimestamp_idx" ON "AuditLog"("farmId", "serverTimestamp");

-- CreateIndex
CREATE INDEX "AuditLog_userId_serverTimestamp_idx" ON "AuditLog"("userId", "serverTimestamp");

-- CreateIndex
CREATE INDEX "AuditLog_entityType_entityId_idx" ON "AuditLog"("entityType", "entityId");

-- CreateIndex
CREATE UNIQUE INDEX "SyncOperation_clientOperationId_key" ON "SyncOperation"("clientOperationId");

-- CreateIndex
CREATE INDEX "SyncOperation_farmId_status_createdAt_idx" ON "SyncOperation"("farmId", "status", "createdAt");

-- CreateIndex
CREATE INDEX "SyncOperation_userId_createdAt_idx" ON "SyncOperation"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "GeneratedReport_farmId_createdAt_idx" ON "GeneratedReport"("farmId", "createdAt");

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Session" ADD CONSTRAINT "Session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Farm" ADD CONSTRAINT "Farm_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FarmUser" ADD CONSTRAINT "FarmUser_farmId_fkey" FOREIGN KEY ("farmId") REFERENCES "Farm"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FarmUser" ADD CONSTRAINT "FarmUser_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Pond" ADD CONSTRAINT "Pond_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Pond" ADD CONSTRAINT "Pond_farmId_fkey" FOREIGN KEY ("farmId") REFERENCES "Farm"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CultureCycle" ADD CONSTRAINT "CultureCycle_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CultureCycle" ADD CONSTRAINT "CultureCycle_farmId_fkey" FOREIGN KEY ("farmId") REFERENCES "Farm"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CultureCycle" ADD CONSTRAINT "CultureCycle_pondId_fkey" FOREIGN KEY ("pondId") REFERENCES "Pond"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FeedProduct" ADD CONSTRAINT "FeedProduct_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FeedProduct" ADD CONSTRAINT "FeedProduct_farmId_fkey" FOREIGN KEY ("farmId") REFERENCES "Farm"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FeedingEntry" ADD CONSTRAINT "FeedingEntry_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FeedingEntry" ADD CONSTRAINT "FeedingEntry_farmId_fkey" FOREIGN KEY ("farmId") REFERENCES "Farm"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FeedingEntry" ADD CONSTRAINT "FeedingEntry_pondId_fkey" FOREIGN KEY ("pondId") REFERENCES "Pond"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FeedingEntry" ADD CONSTRAINT "FeedingEntry_cultureCycleId_fkey" FOREIGN KEY ("cultureCycleId") REFERENCES "CultureCycle"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FeedingEntry" ADD CONSTRAINT "FeedingEntry_feedProductId_fkey" FOREIGN KEY ("feedProductId") REFERENCES "FeedProduct"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FeedingEntry" ADD CONSTRAINT "FeedingEntry_enteredByUserId_fkey" FOREIGN KEY ("enteredByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FeedingEntry" ADD CONSTRAINT "FeedingEntry_approvedByUserId_fkey" FOREIGN KEY ("approvedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FeedingEntry" ADD CONSTRAINT "FeedingEntry_voidedByUserId_fkey" FOREIGN KEY ("voidedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FeedingMeal" ADD CONSTRAINT "FeedingMeal_feedingEntryId_fkey" FOREIGN KEY ("feedingEntryId") REFERENCES "FeedingEntry"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CheckTrayObservation" ADD CONSTRAINT "CheckTrayObservation_feedingEntryId_fkey" FOREIGN KEY ("feedingEntryId") REFERENCES "FeedingEntry"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CheckTrayObservation" ADD CONSTRAINT "CheckTrayObservation_feedingMealId_fkey" FOREIGN KEY ("feedingMealId") REFERENCES "FeedingMeal"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CheckTrayObservation" ADD CONSTRAINT "CheckTrayObservation_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryTransaction" ADD CONSTRAINT "InventoryTransaction_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryTransaction" ADD CONSTRAINT "InventoryTransaction_farmId_fkey" FOREIGN KEY ("farmId") REFERENCES "Farm"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryTransaction" ADD CONSTRAINT "InventoryTransaction_feedProductId_fkey" FOREIGN KEY ("feedProductId") REFERENCES "FeedProduct"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryTransaction" ADD CONSTRAINT "InventoryTransaction_pondId_fkey" FOREIGN KEY ("pondId") REFERENCES "Pond"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryTransaction" ADD CONSTRAINT "InventoryTransaction_feedingEntryId_fkey" FOREIGN KEY ("feedingEntryId") REFERENCES "FeedingEntry"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryTransaction" ADD CONSTRAINT "InventoryTransaction_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryTransaction" ADD CONSTRAINT "InventoryTransaction_approvedByUserId_fkey" FOREIGN KEY ("approvedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_farmId_fkey" FOREIGN KEY ("farmId") REFERENCES "Farm"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SyncOperation" ADD CONSTRAINT "SyncOperation_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SyncOperation" ADD CONSTRAINT "SyncOperation_farmId_fkey" FOREIGN KEY ("farmId") REFERENCES "Farm"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SyncOperation" ADD CONSTRAINT "SyncOperation_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GeneratedReport" ADD CONSTRAINT "GeneratedReport_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GeneratedReport" ADD CONSTRAINT "GeneratedReport_farmId_fkey" FOREIGN KEY ("farmId") REFERENCES "Farm"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GeneratedReport" ADD CONSTRAINT "GeneratedReport_generatedByUserId_fkey" FOREIGN KEY ("generatedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
