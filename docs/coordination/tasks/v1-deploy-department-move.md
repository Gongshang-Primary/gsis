# PAR-04: integrate confirmed one-department moves onto v1.06

Model: Codex. Claimed 19 November 2026, Asia/Singapore. Reviewer: Muse at the new exact head.

- Status: claim only; integration and checks pending. No merge, deployment or live operation authorised.
- Branch: `codex/v1-deploy-department-move-v106`.
- Base: deployed v1.06 `bd77b27deab417afce859cd80465d7c608ae0ab2`.
- Reviewed source: `3895cb94207e852eafc52bd1fbfa434dccd6a3d4`, original branch `codex/v1-deploy-department-move`; [Muse's approval](../review/pr-department-move-muse-review.md) is recorded on main at `deb68287bd6b438939ec8fb23ac9a989923cc502`. That approval covers its original head, not this integration.
- Authority: the owner requested the confirmed Dept move; the coordinator now instructs integrating that reviewed source onto v1.06, publishing this scoped branch claim first, then testing/pushing and opening a draft for Muse only after full Node/LORD CI is green. No direct-main claim, merge or deployment is attempted.
- Refresh: main remains the base above. Only PR182 is open, for separate v0.9 Roster work. The approved New-version inheritance work is assigned to a separate implementer; this branch must not add its helper or create-version changes.

## Exact eight-path scope

1. `docs/coordination/tasks/v1-deploy-department-move.md`
2. `v1/web/shared/deploy-departments.mjs`
3. `v1/web/shared/deploy-departments-ui.js`
4. `v1/services/deploy/model.mjs`
5. `v1/services/deploy/workbooks.mjs`
6. `scripts/v1/build-web.mjs`
7. `tests/v1-product-deploy-departments.mjs`
8. `tests/v1-product-deploy-departments-browser.mjs`

Keep the original reviewed implementation and tests unchanged wherever the new base permits. Preserve v1.06's `projectPlanningNames` and related TTb inputs in the model. The Dept model hunk adds only its pure helper import and final `setOrganisation` guard. Preserve PR209's Roster local-export script/adapter when combining the builder inclusion; append `deploy-departments-ui.js` to the existing Deploy modules. Stop and report any other product conflict needing a policy change. The task record is integration evidence, not a replacement review of untested product changes.

## Contract preserved

A teacher belongs to one distinct department. Count Department IDs across `slots`, `additionalDeputies` and `tls`, not positions within one department. Selecting someone already elsewhere offers **Move to this department**, showing previous/target positions and requiring confirmation. Cancel preserves the complete existing draft and saved document. Confirmation stages the existing native draft intent; explicit Save owns the write. Clear only that person's other Dept references, keep fixed leadership holes and compact only affected member suffixes. Existing within-department role and canonical import rules remain.

Historical multi-Dept records remain visible and unchanged on open, note saves and unrelated edits. An after-state containing more than one Dept must be a subset of that teacher's previous Dept-ID set: no-op/reduction is allowed; A+B to A+C is rejected. A confirmed final single-Dept move can repair history, including an unchanged retained inactive destination without reactivating the teacher or allowing a new excluded assignment. Native direct and actual encoded browser operations and canonical Dept imports share this rule. Imports never guess a destination.

Preserve school/identity/current capability, lease/fence/revision, full captured Dept expected-value binding for confirmed moves, idempotent operation identities, receipts, uncertain-outcome recovery, stable IDs and immutable history. A stale prompt cannot stage a move after a protected context/version/graph change. Other organisations, committee multiple-membership notices, Contacts/Core authority and another planning version remain unchanged. Omitted fields never clear stored data. No page-open write.

## Verification and handoff

Run real built synthetic Worker/D1 and browser Dept programs, with locked Chromium151 and `TZ=Asia/Singapore`, then relevant unchanged eligibility, workbook, recovery, Membership and duplicate-Contacts regressions. Validate the current TTb-name and nonloaded-note behaviors when shared model/build consumers are affected. Run canonical build/no tracked drift, v1 build, nine dry-runs/local migration upgrade, syntax/scope/whitespace checks. Keep all assertions and the 45-second product-program ceiling. No dependency, workflow, provider, migration, configuration or live-data change.

Push progress with exact claim/implementation SHAs. Full Node/LORD and product/package CI must run at the new exact head. Open a separate draft PR for Muse only after Node/LORD is green; report any remaining product-CI state honestly. List visible changes (move dialog, history-review/repair actions and Dept instructions), original source review, integration differences and tests actually run. No merge or deployment. Hosted UAT, official T1B-01/T1B-02 and N-1 latency remain **Not tested**; F5 **OPEN**.

Q01: this branch-only exact-scope claim precedes edits. Q02–Q05: reuse the reviewed pure policy and existing owner/queue/transaction contracts. Q06/Q07: pending new local checks, CI and Muse review. Q08: not applicable to release. Skill methods: repository boundary/recovery/red-green principles applied manually; no external skill package invoked or copied. Prior source-head passes are historical evidence and do not establish verification of this new base.
