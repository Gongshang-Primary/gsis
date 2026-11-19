# Task Claim: v1 Core Central Drive Backup Orchestrator

- Task ID: `v1-core-central-drive-backup-orchestrator`
- Model: `Antigravity`
- Branch: `antigravity/v1-core-central-drive-backup-orchestrator`
- Reviewer: `Muse` (exact-head review)
- Coordinator / Merger: `GPT`
- Scope: Package 2 of `docs/v1/core/CENTRAL_GOOGLE_BACKUP_PLAN.md` — Core central direct-Drive-API backup orchestrator, bounded owner export/stream internal interface, explicit durable job state machine (`queued → exporting → prepared → writing → verifying → verified` + `retryable | unknown | conflict | missing | blocked`), persisted single `file_id` before upload with restart/timeout reconciliation, fair owner round-robin cursor, 23:50 SGT daily freshness check, and Global Admin Toolbox System Health & bounded trigger endpoints (`/admin/backups/health`, `/admin/backups/datasets`, `/admin/backups/run-cycle`).

## Files Claimed
- `docs/coordination/tasks/v1-core-central-drive-backup-orchestrator.md`
- `v1/migrations/core/0006_central_drive_orchestrator.sql`
- `v1/runtime/worker.mjs`
- `v1/services/core/drive-backup-orchestrator.mjs`
- `v1/services/core/service.mjs`
- `tests/v1-product-core-drive-orchestrator.mjs`

## Constraints
- Default disabled unless `DRIVE_BACKUP_ENABLED === "true"`.
- Zero v0.9 changes; no live credentials, OAuth consent, or live Drive writes.
- No automatic Drive deletion; no modification to operational save paths.
- Keep `0006_central_drive_orchestrator.sql` self-contained so `tests/v1-product-drive-connection.mjs` migration upgrade test remains untouched.
