# PAR-04: integrate confirmed one-department moves onto v1.06

Model: Codex. Claimed 19 November 2026, Asia/Singapore. Reviewer: Muse at the new exact head.

- Status: reviewed source integrated and fresh-base focused checks passed; implementation push/CI and new exact-head Muse review pending. No merge, deployment or live operation authorised.
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

## Integration evidence

The branch-only claim was published first at `2bac2cab77144bab08a67e7630a83d6121c96fa6`. Applying only the seven product/test paths from `3895cb9` with Git's three-way patch exposed exactly the anticipated import/inclusion conflicts. The resolution keeps the v1.06 `projectPlanningNames` import and appends the Dept import, and keeps PR209's Roster local-export inclusion/adapter while adding only the Dept module to the existing Deploy inclusion. No other product conflict occurred.

Local byte comparisons prove both new Dept modules, the canonical workbook module and both Dept test programs are identical to the original reviewed head. The model differs from the v1.06 base by only the original Dept import/final guard; the builder differs by only the one Deploy inclusion append. Independent New-version inheritance remains on its own branch; this branch adds none of its helper/create changes.

Fresh-base verification uses `TZ=Asia/Singapore`, locked Chromium151.0.7922.34 and isolated temporary XDG/Wrangler logs. Dependencies reuse existing workspace installations; no installation or dependency edit.

| Check | Result |
| --- | --- |
| `node tests/v1-product-deploy-departments.mjs` | Pass, 26.197 seconds under the unchanged 45-second cap. All three groups cover actual direct/encoded owner requests, native/canonical rule enforcement, retained historical subsets, atomic confirmed moves, strict actor/school/identity/revision/fence/reused-intent rejection, unchanged authority/other versions/history and receipt replay after a real Worker restart. `/tmp/gsis-par04-v106-native.log`. |
| `node tests/v1-product-deploy-departments-browser.mjs` | Pass, 18.289 seconds under the same cap. Actual built browser/Workers/D1 cover ordinary assignment, source/target confirmation, Cancel preserving the prior draft, no write until Save, fixed role holes, repeated moves, coalesced rename retaining full original CAS, and inactive historical repair without reactivation. Original assertions are unchanged. `/tmp/gsis-par04-v106-browser.log`. |
| Unchanged `node tests/v1-product-deploy-workbooks.mjs` | Pass; canonical scopes, selected-fact/retained identity rules, immutable drafts and workload semantics. `/tmp/gsis-par04-v106-workbooks.log`. |
| `npm run build` | Pass, eighteen production components and no tracked generated drift. `/tmp/gsis-par04-v106-canonical.log`. |
| `node scripts/v1/build.mjs` | Pass, nine services and 377 artifacts. `/tmp/gsis-par04-v106-build.log`. |
| Source union, syntax and whitespace | Pass; exactly the original reviewed Dept behavior on the new base, preserving later TTb and Roster export work. |

The coordinator explicitly directed pushing after the fresh native/browser, canonical no-drift and v1 build checks, leaving further unchanged integration regressions and nine dry-runs/local migration upgrade to the required full exact-head CI. This avoids contention between parallel synthetic fixtures; it does not skip a CI gate or claim those checks ran locally. Node/LORD runs on the implementation push; only after it is green may the draft PR open and trigger its product/package run. Report those exact run links/results in the PR without transferring the original source head's CI to this one.

This is a fresh-base integration, not a new policy redesign. The original meaningful native/browser failures and their corrected tests are retained at the original reviewed head/task. No assertion or timeout was changed to obtain this result. Q01–Q05 pass locally; Q06 has the listed focused/build evidence with full CI pending; Q07 new exact-head Muse review remains pending; Q08 no release authority exercised.

## Ledger disposition

PAR-04 has a locally verified implementation on this new base; it is not merged, deployed or hosted-verified. The older DEP17-003 add/save field-codec repair already shipped separately and is not reopened. PAR-03 New inheritance, PAR-01/02/07 layout/presentation and PAR-05 Compact remain separate tasks. Multi-Committee behavior stays allowed; pending CCA/PLT/Event policy is not changed. The broader Contacts catalogue/namespace lifecycle and venue-maintenance gaps are outside this exact scope. Hosted UAT, T1B-01/T1B-02 and N-1 latency remain **Not tested**; F5 **OPEN**.
