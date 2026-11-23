# v1 WhatsApp button templates: drafts for Meta submission

Project: v1. Model: Claude. 21 Nov 2026. Status: **submitted 21 Nov 2026 on owner instruction ("Submit all 10"); all PENDING Meta review, category UTILITY.** Nothing was sent to anyone.

Owner decisions (21 Nov 2026): button versions in v1 now; new templates using the v1 address **https://gsis.gsps.edu.sg** (not the v0.9 hosts); evening summary uses the approved `gsis_relief_evening_v2` wording (no button, no new template).

Method: each body is copied from the APPROVED v2 template on Meta (read 21 Nov). Only addresses change. Category UTILITY, language en_GB. Private links use v1's page `https://gsis.gsps.edu.sg/roster/external/#token=<token>`; Meta allows the variable only at the end of the URL, which this meets. v1's link page has no one-click acknowledge, so the timetable template has one button, not v0.9's two.

Sample values are synthetic.

| # | New name | Replaces (v0.9) | Button | Body change from v2 |
| --- | --- | --- | --- | --- |
| 1 | `gsis_v1_relief_request` | `gsis_relief_request_v2` | Review request → `…/roster/external/#token={{1}}` | address in body |
| 2 | `gsis_v1_relief_changed` | `gsis_relief_changed_v1/v2` | View arrangement → token | none |
| 3 | `gsis_v1_contact_review` | `gsis_contact_review_v1/v2` | Open Contacts → `https://gsis.gsps.edu.sg/contacts/` | address in body |
| 4 | `gsis_v1_relief_assignment` | `gsis_relief_assignment_v1/v2` | View and acknowledge → token | none |
| 5 | `gsis_v1_relief_updated` | `gsis_relief_updated_v1/v2` | View and acknowledge → token | none |
| 6 | `gsis_v1_relief_reminder` | `gsis_relief_reminder_v1/v2` | View and acknowledge → token | none |
| 7 | `gsis_v1_relief_unacknowledged` | `gsis_relief_unacknowledged_v1/v2` | Open Roster → `https://gsis.gsps.edu.sg/roster/` | none |
| 8 | `gsis_v1_relief_urgent` | `gsis_relief_urgent_v1/v2` | View and acknowledge → token | none |
| 9 | `gsis_v1_relief_urgent_smc` | `gsis_relief_urgent_smc_v1/v2` | Open Roster → `https://gsis.gsps.edu.sg/roster/` | none |
| 10 | `gsis_v1_timetable_updated` | `gsis_timetable_updated_button_v2` | View and acknowledge → token | one button; address in body |

## Bodies and samples

### 1. gsis_v1_relief_request (peer teacher; a colleague proposes them to cover)
Body: `*Peer Relief Arrangement*\n\nHi {{1}}, {{2}} has requested on https://gsis.gsps.edu.sg that you cover his/her lesson(s) on {{3}}: {{4}}.\n\nPlease use the button below to review and accept or reject this request.\n\nThank you.`
> Hi Ms Tan Mei Ling, Mr Goh Kok Wah has requested on https://gsis.gsps.edu.sg that you cover his/her lesson(s) on Thu 26 Nov 2026: P3-P4 EL, 4 Integrity. … [Review request]

### 2. gsis_v1_relief_changed (peer teacher; SMC publishes a change replacing their accepted arrangement)
Body: `*Peer Relief Arrangement Updated*\n\nHi {{1}}, Relief Team has changed the peer relief arrangement for {{2}}.\n\n{{3}}\n\nView the published arrangement using the button below.\n\nThank you.`

### 3. gsis_v1_contact_review (Contacts Power Users; new inactive external relief contact)
Body: `*Contact Details for Ad Hoc External Relief*\n\nHi {{1}}.\n\nOn https://gsis.gsps.edu.sg, contact details for an ad hoc external relief teacher were added or updated on {{2}}.\n\nPlease review these details as a Contacts Admin:\n\n{{3}}\n\nReview and confirm the details in Contacts using the button below.\n\nThank you.`

