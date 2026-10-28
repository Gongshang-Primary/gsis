# GSiS v0.8.0 capabilities

GSiS connects staff records, deployment planning, the school calendar, campus venues and daily relief work. It is a set of school applications with shared identity and data contracts. It is not a replacement for EduPage's timetable construction engine. A timetable imported into Roster remains a school-supplied baseline.

This document describes the release's implemented application paths. Installed code, configured service and successful live operation are different states. The release validation record states what was tested locally. Live Google permissions, provider approval, delivery and peak-user response time still need operational checks.

## Contacts

Contacts holds stable Staff IDs, names, employment and subject modifiers, contact aliases, mobile numbers, roles and active state. It supplies role groups and current application authority to other GSiS services. Admin and KP application access are managed separately from a person's staff role.

The application supports controlled staff edits, calculated display names, role and option catalogues, self-service fields, access management and recovery of uncertain saves. Version planning in Deploy does not silently overwrite Contacts. Approved publication and explicit Contacts workflows own those changes.

Ad hoc relief can use an eligible known inactive person for a selected date. A new contact uses the fast entry path with basic name, mandatory mobile and default SRE modifier. A provisional custom modifier can avoid a TTb name clash. Duplicate TTb names or mobile numbers require reuse or resolution, not a second identity. Admin completes the provisional person's full details later. Known contacts retain their effective employment modifier.

## Deploy

Deploy holds independent planning versions and their validity, publication and audit history. An authorised planner starts with the latest saved unpublished draft when one exists; otherwise the current in-force version is shown. An explicit version choice is retained. Ordinary readers see the authorised published view.

Planners assign teachers to classes, teaching groups, organisations and venues. The suite provides ledger, workload, statistics and layout views, plus programme and HR settings. Subject Type is configurable as Class, TG or both. Version-owned reporting, membership and workload rules are separated from the live Contacts directory.

Workload and R are calculated from the version's stored school rules, teaching and other load, offload and employment data. The whole-week-v5 calculation applies any configured weekly teaching-cap headroom before rounding and exporting R. The R API exports the source version and values needed by Roster; Roster checks them against the active timetable and its own dated use. The Deploy manual explains the formula and the meaning of each term. Do not treat an old exported number as an unchanging entitlement.

Save operations use narrow field changes, stored receipts, revisions and recovery journals. The system retains drafts when a save needs review. Concurrent editors can cause a conflict; the product is designed to expose that conflict, not quietly choose the last arriving request.

## Layout

Layout provides a public campus and venue view, search and current approved class or TG venue allocations. Authorised users can perform controlled unit edits. Venue metadata comes from the venue register; deployment allocations belong to Deploy, not the drawing.

The public display is a view of published school data. It is not a permission bypass to staff records. A pending unit rename can require explicit resume before further deployment writes. The application does not claim emergency-route certification or automatic shortest-route navigation.

## Calendar

Calendar maintains school years, terms and weeks, lanes, tags, events, notes and publication state. It can sync approved content to staff and parent Google calendars and produce its existing calendar outputs. Its current backend supplies verified single-date and multi-date context to Roster.

The date service establishes whether a date is a released school day and supplies the school-week context. Roster must not infer that from the computer's weekday alone. Google Calendar sync is explicit and uses its own mutation and recovery state; updating a calendar record in the app is not evidence that an external calendar has already synced.

## Roster

