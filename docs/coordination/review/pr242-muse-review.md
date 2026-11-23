# Review: PR #242 — Enforce Deploy within-group duplicate, Dept TL eligibility, and duty overlap validation

- Reviewer: Muse, replacing Claude until Claude returns, per the owner's 16 November directive (source 12b06eb).
- Verdict: **APPROVED at the exact head** `17f36316`.
- Branch: `antigravity/v1-deploy-group-duty-validation`. Base: main `c318d14`. PR status: open, MERGEABLE. GPT to merge.
- No deployment authorised.

## What it does

Closes the three Deploy backend parity gaps from `docs/coordination/tasks/v1-deploy-v09-frontend-parity-audit.md`, all in `v1/services/deploy/model.mjs` (`applyEdits`):

1. **Within-group duplicate check (`setOrganisation`)**: a teacher may appear only once within a group across `slots`, `additionalDeputies`, `tls` and `legacyLeadership` (`409 DUPLICATE_GROUP_MEMBER`). Grandfathered pre-existing duplicates stay repairable: the check allows them only while the count does not grow (`count <= 1 || (priorCount >= 2 && count <= priorCount)`).
2. **Department TL appointment-level eligibility (`setOrganisation`, `kind === "dept"`)**: newly added `tls` assignments must hold an active eligible `ST`, `LT` or `MTT` appointment level (`409 TL_ELIGIBILITY_REQUIRED`). The level is read from the teacher draft first, then the planning profile, profile, deployment tags, or authority record. Retained TLs are exempt.
3. **Same-weekday Duty interval overlap (`setDuties`)**: the same teacher may not hold overlapping intervals on the same weekday (`a.start < b.end && b.start < a.end`, `409 DUTY_OVERLAP_CONFLICT`). Adjacent intervals (`a.end === b.start`), blank publishable duty slots, different-day and different-teacher assignments are explicitly allowed, and untouched grandfathered overlaps stay allowed (both rows existed before with the same teacher, day and overlapping interval).

## Scope, merge, secrets

- Diff vs the PR base: exactly 3 files, matching the task record's exact-file allowlist (task record, `v1/services/deploy/model.mjs`, new test). 471 insertions, 2 deletions.
- `git merge-tree --write-tree --name-only origin/main 17f36316` clean (tree c1061df7), re-checked against current main.
- `git diff --check`: clean. Secrets scan of the diff: clean.
- `npm run build` produces zero drift in `roster-update/`, `public/`, `shared/` (verified locally with `git diff --exit-code`).

## CI at the exact head

- Isolated v1 product run 44655380356: **success at head 17f3631**.
- Node/LORD ("Verify GSiS queue changes"): **no run exists for this head**. The workflow `verify-queue.yml` triggers only on push to `codex/**`, `muse/**`, `claude/**` branches, so `antigravity/**` branches never trigger it. The owner waived this notation difference on 20 Nov 2026 ("review all done by antigravity, ignore difference in notation, i will orchestrate") and, on 21 Nov, directed review of these six PRs after the gap was restated to him. This approval rests on the green product CI at the exact head plus the full local verification below, and the waiver is recorded here rather than hidden.

## Local checks at the exact head

Worktree `wt242-review` at 17f36316, `npm ci` in root and in `v1/`, `TZ=Asia/Singapore`, Playwright Chromium:

- `tests/v1-product-deploy-group-duty-validation.mjs`: exit 0, PASS — within-group duplicates, Dept ST/LT/MTT TL eligibility, same-weekday duty interval overlaps, adjacent intervals, blank duties, and grandfathered historical repairability.
- `tests/v1-product-deploy-planning-eligibility.mjs`: exit 0, PASS.
- `tests/v1-product-deploy-departments.mjs`: exit 0, PASS.
- `tests/v1-product-deploy-storage.mjs`: exit 0, PASS.
- `npm run build`: exit 0, zero v0.9 drift. `node scripts/v1/build.mjs` and `node scripts/v1/verify-build.mjs`: exit 0.

## Findings

None.

## Quality gates

- Q01–Q06 pass at the exact head (bounded scope, fail-closed validations with grandfathered-state preservation, exact-head product CI green, local checks green). Q07 is this review. Q08 is not applicable — no deployment authorised.
- Hosted/runtime UAT: **Not tested**.
