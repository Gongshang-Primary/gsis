# GSiS v0.5.03

This release follows v0.5.02 after two further reports: staff could not enter Contacts while a save remained Pending, and an Admin still could not complete a save. Blocking the whole directory was a design fault. The screenshot alone does not establish which production Google operation timed out; no exact production root cause is claimed.

Contacts viewing now operates independently of save recovery. New journals retain a verified copy of the complete Contacts, role and validation source from before the save. Staff can sign in and view that copy while the writer is busy or a save awaits recovery. Reads do not take the writer lock, attempt recovery, change the journal or depend on a previously opened browser.

Older pending requests may have no saved source copy. In that case, the directory remains available and identifies the view as legacy; contacts identified as part of the unresolved request are temporarily omitted. A suitable existing backup can provide a fallback when the legacy journal cannot be read safely. If both the legacy journal and every available viewing source are unusable, sign-in remains available with an explicit repair notice and an empty Contacts view. Unknown partial values are not presented as saved data. An unfinished addition stays hidden until confirmed. The original payload, request ID, digest and actor remain intact.

The workspace displays a small viewing notice. Ordinary staff see no Admin recovery panel or private saved request. Admin recovery is a collapsed panel within the workspace. Filtering, copying, export, links and directory Refresh remain usable. Contact edit controls are read only while recovery is pending. Refresh retains local Admin and DIY drafts. Once recovery is confirmed, a fresh editable grid is available again.

The API save path prepares sheet capacity, sheet metadata, range addresses and native fallback ranges before its first durable API write. A new ordinary save then uses two API writes: the original journal with the prior source copy, followed by all contact changes, stable IDs and the Applied marker in one request. Recovery combines its audit fields, contact changes, IDs and Applied in one API request. This Contacts commit does not pass through the shared helper's 100-range batch splitting. Native fallback keeps a separate durable identity stage.

Current access checks, reviewed Admin recovery, optimistic conflicts, immutable retry payloads, receipts and the same writer lock remain. A lost reply can be confirmed from Applied without replaying a completed save. The update does not clear a request merely to restore viewing.

Desktop and mobile columns, staff rank and selected-column ordering, compact table fitting and the 13 px mobile directory font remain. Deploy and Layout keep their existing data ownership and functionality. Write protocol remains 500.

See VALIDATION.md for completed evidence and remaining release gates, PERFORMANCE_v0.5.03.md for call boundaries, and DEPLOYMENT.md for installation. Preparing this release does not publish Apps Script or Cloudflare or complete a live pending request.
