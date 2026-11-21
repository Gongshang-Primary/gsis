# WhatsApp templates: v0.9 baseline, trigger conditions and sample messages

Project: v1 (baseline reference). Model: Claude. 21 Nov 2026 SGT. Owner rule (21 Nov): every WhatsApp-template item carries its trigger conditions and a message sample as per template.

Sources: `notification-worker/template-contracts.json` (exact approved wording), `docs/reference/whatsapp-messages.html` (v0.9 triggers, 6 Nov 2026), `shared/roster-operations.js` (shared by v0.9 and v1). Sample values are synthetic. "v1" means a queueing code path exists in v1 source; no provider delivery has been tested in v1.

**Rules for every message (v0.9, kept in v1 through the shared domain):** master switch `WHATSAPP_ENABLED`; per-type activation; quiet hours 21:30–05:45 for scheduled and routine messages (explicit SMC actions, emergency absences and urgent forwards still go); rechecked just before sending (still current, recipient active with a valid mobile, template approved with the exact wording); one key per message, so repeats do not resend.

Owner decisions on each template: [WHATSAPP_TEMPLATE_REVIEW_2026-11-21.md](WHATSAPP_TEMPLATE_REVIEW_2026-11-21.md). Meta states below come from the repo; the live check in that review supersedes them.

## Summary

| # | Key | Template | Recipient | When | v0.9 activation (6 Nov) | v1 code path |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | `mutual_request` | `gsis_relief_request_v1` | Teacher (peer) | Immediate | On | Queued (shared domain + v1 eligibility/external) |
| 2 | `mutual_override` | `gsis_relief_changed_v1` | Teacher (peer) | On publish / Send WhatsApp | On | Queued (shared domain) |
| 3 | `contact_review` | `gsis_contact_review_v1` | Admins | Immediate | On | Shared domain only; verify v1 Roster contact-create queues it |
| 4 | `relief_assignment` | `gsis_relief_assignment_v1` | Relief teacher | On publish / Send WhatsApp | On | Queued (shared domain) |
| 5 | `relief_updated` | `gsis_relief_updated_v1` | Relief teacher | On publish / Send WhatsApp | On | Queued (shared domain) |
| 6 | `relief_reminder` | `gsis_relief_reminder_v1` | Relief teacher | Timed | On | Queued (shared domain) |
| 7 | `relief_unacknowledged` | `gsis_relief_unacknowledged_v1` | Duty SMC | Timed | On | Queued (shared domain) |
| 8 | `relief_urgent` | `gsis_relief_urgent_v1` | Relief teacher | On publish, or 20 min before | On | Queued (shared domain) |
| 9 | `relief_urgent_smc` | `gsis_relief_urgent_smc_v1` | Duty SMC | Timed | On | Queued (shared domain) |
| 10 | `relief_evening` | `gsis_relief_evening_v1` | Duty SMC | Scheduled (evening) | On | Queued (shared domain) |
| 11 | `relief_morning` | `gsis_relief_morning_v1` | Duty SMC | Scheduled (morning) | On | Queued (shared domain) |
| 12 | `absence_update` | `gsis_absence_update_v1` | Duty SMC | Event | On | Queued (shared domain) |
| 13 | `relief_manual_review` | `gsis_relief_manual_review_v1` | Duty SMC | Not used | Not queued | Not queued (same as v0.9). No gap |
| 14 | `capacity_warning` | `gsis_relief_capacity_warning_v1` | Duty SMC | Event | On | Queued (v1 capacity engine) |
| 15 | `relief_final` | `gsis_relief_final_v1` | Duty SMC | Not used | Not queued | Not queued (same as v0.9). No gap |
| 16 | `conditional_relief_instruction` | `gsis_relief_instruction_v1` | Relief teacher | On publish | On | Queued (shared domain) |
| 17 | `urgent_forward` | `gsis_urgent_forward_v1` | Duty / urgent SMC | Immediate | On | Queued (shared domain + v1 inbound) |
| 18 | `smc_attention` | `gsis_relief_attention_v2` | Duty SMC | Event | On | Queued (shared domain) |
| 19 | `stapler_timetable` | `gsis_timetable_updated_v1` | Teacher | On Stapler publish / day publish | On | Queued (shared domain) |
| 20 | `stapler_request` | `gsis_timetable_sponsor_v1` | Sponsor | Immediate | On | Queued (shared domain) |
| 21 | `stapler_decision` | `gsis_timetable_access_v1` | Teacher (+ sponsor) | Immediate | On | Queued (shared domain) |
| 22 | `system_alert` | `gsis_system_alert_v1` | Admins only | Event (pending) | Off / pending | Shared domain; off until Meta approval |
| 23 | `lse_notice` | `gsis_lse_notice_v1` | Duty SMC | Planned | Off / pending | Queued (shared domain + v1 service) |
| 24 | `inbox_alert` | `gsis_inbox_new_message_v1` | Duty SMC | Immediate | Separate switch `WHATSAPP_INBOX_ALERTS_ENABLED` | Not on Meta; never sent in v0.9. Not a baseline gap (owner: build as improvement) |

