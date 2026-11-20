# Review: PR #241 — Implement Core central Google Drive backup orchestrator (Package 2)

- Reviewer: Muse, replacing Claude until Claude returns, per the owner's 16 November directive (source 12b06eb).
- Verdict: **APPROVED at the exact head** `b90ca478`.
- Branch: `antigravity/v1-core-central-drive-backup-orchestrator`. Base: main `7ee24189`. PR status: open, MERGEABLE. GPT to merge.
- No deployment authorised.

## What it does

Implements Package 2 of `docs/v1/core/CENTRAL_GOOGLE_BACKUP_PLAN.md` — the Core central Google Drive backup orchestrator, with a bounded owner export/stream interface. Claim `e253b7b4`. Zero v0.9 changes; no live credentials, OAuth, or Drive writes; no automatic Drive deletion; no modification to operational save paths.

- New migration `v1/migrations/core/0006_central_drive_orchestrator.sql`: additive, self-contained. Tables `core_backup_cursor` (lease + fair round-robin owner cursor), `core_backup_datasets` (owner, dataset, folder/drive/root IDs, `writer_epoch`), `core_backup_jobs` (UNIQUE index on `(school_id, file_id)` WHERE NOT NULL), `core_backup_assertions`. State CHECK matches the documented machine: `queued → exporting → prepared → writing → verifying → verified`, plus `retryable`/`unknown`/`conflict`/`missing`/`blocked`.
- New `v1/services/core/drive-backup-orchestrator.mjs` (1,120 lines):
  - Two-switch cutover: `centralBackupEnabled` is true only when `DRIVE_BACKUP_ENABLED === "true"` AND `CENTRAL_DRIVE_BACKUP_ENABLED === "true"`. Default disabled; the scheduled entry point returns `disabled` when off.
  - Lease fencing: 5-minute Core lease via `core_backup_cursor`, acquired with a conditional `UPDATE ... WHERE lease_until<=now`; a second cycle gets `busy`. Every cycle step re-asserts the lease (`fencedRun`: assertion INSERT with a CASE on lease validity + the write + DELETE assertion fails atomically if the lease was lost).
  - `streamOwnerArtifact` streams the owner artifact from `/internal/backup-artifact` with the `GSIS_SECRET` header, 15-second timeout, 8 MiB ceiling enforced while streaming, SHA-256 and byte-count verified.
  - Error classification: timeout/uncertain → `unknown`; `GOOGLE_HELPER_`/`GOOGLE_AUTH`/401 → `blocked`; `MISSING` → `missing`; `INTEGRITY`/`SCOPE`/`CONFLICT` → `conflict`; otherwise `retryable`. Backoff `[1m, 5m, 15m, 60m]`, at most 8 attempts.
  - `reconcileAndCompleteJob` reconciles the persisted `file_id` FIRST: exact bytes + scope verified → `verified` without re-upload; a missing historical day → `missing`, never recreated; today's missing file → falls through to upload with the SAME `file_id`; integrity mismatch → conditional replace via `putVerifiedDriveFile(replaceSha256/replaceSize)` only if the remote still holds the prior version, else `conflict`.
  - `processRegisteredDataset`: reconciles an unresolved job before new work; backoff respected; owner export failure → status `unknown`, never `unchanged`; unchanged source + verified remote → stays `current` without rewrite (daily remote re-check via the 23:50 SGT boundary); missing-historical stays `missing`; new/changed content → folder verified, existing today's `file_id` reused or a new one allocated, generation + 1, job row persisted in state `prepared` with the `file_id` BEFORE upload.
  - `runCentralBackupCycle`: Google access token (`drive.file` scope) acquired per cycle, never stored in D1; `driveEnv` forces `GOOGLE_HELPER_ENABLED` to `"false"`; `verifyDriveRoot` per distinct `(rootId, driveId)` before writes; fair persisted round-robin cursor interleaving owners, at most 2 actions per cycle.
  - `centralBackupHealth`: reports `automaticDeletion: false` and `crossOwnerAtomic: false` honestly; a `current` dataset past its daily check is reported `stale`.
  - `handleCentralBackups`: Global Admin only (`admin` capability, no impersonation). `GET /admin/backups/health`, `POST /admin/backups/datasets` (owner from the fixed allowlist, Drive IDs validated, registration idempotent by operation receipt, re-registration bumps `writer_epoch`), `POST /admin/backups/run-cycle`.
