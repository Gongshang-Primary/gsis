# Timetable preparation and production handover

Status: 28 October 2026, Singapore time. This document describes the boundary of revision P. It is not an activation instruction.

## What remains in production

The Roster frontend sends same-origin requests to its Cloudflare Pages Worker. The Worker authenticates the school session and forwards authorised operations to the existing Google Apps Script backend. Where the existing `GSIS_JOBS` binding is configured, an absence can first receive a durable transport receipt in D1, then be forwarded to Google for processing. A transport receipt means received; it does not by itself mean the absence was saved.

The relevant code is `roster-update/public/_worker.js`: `fetch`, `absenceTransportRoute`, `backend` and the generated absence transport helpers. The canonical transport implementation is `shared/roster-absence-transport.js`.

No new frontend binding is needed to keep incoming absences working. Keep the existing Roster URL, Google backend URL, credentials, storage bindings and schedules. The separate preparation Worker has no absence-saving endpoint.

`shared/roster-recovery-profile.js` is applied at the Roster Pages and notification entrypoints. It removes the old operational service delegation and sets both legacy authority selections explicitly. The Pages migration route returns `RECOVERY_MIGRATION_DISABLED`. It does not remove a persisted Google migration fence or rewrite database authority.

The old Operations Worker still contains the broader D1 operational implementation. Including its versioned file in the full suite does not activate it. Do not use its `ROSTER_EDGE_AUTHORITY=d1` setting as a timetable-only switch. That implementation expects the Roster, register and references stores to have verified active D1 heads.

Deploy has a separate existing authority boundary. Its Pages gateway preserves its configured private-service or Google routing; the Roster recovery profile is not a global override for every product. Preserve Deploy's working configuration. Installing P must neither activate a new Deploy migration nor silently undo an existing one.

## What the operator's O report proves

The supplied `gsis-0.9.8o-preparation-report.md` records these live results:

- Roster O frontend and backend were installed by the operator.
- The unmodified O preparation module ran on Cloudflare and school administrator sign-in worked.
- One school snapshot contained 31 dates, one native baseline and four confirmed suspended plans, about 3.8 MB of native parts.
- Cloudflare rebuilt and matched 14 native projection hashes, stored private gzip objects in R2, committed the D1 pointer and read dated copies back.
- Exact request replay and an unchanged re-import preserved revision 1.
- Independent D1 checks matched the import; the earlier synthetic rehearsal ledger was unchanged.

The export required removal of transport-only `timing` fields before O would import it. P addresses that contract defect and adds an actual serialized-response-to-import test. Local P verification is separate evidence from the operator's live O results; a P package is not proof of P deployment.

The report did not prove current Google freshness after the snapshot, dated school-day/parity selection, current baseline name-to-staff mapping, a stale-content race on O, O's unlisted-account denial or larger-school-load performance. The source check is supplied file evidence, not a signed certificate of present Google authority.

## Why this is not yet an authoritative timetable service

The preparation service exposes only its authenticated `/api/prep/*` routes. Its head marker remains `shadow-only`; responses state `productionAuthority: "google"` and `sourceFreshness: "not-independently-verified"`. It has no production credential, scheduler, notification sender, delete operation or activation endpoint.

Dated baseline objects contain candidates for the stored single week or odd/even weeks. They explicitly set Calendar verification to false. The first candidate is not a selected live timetable. A weekend's empty weekday projection is not evidence that the school has no activity that day.

A null baseline mapping is valid when no uploaded baseline covers that date. It must not borrow the previous day's baseline or extend a baseline past its validity. A separately confirmed Stapler plan may still be valid and must retain its intended outcome, confirmation and independence from later baseline changes.

## Gates for a later production adapter and handover

