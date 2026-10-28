# GSiS v0.7.15 capabilities

GSiS connects staff records, deployment planning, the school calendar, campus venues and daily relief work. It is a set of school applications with shared identity and data contracts. It is not a replacement for EduPage's timetable construction engine. A timetable imported into Roster remains a school-supplied baseline.

This document describes the release's implemented application paths. Installed code, configured service and successful live operation are different states. The release validation record states what was tested locally. Live Google permissions, provider approval, delivery and peak-user response time still need operational checks.

## Contacts

Contacts holds stable Staff IDs, names, employment and subject modifiers, contact aliases, mobile numbers, roles and active state. It supplies role groups and current application authority to other GSiS services. Admin and KP application access are managed separately from a person's staff role.

The application supports controlled staff edits, calculated display names, role and option catalogues, self-service fields, access management and recovery of uncertain saves. Version planning in Deploy does not silently overwrite Contacts. Approved publication and explicit Contacts workflows own those changes.

Ad hoc relief can use an eligible known inactive person for a selected date. A new contact uses the fast entry path with basic name, mandatory mobile and default SRE modifier. A provisional custom modifier can avoid a TTb name clash. Duplicate TTb names or mobile numbers require reuse or resolution, not a second identity. Admin completes the provisional person's full details later. Known contacts retain their effective employment modifier.

## Deploy

Deploy holds independent planning versions and their validity, publication and audit history. An authorised planner starts with the latest saved unpublished draft when one exists; otherwise the current in-force version is shown. An explicit version choice is retained. Ordinary readers see the authorised published view.

Planners assign teachers to classes, teaching groups, organisations and venues. The suite provides ledger, workload, statistics and layout views, plus programme and HR settings. Subject Type is configurable as Class, TG or both. Version-owned reporting, membership and workload rules are separated from the live Contacts directory.

Workload and R are calculated from the version's stored school rules, teaching and other load, offload and employment data. Employment caps constrain eligible assignments separately; they do not reduce the R value exported by Deploy. The R API exports the source version and values needed by Roster; Roster checks them against the active timetable and its own dated use. The Deploy manual explains the formula and the meaning of each term. Do not treat an old exported number as an unchanging entitlement.

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
| Timetable | Teacher, class and TG views from the selected valid baseline; immutable model cached in memory and IndexedDB under the signed-in account and permission scope. Current date and authority checks remain online. |
| Check Availability | Local name lookup, cell display and highlighting from the loaded model; current server checks still control final assignment. |
| Report Absence | Dated periods, reasons and instructions; unrelated new reports can save against the latest state without a stale global revision conflict. Requested SL, MK, Support, SAT, OSO and AE categories are excluded from new reports. |
| Own arrangements | Select an affected lesson and choose a colleague's same-period blank cell for relief or a compatible existing lesson for Combine; save validates current state. |
| Manage my absences / Manage school-wide absences | Personal and SMC/Admin views of dated records, details, edits and removal under role and time rules, with retained audit. |
| Assign Relief | Current demand, suitability tiers, manual assignment, Combine, clear assignment and No Relief Needed. Green baseline opportunities rise from a common period axis; red assignments sit beside the same teacher. |
| Daily Notify | SMC/Admin day publication, bulk/affected/individual notices and teacher summaries. |
| Auto-allocate | Fills eligible unassigned future periods without overwriting protected work. Scheduled rebalancing is separately controlled. |
| System Config | Admin-only wildcard and exact subject exclusions, resulting excluded-subject list, shared-subject coverage, allocation preferences and scheduled allocation. |
| Duty SMC roster | Named current/upcoming duty lists, inclusive dates, edit, Activate today and delete. Overlap is rejected. Membership remains restricted to eligible active SMC members. |
| Recess Regression | Creates dated supervision demand from actual classes and baseline recess settings; virtual demand rows are not staff accounts. |
| Daily Updates | Absence and relief-load views for teachers; recipients/settings restricted to SMC and Admin; dated email report after publication. |
| WhatsApp Readiness | SMC/Admin view of route sending and approval state, kept distinct from actual delivery. |
| WhatsApp Inbox | Mobile-friendly conversations, private voice-note playback, human replies, assignment and handled state for all SMC/Admin. New-message alerts go only to current duty SMC. |
| Acknowledgements | Recipient-specific published duties and instructions; explicit acknowledgement history. |

System Config and baseline upload require Admin. This does not make every baseline management action Admin-only: existing SMC permissions for supported metadata, activation, prune and restore are retained. Normal teachers can view the authorised Daily Updates pages, including absence reasons as requested by the school. Only Admin and SMC can change its settings or send reports.

Changed subject exclusions apply to newly reported absences. Existing absence records retain the exclusion policy captured with their report, including unpublished records. Retrospective recalculation of existing demand is not enabled by changing System Config; that policy remains a separate decision.

