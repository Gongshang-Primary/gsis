# Review: PR #256 — Core central Google Drive backup Package 3 (safe Core dataset, cutover guard, discovery/adoption, Admin UI)

- Reviewer: Muse, replacing Claude until Claude returns, per the owner's 16 November directive (source 12b06eb).
- Verdict: **APPROVED at the exact head** `38931cf`.
- Branch: `antigravity/v1-core-central-drive-backup-package-3`. Base: main `6461f4e`. PR status: open, MERGEABLE. GPT to merge.
- No deployment authorised.

## What it does

Implements `CENTRAL_GOOGLE_BACKUP_PLAN.md` Package 3:

1. **Core safe readable dataset**: new `owner === "core"` dataset `access-and-backup-manifest` (`v1/runtime/drive-backup-data.mjs`, `v1/services/core/drive-backup-orchestrator.mjs`) exporting only safe non-secret sheets — `Accounts`, `Grants`, `ServiceGrants`, `BackupDatasets` — with explicit column allowlists. It strictly excludes `core_sessions`, `core_google_connections`, `core_google_flows`, tokens, secrets, and PKCE verifiers; the generic backup path has no `core` table entry, so the Core dataset can only come from this explicit branch. Local `owner === "core"` discovery, export, and R2 artifact reads work without an `env.CORE` self-binding.
2. **Single-writer cutover guard** (`v1/runtime/worker.mjs`): `scheduled()` skips legacy per-service `runDriveBackups` when `CENTRAL_DRIVE_BACKUP_ENABLED === "true"`, so the central orchestrator is the sole Drive backup writer (zero dual-writing). `/internal/backup-datasets` now also exposes the latest verified `drive_backup_files` adoption metadata per dataset (`adoptedFileId`, `adoptedFolderId`, `adoptedDay`, `adoptedSourceDigest`, `adoptedSha256`, `adoptedBytes`, `adoptedVerifiedAt`).
3. **Owner dataset discovery & `fileId` adoption** (`v1/services/core/drive-backup-orchestrator.mjs`): `POST /admin/backups/discover` (Global Admin only — the handler requires `admin` capability and denies impersonation) discovers owner datasets, registers them in `core_backup_datasets` (upsert preserves existing verified digests via `COALESCE`, never overwriting them), and adopts existing verified Drive `file_id`s into `core_backup_jobs` (`INSERT OR IGNORE`, state `verified`) without creating duplicate Drive files.
4. **Admin Health UI** (`v1/web/shared/admin.js`): renders `#centralDriveBackupHealth` on `/admin/#health` from `GET /api/core/admin/backups/health` with a dataset status table and a manual `Run backup cycle now` action (`POST /api/core/admin/backups/run-cycle`).

## Scope, merge, secrets

- Diff vs the PR base: exactly 6 files, matching the task record's exact-file allowlist (task record, `v1/runtime/drive-backup-data.mjs`, `v1/runtime/worker.mjs`, `v1/services/core/drive-backup-orchestrator.mjs`, `v1/web/shared/admin.js`, new test). 782 insertions, 14 deletions.
- `git merge-tree --write-tree --name-only origin/main 38931cf` clean (tree 6653b878), re-checked against current main.
- `git diff --check`: clean. Secrets scan of the diff: clean — the only matches are the task record's exclusion list naming what is never exported.
- `npm run build` produces zero drift in `roster-update/`, `public/`, `shared/` (verified locally with `git diff --exit-code`).
- Safety: `DRIVE_BACKUP_ENABLED` and `CENTRAL_DRIVE_BACKUP_ENABLED` remain disabled by default; no live Google/Drive/Cloudflare resources touched. The cutover mutual-exclusion proof is operational at activation, not coded (same note as #241).

## CI at the exact head

- Isolated v1 product run 44862630178: **success at head 38931cf**.
- Node/LORD ("Verify GSiS queue changes"): **no run exists for this head**. The workflow `verify-queue.yml` triggers only on push to `codex/**`, `muse/**`, `claude/**` branches, so `antigravity/**` branches never trigger it. The owner waived this notation difference on 20 Nov 2026 ("review all done by antigravity, ignore difference in notation, i will orchestrate") and, on 21 Nov, directed review of these six PRs after the gap was restated to him. This approval rests on the green product CI at the exact head plus the full local verification below, and the waiver is recorded here rather than hidden.

## Local checks at the exact head

Worktree `wt256-review` at 38931cf, `npm ci` in root and in `v1/`, `TZ=Asia/Singapore`, Playwright Chromium (`XDG_CONFIG_HOME=/tmp/gsis-pr256-xdg`, `WRANGLER_SEND_METRICS=false`):

- `tests/v1-product-core-central-drive-package3.mjs`: exit 0, PASS — safe Core dataset, single-writer cutover guard, owner discovery + `fileId` adoption, `/admin/#health` UI.
- `tests/v1-product-core-drive-orchestrator.mjs`: exit 0, PASS.
- `npm run build`: exit 0, zero v0.9 drift. `node scripts/v1/build.mjs` and `node scripts/v1/verify-build.mjs`: exit 0.

## Findings

None.

## Quality gates

- Q01–Q06 pass at the exact head (bounded scope, explicit secret exclusion with fail-closed dataset routing, exact-head product CI green, local checks green). Q07 is this review. Q08 is not applicable — no deployment authorised.
- Hosted/runtime UAT: **Not tested**.
