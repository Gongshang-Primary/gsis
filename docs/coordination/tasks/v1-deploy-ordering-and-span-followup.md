# v1 Deploy ordering and Span of Control changelog (`DEP-21-001`, `DEP-21-002`, `DEP-21-003`)

- Task ID: `v1-deploy-ordering-and-span-followup`
- Model: `Antigravity` (originally recorded by `Model: Codex` on 21 November 2026, 01:41 SGT)
- Branch: `antigravity/v1-deploy-ordering-and-span-followup`
- Status: **Claimed for implementation**
- Coordinator / Merger: `GPT` (ChatGPT)
- Reviewer: `Muse` at the exact head
- Reference baseline: v1.09 `e107b5ed62db6cfa2c59f61367902bb2f8957f9e` (`origin/main` `6461f4e2a78eb11ff9b6b254f775d68e12e48d52`) and v0.9.9y `d9d180ced16d32c836a94d67d9cff8d3030eb21d`.

## Files Claimed
- `docs/coordination/tasks/v1-deploy-ordering-and-span-followup.md`
- `v1/web/shared/deploy-ui.js`
- `v1/web/shared/deploy-eligibility.mjs`
- `v1/web/shared/core-table.js`
- `v1/services/deploy/model.mjs`
- `v1/services/deploy/service.mjs`
- `v1/services/deploy/workbooks.mjs`
- `tests/v1-product-deploy-layout-and-teachers-browser.mjs`
- `tests/v1-product-deploy-ordering-and-span-browser.mjs`

## DEP-21-001 — Teachers row order and fill

On load, display active HODs first, then active Junior KPs, then the remaining active teachers. Use the selected version's effective EO appointment level for the grouping. Give explicitly inactive teachers grey rows and keep them at the bottom, including after either direction of a header sort. Normal active rows retain white and light-blue bands. Unknown activity keeps its own label and must stay distinguishable from confirmed inactivity.