## Each template

### 1. `mutual_request` (gsis_relief_request_v1)

- **Recipient:** Teacher (peer)
- **Trigger (v0.9):** A teacher reporting an absence proposes a colleague to cover. Sent at once to that colleague with Accept/Reject. Dropped if the request is no longer pending or has expired.
- **Timing:** Immediate
- **Meta state:** APPROVED
- **v1:** Queued (shared domain + v1 eligibility/external)
- **Fields:** `recipient_name`, `requesting_teacher_name`, `duty_date`, `lessons_and_periods`, `private_approval_url`

Sample:

> *Peer Relief Arrangement*
> 
> Hi Ms Tan Mei Ling, Mr Goh Kok Wah has requested on https://roster.gsps.edu.sg that you cover his/her lesson(s) on Thu 26 Nov 2026: P3-P4 EL, 4 Integrity.
> 
> Accept or reject using this link: [private link].
> 
> Thank you.

### 2. `mutual_override` (gsis_relief_changed_v1)

- **Recipient:** Teacher (peer)
- **Trigger (v0.9):** SMC publishes ("Let teachers see" / "Send WhatsApp") a change that replaces an accepted peer arrangement. Sent to the colleague whose arrangement changed.
- **Timing:** On publish / Send WhatsApp
- **Meta state:** APPROVED
- **v1:** Queued (shared domain)
- **Fields:** `recipient_name`, `duty_date`, `change_details`, `private_published_duties_url`

Sample:

> *Peer Relief Arrangement Updated*
> 
> Hi Ms Tan Mei Ling, Relief Team has changed the peer relief arrangement for Thu 26 Nov 2026.
> 
> P5 Math 3 Kindness moved to P6 (10:40).
> 
> View the published arrangement here: [private link].
> 
> Thank you.

### 3. `contact_review` (gsis_contact_review_v1)

- **Recipient:** Admins
- **Trigger (v0.9):** Someone creates a new inactive external relief contact in Roster. Admins are asked to review it in Contacts.
- **Timing:** Immediate
- **Meta state:** APPROVED
- **v1:** Shared domain only; verify v1 Roster contact-create queues it
- **Fields:** `recipient_name`, `request_date`, `contact_review_details`, `contacts_review_url`

Sample:

> *Contact Details for Ad Hoc External Relief*
> 
> Hi Ms Tan Mei Ling.
> 
> On https://roster.gsps.edu.sg, contact details for an ad hoc external relief teacher were added or updated on Thu 26 Nov 2026.
> 
> Please review these details as a Contacts Admin:
> 
> Mdm Rahimah (ad hoc relief), mobile +65 9xxx xxxx
> 
> Review and confirm the details in Contacts: https://contacts.gsps.edu.sg.
> 
> Thank you.

### 4. `relief_assignment` (gsis_relief_assignment_v1)

- **Recipient:** Relief teacher
- **Trigger (v0.9):** SMC presses "Let teachers see and send WhatsApp" or "Send WhatsApp to all affected". Sent to each teacher with new published duties and no changes.
- **Timing:** On publish / Send WhatsApp
- **Meta state:** APPROVED
- **v1:** Queued (shared domain)
- **Fields:** `recipient_name`, `duty_date`, `lessons_periods_venues`, `private_timetable_url`

Sample:

> *Relief Assignment*
> 
> Hi Ms Tan Mei Ling, Relief Team has assigned you relief duties on Thu 26 Nov 2026.
> 
> P3-P4 EL, 4 Integrity, Room 3-04
> 
> View the relief instructions and acknowledge your duties here: [private link].
> 
> Thank you.

### 5. `relief_updated` (gsis_relief_updated_v1)

