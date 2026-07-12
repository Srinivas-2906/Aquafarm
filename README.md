# Aquafarm (Vijays Farm)

**Aquafarm** is a mobile-browser-first aquaculture feeding and inventory management application for shrimp/aquaculture farms.

## Product Overview

- **Supervisor workflow**: Select tank → enter feed quantity (kg) → save (works offline)
- **Owner workflow**: Dashboard, approvals, historical edits, reports (PDF/Excel/share)
- **Automatic calculations**: DOC, Total Daily Feed, Cumulative Feed, inventory deductions
- **Offline-first**: IndexedDB + sync queue with idempotent API
- **Languages**: English and Telugu (i18n-ready architecture)

> Product name is configurable in `packages/config/src/product.ts`

## Technology Stack

| Layer | Technology |
|-------|------------|
| Frontend | React, TypeScript, Vite, PWA, Tailwind, TanStack Query, Dexie |
| Backend | NestJS, Prisma, PostgreSQL |
| Monorepo | npm workspaces, Turborepo |
| Reports | PDFKit, ExcelJS |
| Testing | Vitest (web), Jest (API) |

## Repository Structure

```
aquaculture-platform/
├── apps/
│   ├── web/          # React PWA
│   └── api/          # NestJS REST API
├── packages/
│   ├── config/       # Product name, theme, env validation
│   ├── types/        # Shared enums and types
│   ├── validation/   # Zod schemas
│   ├── contracts/    # API DTOs
│   └── database/     # Prisma client export
├── docs/             # PRD, architecture, database, offline sync
├── docker-compose.yml
└── turbo.json
```

## Setup Requirements

- Node.js 20+
- npm 10+
- PostgreSQL 16 (or Docker)
- Docker & Docker Compose (optional)

## Quick Start

### 1. Clone and install

```bash
cd aquaculture-platform
cp .env.example .env
npm install
```

### 2. Start PostgreSQL

```bash
docker compose up postgres -d
```

Or use a local PostgreSQL instance and update `DATABASE_URL` in `.env`.

### 3. Database setup

```bash
# Generate Prisma client
npm run db:generate

# Run migrations
cd apps/api && npx prisma migrate dev --name init

# Seed demo data
npm run db:seed
```

### 4. Start development servers

```bash
# Terminal 1: API (port 3001)
npm run dev -w @aqualedger/api

# Terminal 2: Web (port 5173)
npm run dev -w @aqualedger/web
```

Open http://localhost:5173

## Development Credentials

> **DEVELOPMENT ONLY — never use in production**

| Role | Phone | PIN |
|------|-------|-----|
| Owner | 9985533376 | 123456 |
| Supervisor | 9008747926 | 123456 |

- OTP mock code: `123456` (logged to API console)
- Demo farm ID: `demo-farm-001`

## Environment Variables

See `.env.example` for all variables:

| Variable | Description |
|----------|-------------|
| `DATABASE_URL` | PostgreSQL connection string |
| `JWT_SECRET` | Access token secret (min 16 chars) |
| `JWT_REFRESH_SECRET` | Refresh token secret |
| `API_PORT` | API server port (default 3001) |
| `CORS_ORIGIN` | Frontend origin (default http://localhost:5173) |
| `VITE_API_URL` | API URL for frontend |
| `OTP_MOCK_ENABLED` | Use mock OTP in development |

## Commands

```bash
npm run dev          # Start all apps (turbo)
npm run build        # Production build
npm run lint         # Lint all packages
npm run typecheck    # TypeScript check
npm run test         # Run tests

npm run db:generate  # Generate Prisma client
npm run db:migrate   # Run migrations
npm run db:seed      # Seed demo data
npm run db:studio    # Open Prisma Studio
```

## API Documentation

Swagger UI: http://localhost:3001/api/docs

Key endpoints:
- `POST /auth/login` — Phone + PIN login
- `GET /feeding-entries` — List feeding records
- `POST /feeding-entries` — Create feeding entry
- `GET /inventory/summary` — Stock summary
- `POST /sync/batch` — Offline sync
- `POST /reports/generate` — Generate feeding report

## PWA Installation

1. Open the app in Chrome on Android
2. Tap the browser menu → "Add to Home screen" / "Install app"
3. The app works offline for previously authenticated users

## Offline Testing

1. Log in as supervisor
2. Open DevTools → Network → Offline
3. Add a feeding entry — should show "Saved on this phone"
4. Go back online → tap "Send Pending Records"
5. Entry should sync to server

## Report Generation

1. Log in as owner
2. Go to Reports → select date range → Generate
3. Download PDF or Excel, or share via Web Share API

## Deploy to GCP

```bash
chmod +x scripts/deploy-gcp.sh
./scripts/deploy-gcp.sh
```

Production URL: https://aquafarm.kaana.in

## Docker Production Build

```bash
docker compose up --build
```

## Demo Data

- Organization: Sandhya Demo Operations
- Farm: Village Shrimp Farm
- Tanks: 6, 7, 8, 9, 10 (Vannamei, DOC ~24)
- Feed codes: 1C, 2C, 3C
- 14 days of feeding history
- 1 pending late offline submission
- Low stock warning on feed 3C

## Known Limitations (MVP)

- Photo attachments are architected but not fully implemented
- Voice notes are placeholder only
- Conflict resolution UI is basic
- Single organization per deployment

## Troubleshooting

**Database connection failed**
- Ensure PostgreSQL is running: `docker compose ps`
- Check `DATABASE_URL` in `.env`

**Prisma client not found**
- Run `npm run db:generate`

**CORS errors**
- Ensure `CORS_ORIGIN` matches your frontend URL
- API proxy is configured in `vite.config.ts` for `/api`

**Login fails**
- Run seed: `npm run db:seed`
- Check phone/PIN from credentials table above

## License

Private — All rights reserved.
