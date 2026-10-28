# GSiS v0.3.13 — queued changes

- Contacts Data renamed Edit Info; new Sys Fields, Membership and Offload pages with Admin-write / KP-read permissions enforced by Apps Script.
- DIY update restricted to the signed-in user's stable staff record, including safe identity binding across GSPS alias edits.
- In-cell validated selectors, explicit saves, conflict checks and retry journals for Contacts management tables.
- Contact list split visibility/filter buttons, month-only Birthday filtering, duplicate iCON Alias removed; default columns preserved.
- Removed Contacts idle polling. Bounded read retries and visible recovery controls replace indefinitely stuck login loading.
- Deploy HR choices use Contacts Sys Fields. Teachers edit directly in cells with separate conflict tracking per field.
- Classes have equal-width blank/HA/MA/LA selectors, inactive when unchecked. IP Deploy displays coloured ability badges; values are version-scoped.
- Public and Deploy 2D layouts share the accurate vector renderer and palette. Public remains active-only; Deploy retains current/planned versions.
- Layout viewport navigation aligned beside login. 3D remains exclusive to Layout.
- Latest Block B L2 rails/parapet/rain-cover edits and Block G lift solid-wall correction incorporated.
- Recalculate migrates remaining formulas to values; known calculations run in Apps Script. Unknown live-workbook formulas require a separate business-logic review (see DEPLOYMENT.md).

Package built locally. No live backend, school sheet or website was changed. Full suite packaging includes all three frontend ZIPs, both Apps Script backends, source/tests and Markdown instructions.
