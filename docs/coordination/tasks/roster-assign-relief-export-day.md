# roster-assign-relief-export-day: Assign Relief "Export Excel" exports only the selected day, in the daily workbook format

- Status: changelog (owner 6 Nov: "export excel in assign relief only exports the day but follow same format of header frozen left col frozen"); lane R; Codex when authorised. Small. Spec by Claude.
- Reviewer/model: Claude

## Required
1. Assign Relief → **Export Excel** produces one sheet for the **selected date only** (not the week), using the **same renderer as the daily Drive workbook** (#82, roster-update/public/edge-roster-output-renderers.js / the existing Roster/Stapler export renderer): status line (date, timetable source: confirmed Stapler rev N or baseline, exported HH:MM, revision), period numbers + timings rows **frozen**, teacher column **frozen**, every active teacher plus activated ad hoc relief teachers, exactly **4 rows per teacher**, Stapler colours (orange relief, pink extra, grey absence, no fill otherwise) and legend; no absence reasons.
2. One renderer for both (download and Drive file); no second implementation. The file content for a date matches the Drive daily file for the same revision.
3. Uses the effective timetable rule (latest confirmed Stapler version, tasks/roster-stapler-always-effective.md).
4. Works from the local snapshot when the backend is unreachable (keep the behaviour of tasks/roster-export-excel-local.md; label "Local snapshot" when the revision is not confirmed online).
5. File name: `<YYYY-MM-DD> Relief.xlsx`.
6. Tests: one-day export only; frozen panes; 4 rows per teacher incl. empty and ad hoc; colours; byte-equivalent cell content to the Drive renderer for a fixture day; offline export path.

## Addition (owner 6 Nov): "excel export no [draft] no [published]"
Today roster-update/public/roster-export.js (line ~211) appends status tags to relief cell labels: " [Published]", " [Completed]" (draft shows nothing there, but other export paths may show "[Draft]").
7. Remove status tags from every Excel export and the Drive daily workbook: no "[Draft]", "[Published]" or "[Completed]" in any cell. Keep content tags that describe the duty itself: "[Combined]", "[Repurposed recess duty]". Status, where needed, goes in the sheet's status line only (e.g. "Published 07:04, revision 2" or "Draft — not yet published").
8. Test: no cell matches /\[(Draft|Published|Completed)\]/i in a fixture export with draft, published and completed relief; Combined/Repurposed tags still present.


## Codex claim, 6 November 2026

Owner/model: Codex. Reviewer: Claude. Branch: codex/roster-assign-relief-export-day. Base: e59372a1143489116a680f6299a0b48f99418f61 (PR #91). Scope: selected-day Assign Relief workbook through the canonical Drive renderer, offline local snapshot, consistent status-tag removal across Excel paths, tests and generated copies. This follows the owner continuation instruction and LANES order. No live Drive writes, messages, deployment or merge.

