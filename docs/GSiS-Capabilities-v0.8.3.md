# GSiS v0.8.3 capabilities

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
| Timetable | Published suspended day first when available, with the recurring baseline visibly below. Shared teacher/class/TG selectors include both sources; top exports use the published day and separate lower exports use the selected baseline. Immutable baseline and dated publication caches remain separate. |
| Check Availability | Local name lookup, cell display and highlighting from the loaded model; current server checks still control final assignment. |
| Report Absence | Direct own-absence entry with visible Start/End dates, timed individual periods, Select All/Clear, reasons and instructions; unrelated new reports can save against the latest state without a stale global revision conflict. Requested SL, MK, Support, SAT, OSO and AE categories are excluded from new reports. |
| Own arrangements | Beside No relief instructions in editable preview/saved headers; saves new/changed reports before opening the chooser. Select an affected lesson and a colleague's same-period blank cell for relief or a compatible lesson for Combine; Submit requests validates current state and submits explicitly. |
| Manage my absences / Manage school-wide absences | Personal and SMC/Admin views of dated records, details, edits and removal under role and time rules, with retained audit. |
| Assign Relief | Current demand, suitability tiers, manual assignment, Combine, Clear assignment and No relief required. Local edits retained until Save to online; cell-by-cell merge results, exact retry and explicit conflict review. SMC choices remain protected from automatic allocation. |
| Daily Notify | SMC/Admin Let teachers see and Send WhatsApp actions, bulk/affected/individual notices, published teacher summaries and acknowledgement indicators. A top-right dashboard counts unique eligible teachers, acknowledged/pending and progress for the selected publication, independent of search or grouping. Inline refresh leaves other functions usable. |
| Auto-allocate | Fills eligible unassigned future periods without overwriting protected work. Scheduled rebalancing is separately controlled. |
| System Config | SMC/Admin read access, Admin-only changes to subject exclusions, shared coverage, six independently toggleable allocation preferences, daily/consecutive caps, scheduled allocation and Allow advance publishing. |
| Calculations | Authenticated teacher’s own weekly workload, relief quota and recorded cumulative completed percentage; lazy load with plain explanations and source/history availability. |
| Duty SMC roster | Named current/upcoming duty lists, inclusive dates, edit, Activate today and delete. Overlap is rejected. Membership remains restricted to eligible active SMC members. |
| Recess Regression | Creates dated supervision demand from actual classes and baseline recess settings; virtual demand rows are not staff accounts. |
| Daily Updates | Ordinary teachers see grouped published Absent teachers and Relief teachers with period, timing, subject, class and venue. No Relief Load, quotas, private reasons or editing controls. SMC/Admin email settings remain separate. |
| WhatsApp Readiness | SMC/Admin view of route sending and approval state, kept distinct from actual delivery. |
| WhatsApp Inbox | Mobile-friendly conversations, private voice-note playback and incoming JPEG/PNG images, human replies, assignment and handled state for all SMC/Admin. New-message alerts go only to current duty SMC. |
| Acknowledgements | Recipient-specific published duties and instructions; explicit acknowledgement history. |

System Config is read-only for SMC and editable for Admin. Baseline upload requires Admin. Existing supported baseline-management permissions remain. Ordinary teachers' Daily Updates reads only captured published schedule facts, never draft allocations, absence reasons, private instructions or workload accounting. Old publications without the new grouped snapshot expose only provable assigned rows until the next explicit publication.

Changed subject exclusions apply to newly reported absences. Existing absence records retain the exclusion policy captured with their report, including unpublished records. Retrospective recalculation of existing demand is not enabled by changing System Config; that policy remains a separate decision.

New absence reports are validated against the latest document within the shared write lock. Overlapping reports still conflict, and existing-record edits keep strict revision checks. Report Absence first opens a review without writing. Instructions remain visible after review, and No relief instructions sits beside the instruction section’s Absence date selector. Clicking No relief instructions changes that choice and immediately saves through the same validated path as the bottom Submit absence action. Entered text is retained, with the existing confirmation when marking entered instructions not applicable. Own arrangements is beside No relief instructions in editable preview and saved instruction headers, with or without written text. It saves a new absence or changed instructions first and opens the chooser only after confirmation; an unchanged saved record opens directly. It retains text and the instruction choice. Cancelling the chooser leaves saved values intact; only Submit requests submits colleague requests. The instruction choice does not disable relief or carry over to another teacher. An uncertain save keeps its exact retry and pauses changes to the report identity.

### Personal entry and navigation

