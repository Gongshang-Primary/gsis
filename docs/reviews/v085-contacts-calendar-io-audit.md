# v0.8.5 Contacts and Calendar read/write audit

Date: 21 October 2026. Source baseline: `c98d377` (v0.8.4a).

This review inspected the local Contacts and Calendar sources and exercised their synthetic Sheets/Apps Script harnesses. It did not inspect production logs, change production data, or perform a live concurrent load test. Sim Lan's Deploy issue and Roster timetable transport are covered by the other component reviews.

## Confirmed defect and repair

Calendar shared display caches could be repopulated with old configuration after a writer had invalidated them. The reproduced sequence is:

1. Reader A reads active lane/tag metadata and pauses immediately before caching it.
2. Writer B disables that lane/tag, commits its metadata and audit atomically, then invalidates the shared cache.
3. Reader A writes its old display snapshot into the shared cache.
4. Writer C saves an event. v0.8.4a accepts the now-disabled lane/tag because validation trusts the shared cache while holding its lock.

`tests/calendar085-write-cache.cjs` reproduces this with independent reader and writer execution contexts sharing the synthetic workbook/cache. It verifies the metadata deactivation really committed. Against v0.8.4a, the test fails because the invalid event is accepted. The patched backend rejects both lane and tag cases, retains the event, and writes only a rejection receipt.

The fix is in `calendar-backend/Code.gs`. Acquiring the existing Calendar writer lock now starts a fresh request-local metadata cache and clears tables/lookups obtained before waiting for the lock. Cached validation reads within the lock use that private snapshot; ordinary readers continue to use the existing shared display cache. Successful or uncertain transaction invalidation clears local cached values too. Release and authority-error paths end the private cache scope. No new lock, cache service, schema migration, client protocol or deployment property was introduced.

## I/O and concurrency matrix

| Component / path | Read scope and client work | Write and concurrency protection | Audit result |
| --- | --- | --- | --- |
| Contacts bootstrap/data/catalogue | Display catalogue cache keyed by data epoch; bounded chunks; live caller authority. View reads bracket the whole snapshot with before/after markers and retry changed reads. | Read routes do not acquire writer locks, flush or recover pending writes. During unresolved publication, a verified saved snapshot can be shown read-only. | Existing consistency and access boundaries retained; no source change required. |
| Contacts Roster directory / notification directory | One Sheets batch reads the required three tables; one contact derivation. Each identity gets fresh authority. | Zero writer locks and writes on this read path. Pending publication does not become an authoritative directory. | Existing test exercises 30 independent signed identities: 30 batches, zero locks, zero writes. These are sequential harness invocations, not a live 30-user timing claim. |
| Contacts personal/administrative save | Frontend keeps changed cells and expected values locally. Confirmed responses update local data without requiring a full refresh. | Live authority under lock; cell-level compare; stable request digest; durable before-image/journal and receipts. Dirty cells and required derived fields only. | Existing mixed-save, conflict, recovery, fresh-row-mapping and exact-retry tests pass. |
| Contacts commit and recovery | Prepared write values and metadata are immutable before submission. Snapshot gzip has an explicit MIME type. | One bounded atomic Sheets API request where available; no alternate-transport retry after an uncertain API response. Documented native compatibility path has ordered journal recovery. | 150 ranges commit in one API request; corrupt/partial reads fail safely; no duplicate save on lost acknowledgement. Shared SheetsIO was reviewed, not changed. |
| Calendar bootstrap | Selected-year event bodies; batched metadata misses and current Years/Users; frontend deduplicates same-year requests, keeps a per-year RAM cache, and rejects late responses from earlier navigation. | No writer lock. Cached client views remain read-only until fresh authorization/response succeeds. | Cold, warm and cache-unavailable bootstrap stay at three API read batches; cold/cache-unavailable fixture reads 279 cells. |
| Calendar event save/move/copy/delete | Stable event identity, expected revision and narrow live row lookup. New fix uses fresh metadata inside the writer lock. | Existing short script lock; authority rechecked after waiting; per-operation durable identity; unresolved outcomes fenced. Intent is written first; event patch, audit and committed receipt share one final atomic batch. | Disjoint events remain independently retryable; stale same-event edits conflict. No automatic replay after ambiguous commit. |
| Calendar metadata save | Record-specific expected metadata revision; lane schedule reads together with lane metadata. | Metadata and audit transaction is atomic; stale/missing revision rejected; separate records do not share a global revision conflict. | Existing 12-action metadata concurrency suite passes. Delayed cache refill no longer supplies event-write validation. |
| Calendar maintenance/sync | Eligibility scans project relevant columns; sync loads only target event rows and patches sync fields. | The same writer-lock wrapper covers all six direct maintenance callers; local cache scope ends on release/error. | Existing sync, maintenance-role-revocation and atomicity tests pass. |

## Speed and payload findings

The repair preserves read-only bootstrap speed. On the warm synthetic event-edit fixture, fresh validation adds one batched metadata read: five to six read batches, 66 to 218 cells. It still uses two write batches and 26 written cells, of which only six cells belong to the changed event. This is the measured freshness cost, not a production latency estimate. The four configuration tables are fetched together and reused within the writer request.

Contacts already defers teaching/deployment enrichment until the directory is usable and performs filtering, grouping, contact export and edit tracking on the client. Calendar already performs filtering/rendering against its selected-year cache and patches affected event dates following a confirmed edit. Neither component needs per-cell network verification while a user types.

Contacts' gzip is currently for stored coherent snapshots, not an explicit compressed browser bootstrap contract. Calendar and Contacts API gateways return JSON with `no-store`; this audit does not claim application-level endpoint decompression exists there. Compression candidates are whole read-only directory/selected-year snapshots with an explicit schema version and identity boundary, after measuring real payload sizes. Fresh authority, revision comparisons and operation receipts must remain server-side. Sending all years or all editable Contacts tables on every load would increase unrelated I/O and is not recommended without evidence. Roster's requested staged current-day-to-30-day timetable preloading is a separate release change.

## Verification evidence

The regression was run against both the baseline backend and patched backend. Baseline fails on disabled-lane acceptance; patched lane and tag cases pass. A separate read-only agent reviewed the diff and found no blocking correctness or structural findings; it independently reran the new regression and both Calendar concurrency suites.

Passed focused commands:

- `node tests/calendar085-write-cache.cjs`
- `node tests/calendar708-concurrency.cjs`
- `node tests/calendar708-metadata-concurrency.cjs`
- `node tests/suite703-calendar-reliability.cjs`
- `TZ=Asia/Singapore node tests/calendar/sheets_api_tests.cjs` — 63/63
- `TZ=Asia/Singapore node tests/calendar/backend_tests.cjs` — 38/38
- `node tests/contacts718-roster-performance.cjs`
- `node tests/contacts503-save.cjs`
- `node tests/contacts503-view.cjs`
- `node tests/contacts503-commit.cjs`
- `node tests/contacts710-fasttrack.cjs`
- `node tests/sheets414.cjs`

Calendar's inherited date diagnostics fail under the host's UTC timezone and pass under the application timezone, `Asia/Singapore`; the explicit timezone was used for the complete backend suites. No production performance or end-to-end deployment claims follow from these harness results.

Review methods: systematic debugging, Pstack root-cause analysis, Ponytail simplification, Vercel code review, verification-before-completion, and the local Thermonuclear correctness/quality rubrics. No UI behavior was changed in this component patch. No unresolved blocking finding remains within this diff; full-suite packaging, version synchronization and live deployment checks remain the release owner's work.
