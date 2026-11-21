# v1 Core central Google Drive backup Package 3 (`CENTRAL_GOOGLE_BACKUP_PLAN.md`)

- Task ID: `v1-core-central-drive-backup-package-3`
- Model: `Antigravity`
- Branch: `antigravity/v1-core-central-drive-backup-package-3`
- Status: **Claimed for implementation**
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
1. **Core Safe Readable Dataset (`v1/runtime/drive-backup-data.mjs`)**:
   - Add `owner === "core"` dataset `access-and-backup-manifest` exporting safe non-secret Core sheets (`Accounts`, `Grants`, `ServiceGrants`, `BackupDatasets`) while strictly excluding `core_sessions`, `core_google_connections`, `core_oauth_states`, tokens, secrets, and PKCE verifiers.
2. **Single-Writer Cutover Guard (`v1/runtime/worker.mjs`)**:
   - In `scheduled()`, skip legacy per-service `runDriveBackups` when `CENTRAL_DRIVE_BACKUP_ENABLED === "true"` so Core's central orchestrator is the sole Drive backup writer (zero dual-writing).
3. **Owner Dataset Discovery & Existing `fileId` Adoption (`v1/services/core/drive-backup-orchestrator.mjs`)**:
   - Add `discoverOwnerDatasets()` and `POST /admin/backups/discover` in `handleCentralBackups` so admins can discover owner datasets across configured services and adopt existing verified Drive `fileId`s without creating duplicate Drive files.
4. **Admin Health UI (`v1/web/shared/admin.js`)**:
   - Render the Central Google Drive Backup health card (`#centralDriveBackupHealth`) in `/admin/#health` from `GET /api/core/admin/backups/health` with dataset status table and manual `Run backup cycle now` button (`POST /api/core/admin/backups/run-cycle`).
5. **Regression Test (`tests/v1-product-core-central-drive-package3.mjs`)**:
   - Verify Core safe dataset export excludes secrets/tokens, single-writer cutover guard yields per-service cron when `CENTRAL_DRIVE_BACKUP_ENABLED=true`, dataset discovery & `fileId` adoption work end-to-end, and `/admin/#health` renders the central Drive backup card.
