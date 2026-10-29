# roster-excel-relief-for-absent: relief cells name the absent teacher in the subject

- Status: proposed (changelog entry; Codex builds after owner go)
- Owner/model: Codex
- Reviewer/model: Claude
- Last updated (Asia/Singapore): 30 Oct 2026 06:00
- Branch: codex/roster-excel-relief-for-absent
- Base SHA: current main
- PR: none
- User-authorised scope: Song Wee, 30 Oct 2026: "roster excel export: the cells that teacher receive for relief duty should include (for <absent teacher>) in subject eg Art (for Nisha)".
- Files/domains owned: roster-update/public/roster-stapler-export.js, roster-update/public/roster-operations-ui.js (export snapshot), the export-context projection in shared/roster-operations.js if names are missing, generated copies, export tests.
- Out of scope: WhatsApp text, on-screen timetable.

## Required
In every Roster Excel export, a relief teacher's cell reads `<Subject> (for <absent teacher>)`, e.g. `Art (for Nisha)`. A combined class lists every absent teacher once: `Art (for Nisha, Wei Ling)`. Existing tags stay after it ([Combined], [Published], [Completed], [Repurposed recess duty]).

## Current behaviour (source reading)
- All-teacher workbook ("Export Excel" → `makeReliefWorkbook`): `roster-stapler-export.js` ~line 131 already builds `(a.subject||'Relief')+(absentName?' (for '+absentName+')':'')`, with `absentName = a.absentName || members' names`. If the cell shows no name, the export snapshot's assignment lacks `absentName` and `members` names: fix the projection (fall back to the absence record's staff name), not the label.
- Daily relief list ("Export relief excel" → `RosterExport.dailyRelief`) and Class POV workbook (`makeClassWorkbook`, ~line 207): check and apply the same label where a relief teacher's subject is shown.
- Owner to confirm which button showed the missing name.

## Acceptance
- Test fixture: relief for an absent teacher with and without `absentName` on the assignment; every export shows `Art (for Nisha)`.
- Combined class: names listed once, comma separated.
- No other cell text changes.
