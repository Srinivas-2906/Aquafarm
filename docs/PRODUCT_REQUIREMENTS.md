# AquaLedger — Product Requirements Document

## 1. Product Vision

AquaLedger replaces handwritten "Feeding Management Report" sheets used by shrimp/aquaculture farms in rural India. The MVP mirrors the existing manual process so supervisors with limited smartphone experience can adopt it immediately.

**Product name:** AquaLedger (configurable via `packages/config`)

## 2. Target Users

| Role | Description |
|------|-------------|
| **Owner** | Farm owner/manager. Full access, historical edits, approvals, reports |
| **Supervisor** | Daily feeding recorder. Simple mobile workflow, two-day edit window |

## 3. MVP Scope

### In Scope
- Phone + 6-digit PIN authentication (no email)
- Farm, pond/tank, culture-cycle, feed-product setup
- Daily feeding entries with meal-wise quantities
- Automatic DOC, TDF, cumulative feed calculations
- Immutable inventory ledger
- Offline-first data entry with sync
- Two-day supervisor edit rule (farm timezone)
- Late offline submission → owner approval
- Owner dashboard, approvals, audit history
- Feeding and inventory reports (PDF, Excel, share)
- English + Telugu-ready i18n architecture

### Out of Scope (Future Modules)
- Disease prediction, AI recommendations
- Water quality, health observations, growth sampling
- Mortality, treatments, harvest
- Financial accounting, FCR, profitability
- Sensor integration, predictive analytics

## 4. Core User Journeys

### Supervisor Daily Flow
1. Open app → see tank status on home screen
2. Tap "Add Feeding" → select tank (or start from tank card)
3. Enter feed quantity (kg) — primary field
4. Optional: check-tray, appetite, remarks
5. Save → immediate local save, background sync
6. See confirmation with TDF and sync status
7. Add next meal or another tank

### Owner Daily Flow
1. Dashboard → see today's summary, pending items
2. Review/approve late offline submissions
3. Correct historical entries if needed
4. Generate feeding report → PDF/Excel/share

## 5. Business Rules

### Feeding Calculations
- **DOC** = farm-calendar days since stocking + 1 (auto-calculated)
- **TDF** = sum of all meal quantities (auto-calculated)
- **Cumulative Feed** = sum of approved, non-voided entries for culture cycle

### Two-Day Edit Rule
- Supervisor: today + yesterday only (farm timezone, calendar days)
- Owner: any date
- Locked entries show: "This entry is older than two days. Only the owner can make changes."

### Offline Late Entry
- Supervisor offline entry for past date → `PENDING_OWNER_APPROVAL` on sync
- Preserve device timestamp, entry date, sync time, submitting user

### Inventory
- Immutable ledger (no editable "current stock" field)
- Current stock = incoming − outgoing transactions
- Feeding approval creates `FEED_CONSUMED` transaction (idempotent)
- Void creates `REVERSAL` transaction

## 6. Non-Functional Requirements

- Mobile-first (360px minimum)
- Offline-capable on low-end Android
- 48px minimum touch targets
- Decimal-safe quantities (no float arithmetic)
- PWA installable
- Sub-3s offline startup

## 7. Acceptance Criteria

See Section 41 of implementation brief — 30 criteria covering auth, feeding, inventory, offline, reports, i18n, tests, and build.

## 8. Demo Data

- Organization: Sandhya Demo Operations
- Farm: Village Shrimp Farm
- Tanks: 6, 7, 8, 9, 10
- Feed codes: 1C, 2C, 3C
- Seeded feeding history, inventory, one late submission, one conflict
