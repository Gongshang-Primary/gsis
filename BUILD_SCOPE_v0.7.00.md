# GSiS v0.7.00 build scope

Decision checkpoint: 14 October 2026, 10:44 Singapore time.

The user has authorised a full suite build and commit as **v0.7.00**, with Ponytail and Pstack review, after remaining material questions are resolved. This document records requirements only. It does not claim that the release, WhatsApp integration, reconstructed 2026 publication or live installation exists.

## Authority and scope

The user's written UI/UX instructions and supplied screenshots take precedence over STAPLER. Use STAPLER Module 3 as a source of suitable relief business logic. Do not copy its overall workspace or local storage model. **Suspended timetable planning is excluded from v0.7.00.**

Use Singapore dates and times throughout. Display dates as **14 Oct 2026 (Wed)**. Contacts remains authoritative for staff identity, current contact details and SMC/Admin permissions. Roster owns dated absences, operational availability, relief planning, mutual arrangements and publication state.

The previous released baseline is v0.6.09, commit `243a337082f492a61d1bccf02e6af612ee8f0a06`. Existing drafts must be integrated and reviewed, not treated as already released. Preserve the full suite and the 2027 planning version.

## Home functions and access

| Function | Access and placement |
| --- | --- |
| Report Absence | All signed-in staff; red icon in the existing native icon style. |
| Manage reported absences | All signed-in staff for their own records; blue icon beside Report Absence in the first row. |
| Divider | Below that first row, followed by the remaining functions. |
| My Relief Duties | All signed-in staff; blue calendar icon, using the supplied reference. |
| Absences by Date | SMC only, with server-enforced permission checks. |
| Manage Ad-hoc relief | SMC only; maintain the date-specific external relief pool. |
| Manage Absence Type | Contacts Admin only, under Admin settings. |
| Prune records | Contacts Admin only; always the last function at the bottom. |

SMC and Admin are separate authorities. Do not grant SMC-only pages merely because the user is Admin. The employment modifier may be changed by SMC/Admin within their permitted workflow; this does not automatically make the SMC-only home function visible to Admin-only users.

## Absence reporting

Teachers can report their own absences. **SMC may also submit an absence on another teacher's behalf**, confirmed at 10:44. Preserve both the absent staff identity and the reporting actor.

Follow the form reference: teacher, start/end date and relief-required context; then absence type and a horizontal period selector. Each period tile shows its number and start/end times. Select every unavailable period, including free periods. Unselected periods remain eligible for assignment if all other availability rules permit it.

Use the complete imported period range. The timetable viewer/export last-period preference must not truncate absence selection, availability, clashes or relief demand.

Each deliberate submission remains a separate record, including repeated submissions on the same day. Check overlaps by staff, date and period. The save implementation must distinguish a new deliberate submission from a retry of an uncertain save, so retries do not duplicate records.

Absence, whether relief is needed, instruction status, workload and assigned cover are separate facts. An absence with no teaching periods still makes the person unavailable for the selected periods.

### Types and timing rules

Initial type order:

1. Sick Leave (w/ MC)
2. Sick Leave (w/o MC)
3. Leave School Early (LSE)
4. Leave School in Between (LSB)
5. Time Off
6. CCL (w/ MC)
7. CCL (w/o MC)
8. PCL / FCL
9. Hospitalisation Leave
10. Reservist
11. UPA
12. NPL
13. Maternity / Paternity Leave
14. Marriage Leave
15. Compassionate Leave

Admin can add/remove types, change display order with a vertical drag/drop list, and configure business rules. Use the same horizontal period selector to manage permitted periods; show crosses on prohibited periods. Retain historical labels for existing entries when a type is removed.

| Type/rule | Confirmed behaviour |
| --- | --- |
| LSE submission gate | Available daily only after 11:15 Singapore time. |
| LSE period range | 11:30–12:00 and every later applicable period; normally P9 onward. |
| LSE date scope | The 10:44 answer restates the daily time gate; it does not expressly settle whether the selected absence date must be today. Do not infer that future-date LSE is authorised. |
| LSB range | P0 through P11 only; exclude P12 onward. |
| Select All | Not available for Time Off, LSB or LSE. |

Enforce these rules on the backend as well as in controls.

### Relief instructions

After **Log absence** succeeds, remain on the same page. Below the horizontal selector, put the absence date selectors and **Relief Instructions Not Applicable** on the same row.

The chosen date shows a vertical table: **Period and time**; **Subject or TG / class / venue**; **Relief instructions**. Vertically merge the instruction field for consecutive periods of the same lesson identity. Do not merge unrelated lessons merely because subject labels match.

Above the instruction column, remind staff that an external relief teacher may lack Shared Drive access and printing facilities. For softcopy material, include a URL with visibility allowing anyone with the link to view it. Do not change file permissions automatically.

