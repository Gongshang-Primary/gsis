# roster-d1-full-backup-fix: Make the full D1 backup succeed, then prove a restore

- Status: proposed (URGENT)
- Owner/model: Codex
- Reviewer/model: **Claude** (owner exception 12 Nov: "owner approve to skip muse for just these 2 tasks and claude to review. muse to sit and skip these 2 only"). Muse does not review this task.
- Last updated (Asia/Singapore): 2026-11-12 ~20:00
- Branch: codex/roster-d1-full-backup-fix
- Base SHA: re-check main's head before branching
- Current head SHA (or PR head; avoid self-referential commit hashes):
- PR:
- User-authorised scope: owner, 12 Nov ("write tasks that fix these errors"). Make the scheduled full backup of Roster D1 reach `verified` in Drive, and make the restore test pass against it. Stop the failure loop and the alert storm it would cause.

## Evidence (Claude, read-only D1, 12 Nov ~19:40 SGT)
- `gsis_backup_ledger`: **no `full` or `increment` row has ever been `verified`.** In the last 3 days:
  - 230 × `BACKUP_LEASE_EXPIRED`: each run takes more than the 16-minute lease (`duration_ms` ≈ 960 000), and the next run marks it failed (`captureBackup`, edge-roster-backup.js:73).
  - 234 × `BACKUP_OBJECT · A cached timetable part is missing.`: `env.ROSTER_TIMETABLE_SNAPSHOTS.get(ref.objectKey)` returns null for a part named in a `gsis_recovery_timetable_heads` manifest (edge-roster-backup.js:109). One missing part fails the whole backup.
  - 50 × restore-test `BACKUP_MISSING · No verified backup is available.` (follows from the above).
  - 7 × continuity `BACKUP_JOB_INTERRUPTED` (last 11 Nov 11:07); continuity is verified otherwise (last 12 Nov 07:53).
- The daily Excel and log outputs work (330+ verified each), so Drive auth and the folder are fine.
- 12 `system_alert` WhatsApp rows are `blocked` in the outbox (Drive backups / restore test failing, to Admins). `gsis_system_alert_v1` is now **APPROVED** by Meta. It must not be enabled until this task is live, or it will alert Admins every few minutes.
- Since `latest` verified is null, `captureBackup` forces `kind='full'` every time. Increments can never start.

## Required behaviour
1. **Find the real cause of the slow run** before changing limits. Record in the PR where the 16 minutes go: the D1 copy into `gsis_backup_items`, the evidence tables, the export/sanitise/gzip, or the Drive upload. Then fix it. Acceptable fixes:
   - process the run in bounded, resumable pages across cron ticks, holding the lease and renewing it per page;
   - make the lease renewal real (heartbeat), so an active run is not marked expired.

   Raising `LEASE` alone is not acceptable unless the PR shows a measured run time well inside it, with margin.
2. **Missing timetable cache part must not fail the backup.** The recovery timetable cache is derived data:
   - if a part is missing or fails its digest, record it in the manifest (`missingCacheParts`) and continue;
   - the backup verifies without that cache entry, and restore rebuilds the cache from the timetable source as it does after a cache miss.

   Also find **why** the part is missing: is the R2 cleanup (`r2-cleanup`) or the timetable refresh deleting parts that a head still names, or are the heads stale? Fix the cause if it is in our code. Never delete live R2 objects in this task.
3. **One run at a time, no storm.** A run that is still making progress is not marked expired. A truly stuck run is marked failed once. The next run resumes or restarts cleanly. No more than one failed full run per hour should be possible under a persistent fault: back off after repeated identical failures, and record the backoff in `gsis_job_health`.
4. **Increments.** After the first verified full backup, increments run as designed. A full backup runs on the schedule already in code (state it in the PR).
5. **Restore test passes** against the latest verified backup. It runs on its existing schedule and records `verified`.
6. **Alerts.**
   - Before the template is enabled: identical system alerts are de-duplicated per output kind per day (at most one per Admin per kind per day), and a recovery clears the open alert.
   - Do not enable `system_alert` in config; the owner does that after deploy (put it in the deploy steps).
   - The 12 blocked `system_alert` rows stay as records. Do not resend them.
7. **Ledger hygiene.** Keep all ledger rows (no pruning). Add a System Health line: "Last verified full backup: <time> (<size>)", and "Last restore test: <result>".

## Files/domains owned
roster-update/public/edge-roster-backup.js, edge-roster-backup-restore.js, the backup/restore scheduling in roster-update/public/_worker.js and notification-worker/index.js, shared/edge-health.js (System Health lines), the system-alert de-duplication path, tests, CHANGELOG.md, generated bundles via the canonical build.

## Out of scope
Changing which collections are backed up (TIER_ONE/TIER_TWO) unless needed for time, and then only with a note; deleting R2 objects or D1 rows; enabling WhatsApp templates; any live data, settings, merge or deploy.

## Acceptance checks
1. Test: with a dataset at least the size of live (≥ 14 000 roster records, current D1 shape), a full backup completes and verifies within the lease or across resumable pages. Measured times are in the PR.
2. Test: a missing cache part yields a `verified` backup with `missingCacheParts` listed, not a failure. A digest mismatch on a **non-cache** record still fails.
3. Test: a run in progress past the old 16-minute mark (simulated) is not marked `BACKUP_LEASE_EXPIRED` while it heartbeats. A dead run is failed once, then recovered.
4. Test: repeated identical failures back off (no more than one failed full run per hour).
5. Test: a restore test against the new backup round-trips and records `verified`. The restored state matches the source for TIER_ONE collections.
6. Test: the system alert is de-duplicated per kind per Admin per day, and clears on recovery.
7. Root cause of the missing cache part is stated in the PR with evidence (code path or test). If it is outside our code, say so.
8. Canonical build no diff; full local suite green; full CI green; draft PR naming **Claude** as reviewer at the exact head; DEPLOY_STEPS note: deploy, then wait for one verified full backup and one verified restore test, then enable `system_alert`.

## Decisions and changes
- Owner exception 12 Nov: Claude reviews this task instead of Muse. Muse skips this task only.

## Verification
Exact command, tested commit, outcome and evidence. Explicitly list checks not run.

## Review
