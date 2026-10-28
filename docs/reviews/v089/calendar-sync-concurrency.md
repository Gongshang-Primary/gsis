# Calendar sync concurrency — v0.8.9

The Calendar source remains in the existing Google workbook. The existing Script Properties sync session owns the batch claim. A Cloudflare wake can resume this session; it cannot select a different year, target, or user.

## Implemented

- `apiStartSyncYear_` checks provider access outside the write lock and rechecks source settings under the lock.
- `apiSyncYearBatch_` records a batch claim under the Calendar writer lock, releases it for Google Calendar work, then takes the lock for settlement.
- Each claim records event IDs and source hashes. Settlement reads current row positions and content. A changed event, lane decision, year state, or destination cannot be marked synced by an older result.
- Provider identity reservations and linked receipts use short guarded commits. Existing stable Calendar REST IDs and ownership checks remain intact.
- An overlapping batch returns `inProgress` and a bounded retry hint. A failed source settlement retains its claim. After expiry, the next batch reads provider identity and source state before it repeats any work.
- Forced session clearing refuses an unexpired batch claim.
- The request IO log now measures lock wait and lock hold time separately.
- The Calendar gateway accepts a signed, two-minute `gsis-calendar-sync-wake-v1` request at `/api/internal/sync-continue`. Apps Script also requires the separate `CALENDAR_SERVICE_SECRET`, in addition to its normal proxy secret. It uses the stored session owner and checks the current Admin role.
- The optional notification Worker Cron resumes one Calendar batch per tick. It does not share a mutable Calendar queue with WhatsApp. See the main maintainer guide for the final Worker URL/binding settings.

## Validation

All 15 Calendar test scripts passed with `TZ=Asia/Singapore`, including the existing provider transport, publication, metadata, role race, and Sheets tests.

New backend checks verify: no provider call holds the writer lock; edits and lane changes remain pending; overlapping consumers dispatch one insert; lost settlement resumes a stable provider ID; service authorization; role revocation; active-claim protection; and row movement by EventID. New gateway checks reject invalid or stale signatures, omit caller-supplied identity, and keep the route disabled without its secret.

The Sheets regression now expects a second read of the claimed rows. This is required to validate concurrent edits after the provider call. It still reads only the selected batch bodies and writes only sync metadata cells.

## Limits

The seven-minute claim exceeds the documented six-minute Apps Script execution limit. This limit was checked in the official quotas table on 22 October 2026: <https://developers.google.com/apps-script/guides/services/quotas>. Review the lease if Google changes that limit.

Provider changes and Google workbook writes are separate commits. Stable IDs and guarded settlement provide recovery; this is not a distributed transaction. A provider event may briefly show the previous source while the next batch applies a concurrent edit. Direct workbook changes outside the owning Apps Script lock remain outside its concurrency control.

The local tests use independent Google service emulators. They prove the control flow and failure handling, not production latency or live account quotas. No live calendar, school data, or deployment was changed during these tests.
