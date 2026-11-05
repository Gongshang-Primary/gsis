# stapler-add-tile-teacher-search: type-to-search teacher picker in Stapler "Add teacher tile"

- Status: assigned to **Muse** (owner 6 Nov ~01:30: "include in-place partial text search for selecting teacher. let muse work on this"); owner exception to lane R for this UI-only task (roster-update/public/roster-stapler-ui.js and its CSS/tests), disjoint from Codex's current lane R files.
- Reviewer/model: Claude

## Today
Stapler (inside Roster) → Add teacher tile: the Teacher field is a native <select> with the whole staff list in an arbitrary order (roster-update/public/roster-stapler-ui.js, `addCard` about line 497). Finding a teacher means scrolling.

## Required (production-class)
1. Replace it with the **existing** accessible teacher combobox already used in Roster (`teacherPicker` in roster-update/public/roster-operations-ui.js, "Search teachers…"; also `combobox` in roster.js). Reuse or extract a shared helper; do not write a third picker.
2. In-place partial search: typing any part of the name filters as you type (case-, accent- and spacing-insensitive), matching the display name, the timetable name and bracket tags such as "(MTL)", "(FAJT)", "(Art)". Results sorted alphabetically; best matches (prefix) first.
3. Keyboard and screen reader: ARIA combobox pattern, Up/Down, Enter selects, Esc closes, Tab moves on; visible focus; clear "No teacher matches" state; works on touch screens.
4. Same option set as today (active teachers plus ad hoc/added teachers the current list contains); selection value unchanged (staff id), so saving tiles behaves exactly as before.
5. Tests: filter by partial text ("wati" finds Suriawati (FAJT)); tag search ("MTL"); keyboard select; no-match; saved tile carries the same staffId as before; Chromium check of the dialog.
6. Scope: Stapler UI only. No allocator, D1 or backend changes. If needed, stop and ask Claude.