| Function | Capability and operating boundary |
| --- | --- |
| Baseline upload | Admin imports supported timetable formats, resolves detected lesson clashes, previews names and periods and saves validity dates and timing. Original workbook and validated model are retained. |
| Timetable | Immediate valid baseline with an inline published-day check; complete published suspended-day teacher/class/TG views and matching PDF/Excel. Immutable baseline and dated publication caches remain separate; fresh online authority and source checks remain. |
| Check Availability | Local name lookup, cell display and highlighting from the loaded model; current server checks still control final assignment. |
| Report Absence | Direct own-absence entry with visible Start/End dates, timed individual periods, Select All/Clear, reasons and instructions; unrelated new reports can save against the latest state without a stale global revision conflict. Requested SL, MK, Support, SAT, OSO and AE categories are excluded from new reports. |
| Own arrangements | Select an affected lesson and choose a colleague's same-period blank cell for relief or a compatible existing lesson for Combine; save validates current state. |
| Manage my absences / Manage school-wide absences | Personal and SMC/Admin views of dated records, details, edits and removal under role and time rules, with retained audit. |
| Assign Relief | Current demand, suitability tiers, manual assignment, Combine, Clear assignment and No relief required. Immediate local feedback with ordered atomic background draft batches, exact retry and conflict review. |
| Daily Notify | SMC/Admin day publication, bulk/affected/individual notices and teacher summaries. |
| Auto-allocate | Fills eligible unassigned future periods without overwriting protected work. Scheduled rebalancing is separately controlled. |
| System Config | SMC/Admin read access, Admin-only changes to subject exclusions, shared coverage, six independently toggleable allocation preferences, daily/consecutive caps, scheduled allocation and Allow advance publishing. |
| Calculations | Authenticated teacher’s own weekly workload, relief quota and recorded cumulative completed percentage; lazy load with plain explanations and source/history availability. |
| Duty SMC roster | Named current/upcoming duty lists, inclusive dates, edit, Activate today and delete. Overlap is rejected. Membership remains restricted to eligible active SMC members. |
| Recess Regression | Creates dated supervision demand from actual classes and baseline recess settings; virtual demand rows are not staff accounts. |
| Daily Updates | Absence and relief-load views for teachers; recipients/settings restricted to SMC and Admin; dated email report after publication. |
| WhatsApp Readiness | SMC/Admin view of route sending and approval state, kept distinct from actual delivery. |
| WhatsApp Inbox | Mobile-friendly conversations, private voice-note playback, human replies, assignment and handled state for all SMC/Admin. New-message alerts go only to current duty SMC. |
| Acknowledgements | Recipient-specific published duties and instructions; explicit acknowledgement history. |

System Config is read-only for SMC and editable for Admin. Baseline upload requires Admin. This does not make every baseline management action Admin-only: existing SMC permissions for supported metadata, activation, prune and restore are retained. Normal teachers can view the authorised Daily Updates pages, including absence reasons as requested by the school. Only Admin and SMC can change its settings or send reports.

Changed subject exclusions apply to newly reported absences. Existing absence records retain the exclusion policy captured with their report, including unpublished records. Retrospective recalculation of existing demand is not enabled by changing System Config; that policy remains a separate decision.

New absence reports are validated against the latest document within the shared write lock. Overlapping reports still conflict, and existing-record edits keep strict revision checks. Report Absence first opens a review without writing. Instructions remain visible after review, and No relief instructions sits beside the instruction section’s Absence date selector. The bottom Submit absence writes the reviewed report; Own arrangements is available after saving. The instruction choice does not disable relief or carry over to another teacher. An uncertain save keeps its exact retry and pauses changes to the report identity.

### Personal entry and navigation

Home follows the requested 20-function order. Its first eight are Report Absence, Manage my absences, Assign Relief, Daily Notify, Manage school-wide absences, Manage Ad-hoc relief, Stapler and WhatsApp Inbox. The divider follows this group before Check Availability. Role filtering retains order without empty tiles. Four desktop columns become a narrower grid on phones.

Report Absence opens the teacher’s own report from Home or the #reportAbsence deep link, preserved through sign-in. Start/End dates and individual period buttons with times are directly visible. Periods begin unselected, with Select All and Clear available. The date range is one atomic command. Existing reason, date eligibility, allowed-period, overlap, instructions and exact-request retry rules remain. Start and End dates sit beside each other where space permits. The first button, I'm not available in these selected periods, reveals the dated lesson/instruction review without writing. No relief instructions changes only local state and preserves entered text. Submit absence at the bottom is the final write; Own arrangements requires a saved absence.

