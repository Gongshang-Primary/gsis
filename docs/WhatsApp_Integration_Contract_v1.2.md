# GSiS WhatsApp Template Integration Specification

Version: 1.2 | Updated: 15 October 2026 (Singapore time)

## Scope and submission state

This document specifies the 13 templates submitted to Gongshang Primary through the WhatsApp Business MCP on 14 October 2026. All 13 were PENDING in the final submission check. This records that check, not their current approval state. Recheck approval and category before enabling a template. The app was subsequently published by the school. No staff messages were sent during setup.

Language for every template: `en_GB`. Submitted category: `UTILITY`. Parameter format: `POSITIONAL`. Every parameter is a BODY text parameter. No header, footer or button components were submitted. The bold titles are literal text in the body, enclosed in asterisks.

## Sender contract

Use the exact template name and language below. Send parameters in numeric placeholder order. Do not send the literal placeholder labels or the sample values. Preserve the text approved by Meta; runtime fills variables only. Different templates have different parameter counts. The old universal four-field sender is incompatible with this set.

School sending number: +65 9783 6300. Phone number ID: `1330932803442822`. Business ID: `1367896852088548`. Template-owning account ID: `971916692625997`. App ID: `1432764048802128`. Account IDs used for webhook validation must be verified against actual callback payloads; do not infer the callback account ID solely from the template-owning account.

Example request shape (template 1):

```json
{
  "messaging_product": "whatsapp",
  "to": "<recipient mobile in international format>",
  "type": "template",
  "template": {
    "name": "gsis_relief_request_v1",
    "language": {
      "code": "en_GB"
    },
    "components": [
      {
        "type": "body",
        "parameters": [
          {
            "type": "text",
            "text": "<recipient_name>"
          },
          {
            "type": "text",
            "text": "<requesting_teacher_name>"
          },
          {
            "type": "text",
            "text": "<duty_date>"
          },
          {
            "type": "text",
            "text": "<lessons_and_periods>"
          },
          {
            "type": "text",
            "text": "<private_approval_url>"
          }
        ]
      }
    ]
  }
}
```

## Shared business rules

1. Resolve recipients and mobile numbers from authoritative Contacts records, and recheck current recipient eligibility before dispatch. Send only through the school’s permitted WhatsApp notification channel.
2. Use Singapore time for all schedules. Format dates as `15 Oct 2026 (Thu)`. Use explicit lesson times and venues from the actual timetable.
3. Published teacher notices describe the current published arrangement. Draft optimisation sends no teacher notices. Duty SMC may receive draft planning summaries.
4. Reading or receiving WhatsApp is not acknowledgement, acceptance or rejection. Record those actions in Roster.
5. Stop outstanding reminders and acknowledgement escalation when the relevant published duty is acknowledged. Recheck state immediately before sending.
6. Quiet hours: 21:30–05:45. Planning runs are every 30 minutes from 16:00 through 21:30, then morning runs at 05:45, 06:00 and 06:15, with final allocation at 06:29. Define the exact 21:30 boundary once in the scheduler so it cannot both send and suppress the same notice.
7. Failed delivery policy: at most three attempts, immediate, approximately +1 minute and +3 minutes. These are delivery retries, not acknowledgement reminders. After exhaustion, alert SMC through Roster.
8. Retain duplicate protection using stable business event, recipient and published revision identifiers. Never blindly retry an uncertain API outcome; reconcile acceptance/delivery state first. The existing v0.7.00 queue treats uncertain sends separately, and the retry extension must preserve that protection.
9. Private links must be scoped to their intended recipient and permitted records, expire, and expose no unrelated teachers or unpublished allocations. Use current authenticated Roster links for SMC and Contacts review.
10. For published assignment and update links, show the recipient’s complete updated timetable at the top and complete baseline timetable below, in the same table with aligned day and period columns. Include instructions and acknowledgement for the current published revision. Do not claim this view is already implemented.
11. Summaries must omit medical details, absence supporting documents and the full staff directory. External relief contact summaries should contain the minimum review information; permanent contact details are reviewed inside Contacts.
12. A cancelled duty remains viewable where needed for change acknowledgement. Reassignment must notify the outgoing and incoming teachers without duplicating the new assignment notice.

## Exact templates

### 1. gsis_relief_request_v1

Meta template ID: `1406506811640852`. Body parameters: **5**.

**Recipient:** Selected colleague.

**Trigger:** Immediately after a peer relief request is submitted. The request must still be pending; acceptance or rejection occurs in Roster.

