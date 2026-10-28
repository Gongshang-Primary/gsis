# GSiS v0.7.00

Full suite release based on v0.6.09. Existing Contacts, Deploy, Layout, Roster and Calendar applications retain their storage and deployment identities.

## Roster operations

Report Absence and Manage reported absences appear together above the home divider. Reporting stores distinct submissions, rejects overlapping staff periods, retains the actual reporting actor and permits SMC proxy entry. Today and upcoming entries are editable; past records remain view only. Absence types include the requested initial order, period restrictions and Singapore-time LSE gate.

Relief instructions follow a confirmed absence on the same page. Adjacent periods of the same lesson share an instruction field. The selected-date Not Applicable control does not remove relief demand. Teaching, Form and Duty require cover; PD, BLK and IMP remain occupied but do not create cover demand.

My Relief Duties shows each person's published Today, Upcoming and Past duties. SMC Absences by Date adds school-wide management, column filters and multiple deletion with a selected count. SMC relief planning distinguishes unresolved demand, explicit no-relief decisions, drafts, published assignments and mutually arranged cover. Availability checks include timetable occupancy, absences, existing cover and dated external availability. R is advisory, with unknown values preserved.

Teachers can request partial cover from available colleagues. Approval confirms mutual cover without SMC approval; rejection requires a reason. SMC sees its mutual status and must confirm an override. Publication queues the relevant change notices. Valid mutual cover contributes to R accounting once, and cancellation or reassignment removes the previous allocation.

Manage Ad-hoc relief maintains a date-specific pool from active and inactive Contacts. Adding a new person creates an inactive Contact with name/mobile duplicate checks. Employment and availability overrides apply to that day. Permanent profile corrections remain subject to Contacts Admin review. Admin can manage absence types and prune a confirmed past range.

## Timetables and loading

Teacher, Class, TG and Export subpages share the last-period preference and field-aware PDF/Excel projections. Class TG lessons hide teacher names by default, with an explicit toggle. Primary assignment headings remain bold in both exports. Check availability uses partial-text teacher selection, chips and per-period available-name badges.

Roster retains current or next-upcoming model preparation. Fresh Contacts authority reads are batched; immutable model reuse avoids repeated transfer across dates. Access decisions remain fresh and failed authority checks do not retain old permission.

## Workload and notifications

IMP means Instructional Mentoring Programme and contributes once to non-teaching workload without teaching SIUE. Missing workload remains unknown. Existing Calendar publication and API synchronization are retained.

WhatsApp integration includes a durable notification lifecycle, approved-template sender, verified delivery callbacks, private expiring recipient links and a deployable scheduled dispatcher. Sending is disabled until the school supplies and configures its sender, credentials and templates. No live message or Meta asset was created by this build.

## Deliberate defaults and limits

LSE is restricted to today, after 11:15 Singapore, for periods starting at 11:30 or later. Pruning is past-only. Overlapping absence periods are rejected; separate non-overlapping submissions are retained. These conservative defaults resolve the remaining unspecified cases without changing past records.

The reconstructed 2026 T4 publication is not installed by this release. Noorfizah's missing timetable/load remains unresolved. Suspended timetable planning and timetable swaps are excluded. Local validation does not establish production delivery, school-network latency or final printer/Excel rendering.
