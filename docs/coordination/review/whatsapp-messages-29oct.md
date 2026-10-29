# WhatsApp message review (29 Oct 2026)

Purpose: owner review before changing message text. Source: `notification-worker/template-contracts.json` (approved bodies), `shared/roster-operations.js` (variable text), `roster-update/public/_worker.js` ~line 1109 (maps text to template fields).

Key fact: the template body is fixed by Meta approval. The variable parts (`{{n}}`) are built by our code. Shortening a variable needs only a code change, no Meta re-approval. Changing the fixed wording needs a new template and Meta approval (1 to 2 days).

## 1. Teacher messages that list periods today

### relief_assignment (`gsis_relief_assignment_v1`): first publication to a teacher
Body: *Relief Assignment* / Hi {{1}}, Relief Team has assigned you relief duties on {{2}}. / {{3}} / View the relief instructions and acknowledge your duties here: {{4}}. / Thank you.

{{3}} built by `publicationSummary()` (roster-operations.js ~line 851). One block per period, blank line between:
```
P3 08:40 4A · English · Group B · Room 2-3 (class combination)
<lesson instructions>
SMC: <custom instruction>

P5 10:10 2C · Maths · Hall
```

### relief_updated (`gsis_relief_updated_v1`): any change after publication
Body: *Relief Assignment Updated* / Hi {{1}}, Relief Team has changed your relief duties for {{2}}. / {{3}} / View your updated timetable and acknowledge the change here: {{4}}.

{{3}}: same builder; cancelled rows start "Cancelled: ". Every changed and cancelled period is listed with instructions.

### relief_urgent (`gsis_relief_urgent_v1`): published close to the lesson
Uses the same `publicationSummary()` list.

### mutual_override (`gsis_relief_changed_v1`): Relief Team changed a peer arrangement
{{3}} (~line 912), one line per lesson:
```
P3 · 08:40 to 09:10 · 4A · English · Room 2-3 · Published cover: <name>
```

### mutual_request (`gsis_relief_request_v1`): peer asks a peer
{{4}} (~line 904): `P3 08:40 to 09:10 · 4A · English · Group B · Room 2-3; P5 ...`

### relief_reminder (`gsis_relief_reminder_v1`): 20 minutes before an unacknowledged duty
{{3}}: the one duty, same builder. Only one period, so short.

## 2. Teacher message that is already short

### stapler_timetable (`gsis_timetable_updated_button_v2`): "Let teachers see" / Send WhatsApp
Body: *Your timetable for today has changed* / Hi {{1}}, your timetable for today, {{2}}, has updates. / Specifically, the changes are: / {{3}} / Please use the buttons below ...
{{3}} is fixed text (`dailyNoticeMessage()`, ~line 1241): "Your timetable arrangements have been updated. Please check View Detail for your latest lessons and duties."
Note: the fixed body still says "Specifically, the changes are:" before a sentence that lists no changes. Reads oddly.

## 3. SMC messages

| Message | {{3}} content today |
| --- | --- |
| relief_morning / relief_evening / relief_final | "N absent teachers: name; name. X periods have planned cover; Y uncovered. Low-capacity periods: P2 (1), P4 (2)." Names dropped if over 900 characters. Relief Health % separate. |
| absence_update / smc_attention | "<name> reported absence at <time> SGT for P1, P2. Manual allocation is required." |
| relief_manual_review, capacity_warning | uncovered or low-capacity period list |

## Proposed change (owner to choose)

For relief_assignment, relief_updated, relief_urgent and mutual_override, replace the period list in {{3}} with one line:

- Option A, count only: "You have 2 relief duties." / "2 duties changed, 1 cancelled."
- Option B, count plus period numbers: "2 relief duties: P3, P5." / "Changed: P3. Cancelled: P5."

Lesson instructions and SMC notes then show only behind the link. They are no longer in WhatsApp.

Keep as is: relief_reminder (one duty, useful 20 minutes before), mutual_request (the peer must see what they accept), SMC summaries (SMCs need detail).

Optional, needs Meta approval: a v3 of the timetable template without "Specifically, the changes are:".

No Meta re-approval is needed for options A or B. Code: `publicationSummary()` and the mutual_override builder in `shared/roster-operations.js`; rebuild generated backends; update tests that assert summary text.

## Owner decision (29 Oct 2026)
- Option B for relief_assignment, relief_updated, relief_urgent. Task: roster-whatsapp-short-summary.
- Peer messages (mutual_request, mutual_override): no change for now.
- No new timetable template.