**Exact submitted body:**

```text
*Peer Relief Arrangement*

Hi {{1}}, {{2}} has requested on https://roster.gsps.edu.sg that you cover his/her lesson(s) on {{3}}: {{4}}.

Accept or reject using this link: {{5}}.

Thank you.
```

| Position | Runtime field | Submission example |
| --- | --- | --- |
| `{{1}}` | `recipient_name` | Sample Teacher |
| `{{2}}` | `requesting_teacher_name` | Sample Colleague |
| `{{3}}` | `duty_date` | 15 Oct 2026 (Thu) |
| `{{4}}` | `lessons_and_periods` | P3 English, periods 3 and 4 |
| `{{5}}` | `private_approval_url` | https://roster.gsps.edu.sg/external.html#sample-not-valid |

Examples are fictional and are not live approval credentials. A `.html#sample-not-valid` example must never be sent as a real action link.

### 2. gsis_relief_changed_v1

Meta template ID: `1775720290362486`. Body parameters: **4**.

**Recipient:** Both affected teachers, individually.

**Trigger:** When Relief Team publishes an override or change to a mutually accepted peer arrangement.

**Exact submitted body:**

```text
*Peer Relief Arrangement Updated*

Hi {{1}}, Relief Team has changed the peer relief arrangement for {{2}}.

{{3}}

View the published arrangement here: {{4}}.

Thank you.
```

| Position | Runtime field | Submission example |
| --- | --- | --- |
| `{{1}}` | `recipient_name` | Sample Teacher |
| `{{2}}` | `duty_date` | 15 Oct 2026 (Thu) |
| `{{3}}` | `change_details` | The published relief arrangement for periods 3 and 4 has been updated. |
| `{{4}}` | `private_published_duties_url` | https://roster.gsps.edu.sg/external.html#sample-not-valid |

Examples are fictional and are not live approval credentials. A `.html#sample-not-valid` example must never be sent as a real action link.

### 3. gsis_contact_review_v1

Meta template ID: `1777525793360691`. Body parameters: **4**.

**Recipient:** Configured, currently authorised Contacts Admin recipients.

**Trigger:** On the agreed new inactive external relief contact or proposed permanent contact correction workflow. Review permanent details in Contacts; Contacts remains the source of truth. Verify that new-contact creation actually enqueues this kind; do not assume the existing correction handler covers creation.

**Exact submitted body:**

```text
*Contact Details for Ad Hoc External Relief*

Hi {{1}}.

On https://roster.gsps.edu.sg, contact details for an ad hoc external relief teacher were added or updated on {{2}}.

Please review these details as a Contacts Admin:

{{3}}

Review and confirm the details in Contacts: {{4}}.

Thank you.
```

| Position | Runtime field | Submission example |
| --- | --- | --- |
| `{{1}}` | `recipient_name` | Sample Admin |
| `{{2}}` | `request_date` | 15 Oct 2026 (Thu) |
| `{{3}}` | `contact_review_details` | A correction to an external relief teacher profile is awaiting review. |
| `{{4}}` | `contacts_review_url` | https://contacts.gsps.edu.sg/ |

Examples are fictional and are not live approval credentials. A `.html#sample-not-valid` example must never be sent as a real action link.

### 4. gsis_relief_assignment_v1

Meta template ID: `2331306544355004`. Body parameters: **4**.

**Recipient:** Assigned teacher, including eligible external relief teachers.

**Trigger:** When a new relief assignment is published. Do not notify from draft optimisation.

**Exact submitted body:**

```text
*Relief Assignment*

Hi {{1}}, Relief Team has assigned you relief duties on {{2}}.

{{3}}

View the relief instructions and acknowledge your duties here: {{4}}.

Thank you.
```

| Position | Runtime field | Submission example |
| --- | --- | --- |
| `{{1}}` | `recipient_name` | Sample Teacher |
| `{{2}}` | `duty_date` | 15 Oct 2026 (Thu) |
| `{{3}}` | `lessons_periods_venues` | P3 English, class 3A, periods 3 and 4, venue C3-01. |
| `{{4}}` | `private_timetable_url` | https://roster.gsps.edu.sg/external.html#sample-not-valid |

Examples are fictional and are not live approval credentials. A `.html#sample-not-valid` example must never be sent as a real action link.

### 5. gsis_relief_updated_v1

Meta template ID: `1753999250059547`. Body parameters: **4**.

**Recipient:** Each teacher affected by cancellation or reassignment.

**Trigger:** When a changed relief assignment is published. Summarise removed duties and replacement duties, where applicable.