New absence reports are validated against the latest document within the shared write lock. Overlapping reports still conflict, and existing-record edits keep strict revision checks. Report Absence keeps No relief instructions needed in the form and beside Own arrangements after period confirmation; that action submits the current report without instructions and does not disable relief or carry that choice to the next teacher. An uncertain save keeps its exact retry and pauses changes to the report identity.

### Shared subject coverage

The default enabled Form rule combines a shared lesson with a present timetabled co-teacher. Admin can switch it off or choose further subjects from the baseline list. Grouping requires the same date, period, subject and one known venue, with at least two distinct teachers. Unknown or multiple venues stay separate. Each absent teacher's lesson and instructions remain part of the grouped record.

A report can create the Combine immediately as a draft, with no additional R cost for the present teacher. If all suitable co-teachers are absent or unavailable, Auto-allocate sees one group vacancy. Explicit individual manual decisions and accepted own arrangements remain protected. Daily publication and notification are still separate actions.

### Duty lists

A named duty list applies automatically over its inclusive start and end dates. Activate today changes its start to today; it does not change its end. Current/future lists cannot overlap. Edits and deletion preserve past daily duty membership. Existing daily records remain available through compatible legacy lists; pruning retains a list while any unpruned daily membership still references it.

### Automatic relief priorities

Coverage and eligibility constraints remain mandatory. Among eligible options, annual cumulative R utilisation is the default first preference. Other preferences are alternative available periods, weekly R remaining, automatic rotation, same teaching subject and same teaching level. Existing saved priorities are retained, with subject then level appended. Admin can reorder the list; the final allocation must use that saved order as well as candidate ranking. Manual suggestions separately sort eligible internal teachers by remaining weekly R descending, then timetable fit and fairness; special candidate categories retain their meaning.

Annual utilisation uses recorded relief and entitlement history, not a fortnight reset. When no annual history exists, counting starts at zero; no Admin verification gate applies. Existing history is retained; a failed read is still an error. Explicit pruning also removes the associated accounting records. Published, completed, manual and mutually arranged assignments remain protected as specified by their workflows. The solver is bounded; an incomplete search is not described as a proven optimum.

### Stapler

Offline JSON imports the selected day’s final placed timetable. Represented teachers receive a whole day replacement including blanks. Teachers entirely missing from the JSON retain baseline and default present; separately saved online absences still apply. Name matching uses validated TTB names and bridges with explicit resolution for uncertain matches. Save retains a draft before Confirm. Nonempty offline reliefAbsences remain unsupported and are rejected.

Stapler begins with a list of suspension dates and sponsorship controls. Its workspace links teacher and class views to a card pit. The baseline remains the comparison point. Changed tiles, transfers, suspension markers and recess cards represent dated modifications without rewriting the stored usual timetable.

Plans begin as drafts. Confirm makes the latest saved plan ready for allocation, including future dates. The confirmed plan remains editable after its next editor acquires the dated lock. Allocation uses its latest saved confirmed version. Daily publication is a separate action. A teacher can request date-specific sponsorship from SMC; the permitted planner can save the corresponding plan. One teacher cannot hold overlapping effective teaching tiles for the same time. Relief applies over the effective timetable. A teacher's published page compares the modified day with the baseline by aligned periods.

Only one browser session can edit a planning date at a time. The date list shows the current editor. Save keeps the lock; successful Confirm releases it. The active workspace renews its 180-second lease every 45 seconds. Closing or leaving the workspace stops renewal. Other sessions remain read-only until expiry or Admin release of an abandoned session. Lost renewal pauses edits while retaining local changes.

The workspace supports an uncapped lower resize handle, an adjustable middle split, compact wrapping tiles, ad-hoc classes and teacher tiles with custom or existing field values. Same-level normal recess cards form a movable vertical block with adjacent-period swaps; recess blocks stay within their class rows, while lesson tiles can be returned to Card Pit. Export Excel uses the offline Stapler workbook style.

Future dates can be drafted. Publication of relief and Stapler is allowed only on the current Singapore school workday confirmed by Calendar. A scheduler never publishes a draft automatically. Same-day republication updates changed content and suppresses unchanged notices. This restriction does not apply to Deploy's separate version-publication workflow.

### Daily employment email

The selected recipients can receive both their recorded CES and gsps.edu.sg addresses, with duplicate addresses removed. Default delivery time is 08:00 Singapore. A date published before the due time waits until then; first publication after it is due immediately. No publication means no automatic or manual report. Later republication does not automatically resend the daily report; Admin/SMC can explicitly send for a chosen published date.

The report includes dated ad hoc employment, relief health, absent teachers and reasons, and relief staff load and annual cumulative R%. Past reports and resends use the original stored report snapshot. If it is unavailable, the system must say so instead of reconstructing a different past from today's records. Google mail permission and available quota are required.

## WhatsApp

The release contains routes for mutual relief requests and changes, contact review, assigned and updated duties, reminders, unacknowledged and urgent duties, duty-SMC reports, capacity/manual-review alerts, urgent text forwarding, conditional lesson instructions, timetable changes and sponsorship requests/outcomes.

