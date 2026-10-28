# GSiS v0.7.19

Baseline: tagged v0.7.018e at `30558e7`, including all v0.7.018a–e patches over the full v0.7.18 suite. The user authorised implementation and commit on 20 October 2026, Singapore time. Preparing the release does not deploy it or change school records.

## Assign Relief tools

The first action row retains **Publish & Notify**, **Publish Only**, **Export Excel** and **Export relief excel**. The second row places **Export Class POV**, **Absent Teachers** and **Relief Load** immediately before **Refresh records**. Buttons have matching 40-pixel desktop and 44-pixel touch heights.

Export Class POV downloads an XLSX of the complete effective dated class timetable on ordinary and suspended days. It includes teachers, subject, venue and group, with current online relief substitutions and uncovered/no-relief status. It is not limited to classes listed as suspension targets. Existing full-teacher and relief-arrangement exports retain their separate scopes.

Absent Teachers shows the selected day's absence and cover summary, respecting partial-day absence and zero required lessons. Relief Load shows each covering teacher's current online assignment count, periods and absent teachers covered. It is separate from historical annual relief usage. Both dialogs are read-only; exports and summaries do not publish or send messages.

## Suspended import identities

Name resolution draws from Contacts, excluding SLs, MK and OSO by recorded category. Eligible contacts do not need a recurring baseline row. Existing identity links remain useful, but ambiguous names require explicit resolution and imported names are not silently mapped by similarity.

Missing contacts can be added through the existing permitted Contacts workflow, including approval where required. Refreshing the resolver preserves the imported draft and completed mappings. An accepted contact remains the same canonical identity through Save, Confirm, reopening, summaries, Excel and dated availability. The recurring baseline is not rewritten to accommodate a dated participant.

## Responsiveness and save recovery

Confirmed suspended-day absence verification uses a compact projection of the selected teacher instead of reconstructing every teacher. Weekly suspended-workload accounting is omitted when no applicable cap needs it. Roster configuration values are prepared once per execution, reducing repeated property reads from twelve to four, including the date-list path. This does not cache authority across requests.

Eligible unpublished draft Clear assignment and No relief required edits use the existing atomic cell command and source guard. When actual cover is removed or changed, the accepted result appears before a separate authoritative budget refresh; no-relief marker-only changes do not need that extra read. Selection and period browsing remain available while further mutations wait for fresh budgets. A failed refresh retries the read, preserving the accepted mutation. Special cover, recess demand and actual-cover changes on a date with a recorded capacity-warning episode retain the full pipeline, including warning recovery tracking.

`PERFORMANCE_v0.7.19.md` records these work reductions and their local evidence; `VALIDATION.md` records the checks actually run.

Clear assignment leaves the lesson requiring cover; No relief required removes its demand. Related changes retain the existing atomic persistence boundary and current-state validation. Pending commands retain their identity through slow or lost responses. Same-plan edits must not overwrite each other, and retries must not duplicate assignments or side effects. Atomicity does not itself guarantee low latency, and this release makes no unmeasured production response-time claim.

## Integrated surgical patches

- **v0.7.018a:** selected-day final offline Relief overlay, including saved absence labels, covering placements and swap/drop annotations; Assign Relief readability improvements.
- **v0.7.018b:** imported-draft preservation across upstream service/signature failures, scoped signing/encoding hardening and exact recovery after uncertain saves.
- **v0.7.018c:** visible workload warnings for eligible imported original-owner placements without blocking their Save/Confirm; new online work retains its configured limits.
- **v0.7.018d:** no-write absence review, visible instructions and the final submit at the bottom; Own arrangements after a saved absence exists.
- **v0.7.018e:** compact Start/End dates and No relief instructions beside the instruction section's Absence date selector.

An imported teacher's whole day replaces baseline, including blanks. Teachers entirely missing from the JSON retain baseline and default presence, subject to separately saved online absences. Offline overlays do not replay online absence reports, relief accounting or notifications. Current authority, signatures, revisions, date leases, structural validity and protected publication history remain enforced.

## Installation and remaining live checks

From v0.7.018e, update the complete Deploy backend on its existing web app first, then upload the Roster frontend. The existing v0.7.18 Contacts backend remains compatible. The complete suite is optional. Keep URLs, secrets, operational stores, private media binding, cron and active settings; see `DEPLOYMENT.md`.

The existing 21 October Revision 1 draft and uncertain baseline save/switch remain installed readback cases. Keep their data and original request identities. Local verification cannot close those live incidents or establish the original signature failure's production cause. No production deployment, data reset, timetable publication or staff message is part of this release preparation.