**Exact submitted body:**

```text
*Relief Assignment Updated*

Hi {{1}}, Relief Team has changed your relief duties for {{2}}.

{{3}}

View your updated timetable and acknowledge the change here: {{4}}.

Thank you.
```

| Position | Runtime field | Submission example |
| --- | --- | --- |
| `{{1}}` | `recipient_name` | Sample Teacher |
| `{{2}}` | `duty_date` | 15 Oct 2026 (Thu) |
| `{{3}}` | `changed_or_cancelled_duties` | Your relief for 3A English in periods 3 and 4 has been cancelled. |
| `{{4}}` | `private_timetable_url` | https://roster.gsps.edu.sg/external.html#sample-not-valid |

Examples are fictional and are not live approval credentials. A `.html#sample-not-valid` example must never be sent as a real action link.

### 6. gsis_relief_reminder_v1

Meta template ID: `2175089153046382`. Body parameters: **4**.

**Recipient:** Assigned teacher.

**Trigger:** 20 minutes before lesson start if the current duty is not acknowledged in Roster. Suppress once acknowledged, cancelled or superseded.

**Exact submitted body:**

```text
*Relief Duty Reminder*

Hi {{1}}, your relief duty on {{2}} starts in 20 minutes and has not been acknowledged in Roster.

{{3}}

View the relief instructions and acknowledge your duty here: {{4}}.

Thank you.
```

| Position | Runtime field | Submission example |
| --- | --- | --- |
| `{{1}}` | `recipient_name` | Sample Teacher |
| `{{2}}` | `duty_date` | 15 Oct 2026 (Thu) |
| `{{3}}` | `lesson_period_time_venue` | 3A English, period 3, 8:30 to 9:00 am, venue C3-01. |
| `{{4}}` | `private_timetable_url` | https://roster.gsps.edu.sg/external.html#sample-not-valid |

Examples are fictional and are not live approval credentials. A `.html#sample-not-valid` example must never be sent as a real action link.

### 7. gsis_relief_unacknowledged_v1

Meta template ID: `3993441010951993`. Body parameters: **5**.

**Recipient:** SMC on duty.

**Trigger:** 10 minutes before lesson start if the current duty remains unacknowledged. Suppress once acknowledged, cancelled or superseded.

**Exact submitted body:**

```text
*Relief Duty Not Acknowledged*

Hi {{1}}, {{2}} has not acknowledged the relief duty on {{3}}.

{{4}}

The lesson starts in 10 minutes. Please contact the teacher and confirm cover.

View the current status here: {{5}}.

Thank you.
```

| Position | Runtime field | Submission example |
| --- | --- | --- |
| `{{1}}` | `duty_smc_name` | Sample Leader |
| `{{2}}` | `assigned_teacher_name` | Sample Teacher |
| `{{3}}` | `duty_date` | 15 Oct 2026 (Thu) |
| `{{4}}` | `lesson_period_start_venue` | 3A English, period 3, 8:30 am, venue C3-01. |
| `{{5}}` | `roster_status_url` | https://roster.gsps.edu.sg |

Examples are fictional and are not live approval credentials. A `.html#sample-not-valid` example must never be sent as a real action link.

### 8. gsis_relief_urgent_v1

Meta template ID: `2373646553447066`. Body parameters: **5**.

**Recipient:** Assigned teacher.

**Trigger:** Immediately when a relief assignment is published less than 20 minutes before its lesson. Urgency remains until acknowledged; this does not authorise an unspecified repeated-send cadence.

**Exact submitted body:**

```text
*Urgent Relief Assignment*

Hi {{1}}, Relief Team has assigned you a relief duty on {{2}} that starts in {{3}} minutes.

{{4}}

Please view the relief instructions and acknowledge your duty now: {{5}}.

Thank you.
```

| Position | Runtime field | Submission example |
| --- | --- | --- |
| `{{1}}` | `recipient_name` | Sample Teacher |
| `{{2}}` | `duty_date` | 15 Oct 2026 (Thu) |
| `{{3}}` | `minutes_remaining` | 12 |
| `{{4}}` | `lesson_period_start_venue` | 3A English, period 3, 8:30 am, venue C3-01. |
| `{{5}}` | `private_timetable_url` | https://roster.gsps.edu.sg/external.html#sample-not-valid |

Examples are fictional and are not live approval credentials. A `.html#sample-not-valid` example must never be sent as a real action link.

### 9. gsis_relief_urgent_smc_v1

