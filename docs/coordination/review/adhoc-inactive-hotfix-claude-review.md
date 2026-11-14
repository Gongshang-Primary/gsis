# Review (Claude): roster-adhoc-inactive-regression at b09eb6a

- Branch `codex/roster-adhoc-inactive-regression`, head b09eb6a. No PR opened yet. Reviewer: Claude (v0.9 coordinator).
- Verdict: **changes requested (one blocking, one small)**. The fix itself is right; I approve the design.

## Evidence
- CI at the head: **full-suite failure**, shard 2/4 failure (`roster093b-peer-workflow.cjs`: "Missing expected exception"); shards 1, 3, 4 success.
- Local at the head, TZ=Asia/Singapore: PASS roster-adhoc-inactive-regression, roster-adhoc-inactive-parity, roster-inactive-eligibility, roster-inactive-ui, roster-reoptimise-priority-parity, roster099a-sre-daily-priority, roster710-adhoc-ui, roster712-shared-subject, stapler095a-staff-eligibility. `roster093b-peer-workflow.cjs` FAILS on the branch and PASSES on main. Canonical build: no diff. Merge-tree against main: clean.

## Design check (approved)
- `reliefActive(s,ctx,person,d,period)` = Contacts active, or a non-deleted, alias-aware ad hoc row for that date (and period). It is used in search (`candidates`), manual ranks and combine, auto-allocate eligibility (`reliefActivePeriods`), `opportunities`, the optimiser population, `excludedIds`, manual assign / mutual choice (`reliefStaff`), WhatsApp `queue()` and the final delivery guard (relief kinds only), `externalTeachers` (restored to `active===false` plus activation), and reconcile. #38's block for truly inactive staff stays (test `g`). The "(ad hoc)" label replaces "(inactive)" on activated dates.
- `lse_notice`, `system_alert`, stapler requests and decisions stay active-only. Correct: those go to staff or SMC, not to ad hoc relievers.

## Findings
1. **Blocking: a teacher missing from Contacts no longer fails the save.** In reconcile, main uses `ctx.people.find(...)?.active===false`, so a missing person falls through to `availability()`, which fails with 404 "Teacher is no longer in Contacts." The branch uses `!reliefActive(s,ctx,undefined,...)`, which is true for a missing person, so it is silently marked "inactive, review". That changes behaviour outside this task (#38's missing-person rule) and breaks `roster093b-peer-workflow.cjs`. Fix: apply the inactive branch only when the person exists, e.g. `const person=ctx.people.find(p=>p.id===a.staffId); else if(person&&!a.noRelief&&!a.remove&&!reliefActive(s,ctx,person,a.date,a.period))`. Leave the missing-person behaviour exactly as on main. Do not edit the failing test.
2. Small: `DEPLOY_STEPS.md` was added at the **repository root**. Move it to `docs/plans/2026-11-15-adhoc-hotfix-deploy-steps.md`. Claude writes the release bundle's DEPLOY_STEPS when building the release.

## Next
After the fix: canonical build no diff, full CI green at the new head, open the PR naming Claude. I re-review immediately, then build release y (x + hotfix) for the owner.

## Re-review at 39728a2 (PR #153)
- Verdict: **approve**.
- Finding 1 fixed: reconcile marks "inactive" only when the person exists with `active===false` and has no activation; a person missing from Contacts falls through to `availability()` and fails with 404 as on main. Same change in the shared, edge-domain and model copies.
- Finding 2 fixed: deploy steps moved to `docs/plans/2026-11-15-adhoc-hotfix-deploy-steps.md`.
- CI at the head: full-suite success; shards 1-4 success.
- Local at the head: PASS roster093b-peer-workflow (unchanged test), roster-adhoc-inactive-regression, roster-adhoc-inactive-parity, roster-inactive-eligibility, roster-inactive-ui, roster710-adhoc-ui. Canonical build: no diff. Merge-tree against main: clean.
- Owner: "merge 153", then Claude builds release y (x + hotfix).