Confirmed at 10:44: **teaching, Form and Duty periods require cover; PD, BLK and IMP do not.** This is separate from workload treatment: **IMP remains countable non-teaching work**. An occupied PD/BLK/IMP slot is not a free slot for that teacher to cover someone else.

Keep the existing full-day relief principle: a relevant lesson after 13:30 is not excluded solely because of its time.

## Manage reported absences

Use the supplied table reference, limited to the signed-in teacher's own submitted entries. Retain Download Excel, sorting, alternating row shading, entry count, pagination and the row action menu. Show dates in the requested full date format and timestamps in Singapore time.

Today and upcoming entries allow View, Edit and Delete. Past entries are greyed out but readable and viewable; they cannot be edited or deleted through this function. View includes relief instructions. Keep individual submissions separate.

The prior conversation proposed the personal columns Date, Absent Periods, Reason, Remarks, Reported At and Action, omitting repeated personal identity. Because SMC proxy reporting is now authorised, do not discard Reported By from the stored record; show it where the actual submitter differs or in entry details. Its exact personal-table placement is an implementation choice, not a new confirmed omission rule.

## Absences by Date

SMC can view school-wide absences for a selected date, defaulting to today. Use the screenshot's **Absent Teachers** and **Relief Assignments** tabs and table styling. Retain Date, Absentee, Absent Periods, Reason, Remarks, Reported By, Reported At and Action where relevant, plus sorting, pagination, counts and Download Excel.

The user corrected the initial view-only proposal: SMC may **view, edit and delete today's and upcoming entries**. **Past entries remain view only**, including for SMC on this page.

Add partial text filtering to each data column and row checkboxes for multiple deletion. Past entries cannot be selected for deletion. The proposed selection control is **Select all matching entries** across filtered pages, with a visible selected count and confirmation before **Delete selected**. Filtering alone must not select or delete entries. Revalidate date restrictions and authority when a deletion request is submitted.

## My Relief Duties

Each person sees their own published assignments only:

1. **Today** at the top, with period/time, class or TG, venue and instructions.
2. **Upcoming** published assignments, explicitly confirmed at 10:44.
3. **Past** assignments, newest first, as viewable records.

Show an explicit empty state when no relief is assigned today. Never expose future planned but unpublished backend assignments. Apply publication and ownership filtering in backend responses, not only in the browser.

The user approved private, expiring links for external SRE teachers who lack a school Google account. Such access must be limited to that recipient's duties and instructions. Link expiry and renewal duration are not yet specified.

## Colleagues' mutual relief arrangements

Above the relief instructions, add **I have made own arrangements with colleagues**. Open the absent teacher's timetable for the selected date and, below it, the other teachers' timetables with a partial-text-filterable name list.

The reporting teacher selects an affected lesson and a colleague's free period on that date. They need not cover all periods before submission. On submission, queue an immediate WhatsApp request to each identified colleague asking them to approve or reject; rejection requires a reason.

Track Pending, Approved and Rejected requests. Pending is not confirmed cover. Recheck the selected colleague's actual availability on submission and approval. A stale or conflicting request must not create an assignment.

**A colleague's approval confirms the arrangement without SMC approval.** Mark the assignment **Mutually arranged** in SMC's view. It must remain distinguishable from a draft plan and from an ordinary SMC assignment.

SMC can override a mutual arrangement only after a confirmation prompt. On publication of that change, send WhatsApp notices to both the absent teacher and the covering colleague. If the covering colleague changes, the notification implementation must avoid leaving the displaced colleague with stale instructions; the exact recipient expansion is a design detail to resolve explicitly.

Mutually arranged relief counts towards the covering colleague's **R** at the same rate as other assigned relief. Count a period once. Cancellation or reassignment must remove the original colleague's corresponding allocation rather than double-count it.

## Manage Ad-hoc relief

Maintain a day-curated list of external relief teachers, allowing SMC to pre-plan future dates. Source the picker from active and inactive Contacts, using **TTb name and mobile number** as the displayed personal details; retain the stable Contacts identity internally.

Day activation must not change a person's Contacts active/inactive status. Steady-state operation should let SMC pick a known inactive external relief teacher rather than repeatedly add the same person.

| Item | Confirmed behaviour |
| --- | --- |
| Employment modifier | Default SRE, changeable by SMC/Admin. |
| Modifier scope | An operational change applies to that day only. |
| Permanent correction | Send Admin a WhatsApp request to review/confirm in Contacts; Contacts then supplies the authoritative profile for future selections. |
| Availability | Default whole day; permit selected available periods. |
| New person | SMC creates a new inactive Contacts record directly. This is an explicit narrow exception to the normal Contacts Admin approval workflow. |
| Duplicate checks | Use normalised mobile numbers and fuzzy name matching across active and inactive Contacts. Show likely matches; do not silently merge people. |
| Assignment clashes | Check Contacts identity and mobile number so duplicate records cannot enable double booking. |

