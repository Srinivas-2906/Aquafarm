# AquaLedger — Architecture

## Overview

TypeScript monorepo with a modular NestJS backend, React PWA frontend, and shared packages for validation, contracts, and configuration.

```
┌─────────────────────────────────────────────────────────────┐
│                     React PWA (apps/web)                     │
│  React Router │ TanStack Query │ Dexie │ Workbox PWA        │
└──────────────────────────┬──────────────────────────────────┘
                           │ REST + cookies/tokens
┌──────────────────────────▼──────────────────────────────────┐
│                   NestJS API (apps/api)                        │
│  Auth │ Farms │ Feeding │ Inventory │ Reports │ Sync │ Audit  │
└──────────────────────────┬──────────────────────────────────┘
                           │ Prisma ORM
┌──────────────────────────▼──────────────────────────────────┐
│                      PostgreSQL                                │
└─────────────────────────────────────────────────────────────┘

Shared: packages/{config,types,validation,contracts,database,ui}
```

## Monorepo Structure

```
aquaculture-platform/
├── apps/
│   ├── web/          # React + Vite PWA
│   └── api/          # NestJS REST API
├── packages/
│   ├── config/       # Product name, theme tokens, env schemas
│   ├── types/        # Shared TypeScript types
│   ├── validation/   # Zod schemas
│   ├── contracts/    # API request/response contracts
│   ├── database/     # Prisma client export
│   └── ui/           # Shared UI primitives (optional)
├── docs/
├── docker-compose.yml
└── turbo.json
```

## Backend Modules (Modular Monolith)

| Module | Responsibility |
|--------|----------------|
| AuthModule | Login, PIN, OTP mock, sessions, refresh |
| UsersModule | User CRUD, supervisor management |
| OrganizationsModule | Org settings, timezone |
| FarmsModule | Farm CRUD, farm-user assignments |
| PondsModule | Pond/tank management |
| CultureCyclesModule | Cycle lifecycle |
| FeedProductsModule | Feed product catalog |
| FeedingModule | Entries, meals, calculations |
| InventoryModule | Ledger transactions, balance |
| ReportsModule | PDF, Excel, HTML reports |
| AuditModule | Audit log queries |
| SyncModule | Batch sync, idempotency, conflicts |
| HealthModule | Health/readiness checks |

## Frontend Architecture

### State Layers
1. **Server state** — TanStack Query (cached API responses)
2. **Offline state** — Dexie IndexedDB (pending ops, reference data)
3. **UI state** — React local state + React Hook Form

### Routing
- Public: `/login`, `/activate`, `/reset-pin`
- Supervisor: `/`, `/feeding/*`, `/inventory/*`, `/records`
- Owner: `/dashboard`, `/approvals`, `/reports`, `/audit`, `/settings/*`

### Offline Sync Flow
```
Save locally → IndexedDB (PENDING_SYNC)
     ↓
Attempt POST /sync/batch (idempotent clientEntryId)
     ↓
SUCCESS → SYNCED | CONFLICT → owner review | FAILED → retry
```

## Security

- PIN hashed with bcrypt
- JWT access + refresh tokens (HTTP-only cookies in production)
- CSRF protection for cookie auth
- Rate-limited login
- Farm-level authorization on every endpoint
- Role from JWT, never from request body

## Deployment

- Docker Compose for local dev (PostgreSQL + API + Web)
- Separate Dockerfiles for API and Web
- Environment validation via Zod at startup
- Prisma migrations for schema changes

## Extension Points

Future modules plug in as new NestJS modules + React route groups:
- `WaterQualityModule`, `HealthModule`, `HarvestModule`, etc.
- All operational tables include `organizationId` + `farmId`
