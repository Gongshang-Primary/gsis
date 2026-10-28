# Conditional relief instructions: submitted contract

Submitted to Meta on 17 October 2026 and read back with the exact body and examples below. Last observed state: Pending, Utility, en_GB. Do not submit a duplicate. Sending remains disabled, and Pending is not approval.

| Setting | Value |
| --- | --- |
| Template name | `gsis_relief_instruction_v1` |
| Meta template ID | `2516068742237019` |
| Category | Utility |
| Language | English (UK), `en_GB` |
| Parameter format | Positional |
| Components | One text body; no header, footer or buttons |
| Fields | Seven |

Exact submitted body:

```text
*Instructions for relief lesson*

Hi {{1}}, please note the following instructions for your assigned relief lesson at Gongshang Primary School.

Class: {{2}}
Date: {{3}}
Period and time: {{4}}

Lesson instructions:
{{5}}

For clarification, please contact {{6}}, the absent teacher:
{{7}}

Thank you.
```

| Field | GSiS value | Submitted fictional example |
| --- | --- | --- |
| `{{1}}` | recipient_name | Teacher A |
| `{{2}}` | class | 3A |
| `{{3}}` | duty_date | 19 Oct 2026 (Mon) |
| `{{4}}` | period_and_time | Period 3, 8:30 to 9:00 am |
| `{{5}}` | conditional_instruction | Collect the English worksheet from the staff room before the lesson. Guide pupils through pages 1 and 2. Return completed work to the class tray. |
| `{{6}}` | absent_teacher_name | Teacher B |
| `{{7}}` | absent_teacher_contact | https://wa.me/6590000000 |

The final fields identify the absent teacher, separately from the relief recipient. GSiS resolves that teacher through current Contacts data, using a complete WhatsApp link from the mobile number or the school email when mobile is unavailable. Required fields must be complete before dispatch; do not invent a contact or use the recipient's own details.

The canonical body, hash and runtime field order are in `template-contracts.json`. The submission record and fictional examples remain in `proposed-template-submissions.json` for traceability. The revised contract must be used with the matching v0.7.09 payload construction, not the old five-field mapping.

GSiS creates one instruction notice for each matching published assignment period and rule version. It rechecks the current recipient, duty, rule and authoritative absent-teacher contact before sending. Acknowledging the duty does not cancel a later instruction notice. Draft changes do not send messages. Relief publication is limited to the current Singapore school workday.

Runtime requires Approved status, Utility category, exact English (UK) language, exact body and all seven positional fields before sending. If Meta requires revised wording, update the body and hash together before enabling the route. Approval does not enable the global sending switch or the individual notification route. No live send or activation is part of this build.
