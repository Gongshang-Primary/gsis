# v1 Deploy staff lists and Span of Control

- Status: implemented; local verification passed; exact-head CI and Muse review pending.
- Model/owner: Codex; coordinator: ChatGPT; reviewer: Muse at the exact head.
- Updated: 17 November 2026, Asia/Singapore. Branch: `codex/v1-deploy-planning-eligibility`.
- Base: main `9dc353d26d75496b2caaf8d450bb017c20715f77`.
- Accepted documentation-only claim clarifications fast-forwarded through main `b9eb74e00f8fe8001509ccd16f442bfdf0f1d1ab`. No unreviewed product branch is included.
- Owner request: Span must populate from the available active version teacher list, excluding MK but including SAT × MK. Other planning lists, including Dept/Committees/CCAs/PLT/Events/IP Deploy, exclude MK, SAT, Support and School Leaders. The owner asked to compare v0.9. This is an explicit new rule: v0.9 also excluded OSO from Span, which the new “all except MK” rule supersedes.
- Exact scope: this task; `docs/v1/DEPLOY_PLANNING_ELIGIBILITY_2026-11-17.md`; `v1/web/shared/deploy-eligibility.mjs`; `v1/services/deploy/model.mjs`; `v1/services/deploy/workbooks.mjs`; `v1/services/deploy/role-memberships.mjs`; `v1/web/shared/deploy-ui.js`; `scripts/v1/build-web.mjs`; `tests/v1-product-deploy-planning-eligibility.mjs`; `tests/v1-product-deploy-planning-eligibility-browser.mjs`; `tests/v1-product-deploy-workbooks.mjs`; `tests/v1-product-deploy-storage.mjs`; `tests/v1-product-contacts-projection-browser.mjs`; `tests/v1-product-contacts-projection.mjs`; `tests/v1-product-tables.mjs`.
- Coordination: all tasks use the same Codex implementer. The Subject Load model/build edits are frozen at `9d175e0516b3350df2fd6c141dbb9de6e8acfee4`; their shared paths are explicitly handed to this isolated eligibility worktree for the distinct policy regions. Do not change that load branch. If a load correction needs these shared paths, serialize the handoff again. The Duplicate radio task owns disjoint publication/test paths. Keep three bounded PRs and disclose/retest any integration conflict before merging; no stack on unreviewed product code.
- No v0.9 source, Core authority, Roster workload/capacity eligibility, permission grant, migration, live data, provider or deployment changes. No merge/release authority is granted by this coding request.

## Policy and data ownership

Use one pure v1 planning-eligibility policy for the native save checks, UI choices and canonical Span workbook. Version-owned explicit Active and current version role/Membership tags govern planning choices; missing optional EO/grade facts must not blanket-empty the lists. Missing Active remains unknown, not invented true. Retain known staff identity/reference and current actor/school/capability gates.

Span: active && (!MK || SAT). Thus active SAT × MK, SAT, Support, SL and OSO are included; MK without SAT is excluded. General new planning assignments: active && !MK && !SAT && !Support && !SL. Use current version's explicit matrix flags and staff facts; don't infer application permissions from role names or graph position. Preserve Core's accepted SMC/EO/SL/Global Admin access and Roster's separate accepted capacity inputs unchanged.

Populate the Span read projection immediately, without a page-open write or Initialize step. The first explicit reporting edit initializes missing durable reporting state atomically in the owning save. Existing links and references remain visible/flagged if now excluded; new choices use the new policy. Preserve cycle/self checks, protected roots, expected values and stable IDs; removal of stale references must remain possible. Do not replace saved graphs with empty snapshots. General native saves must retain historical assignments and reject newly added excluded staff consistently with the UI.

## Acceptance

Real built browser/Worker/D1 cases: ordinary teacher, MK, SAT, SAT×MK, Support, SL, OSO, inactive and missing-optional-fact staff; version role changes immediately affect choices without an application permission grant; explicit Active edits versus unknown activity; all listed planning views; historical-link retention; no-write page open and first-edit atomic initialization; canonical Span export/preview/import parity; wrong-school/current capability/stale version/fence/retry checks. Prove accepted Core authority/Roster capacity metadata unchanged and existing completed/publication records untouched. All fixtures synthetic.

