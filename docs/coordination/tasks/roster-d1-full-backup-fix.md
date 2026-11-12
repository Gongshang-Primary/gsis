# roster-d1-full-backup-fix: Make the full D1 backup succeed, then prove a restore

- Status: implemented; final validation in progress (URGENT, Model: Codex)
- Owner/model: Codex
- Reviewer/model: **Claude** (owner exception 12 Nov: "owner approve to skip muse for just these 2 tasks and claude to review. muse to sit and skip these 2 only"). Muse does not review this task.
- Last updated (Asia/Singapore): 2026-11-12 ~20:00
- Branch: codex/roster-d1-full-backup-fix
- Base SHA: e72e8ad4028261852956888f3676e486251751e7 (verified current main)
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

## Claim

Model: Codex. Branch `codex/roster-d1-full-backup-fix` from verified current main `e72e8ad4028261852956888f3676e486251751e7`, before implementation edits. The info-only task is already merged (#115). Reviewer is Claude under the owner exception. Investigation uses local synthetic D1/R2/Drive fixtures only. No limit changes, live reads/writes, row or object deletion, template activation, merge or deployment are authorized. Employment-mail work follows this task in serial order.

## Investigation checkpoint (Model: Codex, 12 Nov)

- Proven cache cause: `captureBackup` copies recovery heads into `gsis_backup_items`; `runRecoveryTimetableCleanup` protects only current/previous **live** heads. Cleanup can retire a head and remove its old part after capture. The captured head remains, and the old exporter fails the entire backup. `tests/roster-drive-backup-cache-loss.mjs` reproduces this using the real cleanup implementation with entirely synthetic D1/R2 data. It fails on the original exporter with `BACKUP_OBJECT` and passes on the working change. Missing/corrupt derived entries are omitted and recorded in `missingCacheParts`; authoritative packed-audit digest failures remain fatal.
- The observed 960,000 ms expired rows do **not** establish that export or upload consumed 16 minutes: expiry records the next scheduler's detection time. Neither the inner run lease nor the outer worker lease has a progress renewal, and there are no persisted stage timings in the original code. Exact live stage attribution remains unproven; no live reads were made.
- Original synthetic baseline: 14,000 main records including 13,000 compressed audit-evidence records; capture 24 ms, tier-one export 45 ms, tier-two export 7,008 ms, serialization/compression 106 ms, total 7,183 ms. This local measurement does not reproduce the live delay and is not a provider throughput claim.
- Working core change retains the 15-minute lease duration, renews it only on actual export progress, persists stage/record/time diagnostics, retains captured rows, and applies an hour of backoff after a failed run. It does not yet renew the **outer** worker lease: that change is awaiting the scope clarification below.
- Latest synthetic full/restore check: 14,081 captured records, full verified in 7,273 ms (capture 29; tier-one export 46; tier-two export 6,880; compression 290; synthetic upload 22 ms). Restored TIER_ONE values match the normalized source. Increment follows a verified full. Tests also cover pipeline progress beyond 16 minutes, dead-run single expiry, retained captures, and hourly fault backoff. The Drive adapter is a local fixture; no live provider timing is claimed.
- Existing daily full schedule: 02:15 Asia/Singapore; hourly increments between full backups. Weekly restore drill: Sunday 02:15 Asia/Singapore, with the existing interrupted-drill retry path.

### Pending scope clarification

The task names scheduling in `_worker.js` / `notification-worker/index.js`, but the outer lease, 12-minute elapsed-time check, backup runner and restore scheduling live in `roster-update/public/edge-roster-backup-jobs.js`. The requested visible health lines are rendered by `roster-update/public/system-health.js`, not `shared/edge-health.js`. Asked the owner to include these two files, limited to backup progress/lease handling, recovery alerts and the specified health lines. A proposed patch is prepared locally but **not applied**. Do not treat the core module checkpoint as a complete repair while the outer lease remains unchanged.

### Checkpoint validation

- Passed: `TZ=Asia/Singapore NODE_NO_WARNINGS=1 node tests/roster-drive-backup-cache-loss.mjs`; also proved its failure against the original exporter before restoring the fix.
- Passed: `TZ=Asia/Singapore NODE_NO_WARNINGS=1 node tests/roster-drive-backup-progress.mjs` (14,081 records; full, restore, increment, progress and backoff checks).
- Passed existing `roster-drive-backup.mjs`, `roster-drive-jobs.mjs`, `roster-drive-restore.mjs`, and updated `roster-drive-output-errors.mjs`. The latter now requires expiry backoff before retry instead of its former immediate-retry policy.
- `TZ=Asia/Singapore npm run build` completed; generated Worker bundles regenerated. Final clean-build verification, full local suite, CI, alert recovery acceptance and the draft PR are **not complete**.
- Employment-mail task not started; lane R remains serial. No live data/settings, WhatsApp templates, production R2 objects, main branch, deployment or merge changed.


## Approved completion (Model: Codex, 12 Nov)

Owner answered **"include"** for the bounded addition of `roster-update/public/edge-roster-backup-jobs.js` and `roster-update/public/system-health.js`. The prepared patch is now applied. No further scope expansion was required; the existing parity guard and all 272 probes pass without catalog changes.

- Both the export lease and outer scheduled-worker lease renew from measured progress and completed bridge calls. The fixed elapsed-time rejection is replaced by ownership checks; lease duration remains 15 minutes. A synthetic 20-minute R2 export with a competing cron verifies that the second invocation skips and the single original full run verifies. There is no independent heartbeat timer that could keep a stuck task alive.
- Failed full/increment attempts back off for one hour from failure, including expired attempts, and the scheduled job exposes `backoff`, `backoffSeconds`, `readyAt` and `SKIPPED_BACKOFF` to the existing job-health recorder.
- The scheduled restore drill verifies the newly written 14,081-record full in the fixture. TIER_ONE round-trips; subsequent increment verifies. Full plus scheduled drill measured 15,987 ms locally; the full's export stages were 24 ms capture, 45 ms tier one, 8,052 ms tier two, 341 ms compression and 28 ms simulated upload. These numbers describe local synthetic adapters, not production/provider performance.
- Recovery resolves matching Admin incident records and retains the per-day identity. It does not change, retry or remove delivery records. Tests retain 12 blocked history rows byte-for-byte across recovery and prove repeat failures do not queue another same-day alert.
- System Health displays the last verified full timestamp and compressed size and the last restore-test result/time. The scheduler continues to own the existing daily/weekly cadence. No crons, templates or live configuration were changed.

### Root cause and limits of evidence

The missing-cache failure is reproduced against the real cleanup implementation. The lease failure is structurally reproducible: an active export does not renew either lease; the next two-minute cron expires it at the first observation after 15 minutes (typically 16). The fix proves progress across that boundary and fences a competing cron. The old fixed 12-minute check also rejected otherwise progressing work on its next Drive call. The provided ledger evidence cannot identify the exact production stage before interruption; the new durable `progress`/`timings` fields provide that attribution. Do not describe the synthetic timing as a live diagnosis or claim production backups are verified before the owner checks them.

### Deploy and rollback (owner only)

1. Deploy the rebuilt Roster Pages output (including the backup modules, alert recovery and `system-health.js`), notification Worker `dashboard-worker.mjs`, and operations Worker `dashboard-worker.mjs` through the normal bundle/release process. Generated `.txt` copies match. No Apps Script source change is needed; keep its existing verified Drive adapter.
2. Preserve current bindings, URLs, credentials, Google authority, existing cron entries and Drive backup configuration. This PR does not enable backups or WhatsApp templates.
3. With backup scheduling already enabled, wait for a **verified full** ledger row with a Drive file ID and digest, then a **verified restore-test** row. Check the full's `missingCacheParts` and stage diagnostics, the new System Health lines, and later an increment. A failure must show backoff rather than start another full every two minutes.
4. Only after the owner verifies the full and restore test should the owner consider enabling the approved `system_alert` template. Retain all 12 blocked historical delivery rows; do not retry them. Enabling that template is not an action in this PR.
5. Roll back by redeploying the previous Worker/Pages build while preserving configuration and all ledger and delivery rows. No data deletion or credential change is needed. Existing source/scratch restore behavior is unchanged; this repair adds no R2 deletion and removes only terminal transient captures.

Reviewer: **Claude**, at the final PR head. Full-suite results and CI run ID will be recorded after final verification. Employment mail remains queued behind this task because its Worker/health/generated files overlap; no employment implementation has started.


## Claude re-review correction (Model: Codex, 13 Nov)

Claude requested one change in `docs/coordination/review/pr127-claude-review.md` at `94d9267`: captured `gsis_backup_items` rows are transient working copies, not the retained record. The owner's 13 Nov instruction explicitly authorizes removing them after verified, failed or lease-expired completion. This supersedes the captured-row retention noted in the historical checkpoints above.

Terminal settlement now deletes only the matching run's transient items in the same transaction as its status update. Expiry cleanup is restored both in the scheduler and in direct admission of a replacement run. Ledger rows, manifests, Drive objects and authoritative Roster data are unchanged. Regression assertions cover verified completion before restore, explicit failure, scheduler expiry, admission expiry, preservation of the ledger/manifest, and survival of the replacement's active capture.

Push/build/full CI and the new exact head will be reported in PR #127 for Claude's re-review. The owner also directed starting employment-mail dispatch after this revision is posted; that latest instruction supersedes waiting for the backup PR to merge. The mail change will use its own branch and PR, with this dependency stated explicitly if unmerged shared code is required.

Revision checks: all eight local backup/cache/progress/restore/alert/UI programs passed. The new expiry cleanup assertion fails against the previously reviewed `94d9267` implementation and passes with this correction. The 14,081-record scheduled full/restore still passes after its temporary capture is deleted. Canonical build regenerated the Worker bundles; final-head clean rebuild and CI results are reported in the PR body.
