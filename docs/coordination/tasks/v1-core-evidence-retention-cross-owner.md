# Task Claim: v1 Core Evidence Retention Cross-Owner Dependency Protection & Compact Audit

- **Task ID:** `v1-core-evidence-retention-cross-owner`
- **Model:** Antigravity
- **Branch:** `antigravity/v1-core-evidence-retention-cross-owner`
- **Reviewer:** Muse (exact-head review)
- **Coordinator / Merger:** GPT
- **Reference:** `docs/v1/ANTIGRAVITY_REPAIR_HANDOFF_2026-11-21.md` (Further repair queue — Core evidence retention and F5), `docs/coordination/tasks/v1-core-evidence-retention-measurement.md`

## Scope

1. Add a shared internal read route `/internal/evidence-dependencies` in `v1/runtime/worker.mjs` that reports, for a bounded list of `decisionIds` in `env.SCHOOL_ID`, any `decision_id` still referenced by an unresolved `product_admissions` row (`state IN ('acquiring','ready','resolving')`) or a `held` `source_pins` row in that owner's D1 database.
2. Update `/admin/evidence/retention` in `v1/services/core/service.mjs`:
   - Query every destination owner (`contacts`, `deploy`, `roster`, `calendar`, `lord`, `venues`, `layout`) via `/internal/evidence-dependencies` before classifying expired `core_evidence` rows as eligible for compaction.
   - Protect any `decision_id` with an unresolved admission or held pin in ANY destination owner (`unresolved-owner-dependency`), and fail closed (protect all candidates with `owner-status-unknown`) if any destination owner cannot be reached or returns an invalid response.
   - Compute a deterministic `previewDigest` over the exact eligible evidence/admission IDs and return `{ dryRun: true, previewDigest, eligible, protected: { count, reasons }, ... }`.
   - On destructive runs (`dryRun: false`), continue enforcing `RETENTION_DELETE_ENABLED === "true"` (default `"false"` -> `409 RETENTION_DISABLED`), re-check cross-owner dependencies live, and if `previewDigest` is supplied and differs from the current preview (e.g. a newly unresolved dependency appeared), refuse with `409 PREVIEW_CHANGED` without deleting anything.
   - Retain a compact auditable summary entry in `product_audit` for each compacted batch (including compact per-decision reference metadata: `decisionId`, `actorId`, `action`, `createdAt`, `outcome`, bounded to the batch).
3. Extend `tests/v1-product-core-evidence-retention.mjs` with cross-owner protection, stale preview `409 PREVIEW_CHANGED` refusal, compact retained audit summary, and cross-Worker receipt recovery after unrelated settled evidence is compacted.

## Files Planned

- `docs/coordination/tasks/v1-core-evidence-retention-cross-owner.md`
- `v1/runtime/worker.mjs`
- `v1/services/core/service.mjs`
- `tests/v1-product-core-evidence-retention.mjs`

## Out of Scope

- v0.9 source and generated files (`roster-update/`, `public/`, `shared/`) — zero drift required.
- Enabling `RETENTION_DELETE_ENABLED` (remains `"false"` in all configs).
- Hosted F5 restore rehearsal, deployment, or live school data.

## Claude follow-up (owner-directed takeover, 21 Nov 2026 SGT)

Owner directed Claude to carry on Antigravity's PRs. Findings from `docs/coordination/review/v1-antigravity-pr263-273-claude-triage.md`, fixed here:

1. Lost-response recovery: the stale-digest check ran before the stored receipt lookup, so a retry of a committed run returned `409 PREVIEW_CHANGED`. Core now returns the original receipt first when the operation already committed.
2. A destructive run now requires the dry-run `previewDigest`. Before, omitting it skipped the stale-preview guard and deleted immediately (proved by the new test failing on the previous head).

Tests: `TZ=Asia/Singapore node tests/v1-product-core-evidence-retention.mjs` passes; new cases cover the unbound destructive refusal and replay with the original digest. Deletion stays behind `RETENTION_DELETE_ENABLED`. Muse reviews the new exact head.
