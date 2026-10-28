# GSiS v0.7.07

Built from the v0.7.06 deployment source. Commit means deployment-ready files; this build does not create a Git commit or change production.

## Roster interaction and reliability

1. Check Availability uses full-row selection buttons and local timetable highlighting. Selection and filtering do not wait for a server roundtrip. A baseline preview remains explicitly distinguished from current verified availability.
2. Edit Absence opens from the cached record immediately. Background checks preserve entered text; version conflicts retain the draft and require review before retry.
3. Arrange Relief uses click-own-period then click-colleague-in-the-same-column. Blank slots request cover; occupied class slots request Combine. Current permission and availability are checked again on save/acceptance.
4. Daily Absences is a full-page table. Action menus are not clipped by an inner scrolling frame.
5. Assign Relief has three equal-width selected-period actions: same-venue teachers, Clear assignment, No relief required. Relief is the default mode; assignment actions sit in teacher period cells. Venue matching handles individual components.
6. Relief Health uses period bars and a percentage. Missing R remains unknown rather than becoming a false zero-capacity shortage.
7. SMC edits no longer ask for an audit reason on each allocation. The first successful mass publication of each date reviews human changes to automatic allocations and applicable overrides under one reason. Initially empty ordinary assignments and freeing a teacher are exempt. Cancellation or failed publication does not consume the first-publication marker.
8. Loading/saving uses one rotating overlay with stable opacity. Exact request receipts, revision checks and atomic operational writes remain.

## Stapler

1. Home fits four priority icons across for SMC and three for teachers, including a dark-gold outline Stapler icon.
2. Dated Teacher and Class views share one tile model, with a Card Pit, partial-name filters, view toggles and linked scrolling. Moves are local, with undo/redo.
3. Original, edited and transferred cards use blue, green and orange. Original positions retain non-live baseline ghosts. Teacher double-booking is rejected before the entire compound action changes the plan.
4. Suspension asks for a reason and moves affected cards to the Pit. Its grey marker is visual and does not count as a period. Cards can be placed over it.
5. Purple class recess cards use the recess settings of the selected uploaded baseline. Recess dragging shifts adjacent lessons accordion-style. Reset returns recesses to the baseline positions and moves displaced lessons to the Pit. Recess timings are not duplicated in Recess Regression.
6. Plans have separate drafts and published state. Publishing rechecks authority, baseline identity, clashes and traditional-class coverage. A teacher can request a date-specific SMC sponsor; approval does not grant general SMC access.
7. Published daily timetables appear above the aligned usual baseline. Effective changes and relief feed timetable views and accounting. Orange teacher transfers count as relief once. The affected week's R uses the confirmed Deploy calculation parameters and dated workload changes; unknown inputs remain unverified.
8. Legacy Relief states import into a draft against the selected baseline. Ambiguous names/timings or unsupported Swap semantics are rejected rather than silently reinterpreted.
9. Baseline replacement exposes an explicit restart action for a stale draft. The former plan is archived; a fresh draft is not automatically published. Obsolete current/future transfer charges are invalidated while completed history remains.
10. New inactive contacts accept a custom timetable-name modifier, reject duplicate TTb names and retain the existing audited Contacts creation path. Admin review notification intent is retained.

## Baseline import and period timing

Support HTML/MSHTML Excel exports with five-row teachers and genuine .xlsx workbooks with four-row or variable-row teachers, in single-week and Odd/Even layouts. Read file contents rather than trusting the extension. Binary BIFF .xls must be saved as .xlsx first.

Baseline Upload's period timing now has Period 0 start (07:00), minutes per period (30), and end of day (13:30). The last period is read dynamically from the upload. Later imported periods remain present. Baseline Upload remains the single place for level recess selections.

## SMC duty and WhatsApp

SMC Duty Roster has member checkboxes, Select only me and explicit start/end selectors. Membership comes from the date's current in-force Deploy version and is checked against current Contacts authority. Missing in-force data disables saving; it never expands the recipient list. Saved duty windows and membership are checked again before dispatch.

Duty selection restricts SMC duty notices, not teacher notices. New Stapler timetable, sponsor-request and decision templates are prepared but not submitted or approved. Existing approved evening v1 remains selected; v2 is retained. All sending and automation flags remain disabled.

## Retained data and boundaries

Privacy page/assets and previous suite features are retained. Existing service URLs, secrets, ownership and school data remain. No live messages, absence cleanup, timetable publication, Noorfizah change or in-force deployment activation are performed by this build. The separately prepared 2026 in-force draft still needs its own authorised publication.

See VALIDATION.md for measured checks and limitations.
