# WhatsApp v2 (buttons instead of long links): readiness, 6 Nov 2026

Meta: all 12 v2 templates are APPROVED (checked 6 Nov via the WhatsApp Business account).

| Route | Today | v2 button template | Ready to switch? |
|---|---|---|---|
| mutual_request (peer request) | **already v2** | gsis_relief_request_v2 | live |
| stapler_timetable (timetable changed) | **already v2** | gsis_timetable_updated_button_v2 | live |
| relief_assignment | v1 (long link) | gsis_relief_assignment_v2 | **yes** (contract in repo) |
| relief_updated | v1 | gsis_relief_updated_v2 | **yes** |
| relief_reminder | v1 | gsis_relief_reminder_v2 | **yes** |
| relief_urgent | v1 | gsis_relief_urgent_v2 | **yes** |
| mutual_override | v1 | gsis_relief_changed_v2 | **yes** |
| contact_review | v1 | gsis_contact_review_v2 | no: approved on Meta, exact body/buttons not captured as a repo contract |
| relief_unacknowledged | v1 | gsis_relief_unacknowledged_v2 | no: same |
| relief_urgent_smc | v1 | gsis_relief_urgent_smc_v2 | no: same |
| smc_attention | gsis_relief_attention_v2 | (v3 pending in repo, not on Meta) | no |
| relief_evening | v1 | gsis_relief_evening_v2 (approved) | not selected by design (v1 retained) |

How to switch the 5 ready routes (no code change): Cloudflare → gsis-roster-notifications → Settings → Variables → `WHATSAPP_TEMPLATES_JSON` → replace its value with the content of `docs/reference/whatsapp-templates-buttons-on.json` (same mapping as today with `variants.buttons.enabled: true` on those 5 routes) → Deploy. The Worker checks the live Meta body and buttons before each send; a mismatch falls back safely (not sent, reason recorded).
Roll back: paste the previous value (`notification-worker/templates.activation.json`).
Before switching: confirm the current `WHATSAPP_TEMPLATES_JSON` value equals `notification-worker/templates.activation.json` (if it was edited by hand, merge the 5 flags into it instead of replacing).
Remaining 3 (contact_review, relief_unacknowledged, relief_urgent_smc): Codex task to capture the exact approved body/buttons as contracts, then they can be switched the same way.
