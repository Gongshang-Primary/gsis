# Activate GSiS Suite v0.9.1 WhatsApp

Use this guide for the current release. The complete settings, ownership, template parameters and retained observations are in [WhatsApp parameters](WHATSAPP_PARAMETERS.md). This package does not change live settings, approve templates or send messages. Preserve working production flags, URLs, secrets, Roster ownership, Drive stores and private bindings during an ordinary upgrade.

## 1. Install matching code

1. Update the existing Contacts and Calendar Apps Script deployments using their complete v0.9.1 backend files.
2. Update the existing, separate Deploy and Roster Apps Script deployments; preserve their current URLs and the sole Roster writer.
3. Upload each v0.9.1 frontend ZIP to its matching existing Pages project.
4. Replace the separate notification Worker's code with the entire `notification-worker/dashboard-worker.mjs` or identical `.txt` file.
5. For LORD, OVERLORD and STARLORD, follow `LORD_SETUP_v0.9.1.md`: add existing core values to Script Properties and Pages bindings before replacing code, preserve booking peppers and session settings, and retain `LORD_WA_*` properties, records and queues.

Saving Apps Script editor code alone does not update its web app deployment. Roster Pages `APPS_SCRIPT_URL` and the notification Worker's `APPS_SCRIPT_URL` must both point to the current standalone Roster `/exec` URL. An older unsplit installation needs the documented guarded Roster cutover first; do not create a second active writer. The import-based `notification-worker/index.js` is for a source deployment and is not the standalone dashboard file.

## 2. Preserve or supply settings

1. Open Production Variables and Secrets for Roster Pages and separately for the notification Worker.
2. Reconcile each with the exact names and locations in [WhatsApp parameters](WHATSAPP_PARAMETERS.md).
3. Keep `ROSTER_SERVICE_SECRET` identical in Roster Pages, the Worker, Roster Apps Script and Contacts Apps Script.
4. Retain each sender, template-account and signed-callback account identity in its own field; never infer one from another.
5. Preserve `EXTERNAL_LINK_SECRET` and any intentional rotation overlap key so existing seven-day links remain valid.
6. Keep the notification Worker's Cron trigger at `* * * * *`.

Fresh or intentionally paused installations use `WHATSAPP_ENABLED=false`, `ROSTER_AUTOMATION_ENABLED=false`, `WHATSAPP_MENU_ENABLED=false`, `WHATSAPP_INBOX_ALERTS_ENABLED=false`, and `WHATSAPP_TEMPLATES_JSON={}`. Ordinary upgrades retain working intended values. `WHATSAPP_DIAGNOSTICS_ENABLED` is normally false.

The required menu values are:

| Setting | Intended value |
| --- | --- |
| `WHATSAPP_CURRENT_RELIEF_URL` | `https://roster.gsps.edu.sg/` |
| `WHATSAPP_LAYOUT_URL` | Verified deployed school Layout URL |
| `WHATSAPP_LORD_URL` | Verified deployed LORD device portal URL |
| `GENERAL_OFFICE_PHONE` | Verified General Office number in international format |

Changing the Report Absence menu target requires an explicit Production variable update and redeployment of Roster Pages. Uploading the frontend ZIP does not update that variable. This ordinary menu reply does not require a new Meta template. Do not enable the menu until all four values are known and valid.

With `WHATSAPP_DURABLE_INGRESS=true`, bind the same `GSIS_JOBS` D1 database and required schema in Pages and Worker. The Worker processes queued incoming messages, so also give it the menu flag and values if menus are enabled, and the same private `WHATSAPP_INBOX_MEDIA` bucket if media capture is enabled. Without durable ingress, menu handling is on Pages. Keep private media inaccessible through public bucket URLs.

`NOTIFICATION_DISPATCH_URL` and `NOTIFICATION_QUEUE` enable optional immediate dispatch wakes. Without that pair, the existing minute schedule drains notifications. Follow the parameter reference rather than inventing a dispatcher URL.

## 3. Choose notification routes

1. Retain the complete intended `WHATSAPP_TEMPLATES_JSON` mapping on both projects.
2. For deliberate activation, use the complete compact `notification-worker/templates.activation.json`.
3. To keep routes paused, use `{}` or `notification-worker/templates.disabled.example.json`.
4. Merge a single-route example into the complete object; never replace the other routes accidentally.
5. Check Sending and Approval separately in WhatsApp Readiness.