Use v1-owned modules with only necessary existing script-type wiring; no new text-patch business logic. Run TZ=Asia/Singapore canonical build/no drift, meaningful targeted and relevant old regressions, then required exact-head Node/LORD/product CI before draft PR. Update old behavioral assertions only where the owner's explicit new eligibility rule supersedes them; preserve security assertions. No weakened/skipped tests. Report commands/results and runtime UAT Not tested. F5 OPEN; T1B-01/T1B-02 Not tested. Functional code needs Muse exact-head review; routine release-label review waiver does not apply.

Q01 claim/owner scope recorded; Q02-Q05 preserve authoritative permission/capacity boundaries and native atomic writes; Q06/Q07 pending; Q08 no live action. Publish only this claim first through the expected-head non-force task-record exception, then implement from its accepted commit. Stop on rejected claim; do not bypass it.

## Claim clarification: existing UI module consumer

Before editing it, add the exact existing `tests/v1-product-tables.mjs` path to this claim. It injects deploy-ui.js as a classic inline script; the shared eligibility policy requires normal browser module loading. Serve the unchanged UI module and actual dependency on an intercepted synthetic origin and await its API/initialisation. Preserve every existing table/permission assertion; no import stripping, no weaker checks, no runner/workflow changes. This anticipates the same fixture incompatibility already proven and corrected in the separate Load task. All other source/test ownership remains unchanged.

## Claim clarification: ordinary version field consistency

Before editing it, include `v1/services/deploy/role-memberships.mjs`: roleMapping currently skips the preserved ordinary planning Role snapshot, so a version showing Teacher could derive memberships from a later accepted Contacts Role=P. Use the same existing version-owned Role precedence as UI/workbook (explicit draft first, then saved planning Role), without changing capability checks, permission combinations, immutable-publication proof/application contracts or accepted Core/Roster facts. Canonical Teachers/Membership exports and contactsMemberships display likewise use that ordinary version Role/Active. Test current Contacts changing after version creation, no permission grant from page open or eligibility, consistent publication projection and unchanged historical documents. This aligns an existing source field with the owner's version-copy design; planningEligible/reportingEligible must never be an authority grant source.

## Claim clarification: version activity versus accepted capacity regression

Before editing it, include the exact existing `tests/v1-product-contacts-projection.mjs` path. Its old planning assertion denies an assignment solely because accepted Contacts activity changed after this version saved explicit Active=Y. Under the owner's new version-owned choice rule, retain that accepted excluded/capacity metadata assertion while permitting the version's own active assignment. Then explicitly set version Active=N and preserve rejection of a new binding, plus all actor/school/current-authority/history checks. This updates the superseded target-person planning expectation, not the actor's current capability requirement or Roster's accepted capacity policy.

## Implementation handoff, 17 November 2026

Model: Codex. The [dated specification](../../v1/DEPLOY_PLANNING_ELIGIBILITY_2026-11-17.md) records the policy, v0.9 comparison, data ownership, visible changes and integration limit.

One pure policy now serves native binding checks, UI choices and Span workbooks. `teacher.planningProfile` preserves only ordinary version Role and Active; explicit drafts win. Unknown activity remains unknown. Accepted Contacts authority/capacity properties and actual Core capabilities are unchanged by planning edits. Page reads and note-only saves do not migrate teacher rows. Duplicate refresh removes only Role/Active draft overrides for current Contacts IDs; all unrelated draft fields and draft-only people survive.

Span reads the teacher inventory immediately and initializes missing reporting state only on the first explicit native save. Existing excluded links and allocations survive. Member compaction preserves identity and occurrence count; leadership roles remain positional. Expected-bound orphan clearing removes only that person's edge aliases, retaining history. Alias disagreements, including `staff.ro`, are flagged and reconciled only for the edited person. Canonical Teachers/Membership exports and matrix derivation use the displayed ordinary version Role/Active, without changing publication proof or authority-application rules.

Same-Codex assistance edited disjoint claimed files: UI/new browser test, workbook/existing workbook test, and new native Worker test. A separate same-model read-only pass found member-compaction, orphan-clear and `staff.ro` alias cases, which were corrected within this preservation contract. These passes are builder checks, not independent Muse approval.

### Local verification

All commands use `TZ=Asia/Singapore`; browser commands additionally use `GSIS_BROWSER_EXECUTABLE=/usr/bin/chromium`. Wrangler checks use distinct temporary XDG/log paths. Tests use built local Workers, synthetic D1/R2 data and intercepted providers, with no hosted reads or writes.

