# v1 Deploy staff lists and Span of Control

- Status: claimed; implementation pending.
- Model/owner: Codex; coordinator: ChatGPT; reviewer: Muse at the exact head.
- Updated: 17 November 2026, Asia/Singapore. Branch: `codex/v1-deploy-planning-eligibility`.
- Base: main `9dc353d26d75496b2caaf8d450bb017c20715f77`.
- Owner request: Span must populate from the available active version teacher list, excluding MK but including SAT × MK. Other planning lists, including Dept/Committees/CCAs/PLT/Events/IP Deploy, exclude MK, SAT, Support and School Leaders. The owner asked to compare v0.9. This is an explicit new rule: v0.9 also excluded OSO from Span, which the new “all except MK” rule supersedes.
- Exact scope: this task; `docs/v1/DEPLOY_PLANNING_ELIGIBILITY_2026-11-17.md`; `v1/web/shared/deploy-eligibility.mjs`; `v1/services/deploy/model.mjs`; `v1/services/deploy/workbooks.mjs`; `v1/web/shared/deploy-ui.js`; `scripts/v1/build-web.mjs`; `tests/v1-product-deploy-planning-eligibility.mjs`; `tests/v1-product-deploy-planning-eligibility-browser.mjs`; `tests/v1-product-deploy-workbooks.mjs`; `tests/v1-product-deploy-storage.mjs`; `tests/v1-product-contacts-projection-browser.mjs`.
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
