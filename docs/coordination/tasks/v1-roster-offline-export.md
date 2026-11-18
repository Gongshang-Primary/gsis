# Export the selected Roster day from local data

Model: Codex. Claimed on 18 November 2026 SGT. Reviewer: Muse.

- Branch: `codex/v1-roster-offline-export`, based on `8c2ece8f6cabdb1956b4775c01a1364fd898a2ed`.
- Owner request: export the latest selected-day local timetable and allocations, including unsaved edits, from all three Assign Relief Excel actions. Verify workbook content offline and provide a v1 Roster frontend ZIP.
- Exact scope: this task, `scripts/v1/build-web.mjs`, `v1/web/shared/roster-local-export.js`, and `tests/v1-product-roster-offline-export-browser.mjs`.
- Existing v0.9 repair inspected at PR #182 head `57ab791db80c28f647f1ec03aee73e67cc981b90`, task `docs/coordination/tasks/roster-local-export-recovery.md`. The shared v0.9 source remains under that PR's ownership. The v1 asset builder connects the v1 local export helper to the copied Roster editor's private functions.
- Open #205 and verified Deploy TTb branch have disjoint files. The reviewed department branch also changes one existing build-web script-inclusion line for Deploy. Its hunk is separate from the Roster integration.

Use the selected day's local working state and actual timetable identity. A matching previously loaded plan is useful even when the allocation revision advances. Without a matching plan, reconstruct from complete local timetable cells. Report the precise missing datum if reconstruction is impossible. Use the current local absences, demands and assignments for the workbook, preserve worksheet formatting and existing privacy rules, and keep export from starting an API, timetable request, save or publication.

Verify the three actual downloads using the built v1 browser, real local Workers/D1 and synthetic data. Compare XLSX contents after an unsaved edit and after switching dates. Prove local completeness failures and zero export requests. Run canonical and v1 builds. Archive only built Roster frontend assets and shared dependencies, with exact source SHA and test results. No deployment or live writes.
