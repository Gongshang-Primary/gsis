# PR #127 review (Claude): roster-d1-full-backup-fix

- Head reviewed: 94d9267380 (codex/roster-d1-full-backup-fix). Reviewer: Claude (owner exception 12 Nov).
- Verdict: **changes requested (one item)**. Everything else is approved as is.

## Evidence
- CI at the head: full-suite success (check run 131298434067); regression shards 1-4 success.
- Local, TZ=Asia/Singapore, at the head: PASS roster-drive-backup-cache-loss, roster-drive-backup-progress, roster-drive-output-errors, roster-daily-edge, roster-drive-output-health-ui, roster-drive-backup, roster-drive-jobs, roster-drive-restore (8/8).
- `npm run build` at the head: no diff. Mergeable: clean.
- Live D1 (read-only, 12 Nov): `gsis_backup_items` holds 12 503 rows, 19.1 MB, from 1 run. Roster records total 13 320 rows, 18.6 MB.

## Findings
1. **Blocking: captured rows are no longer removed.** The PR deletes both `DELETE FROM gsis_backup_items` statements (after finish, and for lease-expired runs) and says "Retain captured rows ... this repair does not prune data."
   - These rows are a transient working copy of live Roster, not records. The record is the verified Drive file plus the ledger row (digest, file id, manifest). "Keep all ledger rows (no pruning)" in the task meant the ledger, not this copy.
   - Cost: each full copies about 19 MB into D1 (live measure). One full a day is about 7 GB a year against D1's 10 GB database limit. Under a persistent fault with the new hourly backoff, it is about 19 MB per failed hour, up to 450 MB a day. It also keeps a second copy of staff data in D1 indefinitely.
   - Required: restore removal of a run's captured rows once the run ends: after `verified` (the Drive file holds them), and after `failed`/`BACKUP_LEASE_EXPIRED` (nothing depends on them). Keep the ledger and manifest as they are. If retention for diagnosis is wanted, keep at most the last failed run's rows and say so. Add a test that captured rows are gone after verified and after expiry.
2. Non-blocking, accepted: the cache fix omits a whole derived cache entry when any part is missing or invalid, and records it in `missingCacheParts`. Non-cache digest failures stay fatal. The root cause (cleanup protects only live heads; a captured retired head loses its part) is reproduced with the real cleanup code. Good.
3. Non-blocking, accepted: lease renewal is tied to real progress (every 100 rows and around each bridge call), not a timer. A competing cron is fenced. The hourly backoff and job-health fields match the task. The 12-minute fixed budget is removed correctly.
4. Non-blocking: the live 16-minute stage is still unproven (Codex says so plainly). The new `progress`/`timings` in the manifest will show it after deploy. Owner check after deploy: the first full's manifest timings.
5. Alert recovery: resolves open Admin incidents, keeps blocked rows byte-for-byte, no same-day resend. Good. `system_alert` stays off; the deploy steps enable it only after one verified full and one verified restore test. Correct.

## For the owner
After finding 1 is fixed and re-verified at the new head, I will approve. No other change needed.
