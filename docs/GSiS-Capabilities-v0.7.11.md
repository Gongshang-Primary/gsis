# GSiS v0.7.11 capabilities

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
| Timetable | Teacher, class and TG views from the selected valid baseline; full model cached in the signed-in session. |
| Check Availability | Local name lookup, cell display and highlighting from the loaded model; current server checks still control final assignment. |
| Report Absence | Dated periods, absence reason and lesson instructions, with the school's configured constraints. |
| Own arrangements | Select an affected lesson and choose a colleague's same-period blank cell for relief or a compatible existing lesson for Combine; save validates current state. |
| Manage reported absences | Dated list, details, edits and removal under role and time rules, with retained audit. |
| Assign Relief | Current absence demand, health, suitability tiers, manual assignment, Combine, clear assignment and No Relief Required. |
| Daily Notify | SMC/Admin day publication, bulk/affected/individual notices and teacher summaries. |
| Auto-allocate | Fills eligible unassigned future periods without overwriting protected work. Scheduled rebalancing is separately controlled. |
| System Config | Admin-only subject exclusions with literal/wildcard matching, allocation preference order and scheduled-allocation control. |
| Duty SMC roster | Inclusive start/end dates chosen from eligible teacher SMC members, excluding SLs, AMs and OMs. |
| Recess Regression | Creates dated supervision demand from actual classes and baseline recess settings; virtual demand rows are not staff accounts. |
| Daily Updates | Absence and relief-load views for teachers; recipients/settings restricted to SMC and Admin; dated email report after publication. |
| WhatsApp Readiness | SMC view of route sending and approval state, kept distinct from actual delivery. |
| Acknowledgements | Recipient-specific published duties and instructions; explicit acknowledgement history. |

System Config and baseline upload require Admin. This does not make every baseline management action Admin-only: existing SMC permissions for supported metadata, activation, prune and restore are retained. Normal teachers can view the authorised Daily Updates pages, including absence reasons as requested by the school. Only Admin and SMC can change its settings or send reports.

Changed subject exclusions apply to newly reported absences. Existing absence records retain the exclusion policy captured with their report, including unpublished records. Retrospective recalculation of existing demand is not enabled by changing System Config; that policy remains a separate decision.

### Automatic relief priorities

Coverage and eligibility constraints remain mandatory. Among eligible options, annual cumulative R utilisation is the default first preference. Other preferences are alternative available periods, weekly R remaining and automatic rotation. Admin can reorder the list; the final allocation must use that saved order as well as candidate ranking. Manual candidate tiers remain a separate presentation.

Annual utilisation uses recorded relief and entitlement history, not a fortnight reset. When no annual history exists, counting starts at zero; no Admin verification gate applies. Existing history is retained; a failed read is still an error. Explicit pruning also removes the associated accounting records. Published, completed, manual and mutually arranged assignments remain protected as specified by their workflows. The solver is bounded; an incomplete search is not described as a proven optimum.

### Stapler

Stapler begins with a list of suspension dates and sponsorship controls. Its workspace links teacher and class views to a card pit. The baseline remains the comparison point. Changed tiles, transfers, suspension markers and recess cards represent dated modifications without rewriting the stored usual timetable.

Plans begin as drafts. Confirm makes the latest saved plan ready for allocation, including future dates. The confirmed plan remains editable. Daily publication is a separate action. A teacher can request date-specific sponsorship from SMC; the permitted planner can save the corresponding plan. One teacher cannot hold overlapping effective teaching tiles for the same time. Relief applies over the effective timetable. A teacher's published page compares the modified day with the baseline by aligned periods.

Future dates can be drafted. Publication of relief and Stapler is allowed only on the current Singapore school workday confirmed by Calendar. A scheduler never publishes a draft automatically. Same-day republication updates changed content and suppresses unchanged notices. This restriction does not apply to Deploy's separate version-publication workflow.

### Daily employment email

The selected recipients can receive both their recorded CES and gsps.edu.sg addresses, with duplicate addresses removed. Default delivery time is 08:00 Singapore. A date published before the due time waits until then; first publication after it is due immediately. No publication means no automatic or manual report. Later republication does not automatically resend the daily report; Admin/SMC can explicitly send for a chosen published date.

The report includes dated ad hoc employment, relief health, absent teachers and reasons, and relief staff load and annual cumulative R%. Past reports and resends use the original stored report snapshot. If it is unavailable, the system must say so instead of reconstructing a different past from today's records. Google mail permission and available quota are required.

## WhatsApp

The release contains routes for mutual relief requests and changes, contact review, assigned and updated duties, reminders, unacknowledged and urgent duties, duty-SMC reports, capacity/manual-review alerts, urgent text forwarding, conditional lesson instructions, timetable changes and sponsorship requests/outcomes.

All applicable routes still need their global sending switch, enabled route mapping, complete provider configuration and exact approved Utility template. The later supplied diag4 log on 18 October 2026 reported all 21 contracts Approved, enabled and connection-ready. It explicitly did not test message delivery. Runtime approval and contract checks still apply. Evening v1 remains the selected approved evening contract; v2 need not be deleted.

The inbound contact menu can provide school Layout and device-tool links, office contact details and the supported urgent-message flow. Its menu switch is separate. External relief links are recipient, purpose and date scoped and support acknowledgement without a Google sign-in. They do not expose the schoolwide roster as a public list.

Delivery callbacks, a read receipt and an acknowledgement are different events. An uncertain provider send is held for reconciliation rather than blindly retried. The separate activation guide lists the exact Pages and notification Worker settings, diagnostics and test sequence. No live settings or messages are changed merely by generating this release.

## What this release does not establish

The package is not evidence of live service configuration or delivery. It does not certify sub-second cold Google reads, guarantee unlimited users, make cross-service writes one transaction, recreate missing historical R data or prove global allocation optimality. Cached local interactions are fast after the relevant baseline loads; current saves still require authoritative validation.

Features not listed as implemented in the release reconciliation remain queued or outside this build. Read the package's `PROJECT_RECONCILIATION_v0.7.11.md` and `RELEASE_SUMMARY.json` for the final build's exact scope and verification limits. Use the setup guide for operations and the Deploy manual for screen-level instructions.


## v0.7.11 update

See CHANGELOG_v0.7.11.md for Confirm, daily publication/notification, name bridges, eligibility and zero-start annual history. Baseline architecture diagrams describe v0.7.10 topology; v0.7.11 schema additions are in API_CONTRACTS_v0.7.11.md.
