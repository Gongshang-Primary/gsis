# Roster v0.8.2 quick guide

Home shows functions available to your role. The complete applicable timetable loads in the background on entry. Timetable models are reused across dates; current absences and assignments are checked separately. A blank baseline cell does not confirm live availability.

In **Timetable**, a published suspended day appears first when available, with the recurring baseline visibly below, including odd/even weeks where applicable. Teacher, class and TG selectors apply to both. Top exports use the published day; use the lower baseline PDF/Excel controls for that reference copy.

## Report Absence and Own Arrangements

Choose the dates, periods and reason. Review the affected lessons and provide instructions, or choose No relief instructions beside the instruction date selector. That action saves the reviewed absence or instruction change while preserving entered text; it does not remove the need for a relief teacher. Written instructions use Submit absence or Save instructions at the bottom.

For Own Arrangements, select one or more periods and colleagues. Selected cells display the absent teacher's subject, class, venue and group. You may submit a request covering one period and leave the other periods for automatic allocation. A request becomes cover only after the colleague accepts. The server checks current availability when saving.

## Stapler

Open the date list, then choose or add a suspension date. SMC/Admin and approved sponsored planners may edit. Eligible ordinary teachers can view a frozen Confirmed upcoming timetable without sponsorship; they still need date-specific planning approval to edit.

Plan in Teacher POV and Class POV. The lower handle extends the workspace and Card Pit together; the middle divider changes their relative POV heights. Rows expand for wrapped tile information. Add ad-hoc class creates a class with a pen rename action. Deleting a custom class returns its tiles to Card Pit and clears that association.

Add teacher tile supports blank, existing or custom subject, venue, group and class values. Search existing choices by part of their label. Class choices use checkboxes. Dropping a tile into Class POV replaces its class selections with the destination class.

Edits stay local until **Save to online**. Multiple authorised planners can work on a date; independent online changes can merge and conflicts retain your choices for review. **Confirm** requires a saved plan and makes it ready for allocation. It also freezes the upcoming Confirmed preview for teachers. Later saved edits to an already confirmed plan can update allocation inputs, but that preview changes only after another Confirm. Neither step sends WhatsApp or releases daily relief duties.

## Assign Relief

Select the day, choose an affected period and assign a free teacher or use Auto-allocate. Roster consumes Deploy's R and checks availability, absences, workload limits and fairness. It does not subtract timetable blocks from R. A fresh annual history starts at zero; existing annual records remain in force.

Auto-allocate fills eligible vacancies. Explicit SMC assignments, clears and No relief required remain protected from automatic replacement; choose **Return to automatic** to release that protection. If a manual choice becomes invalid, review its indicator rather than expecting automatic replacement. SMC can change published or started-period allocations without a second audit approval; actual completed relief accounting remains separate.

Use the three separate workflow actions:

- **Save to online** submits your local choices and shows the accepted cell changes.
- **Let teachers see** releases saved online arrangements without messaging.
- **Send WhatsApp** sends eligible changes from the published timetable. A combined button performs both named actions.
- **Export Excel**, **Export relief excel** and **Export Class POV** use the selected day's loaded data and local edits, even without network verification; they do not save or publish.

Let teachers see normally applies to a verified current Singapore school day. Admin can enable Allow advance publishing for future dates. Once a future day is published, its eligible teachers can be notified immediately. Turning the setting off does not retract an already published day.

## Daily Notify

SMC and Admin can open Daily Notify and select the day. The top-right **Teacher acknowledgements** dashboard shows **Requiring acknowledgement**, **Acknowledged**, **Pending** and percentage for the selected publication. It counts each eligible teacher once, including an eligible teacher whose message has already been sent, regardless of search or By Relief Teachers/By Absent Teachers grouping. Acknowledged means the teacher acknowledged the current timetable notice; WhatsApp read/delivery does not count. The date and publication revision identify the counts. An unpublished or zero-eligible day shows an empty state. On a narrow screen, the dashboard stacks below the controls.

- **Let teachers see & Send WhatsApp to all affected** releases the saved day and notifies eligible affected teachers.
- **Let teachers see & Send WhatsApp updates** releases revisions and notifies eligible changes since the preceding publication.
- **Send WhatsApp to all affected** uses the current publication; unsaved or unpublished work is excluded.

Use By Relief Teachers or By Absent Teachers, search names and review each published summary. The individual **Send WhatsApp** button sends to that eligible teacher. All affected includes corrections owed after an earlier sent, acknowledged or uncertain changed notice; it does not mean every staff member. A teacher matching baseline with no outstanding correction is excluded. Teachers absent for the full school day are excluded from timetable WhatsApp and the acknowledgement population. For partial absences, only changed timetable content or a correction owed during periods they are present qualifies; absent-only changes do not. Full-day absence means absence across all school-day periods, not merely every baseline lesson. Saved attendance is rechecked before dispatch, so a queued message can be suppressed if its only changes now fall in absent periods. This does not change the published timetable. Explicit clicks request immediate dispatch, including quiet hours; automatic notices keep their schedules.