The canonical contracts define all 21 routes, exact hashes, ordered BODY parameters and optional URL buttons. Runtime verifies current Meta approval and exact contract before sending. Historical file status is not an approval override. The GSPS origin's enabled legacy timetable route adopts the recorded approved `gsis_timetable_updated_button_v2` contract; disabled routes remain disabled. `templates.buttons.approved.example.json` documents that variant. No approved template needs renaming for Suite v0.9.1.

The separate Inbox alert `gsis_inbox_new_message_v1` requires its own exact approved contract and `WHATSAPP_INBOX_ALERTS_ENABLED=true`. Inbox capture and ordinary eligible replies do not require the school menu or automatic allocation flag. LORD template settings and consent remain separate in LORD Apps Script.

## Complete activation mapping

This compact source mapping intentionally enables all 21 existing routes. Use only when those routes should be active; use `{}` to keep routes paused. The defaults and runtime checks described above still apply.

```json
{"mutual_request":{"name":"gsis_relief_request_v1","language":"en_GB","enabled":true,"bodySha256":"e2f88d19f08ce961bf513224028e820d8b6a08f258d36f2ce700d8fadfc7ad36","summaryMaxCharacters":1024},"mutual_override":{"name":"gsis_relief_changed_v1","language":"en_GB","enabled":true,"bodySha256":"749edb8920ccd75bdf30526742eec67cadfe392a75878baaf80e9f67f7aae5c3","summaryMaxCharacters":1024},"contact_review":{"name":"gsis_contact_review_v1","language":"en_GB","enabled":true,"bodySha256":"5e0c7080d0386968c042e19b1d4a5cb968e05953eb69ca6286b87d5000914e40","summaryMaxCharacters":1024},"relief_assignment":{"name":"gsis_relief_assignment_v1","language":"en_GB","enabled":true,"bodySha256":"dbbc03f5d5d708029b5c62c7025276bfc14ab6434244a3f9ad70a4835a583dd2","summaryMaxCharacters":1024},"relief_updated":{"name":"gsis_relief_updated_v1","language":"en_GB","enabled":true,"bodySha256":"07063c548041f467f9e7b1e9159efffc26afd6ae31bc9883e80222b3fe21fc0f","summaryMaxCharacters":1024},"relief_reminder":{"name":"gsis_relief_reminder_v1","language":"en_GB","enabled":true,"bodySha256":"85faa0c817ea716fa85db1fdbce59f383ee6ad6fdce28acf16e258365629ac57","summaryMaxCharacters":1024},"relief_unacknowledged":{"name":"gsis_relief_unacknowledged_v1","language":"en_GB","enabled":true,"bodySha256":"d998fc781f72ed863069c7171edf9bc6baa8e61e370c1544e5ec82719eece0cf","summaryMaxCharacters":1024},"relief_urgent":{"name":"gsis_relief_urgent_v1","language":"en_GB","enabled":true,"bodySha256":"9d9e8965667a01205be101d2d85524966c194b0c1cd223a4b0f02cddb948f5da","summaryMaxCharacters":1024},"relief_urgent_smc":{"name":"gsis_relief_urgent_smc_v1","language":"en_GB","enabled":true,"bodySha256":"04a471667a7b4ab196723faf083c03d3efa2564fe4b5e2d36e369f56c216d4c5","summaryMaxCharacters":1024},"relief_evening":{"name":"gsis_relief_evening_v1","language":"en_GB","enabled":true,"bodySha256":"2a304cb253c2a479054456b59eaee42bfcfd7f84ab850f253892dcec786811a7","summaryMaxCharacters":1024},"relief_morning":{"name":"gsis_relief_morning_v1","language":"en_GB","enabled":true,"bodySha256":"b3009ec5257e543007a1f4376ce17d3496c73242806d3ea2776ae68ea7f6f771","summaryMaxCharacters":1024},"absence_update":{"name":"gsis_absence_update_v1","language":"en_GB","enabled":true,"bodySha256":"a420012bd6329823f4230d2f07d3ce6b67fb66a08eec141d2780edf3e3d72ad5","summaryMaxCharacters":1024},"relief_manual_review":{"name":"gsis_relief_manual_review_v1","language":"en_GB","enabled":true,"bodySha256":"f5e3f7566836c327251efcf5098e9041b82edf2301514fd060b418ce0d7aaded","summaryMaxCharacters":1024},"capacity_warning":{"name":"gsis_relief_capacity_warning_v1","language":"en_GB","enabled":true,"bodySha256":"485c4c68a32d419879943334a6ea9c28bc146c94f33c7bb317862af1e7802066","summaryMaxCharacters":1024},"relief_final":{"name":"gsis_relief_final_v1","language":"en_GB","enabled":true,"bodySha256":"924dfff4c90543569170ba65da8705c6a444b2d92bc08d88aefed8742bd3d7cb","summaryMaxCharacters":1024},"conditional_relief_instruction":{"name":"gsis_relief_instruction_v1","language":"en_GB","enabled":true,"bodySha256":"93eb9ef8c917dd27080fb8f662eb2eee1aa8a277d18b9f24d3c4d2730da82723","summaryMaxCharacters":1024},"urgent_forward":{"name":"gsis_urgent_forward_v1","language":"en_GB","enabled":true,"bodySha256":"ff20ca9b56ac87b376e07dae5055e106b58ab1a29695a2cb42049b13e7df5356","summaryMaxCharacters":1024},"smc_attention":{"name":"gsis_relief_attention_v2","language":"en_GB","enabled":true,"bodySha256":"640ce7d7db1fed87483ea77c32c5286ea473b09c42f4ac9b3fcf292652bcc43e","summaryMaxCharacters":1024},"stapler_timetable":{"name":"gsis_timetable_updated_button_v2","language":"en_GB","enabled":true,"bodySha256":"c045ccb418e1680e2f528de915ba3897511bd7514eb9941b67f83fab2917c5b0","summaryMaxCharacters":1024},"stapler_request":{"name":"gsis_timetable_sponsor_v1","language":"en_GB","enabled":true,"bodySha256":"740a0dbae98d03ada92af8e11602d180daa3054221fabc67d0442a7080a9a37f","summaryMaxCharacters":1024},"stapler_decision":{"name":"gsis_timetable_access_v1","language":"en_GB","enabled":true,"bodySha256":"f36a327edb998054baf402b6a7c6df03c77804ad00425d659d3936c7e72d63b5","summaryMaxCharacters":1024}}
```

