# roster-d1-backup-ledger: D1 backup to Google Drive with an auditable ledger

- Status: claimed; Model: Codex; lane R; priority 1 of the owner-authorised Drive work
- Reviewer/model: Claude

## Finding (Claude, 5 Nov)
In the fresh-start mode (#79), the ordinary Google mirror is **suppressed** by design (it would overwrite the frozen Google archive). So after the 6 Nov fresh start, **no D1 record is written to Google Drive at all**. Recovery then relies on D1 itself (Cloudflare D1 Time Travel, point-in-time restore within its retention window) and the R2 objects, plus the "Switch back to Google" re-entry report. In the imported mode the mirror queues each saved revision for a Google backup in the background (Worker cron), outside the user's request.

## Requirement
1. A scheduled backup (Worker cron, outside any user request) writes D1 Roster records to `01 Live Data/Roster/Backups/` under the GSiS home base (owner manages its permissions), never into the frozen archive files. Daily full snapshot (for example 02:15 SGT, after LORD's 02:03 sync) plus optional hourly increments by revision. Compressed JSON, with a SHA-256 digest.
2. Ledger: D1 table `gsis_backup_ledger` (one row per run: started/finished, kind full/increment, revision from/to, record count, bytes raw/compressed, Drive file id, digest, duration, status, error). Retained, never pruned.
3. Owner control in System Config (Admin): on/off, schedule, full vs increment, retention on Drive (default keep all), size alert threshold.
4. System Health: last backup time, age, size, status; alert SMC/Admin if older than 26 hours or failed twice. Admin page lists the ledger, filterable, CSV export.
5. Restore drill: an Admin "verify backup" reads the latest file back, checks the digest and record counts against D1, writes the result to the ledger.
6. No effect on the UI: no write in the user's request path; Apps Script work bounded and lock-free against Roster (Google is archive-only in fresh mode); skip when the previous run is still running.
7. Tests: backup runs and ledger rows; digest verify; failure recorded and alerted; no mirror into the frozen archive; a request during a backup stays fast.

## Owner (5 Nov): no Drive backup is acceptable for Fri 6 Nov; spec what must be saved on Google in production
Draft spec (Claude). Collections as they exist in the D1 `roster` scope today.

### Tier 1: school records (restore-grade; daily full at 02:15 + hourly increment by revision)
absences, assignments, importedRelief, reliefCorrections, requests, adhoc, staplerPlans, staplerArchives, dailyPublicationStates, publicationSnapshots, acknowledgements, entitlements, openingBalances, accountingYears, accountingProfiles, rotationEvents, smcDutyRoster, recessActivations, manualDecisions, cellDecisionVersions, manualAuditBaselines, dayRevisions, types, systemConfig, customInstructions, nameBridges, recessSettings, dailyEmploymentSettings, inboxThreads, inboxMessages; plus the `roster-register` scope (timetable register) and the timetable day models/packages held in R2.

### Tier 2: accountability evidence (daily full; needed for disputes and audits)
audit, inboxAudit, outbox (message content and status), deliveryEvents (WhatsApp delivery proof), massPublications, peerMail, optimisationRuns (allocation decisions), allocationAuditExports, dailyEmploymentMail, dailyEmploymentSnapshots, deliveryReview, quiet-mode log, job-health history.

### Tier 3: machine state (not backed up; rebuilt or transient)
receipts, scheduleReceipts, inboxReceipts, inboundEvents (raw webhooks), inboxDeliveryEvents, healthWarningState, notificationWatermarks, inboundSessions, smcAlerts, leases and cycle locks. **Never export `privateLinks` or any capability/token.**

### Operational continuity sheet (human-readable, for an outage)
A Google Sheet SMC can open if Cloudflare/D1 is down: per date from today to +5 school days: absences (teacher, periods, type without medical detail), relief assignments (period, class, absent teacher, relief teacher, status), Stapler-day flag; plus a fairness tab (quota, done, R% per teacher). Rewritten after every publish ("Let teachers see") and at 02:15. It is a view, not a restore source.

### Rules
- Destination: a new restricted Drive folder ("GSiS Roster D1 backups"), never the frozen archive files. Monthly subfolders; file names carry date, tier, revision range, digest.
- Format: gzip JSON per tier (restore-grade) with SHA-256; manifest with record counts per collection.
- Retention: keep all (owner rule: keep records). Ledger never pruned.
- Privacy: absence reasons and medical types stay in Tier 1 JSON (restricted folder) but are left out of the continuity sheet; no phone numbers beyond what records already hold.
- Restore path: an Admin "restore from backup" into an empty D1 (reuses the import/stage machinery), tested in a drill; Time Travel stays the first-line recovery.
- Ledger and alerts as in the requirement above; each run records bytes per tier.

### Open owner questions
1. Continuity sheet: wanted? (Claude recommends yes.)
2. Folder access: Admin only, or SMC read too?
3. Hourly increments, or daily full only?

## Decisions (Claude, under the owner's standing rule of 5 Nov: "i say what i want, and you spec what a proper production-class webapp should have")
- Targets: RPO 1 hour (data loss at most one hour), RTO 2 hours for a restore into D1; continuity sheet usable within minutes of an outage.
- Cadence: hourly increment by revision (Tier 1) + daily full of Tiers 1 and 2 at 02:15 SGT.
- Continuity sheet: yes.
- Access: backup folder Admin only (holds absence reasons); SMC get read access to the continuity sheet only. Folder sharing off for everyone else; ownership by the school service account/Admin, not a personal account.
- Verification: every run reads its file back and checks digest and counts (ledger row "verified"); automated weekly restore test into a scratch D1 database; a documented manual restore drill within 2 weeks of go-live, then each term.
- Alerting: System Health and SMC/Admin alert when the last verified backup is older than 2 hours (increment) or 26 hours (full), or two runs fail.
- Status: authorised for Codex when the owner says "codex work"; priority above the Google speed fix (D1 is the operational store from 6 Nov).


## Implementation claim

- Owner/model: Codex. Reviewer/model: Claude at the exact PR head; owner merges.
- Last updated (Asia/Singapore): 2026-11-05 21:20 +08.
- Branch: `codex/roster-d1-backup-ledger`.
- Base SHA: `5d2d1aca1a41371625e45f73bfe56b1969625f54` (refreshed current main, including fresh-start #79).
- Current head SHA: claim commit; implementation not started. PR: not opened.
- User-authorised scope: implement every binding backup Decision, scheduled Drive writer, shared retained ledger, continuity Sheet, restore verification/drill, System Config and System Health. Then take the separately claimed daily-output task on this shared infrastructure.
- Files/domains owned: lane R canonical `shared/edge-*.js`, new `shared/roster-backup*.js`, `backend/Roster*.gs`, `roster-update/public/`, notification timer/queue integration, schema/migrations, tests/runbook, and their canonical generated backend/Worker copies. Build wiring only where needed for the new sources; no release version or deployment change.
- Out of scope: live D1/Drive/Google/R2 writes, authority/freeze changes, deployment, notification sends, merges, other products and frozen Google archive files.
- Acceptance: hourly Tier 1 increments; daily Tier 1/2 full at 02:15 SGT; no Tier 3/capabilities; gzip SHA-256/count readback; retained ledger; safe home-base destination; age/failure alerts; Admin filters/CSV/restore; private continuity view; scratch restore drill; overlapping runs skip; no Drive work on requests; canonical build and complete Node/LORD CI.
- Coordination: refreshed open PRs and main claims. Earlier Codex work remains held or already merged; this owner's explicit priority assigns this bounded work next. No takeover of another implementer. Daily outputs are a separate follow-on branch/PR, sharing this ledger.
- Verification: none for implementation yet. No deployment or live action.
- Next action: inspect storage/bridge/timer contracts, record the implementation plan here, add failing focused regressions, then implement and run the full suite.
