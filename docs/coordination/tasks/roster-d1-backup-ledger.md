# roster-d1-backup-ledger: D1 backup to Google Drive with an auditable ledger

- Status: implemented; local validation passed; awaiting exact-head Claude review; Model: Codex; lane R; priority 1 of the owner-authorised Drive work
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
- Last updated (Asia/Singapore): 2026-11-05 22:22 +08.
- Branch: `codex/roster-d1-backup-ledger`.
- Base SHA: `5d2d1aca1a41371625e45f73bfe56b1969625f54` (refreshed current main, including fresh-start #79).
- Implementation base: accepted claim `75fb5d4c642c920a01c63d6d56b6e2af68dada2f`. Exact implementation SHA will be recorded after the implementation commit; PR head is recorded in the PR handoff.
- User-authorised scope: implement every binding backup Decision, scheduled Drive writer, shared retained ledger, continuity Sheet, restore verification/drill, System Config and System Health. Then take the separately claimed daily-output task on this shared infrastructure.
- Files/domains owned: lane R canonical `shared/edge-*.js`, new `shared/roster-backup*.js`, `backend/Roster*.gs`, `roster-update/public/`, notification timer/queue integration, schema/migrations, tests/runbook, and their canonical generated backend/Worker copies. Build wiring only where needed for the new sources; no release version or deployment change.
- Out of scope: live D1/Drive/Google/R2 writes, authority/freeze changes, deployment, notification sends, merges, other products and frozen Google archive files.
- Acceptance: hourly Tier 1 increments; daily Tier 1/2 full at 02:15 SGT; no Tier 3/capabilities; gzip SHA-256/count readback; retained ledger; safe home-base destination; age/failure alerts; Admin filters/CSV/restore; private continuity view; scratch restore drill; overlapping runs skip; no Drive work on requests; canonical build and complete Node/LORD CI.
- Coordination: refreshed open PRs and main claims. Earlier Codex work remains held or already merged; this owner's explicit priority assigns this bounded work next. No takeover of another implementer. Daily outputs are a separate follow-on branch/PR, sharing this ledger.
- Verification: canonical build, 1,005 Node scripts in four isolated CI shards and 40 LORD programs passed. Final access/privacy deltas also passed the focused checks. No deployment or live action.
- Next action: publish the draft PR for Claude at the exact head, then claim the owner-authorised daily outputs follow-on using this shared ledger.

## Implementation plan (Codex)

The Worker owns scheduling, snapshots, verification and the retained ledger. A signed Apps Script service writes only dedicated output files, before the legacy archive writer fence, without taking a Roster lock. Ordinary mirroring remains unchanged. SQLite captures immutable rows and deletion tombstones; retries cannot change an already named backup. The daily-output task consumes this writer and ledger.

1. Add `edge-roster-backup.js`: tier allowlists, recursive secret removal, immutable SQL capture, revision increments with tombstones, gzip manifests, readback verification and retained outcomes. Regress with `tests/roster-drive-backup.mjs`, including blocked Drive versus concurrent request reads.
2. Add `backend/RosterDriveOutputs.gs`: signed service dispatch, exact home-base ancestry and output-folder guards, immutable backup writes/readback and a separately located continuity Sheet. Regress with an offline Apps Script Drive host; reject frozen file IDs, wrong parents, digest/count mismatches and unsigned calls.
3. Connect only Worker timer/queue entrypoints; add Admin System Config, ledger/filter/CSV/queued actions and System Health age/failure alerts. Reuse current authority and SMC alert paths. Test default-off, fresh-start, skip-busy, age thresholds and Admin access.
4. Add verified manifest-chain restore into an empty target, using the existing import manifest, stage and finalize guards. A weekly isolated scratch target tests the same path; restore never activates authority or sends old outbox items. Record the manual drill and operational setup. Test tampering, missing/deleted records, missing objects, nonempty/production target refusal and restored scope digests.
5. Canonical build, focused checks, complete Node/LORD CI, fresh whole-branch advisory review and exact-head Claude handoff. No deploy or live writes.

Interface review: capture returns a fenced run; payloads carry per-scope revisions and collection counts; the Google writer returns verified file identity, digest and counts; restore consumes that exact manifest. Rulings: fixed cadence and keep-all retention follow the binding Decisions. The 32 MiB raw / 8 MiB compressed bound is enforced per tier with a visible failure, never a truncated success. Current ordinary mirror bounds and frozen archive pointers remain untouched.

Baseline: canonical `TZ=Asia/Singapore npm run build` passed, all 18 production components. First new regression run correctly failed for the missing backup module after correcting a fixture syntax error. Implementation checks completed below.


## Implementation handoff (Model: Codex)

Implemented the scheduled backup, retained ledger, verified home-base writer, continuity Sheet, Admin queue/filter/CSV, health alerts, empty-target restore and weekly scratch drill. The ordinary mirror and frozen archive pointers remain unchanged. Fresh-start metadata is preserved. No deployment, authority change, live records, Drive files or messages were used in testing.

Validation: canonical `TZ=Asia/Singapore npm run build` passed all 18 components; the current Node inventory passed 1,005/1,005 across four isolated shards; LORD passed 40/40. Eight new focused scripts cover the backup writer, snapshot, privacy, Admin access, ledger browser, jobs, restore and recovery limits. The final register-receipt exclusion and authenticated/current-authority route fixes were rerun with the focused checks and generated-bundle parity.

Advisory review findings were fixed: transient defaults and schema markers on restore; queued-message quarantine; evidence retry after interrupted finalize; large evidence in verified R2; bounded import staging; cumulative chain size and stale object references; retained quiet-window alerts and failed-request retry; and the service-only fence check for restored activation. Claude's separate exact-head review is still pending.

Operational limits are explicit failures, never successful truncation: per-tier 32 MiB raw / 8 MiB gzip; restore import 40 MiB / 2,048 parts; chain 128 MiB with early full rollover. A 19 MiB, 201-part restore completes over several invocations with fewer than 500 D1 calls per invocation. Large evidence uses R2 references. Setup, bindings, permissions and the required manual drill are in `docs/ROSTER_DRIVE_BACKUP_RUNBOOK.md`. Production RPO/RTO and provider limits require the documented live drill after the owner deploys; local fixtures do not establish production timing.

Follow-on coordination: the owner explicitly ordered `roster-daily-drive-outputs` next. It receives its own claim and stacked PR, reusing `gsis_backup_ledger` and the dedicated writer. This implementation is frozen for Claude review while that follow-on runs serially.
