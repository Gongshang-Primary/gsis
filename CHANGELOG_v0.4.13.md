# GSiS v0.4.13

Authorized by “commit” on 29 September 2026 at 13:03 Singapore.

- Q87: Export the displayed 2D layout to an editable Excel worksheet in both Deploy Layout and the public Layout viewport. The supplied workbook determines the spatial format: block headings, room merges, borders, stair details, colours and portrait printing. Current room names, unit IDs, form classes and TGs replace historical data. No source formulas or external dependencies are carried over. Renamed venues use their geometry code; unmatched/ambiguous venues remain visible below the map. Rows grow for current text. PDF export remains available.
- Q90: IP Deploy retains the edited cell's position after teacher/venue picker collapse. A logical class/TG and subject anchor survives rerendering and venue regrouping. If necessary, the cell moves toward horizontal centre and the upper third, within sticky-column/header and scroll limits. Focus follows the replacement control. New input, navigation or user scroll cancels stale restoration.
- All suite labels are v0.4.13. Deploy frontend/backend protocol is 413. Contacts preparation alias `prepareContactsPerformance413()` delegates to the existing preparation routine.

No workload formula, backend save semantics, membership, deployment publication, 2D/3D geometry or production data is changed. This is a committed source/package release, not a live installation. Earlier live follow-up checks remain open.