- **Recipient:** Relief teacher
- **Trigger (v0.9):** Same moment as above, when a teacher's already-published duties changed or were cancelled.
- **Timing:** On publish / Send WhatsApp
- **Meta state:** APPROVED
- **v1:** Queued (shared domain)
- **Fields:** `recipient_name`, `duty_date`, `changed_or_cancelled_duties`, `private_timetable_url`

Sample:

> *Relief Assignment Updated*
> 
> Hi Ms Tan Mei Ling, Relief Team has changed your relief duties for Thu 26 Nov 2026.
> 
> Cancelled: P3 EL 4 Integrity. New: P6 Math 3 Kindness, Room 2-01.
> 
> View your updated timetable and acknowledge the change here: [private link].
> 
> Thank you.

### 6. `relief_reminder` (gsis_relief_reminder_v1)

- **Recipient:** Relief teacher
- **Trigger (v0.9):** 20 minutes before a published relief lesson starts, only if the teacher has not acknowledged. Cancelled automatically when they acknowledge.
- **Timing:** Timed
- **Meta state:** APPROVED
- **v1:** Queued (shared domain)
- **Fields:** `recipient_name`, `duty_date`, `lesson_period_time_venue`, `private_timetable_url`

Sample:

> *Relief Duty Reminder*
> 
> Hi Ms Tan Mei Ling, your relief duty on Thu 26 Nov 2026 starts in 20 minutes and has not been acknowledged in Roster.
> 
> P3 (08:50) EL, 4 Integrity, Room 3-04
> 
> View the relief instructions and acknowledge your duty here: [private link].
> 
> Thank you.

### 7. `relief_unacknowledged` (gsis_relief_unacknowledged_v1)

- **Recipient:** Duty SMC
- **Trigger (v0.9):** 10 minutes before a published relief lesson starts, if the relief teacher still has not acknowledged.
- **Timing:** Timed
- **Meta state:** APPROVED
- **v1:** Queued (shared domain)
- **Fields:** `duty_smc_name`, `assigned_teacher_name`, `duty_date`, `lesson_period_start_venue`, `roster_status_url`

Sample:

> *Relief Duty Not Acknowledged*
> 
> Hi Mr Lim Wei Jie, Ms Tan Mei Ling has not acknowledged the relief duty on Thu 26 Nov 2026.
> 
> P3 08:50, 4 Integrity, Room 3-04
> 
> The lesson starts in 10 minutes. Please contact the teacher and confirm cover.
> 
> View the current status here: https://roster.gsps.edu.sg.
> 
> Thank you.

### 8. `relief_urgent` (gsis_relief_urgent_v1)

- **Recipient:** Relief teacher
- **Trigger (v0.9):** Same moment as above when the first duty starts within about 20 minutes; also replaces the 20-minute reminder if the teacher still has not acknowledged.
- **Timing:** On publish, or 20 min before
- **Meta state:** APPROVED
- **v1:** Queued (shared domain)
- **Fields:** `recipient_name`, `duty_date`, `minutes_remaining`, `lesson_period_start_venue`, `private_timetable_url`

Sample:

> *Urgent Relief Assignment*
> 
> Hi Ms Tan Mei Ling, Relief Team has assigned you a relief duty on Thu 26 Nov 2026 that starts in 15 minutes.
> 
> P3 08:50, 4 Integrity, Room 3-04
> 
> Please view the relief instructions and acknowledge your duty now: [private link].
> 
> Thank you.

### 9. `relief_urgent_smc` (gsis_relief_urgent_smc_v1)

- **Recipient:** Duty SMC
- **Trigger (v0.9):** Under 10 minutes before the lesson and still unacknowledged (the 10-minute window has passed).
- **Timing:** Timed
- **Meta state:** APPROVED
- **v1:** Queued (shared domain)
- **Fields:** `duty_smc_name`, `assigned_teacher_name`, `duty_date`, `minutes_remaining`, `lesson_period_start_venue`, `roster_status_url`

Sample:

> *Urgent Relief Cover*
> 
> Hi Mr Lim Wei Jie, Ms Tan Mei Ling has been assigned relief on Thu 26 Nov 2026. The lesson starts in 15 minutes.
> 
> P3 08:50, 4 Integrity, Room 3-04
> 
> The duty has not yet been acknowledged. Please check that cover is confirmed.
> 
> View the current status here: https://roster.gsps.edu.sg.
> 
> Thank you.