Home follows the requested 20-function order. Its first eight are Report Absence, Manage my absences, Assign Relief, Daily Notify, Manage school-wide absences, Manage Ad-hoc relief, Stapler and WhatsApp Inbox. The divider follows this group before Check Availability. Role filtering retains order without empty tiles. Four desktop columns become a narrower grid on phones.

Report Absence opens the teacher’s own report from Home or the #reportAbsence deep link, preserved through sign-in. Start/End dates and individual period buttons with times are directly visible. Periods begin unselected, with Select All and Clear available. The date range is one atomic command. Existing reason, date eligibility, allowed-period, overlap, instructions and exact-request retry rules remain. Start and End dates sit beside each other where space permits. The first button, I'm not available in these selected periods, reveals the dated lesson/instruction review without writing. No relief instructions immediately saves the reviewed report or saved-record instruction change and preserves entered text. Teachers entering written instructions use Submit absence or Save instructions at the bottom. Own arrangements saves any new absence or changed instructions before opening the colleague chooser, and waits for a confirmed outcome. Recovery can resume the chooser only on the same active report/date. Blank instructions do not silently set No relief instructions or change relief demand.

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

Successful Save to online or Confirm stores a validation proof tied to the plan content, date, baseline, record revision and validation-rule version. Reopening a compatible saved plan uses its canonical day without reconstructing the baseline or repeating whole-plan structural checks. Ordinary card edits validate affected occupancy. Catalogue, timing or source changes require full validation. Legacy plans receive a full check on read and persist proof on the next successful save or confirmation. Reads do not write, and a release-number change alone does not invalidate proof. Current identity, Calendar, permissions and source validation remain authoritative.

Plans begin as local drafts. Save to online uploads the retained original and local plan; Confirm marks a saved plan ready for allocation. For an already confirmed plan, later saved changes update planning inputs, while the teacher-facing Confirmed preview remains frozen until Confirm is used again. Active mapped eligible teaching staff can view frozen confirmed timetables for today and future dates without sponsorship or needing a lesson in the selected plan; editing still requires SMC/Admin authority or date-specific approved sponsorship. Let teachers see separately releases the day's arrangements and does not send a message by itself.

The normal teacher sees a **Confirmed suspensions** table with Date and Plan columns. Plan contains the name, Confirmed revision and **View confirmed timetable**, keeping the action visible on a narrow screen. Authorised delegates retain **Open planner**. **Request planning access** is collapsed unless the teacher has an existing planning date or pending request. The helper points to **Timetable** on the main screen for the published daily timetable. Ordinary preview access excludes past and unconfirmed plans. Imported absence reasons are neutralised throughout the read-only current, baseline and provenance cells; stored SMC records remain unchanged. Browsing writes nothing.

Multiple authorised planners can work on the same date. Local edits do not require an exclusive editor lease. Save to online compares original, local and current online values, merges compatible independent changes and preserves conflicting choices for review. Legacy lock metadata and recovery endpoints remain for compatible older clients; they are not the v0.8.3 editing workflow. An uncertain save keeps its original request identity for confirmation.

The workspace supports an uncapped lower resize handle, an adjustable middle split, compact wrapping tiles, ad-hoc classes and teacher tiles with custom or existing field values. Class view has inline Subject, Venue and Group fields with separate apply arrows. Each arrow changes only its field on current lesson tiles linked to the class, including Card Pit; shared tiles change once, while baseline comparison tiles and recess stay unchanged. Blank or invalid values make no plan change. One successful apply is one Undo step and remains local until Save to online. Ordinary teacher confirmed views have no editing controls. Same-level normal recess cards form a movable vertical block with adjacent-period swaps; recess blocks stay within their class rows, while lesson tiles can be returned to Card Pit. Export Excel uses the offline Stapler workbook style.

Future dates can be drafted and confirmed for allocation. Let teachers see defaults to a verified current Singapore school day; Admin can enable Allow advance publishing for verified future dates. Once a day has been published, its eligible teachers can be notified immediately, including individual and bulk sends for that future day. Explicit Send WhatsApp bypasses quiet hours; automatic notices keep their own schedules. Switching advance publishing off does not retract an existing future publication. Deploy version publication is a separate workflow.

### Daily employment email

The selected recipients can receive both their recorded CES and gsps.edu.sg addresses, with duplicate addresses removed. Saving recipients, subject and send time does not send email. Settings-specific comparison permits unrelated allocation/acknowledgement changes while rejecting competing settings edits; uncertain saves retain their exact request across same-user, same-tab reloads when storage is available, with Check saved settings for recovery and a warning when only memory retention is possible. Default delivery time is 08:00 Singapore. A date published before the due time waits until then; first publication after it is due immediately. No publication means no automatic or manual report. Later republication does not automatically resend the daily report; Admin/SMC can explicitly send for a chosen published date.