- `v1/runtime/worker.mjs` (+103): bounded owner interface — `/internal/backup-datasets` (school check), `/internal/backup-export` (school check, dataset must exist, 8 MiB ceiling, SHA-256 computed, artifact stored under school-scoped R2 key `schools/{schoolId}/central-backup/{safeDataset}/{sha256}.{ext}`), `/internal/backup-artifact` (school check, strict key pattern — school-scoped prefix, 64-hex SHA, safe extension — size ceiling, SHA-256 verification, `no-store`/`nosniff` headers).
- `v1/services/core/service.mjs` (+11): `/admin/backups` routes to the handler; `scheduled` runs the central cycle only when the two switches are on.

## Scope, merge, secrets

- Diff vs origin/main: exactly 6 files, matching the task record's exact-file allowlist. 1,630 insertions, 0 deletions.
- `git merge-tree --write-tree --name-only origin/main b90ca478` clean (tree 3f35a446), re-checked against current main.
- `git diff --check`: clean. Secrets scan of the diff: clean.
- No v0.9 source edits.

## CI at the exact head

- Isolated v1 product run 44654829334: **success at head b90ca47**.
- Node/LORD ("Verify GSiS queue changes"): **no run exists for this head**. The workflow `verify-queue.yml` triggers only on push to `codex/**`, `muse/**`, `claude/**` branches, so `antigravity/**` branches never trigger it. The owner waived this notation difference on 20 Nov 2026 ("review all done by antigravity, ignore difference in notation, i will orchestrate") and will orchestrate the workflow fix/merges. This approval rests on the green product CI at the exact head plus the full local verification below, and the waiver is recorded here rather than hidden.

## Local checks at the exact head

Worktree `wt241-review` at b90ca47, `npm ci` in root and in `v1/`, `TZ=Asia/Singapore`, Playwright Chromium:

- `tests/v1-product-core-drive-orchestrator.mjs`: exit 0, PASS — default-disabled two-switch cutover, Global Admin-only health/register/run-cycle, fair owner cursor, one file id per owner/dataset/day, unchanged same-day and months-old files not rewritten, conditional same-day replacement on the same id, lost upload response reconciled without duplicate, missing remote file reported, unconfigured authorization blocked while native saves commit. Synthetic Drive only.
- `tests/v1-product-drive-connection.mjs`: exit 0, PASS.
- `tests/v1-product-drive-backup.mjs`: exit 0, PASS.
- `tests/v1-product-drive-backup-adapters.mjs`: exit 0, PASS.
- `tests/v1-product-backup.mjs`: exit 0, PASS.
- `tests/v1-product-system.mjs`: exit 0, PASS.
- `tests/v1-product-operation-probe.mjs`: exit 0, PASS — 407 ops, knownMissing 24 (the base count on main `7ee24189`; this PR clears no probe allowances), parsedScripts 130.
- `npm run build`: exit 0, no diff. `node scripts/v1/build.mjs` and `node scripts/v1/verify-build.mjs`: exit 0.

## Findings

None.

## Notes (not findings)

- Cutover mutual exclusion is operational, not coded in this PR. The plan's cutover steps 3–4 require the operator to stop each dataset's owner scheduler, reconcile any unknown write, then adopt its IDs, and to prove no old owner job can still write the dataset ("never run two writers as a fallback"). The owner scheduler (`runDriveBackups`) does not consult `core_backup_datasets` or `writer_epoch`, and the central writer's file identity is per its own persisted `file_id`, so the two writers cannot overwrite each other's files — but both could write into the same folder if a dataset were registered centrally while its owner scheduler still ran. Activation (the second switch is off by default and enabling needs owner setup/activation authorization) must include that per-dataset cutover proof. This PR's scope is Package 2, the orchestrator itself, and it is complete within that scope.
- The PR body's own "Not Run" gates stand: live Google OAuth consent for `helper@gsps.edu.sg`, real Shared Drive ACLs, live Drive ETag conditional-write behaviour, and provider quotas are operator-only and were not tested here. A Node simulation cannot prove them; the plan says so itself.

## Quality gates

- Q01–Q06 pass at the exact head (bounded scope, verified authority and state machine, exact-head product CI green, local checks green). Q07 is this review. Q08 is not applicable — no deployment authorised.
- Hosted/runtime UAT: **Not tested**.
- F5 remains OPEN.