Meta template ID: `4510849222577421`. Body parameters: **6**.

**Recipient:** SMC on duty.

**Trigger:** Immediately for the same last-minute publication as template 8 while duty remains unacknowledged.

**Exact submitted body:**

```text
*Urgent Relief Cover*

Hi {{1}}, {{2}} has been assigned relief on {{3}}. The lesson starts in {{4}} minutes.

{{5}}

The duty has not yet been acknowledged. Please check that cover is confirmed.

View the current status here: {{6}}.

Thank you.
```

| Position | Runtime field | Submission example |
| --- | --- | --- |
| `{{1}}` | `duty_smc_name` | Sample Leader |
| `{{2}}` | `assigned_teacher_name` | Sample Teacher |
| `{{3}}` | `duty_date` | 15 Oct 2026 (Thu) |
| `{{4}}` | `minutes_remaining` | 12 |
| `{{5}}` | `lesson_period_start_venue` | 3A English, period 3, 8:30 am, venue C3-01. |
| `{{6}}` | `roster_status_url` | https://roster.gsps.edu.sg |

Examples are fictional and are not live approval credentials. A `.html#sample-not-valid` example must never be sent as a real action link.

### 10. gsis_relief_evening_v1

Meta template ID: `1662539355443373`. Body parameters: **4**.

**Recipient:** SMC on duty for the target duty date.

**Trigger:** First evening update at 16:00. Subsequent notices only when new absences occur during the 30-minute optimisation runs through 21:30.

**Exact submitted body:**

```text
*Relief Planning Update*

Hi {{1}}, here is the relief planning update for {{2}}.

{{3}}

These allocations are drafts pending publication.

Review the plan here: {{4}}.

Thank you.
```

| Position | Runtime field | Submission example |
| --- | --- | --- |
| `{{1}}` | `duty_smc_name` | Sample Leader |
| `{{2}}` | `duty_date` | 15 Oct 2026 (Thu) |
| `{{3}}` | `absence_allocation_uncovered_summary` | 3 teachers have reported absences. 12 lesson periods need relief. 10 periods have planned cover. 2 periods remain uncovered: 3A English, periods 3 and 4. |
| `{{4}}` | `roster_plan_url` | https://roster.gsps.edu.sg |

Examples are fictional and are not live approval credentials. A `.html#sample-not-valid` example must never be sent as a real action link.

### 11. gsis_relief_morning_v1

Meta template ID: `1082281697770168`. Body parameters: **5**.

**Recipient:** SMC on duty.

**Trigger:** Consolidated 05:45 summary: overnight absences, allocations, uncovered periods and Relief Health.

**Exact submitted body:**

```text
*Morning Relief Summary*

Hi {{1}}, here is the relief summary for {{2}}.

{{3}}

Relief Health: {{4}}

These allocations are drafts pending publication.

Review the plan here: {{5}}.

Thank you.
```

| Position | Runtime field | Submission example |
| --- | --- | --- |
| `{{1}}` | `duty_smc_name` | Sample Leader |
| `{{2}}` | `duty_date` | 15 Oct 2026 (Thu) |
| `{{3}}` | `overnight_absence_allocation_summary` | 2 new absences were reported overnight. 5 teachers are absent today. 20 lesson periods need relief. 18 periods have planned cover. 2 periods remain uncovered: 3A English, periods 3 and 4. |
| `{{4}}` | `relief_health_summary` | 2 uncovered periods require attention. |
| `{{5}}` | `roster_plan_url` | https://roster.gsps.edu.sg |

Examples are fictional and are not live approval credentials. A `.html#sample-not-valid` example must never be sent as a real action link.

### 12. gsis_absence_update_v1

Meta template ID: `934616792782108`. Body parameters: **5**.

**Recipient:** SMC on duty.

**Trigger:** At 06:00 and 06:15 only for new absences since the preceding update. After 06:30, new absences trigger an immediate notice. Count new entries accurately; do not assume count equals unique teachers.

**Exact submitted body:**

```text
*New Absence Update*

Hi {{1}}, {{2}} new absence(s) have been reported for {{3}} since the previous update.

{{4}}

Review the latest allocation and publication status here: {{5}}.

Thank you.
```

| Position | Runtime field | Submission example |
| --- | --- | --- |
| `{{1}}` | `duty_smc_name` | Sample Leader |
| `{{2}}` | `new_absence_count` | 1 |
| `{{3}}` | `duty_date` | 15 Oct 2026 (Thu) |
| `{{4}}` | `additional_periods_allocation_summary` | 4 additional lesson periods need relief. 3 periods have planned cover. 1 period remains uncovered: 4B Mathematics, period 5. |
| `{{5}}` | `roster_plan_url` | https://roster.gsps.edu.sg |