Keep operational date availability in Roster and permanent contact/profile data in Contacts. The new-contact form should stay minimal; do not request unrelated profile data merely because the Contacts schema contains it.

Admin confirmation must not silently rewrite historical daily relief records. What a shared or recycled mobile number means must be reviewed when a suspected duplicate is presented; an empty mobile must not make every mobile-less person the same identity.

## Relief planning and R

Confirmed at 10:44: **R is a fairness target, not a hard assignment limit.** Warn when a proposed assignment exceeds the target; do not block an otherwise valid assignment for that reason alone.

Use actual published Deploy workload data and the current effective timetable for each date. Do not treat a missing teacher timetable or missing R as zero workload or unlimited free capacity. Distinguish quota, assigned relief and remaining advisory capacity.

### Suitable STAPLER Module 3 logic to adapt

The user's instruction permits importing appropriate logic; the following are implementation directions, not authority to copy every STAPLER rule or screen:

1. Enforce one teacher, one place, one period against timetable occupancy, absences, other cover and external availability.
2. Evaluate a partial-day absence at the target period rather than excluding its teacher for the entire day.
3. Keep each absence entry separate while combining its unavailable periods for eligibility.
4. Keep unresolved, assigned and explicitly no-relief-required demand distinct; zero demand does not erase the absence.
5. Rank available candidates using relevant ad hoc availability, current load, surrounding free periods, consecutive periods and relief already assigned; expose understandable reasons.
6. Reconcile a planned assignment when its lesson, covering teacher's availability or source timetable changes; preserve unaffected assignments and return invalidated cover to unresolved with a reason.
7. Never resurrect an invalidated assignment merely because an earlier conflict disappears.
8. Derive summaries from valid assignment records so totals cannot drift from the plan.

STAPLER's exact tier thresholds, its preference for ad hoc staff, the 35th-percentile split and six-consecutive-period warning are source reference logic to assess against GSiS policy and R. They have not separately been accepted as mandatory school policy.

Do not import STAPLER's **Swap** implementation, which drops the covering teacher's original lesson, without a separate safe lesson-coverage design. Suspended timetable planning is excluded. Do not import its local-only name identity model or combined IMP “no workload, no relief” rule. IMP affects workload in GSiS even though it does not itself require relief cover.

## WhatsApp scope

The user wants real individual staff notices as part of the v0.7.00 build. Confirmed workflow triggers are:

| Trigger | Recipient and purpose |
| --- | --- |
| Submit mutual relief request | Selected colleague, immediately requesting approval or rejection with reason. |
| Publish SMC override of mutual arrangement | Absent teacher and covering colleague, describing the changed published arrangement. |
| Proposed permanent external-teacher profile/modifier correction | Admin, linking to Contacts for confirmation. |

Other previously discussed uses, including generic relief publication notices, absence confirmation, missing-instruction reminders, duties, calendar changes and daily summaries, were brainstorming options. Do not silently make all of them enabled production triggers.

Use an auditable notification queue with recipient-specific content and duplicate-send protection. Runtime sending must work from the deployed backend; the MCP is a setup/management aid and is not itself the production notification worker. Approval actions must resolve to the intended recipient and live request state.

The user is unsure why the Business API needs a number. The school sending identity/number, connected WhatsApp developer app, production token, approved templates, webhook setup and selected Admin recipients remain unresolved. Earlier conversation reported a connector result of “No developer app connected”; this document does not independently verify the present connector or business configuration. Do not describe live sending as ready until setup is verified.

No live messages are sent by this scope document. Build and test isolated notification paths before enabling production sends.

## Carry forward into the full suite

### Q225: timetable fields and TG view

Add field toggles next to **Last period to show** for Teacher, Class and TG views. Hide teachers' names by default for TG lessons in the Class view, with a toggle to restore them; preserve ordinary class lesson names and all stored data. Add **TG** before Export, giving **Teacher → Class → TG → Export**, with Teacher as the default.

Preserve the persistent last-period setting and matching PDF/Excel layout already released in v0.6.09. Visibility preference persistence and propagation into exports remain unspecified. An All TGs bulk export was not requested.

### Q226: Check availability

Use a searchable multiple-selection dropdown with removable teacher chips. Show a Period / Available Teachers table with time beneath each period number and blue available-name badges. Teal highlights a row only when at least one teacher is selected and every selected teacher is free. Keep all period rows, including empty results, and include a legend.

Respect the date, applicable timetable, odd/even week and real absence/relief data. A busy, absent or already assigned teacher is unavailable; incomplete operational data must not be presented as confirmed availability.

### Q228: loading speed

Integrate the isolated Contacts authority batching draft: one request for the existing three ranges, with fresh SMC/Admin checks and unchanged pending-save protection. The local draft tests passed; no live latency reduction is claimed.

