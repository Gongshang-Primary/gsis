# v1 Core central Google Drive backup Package 3 (`CENTRAL_GOOGLE_BACKUP_PLAN.md`)

- Task ID: `v1-core-central-drive-backup-package-3`
- Model: `Antigravity`
- Branch: `antigravity/v1-core-central-drive-backup-package-3`
- Status: **Ready for Muse review**
- Coordinator / Merger: `GPT` (ChatGPT)
- Reviewer: `Muse` at the exact head
- Base: `6461f4e2a78eb11ff9b6b254f775d68e12e48d52` (`v1.09` + follow-up changelogs)

## Files Claimed
- `docs/coordination/tasks/v1-core-central-drive-backup-package-3.md`
- `v1/runtime/drive-backup-data.mjs`
- `v1/runtime/worker.mjs`
- `v1/services/core/drive-backup-orchestrator.mjs`
- `v1/web/shared/admin.js`
- `tests/v1-product-core-central-drive-package3.mjs`

## Scope
1. **Core Safe Readable Dataset (`v1/runtime/drive-backup-data.mjs`, `v1/services/core/drive-backup-orchestrator.mjs`)**:
   - Add `owner === "core"` dataset `access-and-backup-manifest` exporting safe non-secret Core sheets (`Accounts`, `Grants`, `ServiceGrants`, `BackupDatasets`) while strictly excluding `core_sessions`, `core_google_connections`, `core_google_flows`, tokens, secrets, and PKCE verifiers.
   - Support local `owner === "core"` discovery, export, and R2 artifact reads in `drive-backup-orchestrator.mjs` without requiring an `env.CORE` self-binding.
2. **Single-Writer Cutover Guard (`v1/runtime/worker.mjs`)**:
   - In `scheduled()`, skip legacy per-service `runDriveBackups` when `CENTRAL_DRIVE_BACKUP_ENABLED === "true"` so Core's central orchestrator is the sole Drive backup writer (zero dual-writing).
   - Expose latest verified `drive_backup_files` metadata (`adoptedFileId`, `adoptedFolderId`, `adoptedDay`, `adoptedSourceDigest`, `adoptedSha256`, `adoptedBytes`, `adoptedVerifiedAt`) from `/internal/backup-datasets`.
3. **Owner Dataset Discovery & Existing `fileId` Adoption (`v1/services/core/drive-backup-orchestrator.mjs`)**:
   - Add `POST /admin/backups/discover` in `handleCentralBackups` (Global Admin only) to discover owner datasets across configured services, register them into `core_backup_datasets`, and adopt existing verified Drive `fileId`s into `core_backup_jobs` (`INSERT OR IGNORE`) without creating duplicate Drive files or overwriting newer central rows.
4. **Admin Health UI (`v1/web/shared/admin.js`)**:
   - Render the Central Google Drive Backup health card (`#centralDriveBackupHealth`) in `/admin/#health` from `GET /api/core/admin/backups/health` with dataset status table and manual `Run backup cycle now` button (`POST /api/core/admin/backups/run-cycle`).
5. **Regression Test (`tests/v1-product-core-central-drive-package3.mjs`)**:
   - Verifies Core safe dataset export excludes secrets/tokens/sessions/OAuth flows, single-writer cutover guard yields per-service cron when `CENTRAL_DRIVE_BACKUP_ENABLED=true`, dataset discovery & `fileId` adoption work end-to-end, Core dataset uploads cleanly to synthetic Drive, and `/admin/#health` renders and operates `#centralDriveBackupHealth` in Chromium.

## Verification (`TZ=Asia/Singapore`)
- `TZ=Asia/Singapore GSIS_BROWSER_EXECUTABLE=/usr/bin/chromium node tests/v1-product-core-central-drive-package3.mjs` — PASS
- `TZ=Asia/Singapore node tests/v1-product-core-drive-orchestrator.mjs` — PASS
- `TZ=Asia/Singapore npm run build && git diff --exit-code -- roster-update/ public/ shared/` — PASS (zero v0.9 drift)
- `TZ=Asia/Singapore node scripts/v1/build.mjs && TZ=Asia/Singapore node scripts/v1/verify-build.mjs` — PASS
- `git diff --check` — PASS
- Safety: `DRIVE_BACKUP_ENABLED` and `CENTRAL_DRIVE_BACKUP_ENABLED` remain disabled by default; no live Google/Drive/Cloudflare resources touched.