Examples are fictional and are not live approval credentials. A `.html#sample-not-valid` example must never be sent as a real action link.

### 13. gsis_relief_manual_review_v1

Meta template ID: `2188657595398105`. Body parameters: **4**.

**Recipient:** SMC on duty.

**Trigger:** 06:30 handover to manual review following the final scheduled 06:29 allocation run. The agreed 06:30–07:30 alert window must not reuse the “final scheduled allocation run is complete” wording when that assertion is false.

**Exact submitted body:**

```text
*Relief Allocation Requires Review*

Hi {{1}}, please review the relief plan for {{2}}.

The final scheduled allocation run is complete.
{{3}}

Please allocate the remaining cover and publish the relief plan here: {{4}}.

Thank you.
```

| Position | Runtime field | Submission example |
| --- | --- | --- |
| `{{1}}` | `duty_smc_name` | Sample Leader |
| `{{2}}` | `duty_date` | 15 Oct 2026 (Thu) |
| `{{3}}` | `uncovered_periods_summary` | 2 periods remain uncovered: 3A English, periods 3 and 4. |
| `{{4}}` | `roster_plan_url` | https://roster.gsps.edu.sg |

Examples are fictional and are not live approval credentials. A `.html#sample-not-valid` example must never be sent as a real action link.

## Implementation and verification checklist

1. Introduce a per-template parameter builder with explicit field order and count; validate at the notification boundary.
2. Add the missing enqueue triggers, scheduler notices, acknowledgements and suppression rules. Do not assume Meta template creation adds these functions.
3. Verify template 1 uses five fields in recipient, requester, date, lessons, link order. Templates 7 and 9 require distinct recipient and assigned-teacher fields.
4. Verify the new-contact review event and correction event both reach Contacts Admins under the agreed review workflow.
5. Check actual approved text, language, category and parameter count against this specification before configuring the template mapping.
6. Test publish, cancel, reassign, acknowledgement, expired links, recipient scope, quiet hours, scheduled summaries and duplicate dispatch.
7. Test definitive failures separately from ambiguous timeouts, with the three-attempt cap and Roster escalation.
8. Perform a permitted single-recipient end-to-end test, including delivery callbacks and acknowledgement, before production enablement.

This document is an integration contract. It does not change production code, approve Meta templates, configure secrets or enable messaging.

## Evening template revision: approved wording, not applied in Meta

On 15 October 2026, Meta returned `PENDING` and `MARKETING` for `gsis_relief_evening_v1`. The school approved the revision below. The attempted update was rejected with error `2388003` because pending templates cannot be edited. The original body in section 10 therefore remains the submitted body. This proposed revision retains the same name, language and four parameters in the same order. Recheck status before editing; content review does not guarantee Utility classification.

```text
*School Relief Allocation Review*

Hi {{1}}, as an SMC member on Relief duty, you need to review lesson cover for {{2}}.

Reported absences, draft cover and uncovered lesson periods:
{{3}}

These allocations are drafts pending publication. Please check for periods pending relief and confirm the relief plan in Roster: {{4}}.

Thank you.
```

## Additional agreed workflow: one-stop WhatsApp contact menu

These requirements extend the original 13 templates. The menu and incoming-message handler have not been submitted as Meta templates or verified in production.

| Option | Behaviour |
| --- | --- |
| Urgent Message | Ask the teacher to type their urgent message, then forward immediately without a Send/Cancel preview. |
| School Layout | Open the publicly accessible school layout. |
| Collect / Return ICT Devices | Open the LORD device collection/return portal. |
| Call General Office | Initiate an ordinary telephone call to the configured General Office landline. |

The four entries are user-facing actions. Do not assume one WhatsApp interactive message can mix four reply, URL and telephone buttons; choose a supported menu presentation during implementation while retaining all four actions. Exact production Layout/LORD URLs and General Office number must be verified before configuration.

### Urgent Message routing

1. Identify the sender from authoritative Contacts using the incoming WhatsApp number; do not trust a name typed into the message as proof of identity.
2. After the teacher selects Urgent Message, prompt: `Type your urgent message for the Relief Team.`
3. Forward the next message immediately to all eligible SMC, excluding school leaders and support staff as agreed. This is distinct from duty-SMC-only allocation alerts.
4. Preserve the teacher’s message wording unchanged. Append sender name and contact number as separate metadata.
5. Confirm submission without claiming recipients have read or acted on it. Record recipient dispatch failures accurately.
6. Deduplicate incoming webhook events so retries cannot forward the same message twice.