Calculations loads on demand for the server-resolved signed-in teacher and the current applicable published Deploy source. It shows weekly W_i and R from whole-week-v5, without halving or doubling for odd/even weeks. The formula includes recorded work, role offload allowance and preparation/marking; R uses the weekly budget balance, timetable share and any configured teaching cap before rounding down.

The personal completed percentage divides recorded completed relief costs through today by recorded accumulated weekly entitlement through the current week. Pending or future assignments do not count as done. Excluded weeks contribute zero. The page states the history range and gaps; it does not invent missing weekly entitlements. Unverified history, an unrecorded current week or a zero denominator shows Unavailable. A result above 100% is allowed. Invalid or missing workload source shows Unavailable rather than zero. No selector permits another teacher’s data, and stale responses cannot reappear after leaving the page or signing out.

### Shared subject coverage

The default enabled Form rule combines a shared lesson with a present timetabled co-teacher. Admin can switch it off or choose further subjects from the baseline list. Grouping requires the same date, period, subject and one known venue, with at least two distinct teachers. Unknown or multiple venues stay separate. Each absent teacher's lesson and instructions remain part of the grouped record.

A report can create the Combine immediately as a draft, with no additional R cost for the present teacher. If all suitable co-teachers are absent or unavailable, Auto-allocate sees one group vacancy. Explicit individual manual decisions and accepted own arrangements remain protected. Daily publication and notification are still separate actions.

### Duty lists

A named duty list applies automatically over its inclusive start and end dates. Activate today changes its start to today; it does not change its end. Current/future lists cannot overlap. Edits and deletion preserve past daily duty membership. Existing daily records remain available through compatible legacy lists; pruning retains a list while any unpruned daily membership still references it.

### Automatic relief priorities

Coverage and hard eligibility remain mandatory. The six default preferences are lower annual cumulative R utilisation, fewer alternative relief periods, more weekly R remaining, rotation order, same teaching level and same teaching subject, in that order. Each has an independent on/off toggle. The one-time v0.7.16 migration moves same subject to the lowest priority while retaining the relative order of the other rules. Later custom order is preserved. Switching off retains the rule’s settings and position. Admin saves the order and toggles; manual Auto-allocate and scheduled allocation use the same policy. Manual suggestions separately sort eligible internal teachers by remaining weekly R descending, then timetable fit and fairness; special candidate categories retain their meaning.

Enabled automatic-allocation limits are strict: 9 total periods per teacher per day and 6 consecutive periods by default. Each limit has an independent toggle and retained numeric value. Missing settings receive these defaults; existing saved values are not reset. Count distinct effective lessons, relief and invigilation, including a confirmed suspended timetable. Other duties block availability but do not count towards these two caps. Existing protected work is retained. Coverage can remain incomplete if no teacher meets the enabled limits.

Annual utilisation uses recorded relief and entitlement history, not a fortnight reset. When no annual history exists, counting starts at zero; no Admin verification gate applies. Existing history is retained; a failed read is still an error. Explicit pruning also removes the associated accounting records. Published, completed, manual and mutually arranged assignments remain protected as specified by their workflows. The solver is bounded; an incomplete search is not described as a proven optimum.

### Stapler

Offline JSON imports the selected day’s final placed timetable. Represented teachers receive a whole day replacement including blanks. Teachers entirely missing from the JSON retain baseline and default present; separately saved online absences still apply. Name resolution offers Contacts names outside SLs, MK and OSO, including eligible contacts absent from the baseline. Ambiguous matches still need explicit selection. Each unresolved name has its own Add new contact action. It pre-fills the source name, selects the returned canonical identity in that same row and preserves the other mappings. The existing Contacts permissions and approval workflow remain. Save retains a draft before Confirm. Offline absence labels, saved coverage and swap/drop annotations are imported as the final timetable overlay; they do not replay online attendance, relief credit or notifications. Unverified or exceeded workload caps on eligible imported placements remain visible warnings without blocking the retained import. New online work still obeys its configured rules.

