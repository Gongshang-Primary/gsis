# Review of PR #272 — Protect cross-owner dependencies and retain compact audit on Core evidence retention

- **Reviewer:** Muse, at the exact head, under the owner's 16 Nov 2026 directive (Muse is the v1 reviewer at the exact head SHA, replacing Claude until Claude returns; source commit 12b06eb). No code, merges, or coordination by Muse.
- **PR:** #272, "Model: Antigravity / Protect cross-owner dependencies and retain compact audit on Core evidence retention". Branch `antigravity/v1-core-evidence-retention-cross-owner`. Head reviewed: `5d4abc49`.
- **Status at review:** OPEN, not a draft. Product CI green at the head. MERGEABLE/CLEAN (GitHub reports mergeable UNKNOWN transiently after main moved; `git merge-tree` below is clean).
- **Verdict: APPROVED at the exact head 5d4abc49.** No findings.
- **Head note:** the head is a merge commit, "Merge origin/main (800585c8) into antigravity/v1-core-evidence-retention-cross-owner" — the PR is based on main 800585c8, and both CI and the local checks below are verified at 5d4abc49.
- **F5 note:** this PR touches Core evidence retention, the area of open finding F5, but it does not claim to close F5: the hosted F5 restore rehearsal is explicitly out of scope and untested. F5 remains OPEN.

## What it does

Repair from `docs/v1/ANTIGRAVITY_REPAIR_HANDOFF_2026-11-21.md` (Core evidence retention and F5):

- `v1/runtime/worker.mjs`: new shared internal route `/internal/evidence-dependencies` reporting any `decision_id` still referenced by an unresolved `product_admissions` row (`acquiring`/`ready`/`resolving`) or a `held` `source_pins` row in that owner's D1 database.
- `v1/services/core/service.mjs`: `/admin/evidence/retention` queries all destination owners (`contacts`, `deploy`, `roster`, `calendar`, `lord`, `venues`, `layout`) before selecting expired `core_evidence`, protecting unresolved or unknown-owner dependencies (fail-closed), returning a deterministic `previewDigest`, refusing stale previews with `409 PREVIEW_CHANGED`, and recording a compact retained audit summary (`compactDecisions`) in `product_audit`. `RETENTION_DELETE_ENABLED` default stays `"false"` (`409 RETENTION_DISABLED`).
- `tests/v1-product-core-evidence-retention.mjs` (extended): cross-owner protection, stale preview 409 refusal, compact audit summary, preserved cross-owner evidence after unrelated cleanup.

## Scope and mergeability

- Diff against base 800585c8: exactly 4 files, matching the task record — `docs/coordination/tasks/v1-core-evidence-retention-cross-owner.md`, `tests/v1-product-core-evidence-retention.mjs`, `v1/runtime/worker.mjs`, `v1/services/core/service.mjs`. 332 insertions, 5 deletions.
- `git merge-tree --write-tree --name-only origin/main 5d4abc49` produced a clean tree (2f4c3c17) against current main (which now includes the #268, #271, #269, #265, #273, #267, #264, #266 and #270 merges). No conflicts.
- `git diff --check` clean. Secrets scan of the diff: no matches.
- Zero v0.9 drift: `git diff --exit-code -- roster-update/ public/ shared/` clean after `npm run build`.

## CI verified at the exact head

- **Product ("Isolated v1 product"):** run 45017314738, completed, success, head_sha 5d4abc497057d41786079b04955c023bfb25cad8, attempt 1. It ran 33m16s — inside the 60-minute cap #274 raised it to.
- **Node/LORD ("Verify GSiS queue changes"):** absent — this is an `antigravity/**` branch and the workflow triggers only on `codex/**`, `muse/**` and `claude/**` branches. No waiver is hidden: under the owner's 20 Nov waiver ("review all done by antigravity, ignore difference in notation, i will orchestrate") and 21 Nov direction, this approval rests on green product CI at the exact head plus the full local verification below.

## Local verification (22 Nov 2026, TZ=Asia/Singapore, Playwright chromium-1234)

Worktree at the exact head 5d4abc49. `npm ci` root and `v1/` both exit 0.

- `node tests/v1-product-core-evidence-retention.mjs` — PASS (dryRun, `RETENTION_DELETE_ENABLED` guard, cross-owner dependency protection, stale preview 409, compact audit, recovery preserved).
- `npm run build` — exit 0, zero legacy drift.
- `node scripts/v1/build.mjs` — exit 0 (380 artifacts, sourceCommit 5d4abc49).
- `node scripts/v1/verify-build.mjs` — exit 0.
- Working tree clean after the runs.

## Quality gates Q01–Q08

- Q01 (scope): confined to the Core evidence retention cross-owner protection, one extended test, and the task record. Pass.
- Q02 (tests): the PR's extended retention test passes locally and in the product run at the head. Pass.
- Q03 (no live change): no Worker deployment, D1 migration, live-data change, or product behaviour change beyond the retention guard. Pass.
- Q04 (no secret in diff): clean. Pass.
- Q05 (regression): product CI green at the head; Node/LORD absent under the disclosed waiver (see CI above). Pass.
- Q06 (build): canonical build and v1 build + verify-build pass with zero drift. Pass.
- Q07 (docs): task record states the change, the verification, and the out-of-scope bounds (hosted F5 rehearsal excluded). Pass.
- Q08 (review): this record is the exact-head review. Pass.

## Release notes

- Core evidence retention now checks every destination owner before deleting, protects unresolved cross-owner dependencies fail-closed, refuses stale previews, and records a compact retained audit summary.
- F5 remains OPEN: the hosted restore rehearsal is not part of this change.
- No deployment authorised by this review.
