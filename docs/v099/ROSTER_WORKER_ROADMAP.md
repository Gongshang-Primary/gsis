# Roster Worker route: staged implementation and handover

Status: future implementation plan, 28 October 2026. Roster remains Google-first in 0.9.9. The user wants an online Worker response first while the Worker route is built in parallel; this is not permission to enable historical full-Roster D1 migration flags. Each completed stage must have its own changelog entry, code/evidence reference and remaining limitations.

## Route, acknowledgement and authority

| Concept | Current boundary | Intended progression |
| --- | --- | --- |
| HTTP route | Browser → authenticated Roster Pages Worker → Google Apps Script. | Keep the same trusted gateway; add bounded operation adapters individually. |
| Durable intake receipt | `saveAbsence` / `requestMutual` with `intake:true` can return a Worker/D1 transport receipt where `GSIS_JOBS` exists. | Extend receipt-first responsiveness only after each operation has an exact recovery contract. |
| Authoritative save | Google owns Roster records, plans, relief decisions and current production processing. | Remain Google until a separately verified ownership handover. A queued command is not a saved record. |
| Shadow/reference copy | O preparation stores validated native timetable bytes and dated candidates in private R2 with D1 heads/receipts. | Build current-source verification and role-scoped read projections; compare before serving production. |
| Future operation ledger | Historical D1 implementation and isolated synthetic rehearsal exist, but are not active Roster authority. | Design the deliberately scoped ledger and prove atomic idempotent operations before any activation. |

Use explicit states: **received**, **processing**, **saved to Google**, **needs attention** and **outcome unknown**. A later Worker-authoritative save must identify that authority and epoch. Publication, notification queued, provider accepted and delivered remain separate facts. Never label a transport 202 or a locally rendered optimistic row “saved”.

## Existing foundations

- `shared/roster-absence-transport.js` captures a stable request, actor and payload identity; exact retries retain that identity. The gateway returns `receiptOnly:true` and `absenceApplied:false` when only transport acceptance is established. Forwarded means Google accepted intake, not necessarily that the absence is applied.
- `shared/roster-recovery-profile.js` keeps legacy Roster authority on Google and disables migration delegation at current entrypoints. Existing pause controls run before capture; they are not an uninterrupted intake buffer.
- `shared/roster-operations.js`, `shared/roster-allocation.js` and `shared/roster-stapler.js` contain portable domain rules. Preserve their current policies rather than reimplementing a reduced allocator.
- `rehearsal-worker/` exercises isolated synthetic absence, assignment, allocation, receipts and simulated notification intents. It does not import full school operational data or send messages.
- `timetable-prep-worker/` imports verified native timetable parts, stores immutable private gzip objects and commits D1 pointer/receipt/version changes atomically. It deliberately labels its head shadow-only, Google authority and independently unverified freshness.
- The operator reports successful live preparation imports/readback, including 31 dates after the P export fix. Current Calendar parity, Contacts mapping, source freshness and production consumer permissions are not established by those imports.

## Bounded stages