### 10. `relief_evening` (gsis_relief_evening_v1)

- **Recipient:** Duty SMC
- **Trigger (v0.9):** At the configured evening summary times (from 16:00) for the next school day: absences, allocation, uncovered periods.
- **Timing:** Scheduled (evening)
- **Meta state:** APPROVED
- **v1:** Queued (shared domain)
- **Fields:** `duty_smc_name`, `duty_date`, `absence_allocation_uncovered_summary`, `roster_plan_url`

Sample:

> *Relief Planning Update*
> 
> Hi Mr Lim Wei Jie, here is the relief planning update for Thu 26 Nov 2026.
> 
> 3 absent teachers. 11 periods have planned cover; 1 uncovered (P7).
> 
> These allocations are drafts pending publication.
> 
> Review the plan here: https://roster.gsps.edu.sg.
> 
> Thank you.

### 11. `relief_morning` (gsis_relief_morning_v1)

- **Recipient:** Duty SMC
- **Trigger (v0.9):** At the configured morning summary times (before 06:30): overnight absences, cancellations, relief health.
- **Timing:** Scheduled (morning)
- **Meta state:** APPROVED
- **v1:** Queued (shared domain)
- **Fields:** `duty_smc_name`, `duty_date`, `overnight_absence_allocation_summary`, `relief_health_summary`, `roster_plan_url`

Sample:

> *Morning Relief Summary*
> 
> Hi Mr Lim Wei Jie, here is the relief summary for Thu 26 Nov 2026.
> 
> 1 new absence overnight; 1 cancellation. 12 periods covered; 0 uncovered.
> 
> Relief Health: 86.0%
> 
> These allocations are drafts pending publication.
> 
> Review the plan here: https://roster.gsps.edu.sg.
> 
> Thank you.

### 12. `absence_update` (gsis_absence_update_v1)

- **Recipient:** Duty SMC
- **Trigger (v0.9):** A new absence arrives after allocation or publication ("Manual allocation is required"), or an emergency absence on the day. Emergency absences bypass quiet hours.
- **Timing:** Event
- **Meta state:** APPROVED
- **v1:** Queued (shared domain)
- **Fields:** `duty_smc_name`, `new_absence_count`, `duty_date`, `additional_periods_allocation_summary`, `roster_plan_url`

Sample:

> *New Absence Update*
> 
> Hi Mr Lim Wei Jie, 2 new absence(s) have been reported for Thu 26 Nov 2026 since the previous update.
> 
> 4 more periods need cover. Manual allocation is required.
> 
> Review the latest allocation and publication status here: https://roster.gsps.edu.sg.
> 
> Thank you.

### 13. `relief_manual_review` (gsis_relief_manual_review_v1)

- **Recipient:** Duty SMC
- **Trigger (v0.9):** Approved and enabled, but no current code path queues it.
- **Timing:** Not used
- **Meta state:** APPROVED
- **v1:** Not queued (same as v0.9). No gap
- **Fields:** `duty_smc_name`, `duty_date`, `uncovered_periods_summary`, `roster_plan_url`

Sample:

> *Relief Allocation Requires Review*
> 
> Hi Mr Lim Wei Jie, please review the relief plan for Thu 26 Nov 2026.
> 
> The final scheduled allocation run is complete.
> 2 periods remain uncovered: P2 3 Kindness, P7 5 Respect.
> 
> Please allocate the remaining cover and publish the relief plan here: https://roster.gsps.edu.sg.
> 
> Thank you.

### 14. `capacity_warning` (gsis_relief_capacity_warning_v1)

- **Recipient:** Duty SMC
- **Trigger (v0.9):** A period's eligible relief capacity falls low or periods are uncovered for the duty date. Respects quiet hours.
- **Timing:** Event
- **Meta state:** APPROVED
- **v1:** Queued (v1 capacity engine)
- **Fields:** `duty_smc_name`, `duty_date`, `capacity_details`, `relief_health_summary`, `roster_plan_url`

Sample:

> *Relief Capacity Warning*
> 
> Hi Mr Lim Wei Jie, relief capacity for Thu 26 Nov 2026 needs your attention.
> 
> P2 has 1 eligible relief teacher left; P7 has none.
> 
> Relief Health: 86.0%
> 
> Review the affected periods in Roster: https://roster.gsps.edu.sg.
> 
> Please consider external ad hoc relief where needed. External staff are not activated automatically.

