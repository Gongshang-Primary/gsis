# Review: PR #237 — Port Roster backup-ledger and read-only archive routes (F09, F10)

- Reviewer: Muse, replacing Claude until Claude returns, per the owner's 16 November directive (source 12b06eb).
- Verdict: **APPROVED at the exact head** `a6db0300`.
- Branch: `antigravity/v1-roster-backup-ledger-and-archive`. Base: main `7ee24189`. PR status: open, MERGEABLE. GPT to merge.
- No deployment authorised.

## What it does

Ports the remaining Roster backup-ledger and archive routes, clearing all six F09/F10 probe allowances:

- New `v1/services/roster/backup-ledger.mjs` (342 lines): `POST /backup-ledger` (`roster.admin`).
  - `read`: paginated, filtered ledger rows over `roster_exports`, `roster_drive_exports`, and `backupLedgerEntries`, with a status summary, backup-config flag, and verification-request history. Internal `_artifactKey`/`_source` fields are stripped from public rows.
  - `verify`: validates `manifestFileId` (safe charset, no `..`), finds the entry, and verifies by private-R2 artifact readback with SHA-256 digest comparison (accepting the store's canonical digest or raw SHA-256 hex); a school-scope mismatch, missing artifact, or digest mismatch is reported, not hidden. The verification request is recorded durably via `prepared`/`commit` (idempotent by operationId).
  - `restore`: hard 409 `RESTORE_ISOLATED_ONLY` — live HTTP restore into an active production database is disabled per `OPERATIONS.md`; operators use the isolated empty-target `restoreOwner` procedure. No restore path exists in this PR.
- New `v1/services/roster/archive.mjs` (397 lines):
  - `POST /edge/archive`: read-only projections — `history` and `calculations` scoped to the caller's own staffId (`roster.own`), `statistics` requires `roster.read` (366-day range cap), `openingBalances` requires `roster.admin`. Every view returns `archive: { readOnly: true, throughDate, id }`.
  - `POST /operations` with `archiveColdOutput` (`roster.admin`): captures an immutable cold-output snapshot/manifest into private R2 (`cold-archive`) with SHA-256 readback verification (503 on failure), retains all authoritative D1/R2 records (`deletionEnabled: false`; nothing is deleted anywhere), and records a durable `coldArchive` index.
- `v1/services/roster/service.mjs`: `/backup-ledger` maps to `roster.admin` (write only for verify/restore), `/edge/archive` maps by view, `archiveColdOutput` is an admin write.
- The operation-probe allowlist loses exactly the six F09/F10 entries.

## Scope, merge, secrets

- Diff vs origin/main: exactly 6 files, matching the task record's exact-file allowlist. 1076 insertions, 48 deletions.
- `git merge-tree --write-tree --name-only origin/main a6db030` clean (tree 2b1ac1b2), re-checked against current main.
- `git diff --check`: clean. Secrets scan of the diff: clean.
- No SQL migrations, no v0.9 source edits.
- Allowance arithmetic verified across this batch: #230 cleared 7, #231 cleared 2, #232 cleared 1, #234 cleared 1, #235 cleared 5, #236 cleared 2, #237 clears 6 — 24 in total, matching the task record's "24/24 probe allowances cleared across PRs 1–7" once all seven merge.

## CI at the exact head

- Isolated v1 product run 44621786925: **success at head a6db030**.
- Node/LORD ("Verify GSiS queue changes"): **no run exists for this head**. The workflow `verify-queue.yml` triggers only on push to `codex/**`, `muse/**`, `claude/**` branches, so `antigravity/**` branches never trigger it. The owner waived this notation difference on 20 Nov 2026 ("review all done by antigravity, ignore difference in notation, i will orchestrate") and will orchestrate the workflow fix/merges. This approval rests on the green product CI at the exact head plus the full local verification below, and the waiver is recorded here rather than hidden.

## Local checks at the exact head

Worktree `wt237-review` at a6db030, `npm ci` in root and in `v1/`, `TZ=Asia/Singapore`, Playwright Chromium:

- `tests/v1-product-roster-backup-archive.mjs`: exit 0, PASS — `/backup-ledger` (read/verify/restore-refusal), `/edge/archive` views, `archiveColdOutput`.
- `tests/v1-product-operation-probe.mjs`: exit 0 — 407 probes, `knownMissing` 18 (was 24 on this base; six allowances cleared).
- `tests/v1-product-roster-service.mjs`: exit 0, PASS — existing Roster service regressions intact.
- `npm run build`: exit 0, no diff. `node scripts/v1/build.mjs` and `node scripts/v1/verify-build.mjs`: exit 0.

## Findings

None.

## Quality gates

- Q01–Q06 pass at the exact head (bounded scope, no live restore path, exact-head product CI green, local checks green). Q07 is this review. Q08 is not applicable — no deployment authorised.
- Hosted/runtime UAT: **Not tested**.
