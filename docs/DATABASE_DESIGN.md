# AquaLedger — Database Design

## Principles

1. **Multi-tenant ready** — `organizationId` + `farmId` on operational tables
2. **Immutable ledger** — inventory via transactions, not editable balances
3. **Soft operations** — void/reverse/deactivate, no hard deletes
4. **Decimal-safe** — `Decimal(12,3)` for kg quantities
5. **Optimistic concurrency** — `version` field on mutable entities
6. **Idempotency** — unique `clientEntryId`, `clientTransactionId`, `clientOperationId`

## Entity Relationship Overview

```
Organization ──┬── User
               ├── Farm ──┬── Pond ── CultureCycle
               │          ├── FeedProduct
               │          ├── FeedingEntry ── FeedingMeal
               │          │                  └── CheckTrayObservation
               │          └── InventoryTransaction
               └── AuditLog

FarmUser (Farm ↔ User junction)
SyncOperation
GeneratedReport
```

## Core Tables

### Organization
| Column | Type | Notes |
|--------|------|-------|
| id | UUID | PK |
| name | String | |
| timezone | String | IANA e.g. Asia/Kolkata |
| status | Enum | ACTIVE, INACTIVE |
| pondTerm | String | "Tank", "Pond", etc. |

### User
| Column | Type | Notes |
|--------|------|-------|
| id | UUID | PK |
| organizationId | UUID | FK |
| phoneNumber | String | Unique per org |
| displayName | String | |
| role | Enum | OWNER, SUPERVISOR |
| pinHash | String | bcrypt |
| preferredLanguage | Enum | en, te |
| status | Enum | ACTIVE, INACTIVE, PENDING_ACTIVATION |

### Farm
| Column | Type | Notes |
|--------|------|-------|
| id | UUID | PK |
| organizationId | UUID | FK |
| name | String | |
| location | String? | |
| timezone | String | Overrides org default |
| status | Enum | |

### Pond
| Column | Type | Notes |
|--------|------|-------|
| id | UUID | PK |
| organizationId, farmId | UUID | FK |
| name, code | String | |
| type | Enum | POND, TANK |
| area | Decimal? | |
| areaUnit | String? | |
| capacity | Decimal? | |

### CultureCycle
| Column | Type | Notes |
|--------|------|-------|
| id | UUID | PK |
| pondId | UUID | FK |
| cycleName | String | |
| stockingDate | Date | DOC base |
| species | String | |
| seedCount | Int? | |
| usualMealsPerDay | Int | Default 4 |
| status | Enum | PLANNED, ACTIVE, COMPLETED, CANCELLED |

### FeedProduct
| Column | Type | Notes |
|--------|------|-------|
| id | UUID | PK |
| brandName, feedCode | String | |
| pelletSize | String? | |
| bagWeightKg | Decimal | |
| lowStockThresholdKg | Decimal? | |

### FeedingEntry
| Column | Type | Notes |
|--------|------|-------|
| id | UUID | PK |
| clientEntryId | String | Unique, idempotency |
| feedingDate | Date | Farm calendar date |
| doc | Int | Auto-calculated |
| status | Enum | DRAFT, CONFIRMED, PENDING_OWNER_APPROVAL, VOIDED |
| submissionType | Enum | NORMAL, LATE_OFFLINE_SUBMISSION |
| syncStatus | Enum | SYNCED, PENDING, FAILED |
| version | Int | Optimistic lock |

### FeedingMeal
| Column | Type | Notes |
|--------|------|-------|
| id | UUID | PK |
| feedingEntryId | UUID | FK |
| mealNumber | Int | Unique per entry |
| feedQuantityKg | Decimal(12,3) | |
| checkTrayRemainingPercentage | Enum? | |
| appetiteStatus | Enum? | |

### InventoryTransaction
| Column | Type | Notes |
|--------|------|-------|
| id | UUID | PK |
| clientTransactionId | String | Unique |
| type | Enum | OPENING_BALANCE, FEED_RECEIVED, FEED_CONSUMED, etc. |
| quantityKg | Decimal(12,3) | Positive magnitude |
| direction | Enum | IN, OUT | Computed from type |
| status | Enum | CONFIRMED, PENDING_APPROVAL, REVERSED |

### AuditLog
Immutable append-only log with `previousValueJson`, `newValueJson`, `action`, `reason`.

## Indexes

```sql
-- Feeding queries
(farmId, feedingDate)
(pondId, feedingDate)
(cultureCycleId, feedingDate)
(clientEntryId) UNIQUE

-- Inventory
(farmId, feedProductId, transactionDate)
(clientTransactionId) UNIQUE

-- Audit
(farmId, serverTimestamp)
(userId, serverTimestamp)

-- Sync
(clientOperationId) UNIQUE
(farmId, status, createdAt)
```

## Balance Calculation

```sql
current_stock = SUM(
  CASE WHEN direction = 'IN' THEN quantityKg
       WHEN direction = 'OUT' THEN -quantityKg
  END
) WHERE status = 'CONFIRMED' AND feedProductId = ?
```

Feeding void: insert REVERSAL (IN) linked to original FEED_CONSUMED.

## Timezone Handling

- Store dates as `DATE` (no time component) for feeding dates
- Store timestamps as `TIMESTAMPTZ` for audit/sync
- DOC and two-day rule computed server-side using farm timezone
