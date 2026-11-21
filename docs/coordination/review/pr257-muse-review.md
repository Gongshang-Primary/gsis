# Review: PR #257 — Core bounded auditable decision evidence and admission retention (F5 Stage 4)

- Reviewer: Muse, replacing Claude until Claude returns, per the owner's 16 November directive (source 12b06eb).
- Verdict: **APPROVED at the exact head** `39f60f7`.
- Branch: `antigravity/v1-core-decision-evidence-retention`. Base: main `6461f4e`. PR status: open, MERGEABLE. GPT to merge.
- No deployment authorised.

## What it does

Adds Global Admin `POST /admin/evidence/retention` in `v1/services/core/service.mjs` (F5 Stage 4 — it does not close F5):

- **Access**: Global Admin only (requires `admin` capability; impersonation denied, 403 otherwise).
- **Inputs**: `dryRun` (default `true`), `retentionDays` (30–3650, default 90), `limit` (1–500, default 500). Out-of-range inputs fail 400.
- **Destructive guard**: `dryRun: false` requires explicit `env.RETENTION_DELETE_ENABLED === "true"`; otherwise `409 RETENTION_DISABLED`. The committed default stays `"false"`. `/admin/health` reflects the flag as `retentionDeletionEnabled`.
- **Eligibility** (cutoff = now − retentionDays): only `core_evidence` rows with `valid_until < cutoff AND created_at < cutoff` that have no active/unrecovered `product_admissions` (`state IN ('acquiring','ready','resolving')`) and no held `source_pins` (`state = 'held'`), plus their `core_destination_receipts`; and terminal `product_admissions` (`state IN ('resolved','aborted') AND valid_until < cutoff`). The admission delete re-checks the terminal states in its own `WHERE` clause. Active admissions, unexpired evidence, recent terminal rows, and evidence referenced by active admissions or held pins are preserved.
- **Auditability**: the run goes through `prepareOperation` / `admit` / `commitOperation` / `resolveAdmission`, so a repeated `operationId` replays the committed receipt instead of deleting twice, and a durable `product_audit` entry (`kind: "evidence-retention"`) records the run. `dryRun: true` returns eligible counts and deletes nothing.

## Scope, merge, secrets

- Diff vs the PR base: exactly 3 files, matching the task record's exact-file allowlist (task record, `v1/services/core/service.mjs`, new test). 378 insertions, 10 deletions.
- `git merge-tree --write-tree --name-only origin/main 39f60f7` clean (tree 512029c1), re-checked against current main.
- `git diff --check`: clean. Secrets scan of the diff: clean.
- `npm run build` produces zero drift in `roster-update/`, `public/`, `shared/` (verified locally with `git diff --exit-code`).
- Safety: `RETENTION_DELETE_ENABLED` remains `"false"` by default in all committed configuration; no live records touched.

## CI at the exact head

- Isolated v1 product run 44862988538: **success at head 39f60f7**.
- Node/LORD ("Verify GSiS queue changes"): **no run exists for this head**. The workflow `verify-queue.yml` triggers only on push to `codex/**`, `muse/**`, `claude/**` branches, so `antigravity/**` branches never trigger it. The owner waived this notation difference on 20 Nov 2026 ("review all done by antigravity, ignore difference in notation, i will orchestrate") and, on 21 Nov, directed review of these six PRs after the gap was restated to him. This approval rests on the green product CI at the exact head plus the full local verification below, and the waiver is recorded here rather than hidden.

## Local checks at the exact head

Worktree `wt257-review` at 39f60f7, `npm ci` in root and in `v1/`, `TZ=Asia/Singapore`, Playwright Chromium:

- `tests/v1-product-core-evidence-retention.mjs`: exit 0, PASS — dryRun, `RETENTION_DELETE_ENABLED` guard, bounded terminal deletion, active/held preservation, idempotency, audit.
- `tests/v1-product-evidence-recovery.mjs`: exit 0, PASS.
- `tests/v1-core-authority.mjs`: exit 0, PASS.
- `npm run build`: exit 0, zero v0.9 drift. `node scripts/v1/build.mjs` and `node scripts/v1/verify-build.mjs`: exit 0.

## Findings

None.

## Quality gates

- Q01–Q06 pass at the exact head (bounded scope, destructive path double-gated by dryRun default and the disabled-by-default flag, exact-head product CI green, local checks green). Q07 is this review. Q08 is not applicable — no deployment authorised.
- Hosted/runtime UAT: **Not tested**.
- F5 remains OPEN (this is Stage 4 of the F5 work; the PR does not claim to close F5).
