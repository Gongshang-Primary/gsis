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