| Command | Result |
| --- | --- |
| `npm run build` and production-path `git diff --exit-code` | Pass; production source/generated files unchanged |
| `node scripts/v1/build.mjs` | Pass; nine owner/web bundles |
| `node scripts/v1/verify-build.mjs` | Pass; all nine Wrangler dry-runs and the local migration upgrade check |
| `node tests/v1-product-deploy-planning-eligibility.mjs` | Pass; full native preservation/security matrix and actual synthetic publication/authority receipt application, 27.772 seconds |
| `node tests/v1-product-deploy-planning-eligibility-browser.mjs` | Pass; seven real browser groups |
| `node tests/v1-product-deploy-workbooks.mjs` | Pass; staff matrix, historical aliases/orphans, unknown activity, ordinary Role/Active and unchanged security assertions |
| `node tests/v1-product-deploy-storage.mjs` | Pass; native storage, binding/import/recovery/interval gates |
| `node tests/v1-product-contacts-projection-browser.mjs` | Pass; seven browser groups, accepted capacity metadata preserved |
| `node tests/v1-product-contacts-projection.mjs` | Pass; nine native integration groups, explicit version Active negative and all accepted-capacity/privacy assertions retained |
| `node tests/v1-product-deploy-duplicate-contacts.mjs` | Pass; existing duplicate/eleven-tag and recovery regression |
| `node tests/v1-product-deploy-role-memberships.mjs` | Pass; existing native role-matrix/publication regression |
| `node tests/v1-product-deploy-memberships-browser.mjs` | Pass; unchanged browser regression |
| `node tests/v1-product-deploy-role-memberships-browser.mjs` | Pass; unchanged browser regression |
| `node tests/v1-product-tables.mjs` | Pass; actual module fixture, all original assertions retained |
| Syntax checks and `git diff --check` | Pass |

Early local browser attempts without the executable override stopped before browser tests because Playwright's cached executable was absent. The reruns above use the installed Chromium. Old planning-only expectations were updated where the owner's version-owned rule superseded accepted-capacity gating. Accepted-fact, actor, identity, school, revision, fence and recovery assertions were retained. No test was skipped or weakened to bypass those checks.

The initial built-browser regression observed an Initialize staff list button where the immediate read projection requires none. It passed after the UI change. The existing native Contacts projection test also reproduced its obsolete Contacts-inactive denial assertion before its claimed update. It now proves both version Active=Y acceptance and explicit version Active=N rejection while retaining accepted capacity exclusion.

The unchanged classic planning codec rejects duplicate `legacyLeadership` record identities before sending a request. Native duplicate-occurrence guards are therefore tested with direct `setOrganisation`; ordinary member compaction is tested through the real browser `patchPlanning` codec. This task does not add support for editing that synthetic malformed historical duplicate array through the copied codec.

Skill use: repository Pstack/Superpowers/Gstack principles guided the ownership trace, failing browser reproduction, synthetic native tests and internal counterexample review. Those full skill workflows were not executed. The available `pstack-plugin:unslop` skill, `c12/unslop`, was read and used for prose only. No third-party code or dependency was added.

| Gate | Status |
| --- | --- |
| Q01 | Pass; owner request, accepted claim/extensions and exact inventory above |
| Q02 | Pass; version planning fields separated from accepted authority/capacity |
| Q03 | Pass locally; actor/school/security regressions retained and exercised |
| Q04 | Pass locally; native atomic initialization, expected values, revision/fence and replay checks |
| Q05 | Pass locally; existing bounded owner routes and payload limits reused; no dependency or migration |
| Q06 | Local verification passed; required exact-head Node/LORD/product CI pending |
| Q07 | Pending draft PR and Muse exact-head review; coordinator will post the committed head/base |
| Q08 | No deployment authority exercised; hosted runtime UAT Not tested |

The functional changes affect Deploy and its workbook output. The common Drive backup reader statically imports Deploy workbooks, so all eight owner bundles plus web can change; compare final artifacts before release. No backup is activated. No new owner decision is required for the stated rule. The separate Load PR also changes the existing Deploy script-inclusion line; disclose any merge conflict, combine both module inclusions and rerun integrated build/browser tests. No merge or deployment was performed. F5 remains OPEN; T1B-01/T1B-02 and hosted runtime UAT remain Not tested.