All applicable routes still need their global sending switch, enabled route mapping, complete provider configuration and exact approved Utility template. The later supplied diag4 log on 18 October 2026 reported all 21 contracts Approved, enabled and connection-ready. That diagnostic did not test message delivery. The user subsequently reported successful 05:45 WhatsApp delivery on 19 October 2026, Singapore time; this is an operator observation, not a new send by this build. Runtime approval and contract checks still apply. Evening v1 remains the selected approved evening contract; v2 need not be deleted.

The inbound contact menu starts with Report Absence, which opens the configured current relief service, initially [the current relief portal](https://roster.diveanalytics.com/). This link does not submit or copy an absence into GSiS. School Layout, device tools, office details and Urgent Message remain available. Its menu switch is separate from Inbox ingestion. External relief links are recipient, purpose and date scoped and support acknowledgement without a Google sign-in. They do not expose the schoolwide roster as a public list.

The Inbox retains incoming text and voice-note metadata separately from timetable operations. Private R2 storage supplies authorised audio playback. Human replies queue for the minute Worker and record who replied and when. Ordinary replies require a current 24-hour customer-message window; otherwise the user selects an approved supported template. Assignment records responsibility without hiding the conversation from other SMC/Admin.

Inbox activation needs matching backend, Pages and scheduled Worker code, school sender credentials, template-account access and the private audio binding. Optional WhatsApp new-message alerts also need the dedicated approved template and enabled flag. No eligible duty team means no fallback to all staff. This package does not establish live activation or delivery.

Delivery callbacks, a read receipt and an acknowledgement are different events. An uncertain provider send is held for reconciliation rather than blindly retried. The separate activation guide lists the exact Pages and notification Worker settings, diagnostics and test sequence. No live settings or messages are changed merely by generating this release.

## What this release does not establish

The package is not evidence of live service configuration or delivery. It does not certify sub-second cold Google reads, guarantee unlimited users, make cross-service writes one transaction, recreate missing historical R data or prove minimum business rule deviation when the preference search reaches its bound. Cached local interactions reuse the loaded baseline; current saves still require authoritative validation.

Features not listed as implemented in the release reconciliation remain queued or outside this build. Read the package's `BUILD_SCOPE_v0.7.15.md` and `RELEASE_SUMMARY.json` for the final build's exact scope and verification limits. Use the setup guide for operations and the Deploy manual for screen-level instructions.


## v0.7.15 update

See `CHANGELOG_v0.7.15.md` and `API_CONTRACTS_v0.7.15.md` for the release changes and data contracts. Use `VALIDATION.md` for the actual local checks and their limits.

### v0.7.15 operating controls

Name Bridge offers partial search of exact names from all baseline teachers. Save revalidates against the current baseline. Retained names missing from a newer baseline are flagged for review.

Relief Health defaults to showing P1 through P12. Admin can choose other available periods. This affects displayed columns only; whole-day capacity and assignments retain their meanings. Assigned red markers stack from the bottom beside their own teacher's baseline marker. A filled green marker denotes baseline eligibility; a neutral outline is outside that pool or unverified.

Automatic relief excludes SRE and FAJT from P0/P13/P14/P15/P16 by default. Admin can edit employment-period restrictions. Existing timetabled work remains valid. SMC can explicitly override the restriction for one manual assignment with a reason, while all other availability checks remain.

Duty SMC summaries default to 16:00 through 21:30 at half-hour intervals for the next school date, and 05:30/05:45/06:00/06:15/06:29 for the current date. The first evening report and fresh 05:30 report send even with zero absences. Later slots report only effective absence changes since the last successful summary. The scheduled allocation cycle remains separately configured.

Layout extends Block A's exposed and sheltered L2 east surfaces to a straight railing at Block K's west wall, keeps Block K fixed, and shifts the L1 flag area and external stairs by the same amount. The marked narrow hall-frontage strip becomes floor while the larger grass patch remains.

The first configured slot in each summary phase is the fresh report. With defaults, 05:30 always starts a new morning summary even if nothing changed overnight. Moving or removing that first slot changes the start of the fresh morning cycle; an empty phase disables its summaries.

## v0.7.15 Roster and Layout changes

Assign relief provides Export Excel for every teacher in the selected day and Export relief excel for the existing relief arrangements workbook. The full summary uses four rows per teacher in the offline Stapler Module 3 style.

Name Bridge uses one searchable selector and still requires a validated baseline name. Stapler uses Import Offline JSON for offline Plan and Relief files. It resolves teacher names, imports the selected day, preserves moved or edited cards and assigned recess work, and requires review of missing or ambiguous identities. The five supplied v3.9/v4.3 plan files are acceptance fixtures; they do not cover every possible Relief or Swap state.

The allocator first maximises valid coverage, then minimises deviation in the saved preference order. Whole arrangements can be changed to improve the result. A bounded preference search is identified as the best match found. An unproved coverage result does not replace the last valid scheduled draft.

The courtyard view removes the marked transverse rail and extends the adjoining rain shelter across the marked section. See the release evidence for visual verification.
