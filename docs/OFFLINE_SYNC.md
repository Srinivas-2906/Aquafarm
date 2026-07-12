# AquaLedger — Offline & Sync Design

## Goals

- Supervisor can save feeding entries without network
- Clear, non-technical sync status language
- No duplicate records on retry (idempotency)
- Late offline entries route to owner approval

## Local Storage (Dexie / IndexedDB)

### Tables

| Store | Contents |
|-------|----------|
| `userProfile` | Authenticated user, role, farm access |
| `farms` | Farm metadata, timezone |
| `ponds` | Pond/tank list |
| `cultureCycles` | Active cycles |
| `feedProducts` | Product catalog |
| `feedingEntries` | Recent + pending entries |
| `feedingMeals` | Meals linked to entries |
| `inventoryTransactions` | Recent + pending |
| `pendingOperations` | Outbound sync queue |
| `syncMetadata` | Last sync time, device ID |
| `i18nCache` | Language strings |

## Save Flow

```
User taps Save
    │
    ├─ Validate locally (Zod)
    ├─ Generate UUID clientEntryId
    ├─ Write to IndexedDB immediately
    ├─ Show "Saved on this phone"
    ├─ Update local TDF / inventory preview
    │
    └─ If online:
         POST /sync/batch (or direct API)
         ├─ Success → "Sent successfully"
         ├─ Conflict → "Owner review required"
         └─ Failure → "Could not send" + retry queue
```

## Sync States (User-Facing)

| Internal | Display |
|----------|---------|
| LOCAL_ONLY | Saved on this phone |
| PENDING_SYNC | Waiting for internet |
| SYNCING | Sending now |
| SYNCED | Sent successfully |
| SYNC_FAILED | Could not send |
| PENDING_OWNER_APPROVAL | Owner review required |
| CONFLICT | Needs owner attention |

## Idempotency Keys

- `clientEntryId` — feeding entries
- `clientTransactionId` — inventory transactions
- `clientOperationId` — generic sync operations

Server checks unique constraints before insert. Duplicate submit returns existing record (200/201).

## Late Offline Submission

```
entryDate = 8 July (device)
syncDate = 11 July (server, farm TZ)
supervisorWindow = today + yesterday only

→ submissionType = LATE_OFFLINE_SUBMISSION
→ status = PENDING_OWNER_APPROVAL
→ Does NOT affect TDF/cumulative until approved
→ Preserve deviceCreatedAt, serverCreatedAt, enteredByUserId
```

## Conflict Resolution

Optimistic concurrency via `version` field:

```
Client sends PATCH with version=1
Server has version=2
→ 409 Conflict with server payload
→ Supervisor: keep server / send for owner review
→ Owner: keep server / use client / merge / reject
```

## PWA / Service Worker

- Vite PWA plugin with `injectManifest`
- Workbox: cache app shell, API stale-while-revalidate for GET
- Background sync as enhancement (not sole mechanism)
- Manual "Sync Now" / "Send Pending Records" button always available

## Offline Auth

- Last authenticated session stored securely (encrypted token in IndexedDB)
- App opens to cached home screen for known user
- New login requires network
- Clear messaging: "New records will send when internet returns"

## Sync API

### POST /sync/batch

```json
{
  "deviceId": "uuid",
  "operations": [
    {
      "clientOperationId": "uuid",
      "entityType": "FEEDING_ENTRY",
      "operationType": "CREATE",
      "payload": { ... },
      "clientVersion": 1
    }
  ]
}
```

Response per operation: `SUCCESS | CONFLICT | FAILED | PENDING_APPROVAL`

### GET /sync/status

Returns pending count, last sync time, failed operations.