v0.9.9y partitions Teachers into active first and inactive last both on initial render and before a manual column sort. It retains input order within each activity bucket on load and uses natural comparison of the selected cell for manual sorts. The Teachers comparator has no HOD or Junior KP rank. The HOD and Junior KP categories exist in the shared appointment grouping used for workload rules. The hierarchy above is an explicit v1 display requirement. [v0.9 default order](https://github.com/Gongshang-Primary/gsis/blob/d9d180ced16d32c836a94d67d9cff8d3030eb21d/public/app.js#L1366) · [Header sort](https://github.com/Gongshang-Primary/gsis/blob/d9d180ced16d32c836a94d67d9cff8d3030eb21d/public/app.js#L662-L664) · [Grey styling](https://github.com/Gongshang-Primary/gsis/blob/d9d180ced16d32c836a94d67d9cff8d3030eb21d/public/table-viewport.css#L55-L58) · [Appointment groups](https://github.com/Gongshang-Primary/gsis/blob/d9d180ced16d32c836a94d67d9cff8d3030eb21d/shared/teaching-rules.js#L20)

The v1.09 screenshot shows rows labelled Inactive at the top with alternating fills. The v1 stylesheet explicitly bands all Teachers rows, which accounts for the missing grey. The inherited native sort still partitions by activity in source. The reason the hosted table shows inactive rows at the top needs a built-browser reproduction covering the initial view and sort, filter and refresh paths. [v1 Teachers sort](https://github.com/Gongshang-Primary/gsis/blob/e107b5ed62db6cfa2c59f61367902bb2f8957f9e/public/app.js#L1366) · [v1 fill override](https://github.com/Gongshang-Primary/gsis/blob/e107b5ed62db6cfa2c59f61367902bb2f8957f9e/v1/web/shared/deploy-ui.js#L119-L130)

Acceptance: use scrambled synthetic active HOD, Junior KP and teacher rows, including an inactive HOD and a row with unknown activity. Check the order and computed fills at load, after toggling Show inactive, and after sorting in both directions and filtering. Check that edits and row IDs still refer to the same staff.

## DEP-21-002 — Consistent class suffix order

Apply the same default class order in **IP Deploy** and **Program Settings → Classes**.

| Class naming pattern | Suffix order |
| --- | --- |
| All class suffixes are single letters | P → T → I → R → C → H → G → K |
| Some class suffixes have two letters | Gc → Gt → P → Rs → Rp → I → D → E → K |

Compare suffixes after the numeric level prefix. Keep ascending numeric levels in IP Deploy and the P1–P6 columns in Program Settings. Keep attached teaching groups with their class or venue blocks. For the implementation baseline, read the naming pattern from the selected version before search or level filtering. Keep custom or unranked classes visible in a stable order.

The v0.9.9y old name set matches the requested single-letter order. Its newer name set lists `Rp` before `Rs`. This changelog records the owner's explicit `Rs` before `Rp`. Both versions' IP Deploy default orders same-level form blocks by saved class-array position, and Classes lists the selected catalogue pairs followed by unmatched existing classes. v1's default catalogue starts with the single-letter set. [v0.9 name sets](https://github.com/Gongshang-Primary/gsis/blob/d9d180ced16d32c836a94d67d9cff8d3030eb21d/public/app.js#L169) · [IP Deploy order](https://github.com/Gongshang-Primary/gsis/blob/e107b5ed62db6cfa2c59f61367902bb2f8957f9e/public/app.js#L710-L730) · [Classes row source](https://github.com/Gongshang-Primary/gsis/blob/e107b5ed62db6cfa2c59f61367902bb2f8957f9e/public/app.js#L827-L839) · [v1 seed catalogue](https://github.com/Gongshang-Primary/gsis/blob/e107b5ed62db6cfa2c59f61367902bb2f8957f9e/v1/services/deploy/model.mjs#L71-L85)

Acceptance: use scrambled synthetic classes in both schemes, including P1 and P2, `Rs` and `Rp`, a custom suffix and attached teaching groups. Check both views before and after search, level selection and reload. Preserve class identities, names, selections, venue associations and saved assignments.

## DEP-21-003 — Span of Control staff and School Leader roots

Include all active staff except MK staff without SAT. Active School Leaders populate Layer 1. Active SAT staff remain selectable, including anyone tagged both SAT and MK. Support and OSO also belong in this reporting view. The separate teaching and allocation pickers keep their own eligibility rules.

The screenshot shows four empty Layer 1 School Leader positions while the unassigned list is populated. It establishes missing displayed roots in the selected draft. The contents of the underlying staff inventory and classifications are unverified.

The current Span predicate already implements the SAT exception on the rows it receives. Span builds its people list from `doc.teachers` and retained reporting history. The selected-version bootstrap hydrates the saved teacher IDs and returns the broader Contacts staff catalogue separately. A School Leader or SAT who is present only in that catalogue is therefore absent from the normal Span pool. For saved rows, effective Active and role mappings also affect the result. Trace both the input inventory and its effective labels before changing the predicate. [Span eligibility and projection](https://github.com/Gongshang-Primary/gsis/blob/e107b5ed62db6cfa2c59f61367902bb2f8957f9e/v1/web/shared/deploy-eligibility.mjs#L96-L108) · [Staff inventory](https://github.com/Gongshang-Primary/gsis/blob/e107b5ed62db6cfa2c59f61367902bb2f8957f9e/v1/web/shared/deploy-eligibility.mjs#L135-L150) · [Root rendering](https://github.com/Gongshang-Primary/gsis/blob/e107b5ed62db6cfa2c59f61367902bb2f8957f9e/v1/web/shared/deploy-ui.js#L640-L651) · [Bootstrap staff boundary](https://github.com/Gongshang-Primary/gsis/blob/e107b5ed62db6cfa2c59f61367902bb2f8957f9e/v1/services/deploy/service.mjs#L764-L780)

Acceptance: reproduce a draft with active SL, SAT, SAT × MK, Support, OSO and MK-only staff split between saved staff and Contacts references. Verify correct Layer 1 roots, eligible officers, save/reload of a valid reporting link and retention of existing historical links. Preserve the version's teacher membership during a page read, and keep reporting classification separate from permission grants and teaching eligibility. [Earlier Span and planning eligibility design](../../v1/DEPLOY_PLANNING_ELIGIBILITY_2026-11-17.md)

## Verification

Read the pinned sources and inspected the owner screenshots without copying staff details. A synthetic direct call to the v1.09 Span projection included active SL, SAT, SAT × MK, Support and OSO, excluded MK-only, inactive and unknown activity, and produced no root when the SL was absent from the input. This is a source-level check. Built-browser reproduction, hosted UAT, implementation CI and deployment are pending a separate implementation task.