Illustrative SMC notice, not a submitted template:

```text
*Urgent Message to Relief Team*

<teacher’s original message, unchanged>

From: <sender name>
Contact: <sender contact number>
```

Forwarding to SMC is a separate outbound message. The sender’s incoming message does not open a service window for every SMC recipient; the sender must use an appropriate approved template where required. No urgent-forwarding template has yet been created. Handling unsupported message types, unknown senders and escalation on recipient failures remains to be specified. This flow does not itself create an absence or allocate relief.

## Additional agreed template: conditional relief instructions

Proposed integration key: `conditional_relief_instruction`. Proposed Meta name: `gsis_relief_instruction_v1`. These names are implementation proposals, not existing Meta assets. No Meta template ID or approval exists yet.

Use one general template for all Roster-defined supplementary instructions, with five positional BODY parameters:

```text
Hi {{1}}, you are providing relief for {{2}} on {{3}}, {{4}}.

{{5}}

Thank you.
```

| Position | Runtime field | Meaning |
| --- | --- | --- |
| `{{1}}` | `recipient_name` | Assigned relief teacher’s name |
| `{{2}}` | `class` | Class label for the matching relief lesson |
| `{{3}}` | `duty_date` | Date formatted as `15 Oct 2026 (Thu)` |
| `{{4}}` | `period_and_time` | Actual matching period and lesson time |
| `{{5}}` | `conditional_instruction` | Predefined message from the matching Roster rule |

### Roster rule behaviour

SMC defines the conditions and predefined operational message in Roster. Conditions select assignments; Meta contains the general wording only. Each matching published relief period generates a separate message to its assigned teacher.

| Example condition | Predefined message |
| --- | --- |
| `(Level = P1 OR Level = P2) AND Period = 12` | SMC’s dismissal instructions |
| `TG is in the selected MTL teaching groups` | SMC’s Mother Tongue relief instructions, including a Layout link if required |

**Send timing:** Send when the relief notification is published. Do not add a scheduled pre-lesson delay. Draft edits send nothing. Repeated publication of an unchanged notification must not resend the instruction.

Evaluate rules against the published assignment and authoritative timetable, with explicit OR within the selected levels and AND between the level and period conditions. Use stable teaching-group IDs rather than fuzzy label matching. Persist the matched rule ID/version, assignment, period, recipient and publication revision for audit and duplicate protection.

Do not merge adjacent periods for these messages: the user explicitly requested separate messages per matching period. Acknowledging a duty must not suppress an instruction that is due on publication; these are distinct notification kinds. Reassignment must invalidate queued instructions for the outgoing teacher.

Multiple matching rules, changed instruction text after publication, removed rules and TG lessons associated with several classes require explicit behaviour before implementation. Do not silently choose a first rule or resend old instructions. No classroom, dismissal text or MTL-specific instructions were supplied in this review; SMC will enter the actual messages in Roster.

## Added verification requirements

1. Verify all four menu options using a real supported WhatsApp UI, including the ordinary telephone action.
2. Verify immediate urgent forwarding, preserved text, sender metadata, recipient exclusions and incoming-event duplicate protection.
3. Verify the conditional instruction’s five-field contract, both example rules, per-period dispatch and publication-only sending.
4. Verify draft suppression, unchanged republish suppression and stale-recipient suppression on reassignment.
5. Submit any new outbound templates through Meta review before enabling their notification kinds.

The specification records agreed behaviour and pending decisions. It does not claim these additional workflows are implemented or that the blocked evening edit was applied.



## Evening template replacement: v2

Decision on 15 October 2026: create `gsis_relief_evening_v2` using the approved revised body shown above, language `en_GB`, requested category `UTILITY`, and the same four BODY fields: duty_smc_name, duty_date, absence_allocation_uncovered_summary, roster_plan_url.

`gsis_relief_evening_v1` is retired from the intended production mapping regardless of its review outcome. Do not use v1 as an automatic fallback. Its historic submission remains in section 10 for audit. Once v2 is approved and verified, configure the evening notice to v2 only. Do not enable v2 while unapproved.

Current v2 state: submitted successfully on 15 October 2026. Meta template ID: `1442160464722287`. Submission response: `PENDING`, category `UTILITY`. These are submission-time values; recheck before enabling. The code mapping has not been changed.