### 15. `relief_final` (gsis_relief_final_v1)

- **Recipient:** Duty SMC
- **Trigger (v0.9):** Approved and enabled, but no current code path queues it (the 06:29 final check uses "Relief allocation requires action").
- **Timing:** Not used
- **Meta state:** APPROVED
- **v1:** Not queued (same as v0.9). No gap
- **Fields:** `duty_smc_name`, `duty_date`, `allocation_summary`, `relief_health_summary`, `roster_plan_url`

Sample:

> *Final Draft Relief Allocation*
> 
> Hi Mr Lim Wei Jie, the final scheduled relief allocation for Thu 26 Nov 2026 is complete.
> 
> 3 absent teachers. 12 periods have planned cover; 0 uncovered.
> 
> Relief Health: 86.0%
> 
> Review and publish the draft in Roster: https://roster.gsps.edu.sg.
> 
> Thank you.

### 16. `conditional_relief_instruction` (gsis_relief_instruction_v1)

- **Recipient:** Relief teacher
- **Trigger (v0.9):** On publish, when the absent teacher left a conditional relief instruction that applies to that lesson (new or changed since the last publish).
- **Timing:** On publish
- **Meta state:** PENDING
- **v1:** Queued (shared domain)
- **Fields:** `recipient_name`, `class`, `duty_date`, `period_and_time`, `conditional_instruction`, `absent_teacher_name`, `absent_teacher_contact`

Sample:

> *Instructions for relief lesson*
> 
> Hi Ms Tan Mei Ling, please note the following instructions for your assigned relief lesson at Gongshang Primary School.
> 
> Class: 4 Integrity
> Date: Thu 26 Nov 2026
> Period and time: P3, 08:50-09:20
> 
> Lesson instructions:
> If wet weather, use the classroom; worksheets are on the teacher's desk.
> 
> For clarification, please contact Mr Goh Kok Wah, the absent teacher:
> +65 9xxx xxxx
> 
> Thank you.

### 17. `urgent_forward` (gsis_urgent_forward_v1)

- **Recipient:** Duty / urgent SMC
- **Trigger (v0.9):** A teacher sends an urgent message through the school WhatsApp menu. Forwarded to the duty SMC (inbox mode) or urgent SMC list. Bypasses quiet hours.
- **Timing:** Immediate
- **Meta state:** APPROVED
- **v1:** Queued (shared domain + v1 inbound)
- **Fields:** `recipient_name`, `original_message`, `sender_name`, `sender_contact`

Sample:

> *Urgent Message to Relief Team*
> 
> Hi Ms Tan Mei Ling, a staff member has sent this urgent message:
> 
> I am stuck on the CTE, will be 20 min late for P1.
> 
> From: Mr Goh Kok Wah
> Contact: +65 9xxx xxxx
> 
> Please contact the sender directly. This message does not create an absence report or confirm relief cover.

### 18. `smc_attention` (gsis_relief_attention_v2)