## 4. Verify connections when needed

1. For a new or intentionally paused installation, leave sending flags false while checking configuration.
2. Temporarily set `WHATSAPP_DIAGNOSTICS_ENABLED=true` on the notification Worker.
3. Inspect the next `roster-notification-connections` event for sender, templates, signed backend/Contacts and Calendar checks.
4. Restore `WHATSAPP_DIAGNOSTICS_ENABLED=false` to resume the normal scheduled cycle.
5. Confirm Meta's existing callback is `https://roster.gsps.edu.sg/api/whatsapp/webhook`, with the correct verify token and `messages` subscription.

A callback challenge does not prove that real signed callbacks pass the account and phone filters. `connectionsReady` does not prove sending, delivery or acknowledgement. The Worker's ordinary browser URL returns 404; its optional `/dispatch` route accepts authenticated POST wakes only. An ordinary working upgrade need not pause service for this diagnostic.

## 5. Check business settings

1. Review the SMC Duty Roster for eligible staff and target dates.
2. Review System Config's saved allocation switch, rule order, workload limits and summary slots.
3. Retain the active timetable baseline and authoritative Calendar school-date connection.
4. Review Contacts Admin notification Staff IDs in `ROSTER_NOTIFICATION_ADMIN_IDS` if that route is used.
5. For LORD, keep the existing one-minute `processSecondaryQueueTrigger` and do not add duplicates.

Default Singapore duty-summary slots are 16:00 through 21:30 every 30 minutes, then 05:30, 05:45, 06:00, 06:15 and 06:29. The first slot in each phase sends a fresh report; later unchanged summaries are suppressed after successful delivery. The allocator hands over at 06:30. Turning off saved automatic allocation does not disable manual Auto-allocate, reports or acknowledgement reminders.

Save to online, Confirm, Let teachers see and Send WhatsApp are distinct actions. The timer does not publish on behalf of SMC. Configured automatic duty summaries and explicit eligible teacher sends retain their scoped quiet-hour exceptions. Preserve queued jobs and receipts during diagnosis.

## 6. Installed acceptance check

Use an explicitly authorised controlled recipient for a real test after installation. Check ingestion, private image/audio viewing, outgoing acceptance, delivered/read callbacks, private timetable access and explicit acknowledgement separately. A delivery/read callback is not a Roster acknowledgement. If an outcome is uncertain, inspect recorded state before sending again.

No live acceptance test was performed while preparing this package. Existing reported successful messages and source-recorded approvals remain dated observations, not a fresh claim about this deployment.

## Intentional pause

Set `WHATSAPP_ENABLED=false` in both projects and `WHATSAPP_MENU_ENABLED=false` wherever ingress runs to pause capture and sending. Saved conversations remain readable. This does not stop allocation or email. To pause the scheduled service's automation too, set `ROSTER_AUTOMATION_ENABLED=false`; to stop only automatic allocation, use the saved System Config switch. Preserve secrets and records.