Suspended Timeable Advance PLannER begins with a list of suspension dates and sponsorship controls. A returning user sees the last verified same-session list while it refreshes. New mutations wait for current metadata; recovery of an immutable uncertain request stays available. Its narrow Contacts response contains only the caller and eligible sponsors after fresh authority checks. Its workspace links teacher and class views to a card pit. The baseline remains the comparison point. Changed tiles, transfers, suspension markers and recess cards represent dated modifications without rewriting the stored usual timetable.

Successful Save or Confirm stores a validation proof tied to the plan content, date, baseline, record revision and validation-rule version. Reopening a compatible saved plan uses its canonical day without reconstructing the baseline or repeating whole-plan structural checks. Ordinary card edits validate changed cards and affected occupancy. Catalogue, timing or source changes require full validation. Legacy plans receive a full check on read and persist proof on the next successful Save/Confirm. Reads do not write, and a release-number change alone does not invalidate proof. Corrupt or mismatched proof is an error, never a silent baseline replacement. Current identity, Calendar, permission, lease, revision and operational checks still apply.

Plans begin as drafts. Confirm makes the latest saved plan ready for allocation, including future dates. The confirmed plan remains editable after its next editor acquires the dated lock. Allocation uses its latest saved confirmed version. Daily publication is a separate action. A teacher can request date-specific sponsorship from SMC; the permitted planner can save the corresponding plan. One teacher cannot hold overlapping effective teaching tiles for the same time. Relief applies over the effective timetable. A teacher's published page compares the modified day with the baseline by aligned periods.

Only one browser session can edit a planning date at a time. The date list shows the current editor. Save keeps the lock; successful Confirm releases it. The active workspace renews its 180-second lease every 45 seconds. Closing or leaving the workspace stops renewal. Other sessions remain read-only until expiry or Admin release of an abandoned session. Lost renewal pauses edits while retaining local changes.

The workspace supports an uncapped lower resize handle, an adjustable middle split, compact wrapping tiles, ad-hoc classes and teacher tiles with custom or existing field values. Same-level normal recess cards form a movable vertical block with adjacent-period swaps; recess blocks stay within their class rows, while lesson tiles can be returned to Card Pit. Export Excel uses the offline Stapler workbook style.

Future dates can be drafted and confirmed for allocation. Publication defaults to the current Singapore school workday verified by Calendar. Admin can enable Allow advance publishing, initially Off, to permit future Publish Only with the normal school-date/source checks. Future Publish & Notify remains unavailable; the setting does not send early notices or schedule publication. Turning it off does not retract an already published future day. Same-day republication keeps its existing notification policy. Deploy version publication is a separate workflow.

### Daily employment email

The selected recipients can receive both their recorded CES and gsps.edu.sg addresses, with duplicate addresses removed. Default delivery time is 08:00 Singapore. A date published before the due time waits until then; first publication after it is due immediately. No publication means no automatic or manual report. Later republication does not automatically resend the daily report; Admin/SMC can explicitly send for a chosen published date.

The report includes dated ad hoc employment, relief health, absent teachers and reasons, and relief staff load and annual cumulative R%. Past reports and resends use the original stored report snapshot. If it is unavailable, the system must say so instead of reconstructing a different past from today's records. Google mail permission and available quota are required.

## WhatsApp

The release contains routes for mutual relief requests and changes, contact review, assigned and updated duties, reminders, unacknowledged and urgent duties, duty-SMC reports, capacity/manual-review alerts, urgent text forwarding, conditional lesson instructions, timetable changes and sponsorship requests/outcomes.

All applicable routes still need their global sending switch, enabled route mapping, complete provider configuration and exact approved Utility template. The later supplied diag4 log on 18 October 2026 reported all 21 contracts Approved, enabled and connection-ready. That diagnostic did not test message delivery. The user subsequently reported successful 05:45 WhatsApp delivery on 19 October 2026, Singapore time; this is an operator observation, not a new send by this build. Runtime approval and contract checks still apply. Evening v1 remains the selected approved evening contract; v2 need not be deleted.

