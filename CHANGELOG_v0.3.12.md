# GSiS v0.3.12

## Queued changes implemented

- Removed Deploy background polling, WebSocket connection and editor heartbeats; added explicit freshness messaging. Public Layout continues automatic active-allocation refresh.
- Metadata editors open locally, acquire/check their save resource at submission, and reject stale forms. Cell drafts retain explicit batch Save, conflict records and uncertain-save recovery.
- Level Exclusions supports immediate case-insensitive partial teacher-name filtering without losing hidden drafts.
- Added version-scoped HR Terms to the left of Teachers for KP/Admin, using explicit Save and field-specific conflict reporting.
- All six Teachers HR fields use searchable validated lists, including selectable Appointment Level. Approved custom levels survive Contacts recalculation through a backwards-compatible source column.
- Classes now shows a name/short-name matrix across P1–P6 with selection totals, editable/custom name sets and explicit Save.
- Removed notes from both Summary modes; retained them on Teachers with compact expandable editors.
- Content-based initial widths and Autofit all for dense planning tables; reduced padding while keeping readable type and manual resize/hide controls.
- New planning versions inherit class/TG venues from the selected previous version. Duplicate preserves planning data including teacher assignments, proposals and notes. Rename and Admin-only planning deletion remain available.
- Creation receipts retain the created ID for safe retry after an uncertain response; copies remain independent and the active version cannot be deleted.
- Profile saves fetch required Contacts details once before applying the batch, avoiding a second Contacts read inside the save lock.

## Deployment

Update both Apps Script deployments and all three frontend ZIPs. Existing sheet data and URLs remain. See DEPLOYMENT.md.

## Scope retained

One 3D model, owned by public Layout; current-active-only public allocations; existing geometry corrections; Admin approval for Contacts changes; planner notes private to their version; exclusion warnings do not block assignments.