| Stage | Deliverable and completion gate | Production effect |
| --- | --- | --- |
| 0. Preserve and measure | Inventory every route, writer, receipt/job type, consumer and current authority. Measure foreground acknowledgement, Google commit and visible refresh separately. Record version/authority/source revisions with safe diagnostic IDs. | Google route unchanged. |
| 1. Trusted timetable comparison | Add an administrator-only comparison adapter using current Calendar dated school-day/parity and Contacts identity mapping. Bind projections to both source and permission revisions. Compare ordinary, odd/even, suspended, missing-baseline, non-school and rollover dates. | Shadow reads only; production answers still Google. |
| 2. Worker-first command response | Select one bounded operation family after absence transport. Persist exact request/hash, actor, expected source revision, operation sequence, status and recovery evidence before acknowledging. Dispatch to Google with original-actor revalidation, and recover authoritative receipts before any uncertain replay. Prove offline/reload/two-tab/race behavior. | Worker receives and reports; Google commits. Do not make browser background promises the durable queue. |
| 3. Verified read projections and local caches | Publish permitted dated views keyed by source revision, authority epoch and actor/permission context. Apply affected-date invalidation; preserve drafts and refresh only changed views. Use push as a change hint with ledger/cursor catch-up; bounded reconnect does not imply freshness. | Gradual read acceleration behind the same authentication boundary; Google remains authority. |
| 4. Administrator-only operation simulation | Build an explicit supported operational snapshot/converter, isolated ledger and simulated outbox. Exercise real domain decisions, duplicates, concurrent edits, failures and replay against captured references. Measure school-sized loads. | Separate namespaces/storage; no production consumers, Google writes or provider credentials. |
| 5. Handover rehearsal and evidence | Inventory and fence every writer; build and test continuous intake, final snapshot/deltas, one authority epoch, outstanding receipt reconciliation, rollback and backup. Require a reviewed evidence checklist before choosing a window. | No cutover until all gates pass and the operator deliberately activates it. |
| 6. Single-writer authority handover | Activate only the scoped store(s) whose writers/readers are ready. Commit the final current snapshot and checked ownership epoch; enable one processing/sending owner. Verify critical acceptance before normal traffic. | A later release, not 0.9.9. Google becomes an explicit asynchronous backup only for handed-over stores. |

The next bounded implementation is stage 0 plus the stage 1 administrator comparison adapter. Stage 2 can be designed in parallel against the existing absence receipt contract. Do not combine stages 1–6 into a single migration patch.

## Data and transaction contract

The future D1 ledger should hold operation/request identity, payload hash, actor/role evidence, source revisions, authority epoch, dated operational revisions, receipts, job/outbox intent and reconciliation state. Native baseline and independent confirmed Stapler documents belong in private immutable compressed R2 objects, referenced by verified hashes and versioned D1 pointers. Store only the data required by the operation; do not copy whole private staff records into venue projections or browser caches.

Prepare and verify an immutable R2 object before making it visible. Within one guarded D1 transaction, require the expected revision/epoch, advance the head and write the command receipt and any outbox intent. An exact request replay returns the same result; reuse of an ID with different payload is rejected. A losing/failed D1 transaction must not publish its R2 object. Retain unreferenced objects until safe recovery/retention rules allow collection. Google and D1 do not share a transaction: designate one authority and represent replication failures explicitly.

For Google-first queued commands, persist the intent before dispatch; recover an uncertain Google result using the same request identity and authoritative receipt. An expired lease alone never proves nonacceptance. Preserve per-record ordering and expected revisions, and allow independent records to proceed where their business constraints permit. Publish and notify remain separate stages. Preserve accepted/unknown provider evidence and never recreate a message under a fresh identity to hide an uncertain outcome.

## Freshness, permissions and venue projection

Baseline upload, activation, edit, validity/priority change and deletion must invalidate affected dates. Stapler save/import, confirmation/publication, reset, move, rename, restore and deletion need explicit draft-versus-confirmed revision behavior. A changed baseline must not replace confirmed Stapler intent. Missing baselines remain missing; never borrow an adjacent date or extend validity implicitly.

The active window is Singapore today through 30 days ahead inclusive (31 dates). Roll it forward with current dated source evidence. It is a read window, not permission to erase original plans, cumulative relief history, receipts or recovery versions. Failed refresh leaves visible pending/failed state; it cannot certify old content as current.

Check server permissions on reads and mutations. Ordinary teachers receive only permitted personal/confirmed views; SMC/admin scopes remain distinct. Unknown, duplicate, changed or inactive identity mappings fail without broadening access. Invalidate cached private projections after actor/role changes. The preparation administrator allowlist/token is not a production teacher session.

Venues receives only permitted occupancy, stable venue/event identities, date/time and the required occupying-teacher display name. Exclude drafts, private absence reasons, contact details, instructions and other unrelated staff data. Test this restricted response independently. Calendar catalogue matching and stored VenueID do not create a booking or establish free/busy. Roster occupancy export is currently paused in the recovery profile; reopening it is an explicit integration stage.

## Overnight intake and single-writer handover

Staff may report absences overnight and the optimiser can already run. 03:00 Singapore is a possible operator-selected window, not a scheduled task or evidence of quiescence. Implement durable intake before any pause that would otherwise reject new reports. Carry original request IDs, actor chronology and accepted state through buffering/replay; expose processing state to staff.