## System Config and Daily Updates

Admin controls exact subject exclusions and wildcard patterns. The bottom list shows the active-baseline subjects that will not receive automatic relief. Changing rules applies to new absence reports; existing absences retain their captured policy.

Admin can review temporary name bridges that link exact baseline timetable names to Contacts Staff IDs. Search the validated baseline list by part of a name; custom timetable names cannot be saved. Retained names missing from a newer baseline are flagged for review. Normal unique matching takes priority. Ambiguous or conflicting identities remain unavailable until resolved. Changing links does not rename source Contacts records.

Ordinary teachers' **Daily Updates** has **Absent teachers** and **Relief teachers** groups with period, timing, subject, class and venue. It uses the published snapshot, with no Relief Load, quota, private reason or draft data. Older publications show only provable assigned rows until a fresh explicit publication. SMC/Admin daily employment email settings remain separate. Saving recipient addresses, subject and send time does not send an email. Unrelated allocation or acknowledgement activity does not invalidate that settings save; another settings edit requires review. If the result cannot be confirmed, use **Check saved settings** rather than submitting a replacement. It retries the exact request without sending a report. Recovery survives a reload in the same tab for the same user when storage is available. If a memory-only warning appears, keep the page open.

SMC duty uses inclusive start/end dates and excludes SL, AM and OM.

## Scheduled processing

The notification Worker's ROSTER_AUTOMATION_ENABLED flag and System Config's scheduled-allocation switch both control the allocation service. Diagnostic mode must be false during normal operation. The per-minute cron checks scheduled work; allocation begins from 16:00 for the following school day and follows the existing overnight cycle. It never publishes a day automatically.

WhatsApp routes require valid configuration and provider approval. The later 18 October diag4 operator log reported all 21 configured contracts approved and enabled, with connections ready; that diagnostic did not test delivery. The user subsequently reported successful 05:45 delivery on 19 October 2026, Singapore time. This is an installed-service observation, not a live test performed by this build. See [WhatsApp activation](WHATSAPP_ACTIVATION_v0.8.2.md) for installation. Preserve chosen production flags and secrets when updating code.

## Duty SMC summary times

As Admin, open System Config and edit the evening and morning summary lists. All times use Singapore time. Defaults are:

- Evening: 16:00, 16:30, 17:00, 17:30, 18:00, 18:30, 19:00, 19:30, 20:00, 20:30, 21:00 and 21:30, for the following school date.
- Morning: 05:30, 05:45, 06:00, 06:15 and 06:29, for the current date.

The target date's duty SMC receive the summary. The first configured time in each phase sends a fresh report, including zero absences. With defaults, 05:30 sends a fresh morning summary even if nothing changed overnight. If you move that first slot, the fresh morning cycle moves with it. An empty phase disables its summaries.

Later summaries are suppressed when effective absences have not changed since the recipient's last successful summary. New absences, cancellations and changed periods count as changes. Allocation-only changes do not. Failed or uncertain sends do not become a successful checkpoint. Saving this setting alone does not send a message.

Configured duty summaries retain the 21:30 and 05:30 quiet-hour boundary exceptions. Explicit teacher Send WhatsApp clicks also request immediate dispatch; other automatic routes retain their own quiet-hour rules. Automatic allocation and its morning cutoff remain unchanged.

## Uncertain saves

Keep the same request ID when a save result is uncertain. Use the supplied retry/confirmation action. A stale revision requires review of the latest records. Do not treat a failed data load as an empty timetable, empty history or successful publication.


## Private timetable, acknowledgement and Inbox

A teacher's private timetable link needs no Google sign-in and can be opened repeatedly for seven days from original issuance. Opening and acknowledging do not consume it or extend expiry. The acknowledgement action is at the top; a changed published notice must be reviewed and acknowledged again. Daily Notify shows filled acknowledged and grey pending indicators. WhatsApp delivered/read is not acknowledgement.

The two-button timetable template is prepared but the latest recorded 21 October Meta check is still PENDING. Until exact approval and activation, the existing in-text URL template remains selected. Its button variant opens View Detail or the acknowledgement action; opening the latter alone does not acknowledge.

SMC/Admin Inbox supports incoming text, private JPEG/PNG images and voice notes when the media integration is configured. Replies retain their drafts during refresh; delivery remains separate from acceptance. Use the published activation guide for setup and a separately authorised live check.

## Online decision trail

The Worker maintains one readable allocation file per school day under the configured Roster root's `Allocation Audit/YYYY/MM` folder. It records accepted automatic decisions and SMC online before/after changes. Unsaved device edits are not yet online events. Export retries do not undo an accepted save. See [Allocation audit](docs/ALLOCATION_AUDIT_v0.8.2.md) for retention and recovery.
