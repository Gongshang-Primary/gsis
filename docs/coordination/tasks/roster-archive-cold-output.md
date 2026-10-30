# roster-archive-cold-output: move old machine output to monthly archive files (keep all records)

- Status: review prepared; open the PR only after the current full CI passes
- Owner/model: Codex (builder)
- Reviewer/model: Claude
- Last updated (Asia/Singapore): 31 Oct 2026 05:30
- Branch: codex/roster-archive-cold-output
- Base SHA: 082dec5ddb34c20275348ac9eaaeba26d64952b3 (latest main integrated; changelog and deployment notes retained)
- PR: [row A branch pull request](https://github.com/helper-gsps/gsis/pulls?q=is%3Apr+head%3Acodex%2Froster-archive-cold-output)
- Files/domains owned: backend/RosterOperations.gs (archive write/read, nightly job hook), shared/roster-operations.js (archive selection, compact stubs), Roster Admin storage UI (archive status, open archived item), generated copies, tests.
- Out of scope: pruning (owner: "cannot prune. need to keep records"); the split-file live layout (#19 is repurposed for the D1 backup, see roster-d1-google-backup.md).

## Background (Storage report, 31 Oct 2026 04:47)
Total 16,079,661 of 24,000,000. About half is machine output, not school records:
- outbox 2.37M (1,053): stapler_timetable 1.03M, smc_alert 0.71M, smc_report 0.54M. Full message bodies stored with each item.
- audit 2.18M (3,169): workload-review 0.79M and optimise 0.35M are system entries; human actions (assign, saveAbsence, saveStapler, ...) about 0.5M.
- receipts 1.95M (520), optimisationRuns 1.67M (215), scheduleReceipts 0.11M (1,130).
Every request reads and every save rewrites the whole file, so size also makes Roster slow (31 Oct: intake timeouts, slow page loads).

## Owner decisions (31 Oct 2026)
- Option A chosen over the split layout for live data: archive, never delete.
- Age: items **older than 30 days** (by their date or completion time). Today, future dates, baselines and suspended timetables are never archived.
- Message bodies may move to the archive; the main file keeps a one-line delivery record. (Claude explained; owner deferred the detail to this default.)

## Required
1. **What moves (only when older than 30 days and finished):**
   - `outbox`: keep a stub `{id, kind, recipientId, date, status, createdAt, sentAt, deliveryAt, readAt, failure code, archiveRef}`; the body/data/payload moves. Queued, uncertain or retrying items never move.
   - `receipts`, `scheduleReceipts`: move whole items past 30 days (replay protection only needs recent ones; confirm the replay window in code and use max(30 days, that window)).
   - `optimisationRuns`: move `decisionEvidence` and large fields when the run's audit export is captured (`auditExportCaptured`); keep a stub with id, date, outcome, archiveRef.
   - `audit`: move **system** entries only (`workload-review`, `optimise`, other non-human operations listed in code) with a stub of `{id, date, at, operation, actor:'system', archiveRef}`. Human-action audit entries never move.
   - `smcAlerts`: move items resolved more than 30 days ago, keep a stub.
   - **Never move:** absences, assignments, acknowledgements, entitlements, importedRelief, reliefCorrections, rotationEvents, stapler plans and archives, daily publication states, settings, anything dated today or later.
2. **Archive files:** `Roster archive YYYY-MM.json` in the Roster data folder, one per month of the item's date. Append-only: write the new archive version and read it back (digest check) **before** the main file commit removes the bodies. A crash between the two leaves duplicates, never loss. Each archived item keeps its original id.
3. **When:** a nightly step (after school hours, inside the existing scheduled maintenance, under the Roster lock, bounded per run, e.g. at most 2M characters moved per night) plus an Admin "Archive now" button on the storage report.
4. **Reads:** every existing screen keeps working on stubs. Where a screen shows a full old message or run evidence, offer "Open archived copy", which reads the archive by `archiveRef`. Statistics and R% must not depend on archived bodies (verify).
5. **Storage report:** show archived totals per month and the last archive run.
6. **D1 compatibility:** the stub shapes and the rule list live in shared code so the D1 path can apply the same retention later; the D1 import must accept stubs.

## Acceptance
- Fixture with production-like shapes: after archiving, main-file size drops by the archived bodies; every stub's `archiveRef` resolves to the original item byte-for-byte.
- Never-move collections are byte-identical before and after.
- Queued/uncertain outbox items and today/future items never move.
- Crash after archive write but before main commit: rerun is idempotent, no duplicates in the main file, no loss.
- Replay of a request inside the replay window still works; outside it, the existing "expired request" behaviour applies.
- Full suite (Node and LORD) green in the main checkout. Regenerate bundles.

## Claim and implementation boundaries

Model: Codex. Owner explicitly paused other repository work and authorised this task and a PR after the full suite passes. Earlier Codex PRs #19 and #27 remain untouched. The PR8 automation is paused. Claude remains the exact-head reviewer.

The implementation also owns the existing audit-export cleanup and notification-store overlay where needed to prevent deletion or re-expansion of archived data. Google remains authoritative. No live records, configuration, messages, deployment or D1 cutover are authorised by this task.

Receipt replay protection has no general request expiry today. Preserve durable request identities while moving large receipt bodies; do not weaken replay protection to satisfy archival. Use existing folder, lock, storage and scheduled maintenance paths. Tests must cover verified write-before-stub, interrupted retry, permissions, protected data, delivery overlay, audit export and statistics parity.

## Implemented scope

- Shared eligibility rules and compact records; scheduler records leave the main map only after verified archival. Ordinary receipt identities remain for replay protection.
- Append-only monthly envelopes with original JSON and per-entry/whole-file digests, readback before primary commit, idempotent interrupted retries, Admin browse/read/archive routes and command receipt recovery.
- One bounded after-school maintenance run per Singapore day, with a cheap successful-day marker; manual runs use the same locked writer.
- Storage replaces the visible destructive prune controls. Monthly lists, exact-copy view, escaped data, retry states and date-free gateway reads are included.
- Daily audit exports no longer delete original human records. Delivery overlays preserve compact rows; historical notification reads hydrate only the requested date.
- No live configuration, messages, school records, authority flags or deployment changed.

Details and rollback constraints: [change note](../changes/2026-10-31-roster-archive-cold-output.md).

## Verification

- `TZ=Asia/Singapore npm run build`: passed, all 18 components; Apps Script syntax gate parsed 86 files.
- Regression-first checks reproduced missing archive rules, unverified storage, UI and unnecessary Calendar lookup before the respective changes.
- `tests/roster-archive-rules.cjs`, `tests/roster-archive-storage.cjs`, `tests/roster-archive-cold-output-ui.cjs`, `tests/roster-archive-gateway.mjs`, `tests/roster-archive-accounting.cjs`, `tests/roster-archive-import.cjs`: focused checks, with final combined result recorded at handoff.
- Full Node/LORD suite: the exact current-head result is recorded in the branch CI and PR. The first run and its repairs are recorded below. No local Chromium binary is available; no browser tests have been skipped and counted as passing.
- D1 import accepts stubs and metadata; monthly archive files remain in Google. No D1 archive-body migration is claimed.
- Apps Script/Drive staging latency and actual school-sized records have not been tested live.

## Handoff

Only row A is active. PR #19, PR #27 and the other queue rows remain paused. The PR8 automation is disabled. Claude must review the exact published PR head after full CI passes. The PR is the current-head handoff record. No deployment is claimed.

### First full CI run

At source head `c8cce80927832218563ba3787b9032c8d83bc9ed`, GitHub Actions run [41129266049](https://github.com/helper-gsps/gsis/actions/runs/41129266049) passed the 18-component build, browser portability checks, all six archive programs and 888 of 890 Node programs. Two source-pattern assertions failed: `release505-timing.cjs` counted the archive transport UserLock as a planner ScriptLock, and `roster099a-storage-cap.cjs` expected the old preview-only storage ternary. The Node failure prevented the chained LORD suite from running. These failures are retained as evidence, not claimed as passes.

Local final focused run: 16/16 programs passed before those two fixture repairs. Local LORD execution reached its browser test and stopped because this runner has no Chromium binary; it is not a local full-suite pass.

The additional 16 MB synthetic fixture reduced 16,486,779 main-file characters to 2,318,740 across eight batches, each at most 2,000,000 characters. It retained 2,600 exact original records and byte-identical protected school records and pending/uncertain notices. This is synthetic capacity evidence, not measured live Drive throughput.

### Verification repairs and final handoff

The two failing source-pattern assertions were replaced or narrowed without relaxing their behavior contracts. The lock test still checks every planner ScriptLock release; the new archive runtime check verifies lock order and exact release counts on success, save failure and transport contention. The storage test now invokes the real context helper for both Storage and prune preview, checks the configured 20M capacity, verifies stored-form measurements and rejects any history decompression.

Fresh local commands passed: `TZ=Asia/Singapore node tests/release505-timing.cjs`, `TZ=Asia/Singapore node tests/roster099a-storage-cap.cjs`, `TZ=Asia/Singapore node tests/roster-archive-storage.cjs` (11 checks), `TZ=Asia/Singapore node tests/roster-archive-capacity.cjs` and `git diff --check`. The final full CI rerun must pass before the PR opens. Its URL and exact head are recorded in the PR body. No product logic changed after source head `c8cce80927832218563ba3787b9032c8d83bc9ed`; this follow-up retains latest main documentation and adds verification evidence/tests.
