# Muse review — PR #219: retain final Core denial evidence without issuing authority

- Reviewer: Muse, replacing Claude until Claude returns, per the owner's 16 Nov directive (source 12b06eb).
- PR: #219, branch `codex/v1-core-denial-evidence`, OPEN, MERGEABLE.
- Exact head reviewed: `74e5559ed035ceadb29f1d83c87ed2368fbec7e8`.
- Base (merge-base of the head against origin/main at review time): `360853c32ce5f0a07b5e385fea3647fea5c63b6e` (the accepted claim).
- Verdict: **APPROVED at the exact head.**

## What it fixes

Core's final Deploy authority resolver could reject a request without retaining the denial or its actual Contacts observation. This change appends a minimal sealed denial to existing Core audit storage and lets a current global Admin recover the original denial and the exact historical Contacts reference. Denials never enter the principal store or authorize a commit. Audit failure preserves the original 403/409/503 response.

## Scope verified

- Diff is exactly the five paths in the task record `docs/coordination/tasks/v1-core-denial-evidence.md`: the task record, `docs/v1/core/F5_RECOVERY_VERIFICATION.md`, `tests/v1-product-core-denial-evidence.mjs`, `v1/services/core/evidence.mjs`, `v1/services/core/service.mjs`. 1013 insertions, 4 deletions.
- `git merge-tree --write-tree --name-only origin/main 74e5559` is clean (no conflicts).
- `git diff --check` clean. Secrets scan of the diff clean.
- No schema, grants, gateway, provider, CI, configuration or Contacts writer change. No deployment. No live data change.

## Design read

- `v1/services/core/service.mjs` (`authorizeCore`): after a final decision with outcome !== "allow", `recordFinalDenial` is called with the decision, descriptor, actor, subject, sessionId and authority. If the capture is not persisted, only a `console.warn` is emitted — the original denial response is untouched. The `fail()` that follows still returns the original 403/409/503.
- `v1/services/core/evidence.mjs` (`recordFinalDenial`): validates the decision strictly (schemaVersion 1, outcome deny/unavailable only, exact key allowlist, school match, action match, `descriptor.service === "deploy"`). The Contacts observation is captured only when `authority.kind === "current"` and `authority.observation.evaluationId === decisionId`; otherwise the evidence records kind `not-captured` with reason `FINAL_VALIDATED_OBSERVATION_UNAVAILABLE` — an absent final validated observation is explicit, never replaced by a preliminary read. The audit write is bounded best-effort (32 KiB, one-second sink via `createSecurityAudit`): `INSERT OR IGNORE` into the append-only `product_audit` table, then the retained row is re-read and validated (integrity digest, identity match) before the capture is reported persisted. Any failure returns `{ persisted: false, status: "unconfirmed" }` and never changes the denial.
- `validateDenialRow`: scope checks (school, event/decision IDs, action `core.authority-denial`), integrity digest, decision/outcome/retryable consistency (503 → unavailable; 409/503 retryable), event/binding/decision cross-consistency, actor/session binding, and re-projection of the stored event — no unapproved field may ride the audit envelope.
- `recoverDeniedDecision` (reached from `recoverDecisionEvidence` when no `core_evidence` row exists): validates the row, then for an observed Contacts reference re-reads the historical snapshot through the Contacts reader and checks the content digest, per-field revisions (smc/eo/schoolLeader) and observation time ordering (requestedAt ≤ asOf ≤ receivedAt ≤ effectiveAt ≤ recordedAt). The verification explicitly states `currentAuthority: false` and `operationCommitted: false`. The recovery route (`/admin/evidence` and `/evidence/<id>`) maps to action `core.admin`, so recovery inherits the existing admin gate.
- Decision time and read-observation time stay distinct. Capture is bounded best-effort; a timeout means unconfirmed completion.

## CI verified at the exact head

- Node/LORD run 44410790164: head_sha verified `74e5559`, completed success, all five jobs green.
- Isolated product run 44411121050: head_sha verified `74e5559`, completed success.
- PR-triggered product run 44413886522: head_sha verified `74e5559`, completed success.

## Local checks run (TZ=Asia/Singapore, Playwright chromium-1234)

Worktree at the exact head; `npm ci` at root and inside `v1/` first.

- `node tests/v1-product-core-denial-evidence.mjs` — PASS (six actual local Worker/D1 groups: final 403, final provider 503, revision-race 409, non-replay, Admin/school isolation, exact observation/history, immutable-event conflict/tamper, storage failure, timeout with late completion, Worker restart).
- `node tests/v1-product-core-contacts.mjs` — PASS (unchanged Core/Contacts regression).
- `node tests/v1-product-evidence-recovery.mjs` — PASS (unchanged, existing evidence recovery 8/8).
- `node tests/v1-core-authority.mjs` — PASS (unchanged, T1A authority 7/7).
- `node tests/v1-core-isolation.mjs` — PASS (unchanged, isolation 4/4).
- `npm run build` — PASS, no tracked drift.
- `node scripts/v1/build.mjs` — PASS.
- `node scripts/v1/verify-build.mjs` — PASS.

Note: two test names I first tried (`v1-product-core`, `v1-product-contacts`) do not exist and failed with `MODULE_NOT_FOUND` before running anything; the correct regression programs above were run instead.

## Findings

None. No findings.

## Notes

- N1 (negative control, builder-stated): meaningful unchanged-source red before the fix. The passing state is re-verified locally above.
- N2 (limits, as stated): **F5 remains OPEN.** This captures actual final T1A non-allow decisions only; preliminary identity/session/activity/missing-record/capability failures remain outside this slice. No current authority, destination commit, hosted recovery or retention closure is claimed. Official T1B-01/T1B-02 and unperformed runtime UAT remain Not tested. No merge or deployment by this review.

## Quality gates

- Q01: Pass. Coordinator-authorised bounded Core evidence slice; exact scope in the task record.
- Q02: Pass. Existing Core audit storage and Contacts historical read reused; no new data source or access path.
- Q03: Pass. Admin-only recovery (existing `core.admin` gate), school isolation and strict decision-shape validation exercised.
- Q04: Pass. Storage failure, timeout with late completion, restart, tamper and revision-race behaviour exercised; audit failure preserves the original denial.
- Q05: Pass. Bounded Core service only; no new workflow.
- Q06: Pass. Local verification above; exact-head Node/LORD CI green and product CI green (two runs).
- Q07: Pass. This exact-head review.
- Q08: No deployment authorised by this task and none performed.

## Release notes

No release label change. No deployment. Rollback reverts this code and retains historical audit rows.