Investigate measured remaining round trips: reuse immutable timetable data across dates, avoid repeated full profile fetches, prevent optional Calendar reads from delaying first usable navigation, and reduce redundant diagnostic cache writes while preserving useful failure evidence. Current or next-upcoming timetable preloading is already a v0.6.09 feature and must be preserved.

### IMP and reconstruction integration

Integrate the reviewed version-owned countable non-teaching activity draft. **IMP = Instructional Mentoring Programme**; count it once in workload, without adding to teaching totals or applying teaching SIUE. **E2K is P3.** Preserve existing R policy, FTT, PD and duty treatment; the new relief-exclusion rules do not redefine their workload status.

## Published 2026 baseline is not yet established

The local reconstructed candidate is **2026 T4 post-PSLE**, academic year 2026, effective **14 October–20 November 2026**. Its reviewed source has 100 timetable teachers, 40 classes, 122 TGs and 2,447 weekly teaching periods. IMP adds eight weekly non-teaching periods separately.

The approved identity corrections are Sarifah with FAJT, Ros Hamidah with SRE and the corrected Roster name; Kavi alone retains BT among the three flagged discrepancies, Fadzriel retains UT, and 6H is standard P6 including EL. Collapsed P6 Foundation loads are N/A, not invented zero teaching assignments. Preserve other confirmed Contacts data and the 2027 planning version.

**Noorfizah (FAJT) is active in Contacts but has no matching teacher timetable in the supplied source.** Her teaching/workload and relief capacity are unverified. The preview deliberately uses null values rather than declaring her free. At 10:44 the user asked for the evidence and implications; they have not agreed to exclude her. Resolve this before publishing the reconstruction or using its R as authoritative.

The candidate is a local preparation document, not a live published Deploy version. Normal authenticated Contacts creation, Deploy save/review/publication and the verified handoff from the imported Contacts feed are still required. Previous Google authentication access was blocked pending explicit authorisation; no workaround or raw backend write is authorised by this scope.

Do not label a working draft “production ready” merely because a relief UI exists. Correct live R requires the valid in-force baseline and its published source handoff, and real WhatsApp delivery requires its separate verified configuration.

## Open decisions and proposed defaults

These are not resolved user policy:

| Topic | Current position |
| --- | --- |
| Noorfizah | User requests details before deciding whether to exclude or supply missing load. |
| WhatsApp setup | Explain the sending number requirement and identify sender/Admin recipients before configuration. |
| LSE future dates | Daily gate confirmed; today-only versus future date entry not expressly settled. |
| Overlapping absence entries | Checks required; blocking overlaps is STAPLER's behaviour and a proposed default, not a confirmed override policy. |
| Instructions Not Applicable | Proposed selected-date-only effect, without removing cover demand; user has not directly confirmed. |
| Prune range | Year/date range and Admin access confirmed; whether current/future records may be pruned remains unspecified. |
| Multi-day absence periods | Proposed same selected periods across the range and only timetable-bearing school dates producing lesson demand. |
| Delete semantics | Proposed cancellation/audit for ordinary deletion, versus explicit Admin pruning; implementation must reconcile cover and requests. |
| Private link expiry | Expiring recipient-specific links approved; lifetime and renewal policy unspecified. |
| Notification delivery failure | Needs a visible failed/pending state and an operational recovery path; exact retry/escalation policy is implementation design. |
| Field-toggle preferences | Persistence and PDF/Excel propagation not yet specified. |

## Evidence and source files

Local requirements read for this checkpoint:

1. `absence-planning/Roster_Absence_Requirements.md`
2. `absence-planning/Stapler_v4_3_Reference.md`, especially Module 3 eligibility, ranking and reconciliation.
3. `queue610/GSiS_Queued_Changelog.md`, Q223–Q229 and reconstruction decisions.
4. `reverse-timetable/CURRENT_STATUS.md`
5. Conversation decisions through 14 October 2026, 10:44 Singapore time.

| Screenshot | Use |
| --- | --- |
| `upload/image(20261013-221944).png` | Absence entry form hierarchy and horizontal periods. |
| `upload/image(20261013-223602).png` | Vertical period/time column for instructions. |
| `upload/image(20261014-020024).png` | Personal absence-management table reference. |
| `upload/image(20261014-020141).png` | Absences by Date, date selector and two tabs. |
| `upload/image(20261014-020321).png` | My Relief Duties blue calendar function icon. |
| `upload/image(20261013-221015).png` and `221038`, `221039`, `221051`, `221103` | Successive Check availability selection/result states. |
| `upload/image(20261013-221438).png` | Explicitly excluded timetable screenshot. |

The three new 14 October screenshots were inspected directly for this checkpoint. Screenshot table contents are examples, not live records to create.