Inventory direct Apps Script helpers, old browser tabs, Pages routes, scheduled Workers, admin/service routes, baseline/Stapler lifecycle writes and notification callbacks. A feature flag is not an all-writer fence. Recheck ownership epoch at the final authoritative write boundary. Prove that two writers cannot both commit one revision across a handover.

The final snapshot/delta reconciliation must include absence reports and intake receipts, manual SMC decisions, peer arrangements, protected/published allocations, confirmed timetable views, accounting history, request receipts, pending jobs and provider attempts/callbacks. A timetable-only import cannot stand in for this ledger. Scope each store's handover explicitly; preserve Deploy's separate existing authority configuration.

Before activation prove: one last trusted Google comparison; capture of reports arriving during the transition; replay once under the correct effective timetable revision; no duplicate provider submission; permission revocation during work; stale/duplicate requests; R2/D1/Google failure; interruption at each ownership step; and live morning latency/error monitoring. Keep the existing critical absence pipeline operating during preparation.

## Rollback and evidence log

Before Worker authority, rollback can disable a new reader/dispatcher only after accepted queued work is retained and reconciled. After Worker writes are accepted, restore ownership only after their changes, receipts and outbox outcomes are reconciled into the selected destination. Deploying old code or changing a URL alone cannot restore consistent ownership. Never silently read a stale Google replica as current after cutover, or replay accepted/unknown notifications during recovery.

Define retained native backup, pointer/object integrity checks, asynchronous timestamped Google backup, retention and restore tests before activation. Prune only objects proven unreferenced by current heads, in-flight commands, confirmed recovery sources and retained receipts. Source-package pruning is independent of production retention.

Every future changelog entry records: stage and operation/store scope; route and authority before/after; data/permission contract; source and authority revisions; duplicate/concurrency/failure results; local versus live evidence; configuration changes; operator actions; rollback boundary; and unresolved gates. Record actual release/commit/evidence hashes when available. Do not describe a proposed stage, a synthetic pass or an earlier native import as completed production migration.


## 29 October 2026: bounded preparation, locally implemented

[Task roster-d1-chunked-import](../coordination/tasks/roster-d1-chunked-import.md) replaces the administrator preparation route's monolithic import. It freezes one immutable indexed Google source, transfers bounded verified records and gzip object segments, records durable session progress and commits the Roster and register heads atomically at imported. The existing Google source digest remains in both heads' source metadata; each head's packed-state digest convention is preserved. The browser resumes the same actor/request/session and never calls a part receipt a completed import.

This advances preparation/rehearsal evidence only. It does not advance stage 6, change a production reader, flip `ROSTER_EDGE_AUTHORITY`, call the activation fence or send notifications. Status/evidence/restart are bounded; explicit restart retains source, staged rows and receipts. Source bytes that never reached Drive cannot be recovered from a digest, so failed preparation requires a new request ID. The retained upload can be adopted after lost acknowledgement only after its header/length/digests verify.

Focused functional tests and the final local workerd/D1/R2 production-size run pass (14.9 MB source, 72 parts, 55,459,509 bytes sampled peak isolate memory). Its 159.78 ms maximum sampled active CPU exceeds the free 10 ms allowance and fits the tested 30-second paid budget assumption; the deployment account plan still needs verification. See the task record for generated/full-suite results, exact bounds, evidence and unknown-outcome semantics. Claude's exact-head review, Apps Script/Drive staging, release approval and every existing authority-handover gate remain open. Keep rollback scoped to stopping preparation and retaining its evidence; shared data and production authority are unchanged.


Retained preparation is admitted up to **eight sessions** in both Google and D1. Google checks descriptor count under its script lock before capture; D1 checks session count in the reservation transaction. Existing identities can still resume at capacity. A ninth new request fails clearly and requires reviewed archival/cleanup; no uncertain evidence is automatically deleted. This bounds repeated restart/new-request storage growth while retaining recovery evidence. Focused tests cover the cap, existing-session resume and concurrent claims for the final slot.