### 4. gsis_v1_relief_assignment (relief teacher; new published duties)
Body: `*Relief Assignment*\n\nHi {{1}}, Relief Team has assigned you relief duties on {{2}}.\n\n{{3}}\n\nView the relief instructions and acknowledge your duties using the button below.\n\nThank you.`

### 5. gsis_v1_relief_updated (relief teacher; published duties changed or cancelled)
Body: `*Relief Assignment Updated*\n\nHi {{1}}, Relief Team has changed your relief duties for {{2}}.\n\n{{3}}\n\nView your updated timetable and acknowledge the change using the button below.\n\nThank you.`

### 6. gsis_v1_relief_reminder (relief teacher; 20 min before, not acknowledged)
Body: `*Relief Duty Reminder*\n\nHi {{1}}, your relief duty on {{2}} starts in 20 minutes and has not been acknowledged in Roster.\n\n{{3}}\n\nView the relief instructions and acknowledge your duty using the button below.\n\nThank you.`

### 7. gsis_v1_relief_unacknowledged (duty SMC; 10 min before, not acknowledged)
Body: `*Relief Duty Not Acknowledged*\n\nHi {{1}}, {{2}} has not acknowledged the relief duty on {{3}}.\n\n{{4}}\n\nThe lesson starts in 10 minutes. Please contact the teacher and confirm cover.\n\nView the current status using the button below.\n\nThank you.`

### 8. gsis_v1_relief_urgent (relief teacher; duty starts within about 20 min)
Body: `*Urgent Relief Assignment*\n\nHi {{1}}, Relief Team has assigned you a relief duty on {{2}} that starts in {{3}} minutes.\n\n{{4}}\n\nPlease view the relief instructions and acknowledge your duty now using the button below.\n\nThank you.`

### 9. gsis_v1_relief_urgent_smc (duty SMC; under 10 min, still not acknowledged)
Body: `*Urgent Relief Cover*\n\nHi {{1}}, {{2}} has been assigned relief on {{3}}. The lesson starts in {{4}} minutes.\n\n{{5}}\n\nThe duty has not yet been acknowledged. Please check that cover is confirmed.\n\nView the current status using the button below.\n\nThank you.`

### 10. gsis_v1_timetable_updated (teacher; published Stapler/day change to their timetable)
Body: `*Your timetable for today has changed*\n\nHi {{1}}, your timetable for today, {{2}}, has updates.\n\nSpecifically, the changes are:\n{{3}}\n\nPlease use the button below to view your updated timetable alongside your usual timetable and acknowledge this update.\n\nThank you.\nAccess https://gsis.gsps.edu.sg for more info.`

## Until approval

v1 keeps the approved link-in-body versions (`*_v1`) for routes 2–9 and must not use the v0.9 button templates, whose fixed URLs point at the v0.9 hosts. For routes 1 and 10, v1 uses `gsis_relief_request_v1` and `gsis_timetable_updated_v1` (both APPROVED, link in body) until the new ones are approved.

## Submission record (21 Nov 2026)

| Name | Meta template ID | State at submission |
| --- | --- | --- |
| gsis_v1_relief_request | 1665470368578133 | PENDING |
| gsis_v1_relief_changed | 1645520940586028 | PENDING |
| gsis_v1_contact_review | 1170072542117257 | PENDING |
| gsis_v1_relief_assignment | 1172529062127628 | PENDING |
| gsis_v1_relief_updated | 3256714774522340 | PENDING |
| gsis_v1_relief_reminder | 2311196459674631 | PENDING |
| gsis_v1_relief_unacknowledged | 1205342768583239 | PENDING |
| gsis_v1_relief_urgent | 2140936916521447 | PENDING |
| gsis_v1_relief_urgent_smc | 1625548885229398 | PENDING |
| gsis_v1_timetable_updated | 2208482650072271 | PENDING |

Dynamic button example value: `review-example-not-a-valid-private-link`. Check approval with the read-only template lookup before activating any of them in v1.
