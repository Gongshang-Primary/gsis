# v1 Deploy Teachers visual cleanup queue

Model: Codex. Recorded 17 November 2026 19:01:29 SGT.

- Status: **QUEUED changelog**, no product edit or active takeover. The current Versions pipeline continues. Keep PR #204 at its review head; coordinate the source handoff after its review/integration before implementing this follow-up.
- Owner request: TTb Name's heading must use the same dark blue as adjacent headings; move Span of Control to the last HR Settings item, immediately after HR Terms; explain and correct grey Teachers rows so the table uses alternating white and light-blue row fills.
- Builder: Codex; coordinator: ChatGPT; intended reviewer: Muse at the eventual exact head.
- Intended branch: `codex/v1-deploy-teachers-visual-cleanup`.
- Proposed exact three-file implementation scope: this task record; `v1/web/shared/deploy-ui.js`; new `tests/v1-product-deploy-teachers-chrome-browser.mjs`. Publish/confirm the active claim and source handoff before product edits. No builder, v0.9 source, Worker, schema, authority, provider or live-data change.

## Changelog and investigation

| Item | Required behaviour | Source evidence | State |
| --- | --- | --- | --- |
| TTb Name heading contrast | The first ordinary Teachers heading has the same dark blue background and readable light text as adjacent headings. Keep the filter row's separate pale style. | `v1/web/shared/core-table.css:80` applies pale `#edf3f7` to both sticky first body and header cells, while the normal header text remains white. | Queued |
| HR Settings order | Teachers, Exclusions, Membership, Offload, HR Terms, then Span of Control. Reorder the existing native list so rendering, keyboard order and normal entry behaviour agree; preserve native edit guards. | `public/app.js:636` currently puts Span first in `settingsSections['HR Settings']`. The existing v1 module can reorder that array without a build-time text patch. | Queued |
| Teachers row fills | Apply normal alternating white/light-blue fills across Teachers rows, including names and frozen cells. Retain explicit unknown/inactive labels and the actual values; do not infer Active=Yes or change eligibility/access to fix styling. Preserve inactive sorting and controls. | Native Teachers assigns `.inactive` when `active` is false, including unknown activity. `public/table-viewport.css:55` overrides the normal row bands with solid grey and muted text. | Queued |

“Activity unknown” means activity evidence is missing. It does not prove the person is inactive. “Teaching eligibility unavailable” means accepted capacity evidence is missing. PR #204 improves the version Role/Active projection and capacity wording, but deliberately does not fabricate activity and does not implement these separate header/nav/striping changes.

The screenshot is reference evidence only. No real staff names or records have been copied into the task or tests. Investigation read repository source, not the hosted site.

## Proposed acceptance and boundaries

Use a synthetic built-browser/Worker fixture with active, explicitly inactive and unknown staff. Check computed first-heading colours against adjacent headings, unchanged filter-row styling, alternating visible bands through sorting/filtering/refresh, frozen-cell consistency, and the exact HR order. Confirm labels and actual Active/accepted facts stay intact, page navigation keeps native handlers and opening/styling writes no data. Keep the v0.9 visual vocabulary.

Prefer scoped styles and the existing native HR array in the v1-owned UI module. No new business-logic build patch. Run the canonical build/no-drift checks, the meaningful browser regression and all required exact-head CI before a separate draft PR. Every commit/PR is labelled Model: Codex. Independent review remains required. No merge or deployment is authorised by this changelog.

This is a recorded queue, not an implementation or verification claim. Hosted runtime UAT remains Not tested; F5 remains OPEN. Source ownership of frozen PR #204 has not been taken over. The coordinator will refresh main/PRs and record the actual implementation base and handoff when starting it.
