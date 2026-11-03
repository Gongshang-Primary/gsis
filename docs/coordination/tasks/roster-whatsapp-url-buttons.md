# roster-whatsapp-url-buttons: move private links from message body to URL buttons (changelog)

- Status: open; assign to Codex
- Owner/model: Codex
- Reviewer/model: Claude
- Lane: R (after tonight's cutover unless the owner says otherwise)
- Last updated (Asia/Singapore): 3 Nov 2026
- Branch: codex/roster-whatsapp-url-buttons
- PR: none
- Out of scope: template bodies (already submitted to Meta), cutover, freeze, live sends, LORD templates.

## Owner request (verbatim)
"check thru all whatsapp templates, and bundle all such long custom URls behind buttons. submit templates as v(n+1) as needed" (3 Nov). Trigger: Wen Di's message showed a long `external.html#<token>` link in the body.

## Meta state (Claude, 3 Nov, list_templates)
Button URL in every case: `https://roster.gsps.edu.sg/external.html#{{1}}`; button parameter = the capability token only (what follows `#`).

| Contract key | New template | Meta ID | Status | Button text | Body fields (in order) |
|---|---|---|---|---|---|
| mutual_request | gsis_relief_request_v2 | 1860613241950793 | APPROVED | Review request | recipient_name, requesting_teacher_name, duty_date, lessons_and_periods |
| stapler_timetable | gsis_timetable_updated_button_v2 | 1009634445543507 | APPROVED (already active) | (as registered) | recipient_name, duty_date, change_details |
| relief_assignment | gsis_relief_assignment_v2 | 1111277344970510 | PENDING | View and acknowledge | recipient_name, duty_date, lessons_periods_venues |
| relief_updated | gsis_relief_updated_v2 | 1093823786983973 | PENDING | View and acknowledge | recipient_name, duty_date, changed_or_cancelled_duties |
| relief_reminder | gsis_relief_reminder_v2 | 1140063958558991 | PENDING | View and acknowledge | recipient_name, duty_date, lesson_period_time_venue |
| relief_urgent | gsis_relief_urgent_v2 | 1068710112868282 | PENDING | View and acknowledge | recipient_name, duty_date, minutes_remaining, lesson_period_start_venue |
| mutual_override | gsis_relief_changed_v2 | 2114085432831676 | PENDING | View arrangement | recipient_name, duty_date, change_details |
| (new) absence_on_behalf | gsis_absence_on_behalf_v1 | 1110444688418734 | PENDING | Approve or deny | see roster-absence-on-behalf.md |

Exact bodies: v1 body with the final "…here: {{n}}." sentence replaced by "…using the button below." (urgent: "…acknowledge your duty now using the button below."). Fetch the live body with the Meta API or ask Claude; compute `bodySha256` from the live body, never from this table.

Staff-page links (owner ruling 3 Nov: "yes", buttons too). Static URL buttons, no button parameter; drop the URL body field. Drafted by Claude, awaiting owner confirm before Meta submission:
| contact_review | gsis_contact_review_v2 | button "Open Contacts" → https://contacts.gsps.edu.sg/ (must equal CONTACTS_PUBLIC_URL) |
| relief_unacknowledged | gsis_relief_unacknowledged_v2 | "Open Roster" → https://roster.gsps.edu.sg/ |
| relief_urgent_smc | gsis_relief_urgent_smc_v2 | "Open Roster" → https://roster.gsps.edu.sg/ |
| smc_attention | gsis_relief_attention_v3 | "Open Roster" → https://roster.gsps.edu.sg/ |
On a non-production origin (publicOrigin not roster.gsps.edu.sg), keep v1 so the link is never wrong.

## Build
1. `notification-worker/template-contracts.json`: add a `variants.buttons` entry for each PENDING row, same shape as mutual_request; `privateLinkPurpose` unchanged; `submissionState` from Meta.
2. Sender: when the button variant is selected, drop the URL body field and send the token as the button component parameter (`sub_type: url`, `index: 0`, `parameters: [{type: text, text: <token>}]`). Never put the full URL in the parameter.
3. `templates.activation.json`: switch mutual_request to v2 now (APPROVED). Add the five PENDING ones **disabled**; the owner flips each when Meta shows APPROVED. Fallback to v1 while disabled.
4. Same behaviour on the D1/edge send path and the Google path (if both build payloads).
5. Tests: payload shape per template (body param count matches, button param = token, no URL in body); disabled variant falls back to v1; token with `.`/`-`/`_` passes through unescaped.

## Second item: Wen Di (3 Nov)
She acknowledged, yet got the reminder; her link then said "expired". Context: Daily Notify sent at 07:12 from a draft, then "Let teachers see" published at 12:05 after the Venues recovery.
Questions to answer with evidence before fixing:
1. Does publish re-issue tokens or bump a revision that invalidates the 07:12 link? If so, is "expired" the right message, or should the old token redirect to the current duties?
2. Is the acknowledgement keyed to a revision, so a republish resets it and the reminder fires?
3. Fix so an acknowledgement for the same duty (date, period, class) survives a republish, and a stale token shows the current duties instead of "expired". Owner ruling 3 Nov: "yes" to both; no option flag needed. Still expire after the normal link age and for revoked staff.

## Acceptance
Full suite green; Claude exact-head review; no live send in tests; owner flips activation.