The report includes dated ad hoc employment, relief health, absent teachers and reasons, and relief staff load and annual cumulative R%. Past reports and resends use the original stored report snapshot. If it is unavailable, the system must say so instead of reconstructing a different past from today's records. Google mail permission and available quota are required.

## WhatsApp

The release contains routes for mutual relief requests and changes, contact review, assigned and updated duties, reminders, unacknowledged and urgent duties, duty-SMC reports, capacity/manual-review alerts, urgent text forwarding, conditional lesson instructions, timetable changes and sponsorship requests/outcomes.

All applicable routes still need their global sending switch, enabled route mapping, complete provider configuration and exact approved Utility template. The later supplied diag4 log on 18 October 2026 reported all 21 contracts Approved, enabled and connection-ready. That diagnostic did not test message delivery. The user subsequently reported successful 05:45 WhatsApp delivery on 19 October 2026, Singapore time; this is an operator observation, not a new send by this build. Runtime approval and contract checks still apply. Evening v1 remains the selected approved evening contract; v2 need not be deleted.

The inbound contact menu starts with Report Absence, which opens the configured current relief service, initially [the current relief portal](https://roster.diveanalytics.com/). This link does not submit or copy an absence into GSiS. School Layout, device tools, office details and Urgent Message remain available. Its menu switch is separate from Inbox ingestion. External relief links are recipient, purpose and date scoped and support acknowledgement without a Google sign-in. They do not expose the schoolwide roster as a public list.

The Inbox captures new verified webhook events; it does not recover historical messages that were not captured. It retains incoming text, voice-note and image metadata separately from timetable operations. A private R2 bucket supplies authorised voice playback and JPEG/PNG image viewing. Invalid or unavailable media remains visibly unavailable without discarding the message. Human replies queue for the minute Worker and record who replied and when. Ordinary replies require a current 24-hour customer-message window; otherwise the user selects an approved supported template. Assignment records responsibility without hiding the conversation from other SMC/Admin.

Inbox activation needs matching backend, Pages and scheduled Worker code, school sender credentials, template-account access and the private media binding. Optional WhatsApp new-message alerts also need the dedicated approved template and enabled flag. No eligible duty team means no fallback to all staff. The package is configuration-ready; live ingestion, image/audio access and delivery require installed-service checks. Faster refresh and preserved message rows are locally verified improvements, not a guarantee of provider latency.

Delivery callbacks, a read receipt and an acknowledgement are different events. An uncertain provider send is held for reconciliation rather than blindly retried. The separate activation guide lists the exact Pages and notification Worker settings, diagnostics and test sequence. No live settings or messages are changed merely by generating this release.

## What this release does not establish

The package is not evidence of live service configuration or delivery. It does not certify sub-second cold Google reads, guarantee unlimited users, make cross-service writes one transaction, recreate missing historical R data or prove minimum business rule deviation when the preference search reaches its bound. Cached local interactions reuse the loaded baseline; current saves still require authoritative validation.

Features not listed as implemented in the release reconciliation remain queued or outside this build. Read the package's `BUILD_SCOPE_v0.8.3.md` and `RELEASE_SUMMARY.json` for the final build's exact scope and verification limits. Use the setup guide for operations and the Deploy manual for screen-level instructions.


## v0.8.3 update

Save to online, Let teachers see and Send WhatsApp are separate steps. Assign Relief and Stapler retain manual edits locally until Save to online. The accepted save shows the cell changes; independent concurrent changes can merge, while a conflicting choice is retained for comparison. Let teachers see uses saved online arrangements only. Send WhatsApp uses the published timetable and eligible recipients, including a correction when an earlier notice showed a timetable that has now returned to baseline. A teacher whose timetable equals baseline and has no outstanding correction is not notified. Teachers absent for the full school day are excluded from timetable WhatsApp and the acknowledgement population. For partial absences, only changed timetable content or a correction owed during periods they are present qualifies; absent-only changes do not. Saved online absences are checked again before queued dispatch; this narrows notification relevance without changing the released timetable.

The notification Worker dispatches notices, Inbox replies and allocation-audit exports independently of allocation work. Tomorrow's drafting does not by itself invalidate today's publication. Expensive planning preparation runs outside the final shared commit lock; current permissions, sources, workload limits and conflict checks remain. SMC can replace a published allocation or a period that has already started without an audit-approval block. Such a change does not claim that the new teacher actually performed historical relief; completion accounting remains separate.

Manual Assign Relief choices, including a clear or No relief required, belong to SMC. Automatic allocation and shared-lesson reconciliation preserve them. Return to automatic explicitly releases that ownership. If later attendance or timetable changes make an SMC choice invalid, the system indicates the problem instead of silently replacing it. Employment-period exceptions and other manual warnings are recorded without a second approval click; real availability, structural and employment-cap constraints still apply.

### Retained v0.8.0 improvements

Stapler date-list reads use a smaller trusted Contacts response and avoid unrelated preparation and repeated metadata scans. The browser retains its last verified same-session list provisionally during refresh. Each unresolved import name has independent existing/add-contact choices, exact returned identity mapping and a retained retry origin that cannot move to another row.

Main Timetable shows the selected day's published suspended timetable first when available, with the recurring baseline visibly below, including odd/even weeks when applicable. Shared teacher/class/TG selectors include names from either source, with an explicit empty state for a missing counterpart. Top exports use the published day; separate lower PDF/Excel exports use the selected baseline. The valid baseline remains available during the initial inline publication check. The published section reads the complete released schedule, including unchanged teachers and blanks, without requiring Calendar for a compatible published snapshot. It does not expose confirmed or later edited private plans. Later checks retain the last verified same-date view and selection. A failed first check keeps the baseline; a later refresh failure keeps that last verified view, with explicit status and Retry. Recognized offline absence labels become neutral Absent in this schedule-only public view; private reasons and instructions are excluded.

Relief edits appear locally at once and remain there until Save to online. Each accepted batch commits atomically; later local edits remain pending. Uncertain saves retain their original request, conflicts retain choices for explicit comparison, and browser storage supports recovery where available. Exports use local data without saving. A replacement or removal changes the teacher-visible timetable only after Let teachers see.

Admin's Allow advance publishing defaults Off. When On, a verified future date can be released with Let teachers see. A published future day is eligible for explicit individual or bulk Send WhatsApp; the setting does not automatically publish or schedule a send.

The v0.7.19 Class POV export, Absent Teachers and Relief Load summaries remain before Refresh records, alongside the existing full-teacher and relief-arrangement exports. The staged absence form, compact suspended-day own-absence projection, final Offline JSON overlay and save recovery remain. `PERFORMANCE_v0.8.3.md` records work reductions; `VALIDATION.md` records actual checks. Neither establishes production latency or unlimited concurrent-user capacity.

## Retained v0.7.18 update

The date and individual period absence form is restored. The loading path combines profile and compact own-report data when available, defers unused Home requests and shares identical in-flight reads. Current Contacts authority is read with less metadata preparation and repeated directory work. Exact absence receipts provide a smaller acknowledgement-recovery path.

Stapler gains Rename, Change date, Delete and Restore. Rename changes its label while keeping confirmation. Date move and Restore preserve final content but return Draft after current date/baseline checks. Occupied destinations and protected historical publications cannot be overwritten. Deleted content remains archived for supported restoration. These actions retain current permission, source, revision and exact retry controls.

### Retained v0.7.17 improvements

Home displays **Stapler** as the tile title and **Suspended Timeable Advance PLannER** as its description. The planner heading and internal route remain unchanged.

Saved plans are decompressed with explicit gzip Blob metadata. Opening an existing plan avoids quota and full baseline-cell reads, while Save and Confirm keep their complete checks. Load failures retain the existing date and available diagnostic details. The installed 21 October Revision 1 draft still needs successful readback before the production issue can be considered resolved.

Inbox avoids operations-store reads when duty-alert acknowledgement is not needed and uses the accepted mutation's thread snapshot. Refresh preserves unchanged message rows, reply drafts and playing audio. Reply acceptance remains distinct from dispatch and delivery.

Calculations removes a repeated Deploy-index read. Its explanation uses the teacher's actual values and the configured SIUE preparation allowance. Appointment offload is already included in the weekly quota, so KP status alone adds no separate preference to be assigned last. The weekly formula, history verification and existing allocation policy remain unchanged.


See `CHANGELOG_v0.8.3.md` and `API_CONTRACTS_v0.8.3.md` for the release changes and data contracts. Use `VALIDATION.md` for the actual local checks and their limits.

### Retained operating controls

Name Bridge offers partial search of exact names from all baseline teachers. Save revalidates against the current baseline. Retained names missing from a newer baseline are flagged for review.

Relief Health defaults to showing P1 through P12. Admin can choose other available periods. This affects displayed columns only; whole-day capacity and assignments retain their meanings. Assigned red markers stack from the bottom beside their own teacher's baseline marker. A filled green marker denotes baseline eligibility; a neutral outline is outside that pool or unverified.

Automatic relief excludes SRE and FAJT from P0/P13/P14/P15/P16 by default. Admin can edit employment-period restrictions. Existing timetabled work remains valid. An explicit SMC assignment can override that employment-period preference; the warning is recorded and all other availability checks remain.

Duty SMC summaries default to 16:00 through 21:30 at half-hour intervals for the next school date, and 05:30/05:45/06:00/06:15/06:29 for the current date. The first evening report and fresh 05:30 report send even with zero absences. Later slots report only effective absence changes since the last successful summary. The scheduled allocation cycle remains separately configured.

Layout extends Block A's exposed and sheltered L2 east surfaces to a straight railing at Block K's west wall, keeps Block K fixed, and shifts the L1 flag area and external stairs by the same amount. The marked narrow hall-frontage strip becomes floor while the larger grass patch remains.

The first configured slot in each summary phase is the fresh report. With defaults, 05:30 always starts a new morning summary even if nothing changed overnight. Moving or removing that first slot changes the start of the fresh morning cycle; an empty phase disables its summaries.

## Retained Roster exports, import and Layout changes

Assign relief provides Export Excel for every teacher in the selected day and Export relief excel for the existing relief arrangements workbook. The full summary uses four rows per teacher in the offline Stapler Module 3 style.

Name Bridge uses one searchable selector and still requires a validated baseline name. Suspended Timeable Advance PLannER uses Import Offline JSON for offline Plan and Relief files. It resolves teacher names, imports the selected day, preserves moved or edited cards and assigned recess work, and requires review of missing or ambiguous identities. The five supplied v3.9/v4.3 plan files are acceptance fixtures; they do not cover every possible Relief or Swap state.

The allocator first maximises valid coverage, then minimises deviation in the saved preference order. Whole arrangements can be changed to improve the result. A bounded preference search is identified as the best match found. An unproved coverage result does not replace the last valid scheduled draft.

The courtyard view removes the marked transverse rail and extends the adjoining rain shelter across the marked section. See the release evidence for visual verification.


## Portable contact file

The **add** column immediately before **TTb Name** contains an unboxed text **+** with horizontal touch padding. Clicking produces one `.vcf` locally from the selected loaded directory row. The name fields are Prefix `GSPS`, First Name equal to the entire TTb Name and Last Name equal to the entire Statutory Name. Available mobile and work email fields are included, with internal extensions kept as labelled notes.

School sign-in is still needed to load the authorised directory. Export requires no People API, extra Contacts permission or new request after loading. Open the file in the device contact app and review it before saving. GSiS cannot confirm the native save, and repeated imports may create duplicates. The file is a copy rather than a sync. See [Contact-file export](GOOGLE_CONTACTS_SETUP.md) for the fallback and Android/iPhone import guidance. Actual native-device handoff remains an installation check.

## Private timetable and acknowledgement

A recipient-scoped private link needs no Google sign-in and can be opened repeatedly for seven days from its original issuance. Opening or acknowledging does not consume it or restart its expiry. It shows the latest publication for that teacher/date. The acknowledgement action is on the first line, and only an explicit confirmed acknowledgement marks the current notice acknowledged. Daily Notify shows a filled acknowledgement pill and a grey pending state; WhatsApp delivery/read receipts are separate.

The latest recorded Meta check on 21 October 2026 still showed `gsis_timetable_updated_button_v2` as PENDING. The prepared contract supplies **View Detail** and **Acknowledge** URL buttons. The second button opens the acknowledgement action; it does not silently acknowledge on navigation. The default activation mapping retains the existing approved in-text URL template until the new exact body, language and buttons have Meta approval and are deliberately selected.

## Local exports and allocation trail

Assign Relief's Excel exports use the selected day's loaded data and current local edits. They work without an online-save or fresh network-verification prerequisite; exporting neither saves nor publishes. The file may therefore differ from the current online or teacher-visible plan.

Accepted automatic-allocation evidence and SMC online changes are captured with the operations transaction. The separate Worker maintains one human-readable text file per school day under the configured Roster root: `Allocation Audit/YYYY/MM/YYYY-MM-DD.txt`, with structured evidence in the month's `Evidence` subfolder. Text export retries independently of allocation saves. Confirmed archive/export watermarks permit older captured facts to leave the working document without deleting the durable trail. No live Drive export is established by a package build.