The inbound contact menu starts with Report Absence, which opens the configured current relief service, initially [the current relief portal](https://roster.diveanalytics.com/). This link does not submit or copy an absence into GSiS. School Layout, device tools, office details and Urgent Message remain available. Its menu switch is separate from Inbox ingestion. External relief links are recipient, purpose and date scoped and support acknowledgement without a Google sign-in. They do not expose the schoolwide roster as a public list.

The Inbox captures new verified webhook events; it does not recover historical messages that were not captured. It retains incoming text and voice-note metadata separately from timetable operations. Private R2 storage supplies authorised audio playback. Human replies queue for the minute Worker and record who replied and when. Ordinary replies require a current 24-hour customer-message window; otherwise the user selects an approved supported template. Assignment records responsibility without hiding the conversation from other SMC/Admin.

Inbox activation needs matching backend, Pages and scheduled Worker code, school sender credentials, template-account access and the private audio binding. Optional WhatsApp new-message alerts also need the dedicated approved template and enabled flag. No eligible duty team means no fallback to all staff. The packaged Inbox is configuration-ready, not live verified. This package does not establish live activation, successful ingestion, private audio access or delivery.

Delivery callbacks, a read receipt and an acknowledgement are different events. An uncertain provider send is held for reconciliation rather than blindly retried. The separate activation guide lists the exact Pages and notification Worker settings, diagnostics and test sequence. No live settings or messages are changed merely by generating this release.

## What this release does not establish

The package is not evidence of live service configuration or delivery. It does not certify sub-second cold Google reads, guarantee unlimited users, make cross-service writes one transaction, recreate missing historical R data or prove minimum business rule deviation when the preference search reaches its bound. Cached local interactions reuse the loaded baseline; current saves still require authoritative validation.

Features not listed as implemented in the release reconciliation remain queued or outside this build. Read the package's `BUILD_SCOPE_v0.8.0.md` and `RELEASE_SUMMARY.json` for the final build's exact scope and verification limits. Use the setup guide for operations and the Deploy manual for screen-level instructions.


## v0.8.0 update

Stapler date-list reads use a smaller trusted Contacts response and avoid unrelated preparation and repeated metadata scans. The browser retains its last verified same-session list provisionally during refresh. Each unresolved import name has independent existing/add-contact choices, exact returned identity mapping and a retained retry origin that cannot move to another row.

Main Timetable checks for the selected day's published suspended timetable in the background while showing the valid baseline. It reads the complete released schedule, including unchanged teachers and blanks, without requiring Calendar for a compatible published snapshot. It does not expose confirmed or later edited private plans. Later checks retain the last verified same-date view and selection. A failed first check keeps the baseline; a later refresh failure keeps that last verified view, with explicit status and Retry. Recognized offline absence labels become neutral Absent in this schedule-only public view; private reasons and instructions are excluded.

Relief edits appear locally at once while ordered draft batches save in the background. One batch commits atomically; later edits remain queued when it is acknowledged. Uncertain saves keep the same request, conflicts retain choices for explicit review, and session storage supports recovery where available. Publish, exports and leaving the page first resolve pending work. A draft replacement or removal does not alter the teacher's released timetable until republish.

Admin's Allow advance publishing defaults Off. When On, a future verified school date can be released using Publish Only. Future notification modes remain disabled and server-rejected. The setting is durable and does not schedule publication.

The v0.7.19 Class POV export, Absent Teachers and Relief Load summaries remain before Refresh records, alongside the existing full-teacher and relief-arrangement exports. The staged absence form, compact suspended-day own-absence projection, final Offline JSON overlay and save recovery remain. `PERFORMANCE_v0.8.0.md` records work reductions; `VALIDATION.md` records actual checks. Neither establishes production latency or unlimited concurrent-user capacity.

## Retained v0.7.18 update

The date and individual period absence form is restored. The loading path combines profile and compact own-report data when available, defers unused Home requests and shares identical in-flight reads. Current Contacts authority is read with less metadata preparation and repeated directory work. Exact absence receipts provide a smaller acknowledgement-recovery path.

Stapler gains Rename, Change date, Delete and Restore. Rename changes its label while keeping confirmation. Date move and Restore preserve final content but return Draft after current date/baseline checks. Occupied destinations and protected historical publications cannot be overwritten. Deleted content remains archived for supported restoration. These actions retain current permission, revision, lease and exact retry controls.

### Retained v0.7.17 improvements

Home displays **Stapler** as the tile title and **Suspended Timeable Advance PLannER** as its description. The planner heading and internal route remain unchanged.

Saved plans are decompressed with explicit gzip Blob metadata. Opening an existing plan avoids quota and full baseline-cell reads, while Save and Confirm keep their complete checks. Load failures retain the existing date and available diagnostic details. The installed 21 October Revision 1 draft still needs successful readback before the production issue can be considered resolved.

Inbox avoids operations-store reads when duty-alert acknowledgement is not needed and uses the accepted mutation's thread snapshot. Refresh preserves unchanged message rows, reply drafts and playing audio. Reply acceptance remains distinct from dispatch and delivery.

Calculations removes a repeated Deploy-index read. Its explanation uses the teacher's actual values and the configured SIUE preparation allowance. Appointment offload is already included in the weekly quota, so KP status alone adds no separate preference to be assigned last. The weekly formula, history verification and existing allocation policy remain unchanged.


See `CHANGELOG_v0.8.0.md` and `API_CONTRACTS_v0.8.0.md` for the release changes and data contracts. Use `VALIDATION.md` for the actual local checks and their limits.

### Retained operating controls

Name Bridge offers partial search of exact names from all baseline teachers. Save revalidates against the current baseline. Retained names missing from a newer baseline are flagged for review.

Relief Health defaults to showing P1 through P12. Admin can choose other available periods. This affects displayed columns only; whole-day capacity and assignments retain their meanings. Assigned red markers stack from the bottom beside their own teacher's baseline marker. A filled green marker denotes baseline eligibility; a neutral outline is outside that pool or unverified.

Automatic relief excludes SRE and FAJT from P0/P13/P14/P15/P16 by default. Admin can edit employment-period restrictions. Existing timetabled work remains valid. SMC can explicitly override the restriction for one manual assignment with a reason, while all other availability checks remain.

Duty SMC summaries default to 16:00 through 21:30 at half-hour intervals for the next school date, and 05:30/05:45/06:00/06:15/06:29 for the current date. The first evening report and fresh 05:30 report send even with zero absences. Later slots report only effective absence changes since the last successful summary. The scheduled allocation cycle remains separately configured.

Layout extends Block A's exposed and sheltered L2 east surfaces to a straight railing at Block K's west wall, keeps Block K fixed, and shifts the L1 flag area and external stairs by the same amount. The marked narrow hall-frontage strip becomes floor while the larger grass patch remains.

The first configured slot in each summary phase is the fresh report. With defaults, 05:30 always starts a new morning summary even if nothing changed overnight. Moving or removing that first slot changes the start of the fresh morning cycle; an empty phase disables its summaries.

## Retained Roster exports, import and Layout changes

Assign relief provides Export Excel for every teacher in the selected day and Export relief excel for the existing relief arrangements workbook. The full summary uses four rows per teacher in the offline Stapler Module 3 style.

Name Bridge uses one searchable selector and still requires a validated baseline name. Suspended Timeable Advance PLannER uses Import Offline JSON for offline Plan and Relief files. It resolves teacher names, imports the selected day, preserves moved or edited cards and assigned recess work, and requires review of missing or ambiguous identities. The five supplied v3.9/v4.3 plan files are acceptance fixtures; they do not cover every possible Relief or Swap state.

The allocator first maximises valid coverage, then minimises deviation in the saved preference order. Whole arrangements can be changed to improve the result. A bounded preference search is identified as the best match found. An unproved coverage result does not replace the last valid scheduled draft.

The courtyard view removes the marked transverse rail and extends the adjoining rain shelter across the marked section. See the release evidence for visual verification.
