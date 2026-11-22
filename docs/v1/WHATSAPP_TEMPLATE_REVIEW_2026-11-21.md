# WhatsApp template review, 21 November 2026

Project: v1. Owner decisions, recorded by Claude, template by template. Each item states the trigger and a sample in the approved wording; full samples are in [WHATSAPP_TEMPLATES_V09_BASELINE.md](WHATSAPP_TEMPLATES_V09_BASELINE.md).

## Live Meta check (read-only, account "Gongshang Primary", 21 Nov 2026)

36 `gsis_` templates, all APPROVED. Corrections to repository files:
- `gsis_relief_instruction_v1`, `gsis_timetable_sponsor_v1`, `gsis_timetable_access_v1`, `gsis_timetable_updated_v1`, `gsis_system_alert_v1`: APPROVED (repo said PENDING).
- No `gsis_relief_instruction_v2` exists.
- `gsis_inbox_new_message_v1` does **not** exist on Meta, so v0.9 never sent an inbox alert. Not a baseline gap.
- Approved but unused in v0.9: button v2 versions of 9 routes, `gsis_relief_attention_v3`, `gsis_relief_evening_v2`, `gsis_absence_on_behalf_v1` (feature never built; not baseline).

## Decisions

| # | Key | Decision | Note |
| --- | --- | --- | --- |
| 1 | `mutual_request` | Keep | Live uses `gsis_relief_request_v2` (button) |
| 2 | `mutual_override` | Keep | Switch to button v2 (see row B) |
| 3 | `contact_review` | Keep; **verify v1 queues it** | Work W1 |
| 4 | `relief_assignment` | Keep | Button v2 |
| 5 | `relief_updated` | Keep | Button v2 |
| 6 | `relief_reminder` | Keep | Re-confirmed on exact wording; button v2 |
| 7 | `relief_unacknowledged` | Keep | Button v2 |
| 8 | `relief_urgent` | Keep | Button v2 |
| 9 | `relief_urgent_smc` | Keep | Button v2 |
| 10 | `relief_evening` | Keep | Button v2 (`gsis_relief_evening_v2`) |
| 11 | `relief_morning` | Keep | No v2 exists |
| 12 | `absence_update` | **Keep v0.9 rule** | Same-day, LSE excluded; after first "Let teachers see" until 14:00; plus pre-publication late alert |
| 13 | `relief_manual_review` | **Start using** | Work W2 |
| 14 | `capacity_warning` | Keep | |
| 15 | `relief_final` | **Start using** | Work W2 |
| 16 | `conditional_relief_instruction` | Keep | No v2; v1 is APPROVED |
| 17 | `urgent_forward` | Keep | |
| 18 | `smc_attention` | Keep for failures, cut-off and edits | Final-run outcomes move to 13/15 |
| 19 | `stapler_timetable` | Keep | Live uses `gsis_timetable_updated_button_v2` |
| 20 | `stapler_request` | Keep | |
| 21 | `stapler_decision` | Keep | |
| 22 | `system_alert` | **Retire** | Work W3 |
| 23 | `lse_notice` | Keep | New LSE absence, first save only, once per teacher per date, duty SMC |
| 24 | `inbox_alert` | **Build as improvement** | Work W5 |
| B | Button versions | **Switch in v1 now** | Rows 2, 3, 4–10. Work W4 |

## Work created (v1)

| ID | Work | Type | Trigger and acceptance |
| --- | --- | --- | --- |
| W1 | Verify `contact_review` from v1 Roster contact creation | Baseline check | Creating an inactive external relief contact in v1 Roster queues one `contact_review` per Admin; fix if missing |
| W2 | Final-run outcome split | Improvement (owner) | At the 06:29 final scheduled run on a school day: run **complete with uncovered periods** → `relief_manual_review` to duty SMC with the uncovered list; run **complete with none uncovered** → `relief_final` with allocation summary and Relief Health; run **not complete** → `smc_attention` as today. One message per duty SMC per date per outcome; quiet-hours and recheck rules unchanged |
| W3 | Retire `system_alert` | Owner decision | v1 queues no `system_alert`; System Health keeps showing Drive/backup failures |
| W4 | Button versions in v1 | Owner decision | Activate approved v2 for `relief_assignment`, `relief_updated`, `relief_reminder`, `relief_urgent`, `mutual_override`, `contact_review`, `relief_unacknowledged`, `relief_urgent_smc`, `relief_evening`. Capture exact body/button contracts (three exist in `docs/reference/whatsapp-remaining-v2-contracts.json`; evening v2 from Meta). Worker checks live body and buttons before each send; mismatch is not sent and recorded |
| W5 | Inbox alert | Improvement, after baseline | Submit `gsis_inbox_new_message_v1` to Meta (owner approves the submission), then alert duty SMC when a new inbox message arrives |
| W6 | Refresh template contract states | Housekeeping | Update repo states to match the live Meta check above |

No template was created, edited or sent during this review.

## Follow-up decisions (21 Nov 2026, later)

- **W3 needs no code.** v1 never queues `system_alert`: the shared helper is never called and v1 supplies no admin recipients. Recorded as done by evidence.
- **Correction:** `gsis_relief_evening_v2` is not a button version; it is different wording with no button. Owner chose the **v2 wording** for template 10.
- **Buttons and addresses:** approved v2 buttons have fixed v0.9 URLs (`roster.gsps.edu.sg/external.html#…`, `contacts.gsps.edu.sg/`). Owner chose **new v1 templates** at **https://gsis.gsps.edu.sg**. Drafts: [WHATSAPP_V1_BUTTON_TEMPLATES_DRAFT.md](WHATSAPP_V1_BUTTON_TEMPLATES_DRAFT.md). Until approved, v1 uses the approved link-in-body versions, including `gsis_relief_request_v1` and `gsis_timetable_updated_v1` for routes 1 and 19.
- W1 shipped as PR #276.

## Work status (22 Nov 2026)

| ID | Status |
| --- | --- |
| W1 contact review | #276 merged. Creating an inactive external contact queues review for Contacts Power Users. |
| W2 final-run split | #278 merged. The completed 06:29 run queues one outcome alert per date. |
| W3 retire system_alert | Done; no code needed (v1 never queues it) |
| W4 buttons | #277 merged. Ten `gsis_v1_*` templates were submitted and recorded as PENDING. |
| W5 inbox alert | #279 merged. Free-text inbox messages from known and unknown senders can alert the duty SMC once per sender per date, including during quiet hours. Menu responses and urgent forwards are excluded. The submission used `gsis_v1_inbox_new_message` (ID 1798304818089770) and was recorded as PENDING. |
| W6 contract states | Done in v1 docs only. `notification-worker/template-contracts.json` feeds frozen v0.9 outputs, so it stays unchanged; live states are in the Meta check above |

Activation of every new or newly used template is a deployment configuration step after Meta approval, mapped in `WHATSAPP_TEMPLATES_JSON` with parameters in body order.