- **Recipient:** Duty SMC
- **Trigger (v0.9):** Issues needing the duty SMC: final scheduled optimisation not complete at 06:29-06:30, cut-off missed, allocation or timetable problems, absence edits needing review. (Until PR #87 ships, Drive output failures also used this; #87 moves them to Admins only.)
- **Timing:** Event
- **Meta state:** APPROVED
- **v1:** Queued (shared domain)
- **Fields:** `duty_smc_name`, `duty_date`, `attention_details`, `roster_status_url`

Sample:

> *School Relief Allocation Requires Action*
> 
> Hi Mr Lim Wei Jie, you are on SMC relief duty at Gongshang Primary School on Thu 26 Nov 2026.
> 
> The following issue has been recorded in the teacher relief allocation for your duty date:
> 
> The final scheduled optimisation has NOT completed. Review the last valid draft and allocate the remaining cover.
> 
> Please review the affected lessons and confirm or correct their teacher coverage in Roster: https://roster.gsps.edu.sg.
> 
> Thank you.

### 19. `stapler_timetable` (gsis_timetable_updated_v1)

- **Recipient:** Teacher
- **Trigger (v0.9):** A confirmed/published Stapler plan changes a teacher's cells for the day, or the day is published with timetable changes. Sent to each teacher whose day changed; asks for acknowledgement.
- **Timing:** On Stapler publish / day publish
- **Meta state:** PENDING
- **v1:** Queued (shared domain)
- **Fields:** `recipient_name`, `duty_date`, `change_details`, `private_timetable_url`

Sample:

> *Your timetable for today has changed*
> 
> Hi Ms Tan Mei Ling, your timetable for today, Thu 26 Nov 2026, has updates.
> 
> Specifically, the changes are:
> P5 Math 3 Kindness moved to P6 (10:40).
> 
> View your updated timetable alongside your usual timetable:
> [private link]
> 
> Thank you.
> GSiS Roster

### 20. `stapler_request` (gsis_timetable_sponsor_v1)

- **Recipient:** Sponsor
- **Trigger (v0.9):** A teacher asks for Stapler planning access for a date and names a sponsor. Sent to the sponsor.
- **Timing:** Immediate
- **Meta state:** PENDING
- **v1:** Queued (shared domain)
- **Fields:** `recipient_name`, `requesting_teacher_name`, `duty_date`, `roster_plan_url`

Sample:

> *Request to plan Suspended Timetable*
> 
> Hi Ms Tan Mei Ling, Mr Goh Kok Wah has requested your approval to plan and publish a suspended timetable for Thu 26 Nov 2026.
> 
> Please review the request and approve or reject it here:
> https://roster.gsps.edu.sg
> 
> Thank you.

### 21. `stapler_decision` (gsis_timetable_access_v1)

- **Recipient:** Teacher (+ sponsor)
- **Trigger (v0.9):** The request is approved or rejected. Sent to the requester, and to the sponsor if someone else approved.
- **Timing:** Immediate
- **Meta state:** PENDING
- **v1:** Queued (shared domain)
- **Fields:** `requesting_teacher_name`, `duty_date`, `change_details`, `roster_plan_url`

Sample:

> *Suspended timetable request outcome*
> 
> Mr Goh Kok Wah made a request to plan a suspended timetable for Thu 26 Nov 2026.
> 
> The request has been reviewed and the outcome is:
> P5 Math 3 Kindness moved to P6 (10:40).
> 
> View the request and decision here:
> https://roster.gsps.edu.sg
> 
> Thank you.

### 22. `system_alert` (gsis_system_alert_v1)

- **Recipient:** Admins only
- **Trigger (v0.9):** Drive outputs or backups failing (one per kind per day). Ships with PR #87; stays off until Meta approves the template (submitted 6 Nov, pending).
- **Timing:** Event (pending)
- **Meta state:** PENDING
- **v1:** Shared domain; off until Meta approval
- **Fields:** `recipient_name`, `request_date`, `attention_details`, `roster_status_url`

Sample:

> *GSiS System Alert*
> 
> Hi Ms Tan Mei Ling, this system alert is for GSiS Admins.
> 
> Date: Thu 26 Nov 2026
> 
> Issue: The final scheduled optimisation has NOT completed. Review the last valid draft and allocate the remaining cover.
> 
> Open System Health to review: https://roster.gsps.edu.sg.
> 
> Thank you.

### 23. `lse_notice` (gsis_lse_notice_v1)

- **Recipient:** Duty SMC
- **Trigger (v0.9):** Owner spec 4 Nov: when an LSE absence is reported, notify the SMC on duty at the next timer run. Template submitted; wiring not built yet (Codex queue).
- **Timing:** Planned
- **Meta state:** APPROVED
- **v1:** Queued (shared domain + v1 service)
- **Fields:** `duty_smc_name`, `absent_teacher_name`, `duty_date`

Sample:

> *Leave School Early*
> 
> Hi Mr Lim Wei Jie, Mr Goh Kok Wah has applied for LSE on Thu 26 Nov 2026.
> 
> For info, thank you!

### 24. `inbox_alert` (gsis_inbox_new_message_v1)

- **Recipient:** Duty SMC
- **Trigger (v0.9):** A message arrives in the school WhatsApp inbox. Separate switch WHATSAPP_INBOX_ALERTS_ENABLED.
- **Timing:** Immediate
- **Meta state:** defined in roster-update/public/_worker.js
- **v1:** Not on Meta; never sent in v0.9. Not a baseline gap (owner: build as improvement)
- **Fields:** `duty_smc_name`, `sender_name`, `roster_status_url`

Sample:

> *New School WhatsApp Message*
> 
> Hi Mr Lim Wei Jie, a new message from Mr Goh Kok Wah is waiting in the GSiS WhatsApp Inbox.
> 
> Open Roster to review and reply: https://roster.gsps.edu.sg.
