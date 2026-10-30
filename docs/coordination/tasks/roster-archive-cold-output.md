# roster-archive-cold-output: move old machine output to monthly archive files (keep all records)

- Status: claimed (owner 31 Oct 2026: start row A; pause all other GSiS repository work)
- Owner/model: Codex (builder)
- Reviewer/model: Claude
- Last updated (Asia/Singapore): 31 Oct 2026 05:59
- Branch: codex/roster-archive-cold-output
- Base SHA: 6eb943f01e5974b33244001040fdb5f66d1ad6a4
- PR: none
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
