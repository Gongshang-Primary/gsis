# v1 Core decision evidence and admission retention (`F5` Stage 4)

- Task ID: `v1-core-decision-evidence-retention`
- Model: `Antigravity`
- Branch: `antigravity/v1-core-decision-evidence-retention`
- Status: **Claimed for implementation**
- Coordinator / Merger: `GPT` (ChatGPT)
- Reviewer: `Muse` at the exact head
- Base: `6461f4e2a78eb11ff9b6b254f775d68e12e48d52` (`v1.09` + follow-up changelogs)

## Files Claimed
- `docs/coordination/tasks/v1-core-decision-evidence-retention.md`
- `v1/services/core/service.mjs`
- `tests/v1-product-core-evidence-retention.mjs`

## Scope
1. **Bounded, Auditable Core Retention Endpoint (`v1/services/core/service.mjs`)**:
   - Add Global Admin `POST /admin/evidence/retention` supporting `dryRun` (default `true`), `retentionDays` (minimum `30`, default `90`), and `limit` (bounded `1..500`, default `500`) with `operationId` idempotency.
   - Guard destructive deletion (`dryRun: false`) behind explicit `env.RETENTION_DELETE_ENABLED === "true"` (refusing with `409 RETENTION_DISABLED` when disabled, keeping default `"false"` untouched).
   - Delete only expired/terminal rows older than `cutoff = now - retentionDays * 86400000`:
     - `core_evidence` rows with `valid_until < cutoff` that have no active/prepared `product_admissions` referencing `decision_id`.
     - Terminal `product_admissions` rows (`state IN ('committed','aborted') AND updated_at < cutoff`), never touching `state = 'prepared'` / unrecovered admissions.
   - Record a durable audit entry and operation receipt for each retention run.
2. **Regression Test (`tests/v1-product-core-evidence-retention.mjs`)**:
   - Verify `dryRun: true` reports eligible counts without deleting any rows.
   - Verify `dryRun: false` returns `409 RETENTION_DISABLED` when `RETENTION_DELETE_ENABLED` is `"false"` (default).
   - Verify `dryRun: false` with `RETENTION_DELETE_ENABLED: "true"` deletes only expired/terminal rows older than `retentionDays`, strictly preserving unexpired evidence, recent terminal rows, and prepared/unrecovered admissions (and any evidence referenced by a prepared admission).
   - Verify `operationId` idempotency replay and `403` denial for non-admin callers.
