# GSiS WhatsApp current relief link

## 2026-10-19: WhatsApp menu access to the existing relief system

Status: queued requirement for the next authorised build. No code deployment, release build, school-data change, message send or live menu change performed by this task.

Add a first menu item titled "Report Absence", with description "Open the current relief system". Selecting it replies with the clickable URL https://roster.diveanalytics.com/. The URL was checked on 19 October and redirected to its Roster login page offering Google login. No authenticated workflow was inspected.

This preserves a route to the existing reporting workflow for staff using the former duty-phone number, now on Cloud API. Retain Urgent Message, School Layout, Collect / Return ICT and Call General Office. The link does not submit an absence, copy data into GSiS, confirm receipt or change notification/publication rules.

For the next build, update the menu selection ID, backend action allowlist and reply mapping together. Use a Pages URL setting such as WHATSAPP_CURRENT_RELIEF_URL and the existing HTTPS-link validation helper. Document the setting. The separate scheduled Worker has no incoming webhook and does not require this setting for its timer. Regenerate generated Worker files if shared source changes. Verify selection-to-link handling and the existing options before packaging.

Continuity limitation: the link does not restore the old duty phone's human WhatsApp inbox. Typed messages, voice notes and conversations expecting human attention require a separately defined inbox/handoff process. Do not imply that a Dive absence enters GSiS. Inbox migration, coexistence and cross-system integration are outside this logged change.

## Completed source disposition: v0.7.12

The menu selection, backend allowlist and HTTPS reply mapping are implemented in v0.7.12, including the Pages-only WHATSAPP_CURRENT_RELIEF_URL setting. Existing menu options remain. Focused simulated checks passed; production activation remains separate.

The original request above is retained for traceability; its queued wording is historical. No deployment or live school-data change was performed.

