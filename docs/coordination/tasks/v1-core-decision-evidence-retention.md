# v1 Core decision evidence and admission retention (`F5` Stage 4)

- Task ID: `v1-core-decision-evidence-retention`
- Model: `Antigravity`
- Branch: `antigravity/v1-core-decision-evidence-retention`
- Status: **Ready for Muse review**
- Coordinator / Merger: `GPT` (ChatGPT)
- Reviewer: `Muse` at the exact head
- Base: `6461f4e2a78eb11ff9b6b254f775d68e12e48d52` (`v1.09` + follow-up changelogs)

## Files Claimed
- `docs/coordination/tasks/v1-core-decision-evidence-retention.md`
- `v1/services/core/service.mjs`
- `tests/v1-product-core-evidence-retention.mjs`

## Scope
1. **Bounded, Auditable Core Retention Endpoint (`v1/services/core/service.mjs`)**:
   - Add Global Admin `POST /admin/evidence/retention` supporting `dryRun` (default `true`), `retentionDays` (minimum `30`, max `3650`, default `90`), and `limit` (bounded `1..500`, default `500`) with `prepareOperation` / `admit` / `commitOperation` / `resolveAdmission` idempotency.
   - Guard destructive deletion (`dryRun: false`) behind explicit `env.RETENTION_DELETE_ENABLED === "true"` (refusing with `409 RETENTION_DISABLED` when disabled, keeping default `"false"` untouched).
   - Reflect `env.RETENTION_DELETE_ENABLED === "true"` in `/admin/health` (`retentionDeletionEnabled`).
   - Delete only expired/terminal rows older than `cutoff = now - retentionDays * 86400000`:
     - `core_evidence` rows with `valid_until < cutoff AND created_at < cutoff` that have no active/unrecovered `product_admissions` (`state IN ('acquiring','ready','resolving')`) and no held `source_pins` (`state = 'held'`), along with their `core_destination_receipts`.
     - Terminal `product_admissions` rows (`state IN ('resolved','aborted') AND valid_until < cutoff`), never touching active/unrecovered admissions.
   - Record a durable `product_audit` entry (`kind: "evidence-retention"`) and committed operation receipt.
2. **Regression Test (`tests/v1-product-core-evidence-retention.mjs`)**:
   - Verifies `dryRun: true` reports eligible counts without deleting any rows.
   - Verifies `dryRun: false` returns `409 RETENTION_DISABLED` when `RETENTION_DELETE_ENABLED` is `"false"` (default).
   - Verifies `dryRun: false` with `RETENTION_DELETE_ENABLED: "true"` deletes only expired/terminal rows older than `retentionDays`, strictly preserving unexpired evidence, recent terminal rows, active admissions, and evidence referenced by active admissions or held source pins.
   - Verifies `operationId` idempotency replay, durable `product_audit` entry, `retentionDays < 30` validation (`400`), and `403` denial for non-admin callers.

## Verification (`TZ=Asia/Singapore`)
- `TZ=Asia/Singapore node tests/v1-product-core-evidence-retention.mjs` — PASS
- `TZ=Asia/Singapore npm run build && git diff --exit-code -- roster-update/ public/ shared/` — PASS (zero v0.9 drift)
- `TZ=Asia/Singapore node scripts/v1/build.mjs && TZ=Asia/Singapore node scripts/v1/verify-build.mjs` — PASS
- `git diff --check` — PASS
- Safety: `RETENTION_DELETE_ENABLED` remains `"false"` by default in all committed configuration; no live records touched.