| Gate | Required implementation and proof |
| --- | --- |
| Date and parity | Obtain the dated school-day and odd/even decision from the current Calendar authority. Bind the selected projection to the Calendar revision and timetable source revision. Refuse an unverified decision rather than choose the first candidate. Distinguish a verified non-school day from unavailable Calendar data. |
| Staff identity | Resolve baseline teacher names through the current Contacts/Name Bridge authority. Detect missing, duplicate, changed and inactive identities. A text match alone must not grant a teacher access to another person's timetable. Recheck current roles for each privileged consumer. |
| Production reader | Add a deliberately scoped service-to-service adapter behind the existing authenticated Roster gateway. Ordinary teachers receive permitted personal/confirmed views; SMC and administrator views use their own permissions. The preparation administrator token is not a production user session. |
| Venue projection | Return only permitted occupancy, including the occupying teacher's required display name. Exclude draft allocations, private absence details, contacts, instructions and other staff data. Test venue responses independently from the full timetable response. |
| Freshness | Tie every published pointer to a current authoritative revision. Baseline upload, change, activation, validity/priority edit and deletion must invalidate the affected dates. Stapler save, import, confirmation, publication, reset, move, restore, rename and deletion need explicit draft-versus-confirmed revision behaviour. A failed update must leave a visible pending/failed state, not silently certify old content. |
| Independent Stapler | Preserve the saved confirmed intended timetable even when a current baseline changes or is missing. Recompute baseline comparison separately. Do not import later unconfirmed edits as confirmed content. |
| Read fallback | Before handover, a failed shadow read may fall back to current Google data only after the same permission and dated-source checks. Never describe stale shadow data as current. After handover, do not silently fall back to a stale Google replica; use explicit recovery ownership. |
| Writer ownership | Fence every relevant writer, including direct Apps Script helpers, older browser tabs and service/background routes. A flag alone is insufficient. Commit a final current snapshot and a single authority epoch with checked revision ownership. Two concurrent writers must not both accept a save. |
| Concurrent intake | Keep absence intake on its current pipeline during timetable preparation and handover. Incoming absence receipts must not be discarded or replayed under new identities. Applying an absence must use the correct effective timetable revision or expose a recoverable source conflict. The relief ledger remains outside this timetable-only move. |
| Rollover and pruning | Advance the Singapore today-to-30-days-ahead window; prepare newly entering dates. Keep one current working copy per dated source, plus explicit recovery retention. Cull only unreferenced objects after the current head, in-flight imports, confirmed recovery sources and retained receipts can no longer reference them. |
| Recovery | Verify native D1/R2 recovery, retained pointer/object integrity and an asynchronous Google backup. Record how to return ownership, not merely how to deploy old code. A rollback must not produce competing writers or recall accepted provider notifications. |
| Operational test | Compare Google and Cloudflare results across ordinary, suspended, missing-baseline, odd/even, non-school and rollover dates; run concurrent updates, interruption, stale revision, permission revocation and storage-failure cases. Measure live CPU, memory, latency and errors with actual workload. |

The first production read phase can remain behind an administrator-only comparison path. It should return both revisions and the comparison result without changing production answers. Opening normal consumer reads and moving source ownership are separate controlled steps.

## Independent reviewer checklist

- Confirm the full suite retains `rosterRecoveryEnvironment` at every Roster Pages/notification entrypoint, preserves Deploy's separate routing, and does not enable a historical migration flag or route.
- Confirm preparation accepts only the documented schema and preserves exact hashes, immutable objects and D1 compare-and-swap receipts.
- Check O-to-P export compatibility and interrupted-request recovery, including already imported O snapshots and exact retries.
- Do not infer a live school-day/parity from the presence, order, size or absence of a baseline candidate.
- Verify unknown staff mappings fail without widening access; test teacher, SMC, administrator and venue projections separately.
- Inventory every baseline/Stapler writer before accepting a single-writer handover claim.
- Check confirmed plans remain independent of baseline and draft changes.
- Require a fresh trusted comparison at handover. A successful earlier import is insufficient.
- Distinguish local test success, operator-reported O live evidence, P deployment and completed authority handover.
- Verify source-artifact pruning excludes duplicate history only; it must not delete production receipts, attendance, assignments, plans or retained recovery evidence.

## Source map

- `shared/roster-recovery-profile.js`: release authority profile.
- `roster-update/public/_worker.js`: authenticated production routing and absence receipt handling.
- `shared/roster-absence-transport.js`: durable receipt capture, identity and forwarding.
- `backend/RosterTimetablePreparation.gs`: read-only native snapshot contract and source checks.
- `timetable-prep-worker/domain.mjs`: exact portable schema, hashes and native reconstruction.
- `timetable-prep-worker/storage.mjs`: private gzip objects, dated candidates, atomic pointer/receipt commit and readback.
- `timetable-prep-worker/index.mjs` and `auth.mjs`: restricted preparation routes and administrator identity.
- `operations-worker/index.js`: broader historical D1 operational authority, not a timetable-only adapter.
- `docs/v098o/TIMETABLE_EXPORT_CONTRACT.md`: existing portable format and confirmed-plan projection semantics.

## Read-only integration checks

The following retained tests passed against the P working tree on 28 October 2026, before final release label generation. They exercise local services/mocks, not a live absence submission:

- `TZ=Asia/Singapore node tests/roster098-recovery-worker.mjs`: 8/8, including stale migration settings, durable absence capture/forwarding, Google fencing and pause controls.
- `TZ=Asia/Singapore node tests/paid097-backend-gateway.mjs`: pass, including Roster recovery routing and separately preserved Deploy/private-service routing. Node emitted its existing module-type inference warning.
- `TZ=Asia/Singapore node tests/paid097-jobs-worker.cjs`: pass, including no old paid-job claims and unchanged queue retention.

Repeat the release's final generated-artifact checks after bundling. These three programs do not prove a timetable authority handover.
