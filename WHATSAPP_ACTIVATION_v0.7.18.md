# Activate GSiS WhatsApp for v0.7.18

Roster Pages and the separate notification Worker have separate settings. From v0.7.17, publish the Contacts backend, then Deploy backend, then upload the Roster frontend. The existing notification Worker remains compatible and can remain installed. Uploading the Roster ZIP does not update the scheduled Worker or copy its variables.

This guide prepares activation. No live flags were changed and no message was sent while building the package.

This release retains the existing notification routes and their template contracts. The v0.7.18 changes do not require new templates for those routes. Human Inbox activation and its separate optional duty-alert template are covered in [the exact Inbox runbook](docs/INBOX_v0.7.18.md).

## Recorded approval and delivery observations

The user's 19 October 2026 Inbox screenshot showed the received texts Inbox Test and Inbox Test2. This confirms their capture and display. It does not verify outgoing reply delivery, private voice playback or optional duty alerts. Those remain separate checks.

The operator's later diag4 log on 18 October 2026 reported all 21 contracts matching, Approved and enabled, with `connectionsReady: true`. It reported Graph API `v23.0`. Earlier observations of four Pending contracts are historical. `sendingTested: false` describes that read-only check. The user later confirmed the 05:45 WhatsApp message arrived on 19 October 2026, Singapore time. This confirms that reported delivery; the v0.7.13 release recorded that observation. Preparing v0.7.18 does not send a provider message.

| Function | Recorded approval state |
| --- | --- |
| Peer relief request and change notices | Approved |
| Relief assignments, updates, urgent notices and acknowledgement reminders | Approved |
| Duty SMC planning summaries, capacity alerts and attention notices | Approved |
| Contacts Admin review and urgent message forwarding | Approved |
| Conditional relief lesson instructions | Approved |
| Stapler timetable change notice | Approved |
| Suspended timetable sponsorship request | Approved |
| Suspended timetable sponsorship outcome | Approved |

Evening planning uses `gsis_relief_evening_v1`. Evening v2 stays in Meta and is not selected. Attention notices use Utility v2, not Marketing v1.

The optional activation JSON below selects all 21 routes. The packaged false flags are fresh-install defaults; retain the intended active values when upgrading a working deployment. This file does not change live flags. Runtime still verifies approval, exact body and language before sending. Expired or superseded jobs do not become valid again.

## 1. Install the applicable update

For an existing v0.7.17 installation, publish the complete Contacts and Deploy backend files as new versions on their existing web apps, then upload the Roster frontend ZIP. Keep the existing `/exec` URLs, properties, records, active flags, private media binding and cron. The existing notification Worker remains compatible; its dispatch contract is unchanged. Follow [Deployment](DEPLOYMENT.md) for the exact order.

For a first installation or an older incomplete installation, follow [Setup and maintenance](docs/GSiS-Setup-and-Maintenance-v0.7.18.md). Install the required complete backend files, matching frontend ZIPs and the entire `notification-worker/dashboard-worker.txt`. Preserve URLs and records on an existing installation. Do not paste `index.js` alone into the Worker editor.

## 2. Confirm the shared connections

Open Cloudflare Workers & Pages, select the Roster Pages project, then Settings, Variables and Secrets. Select Production. Repeat in the separate notification Worker.

| Setting | Roster Pages | Notification Worker |
| --- | --- | --- |
| `APPS_SCRIPT_URL` | Existing Deploy web app URL ending in /exec | Same |
| `CALENDAR_APPS_SCRIPT_URL` | Existing Calendar web app URL ending in /exec | Same |
| `CALENDAR_PROXY_SECRET` | Existing encrypted Calendar secret | Same |
| `ROSTER_SERVICE_SECRET` | Existing dedicated encrypted service secret | Same |
| `EXTERNAL_LINK_SECRET` | Existing dedicated encrypted private link secret | Same |
| `ROSTER_PUBLIC_ORIGIN` | `https://roster.gsps.edu.sg` | Same |
| `CONTACTS_PUBLIC_URL` | `https://contacts.gsps.edu.sg` | Same |
| `WHATSAPP_PHONE_NUMBER_ID` | Existing sender ID for the school number | Same |
| `WHATSAPP_TEMPLATE_ACCOUNT_ID` | Existing template and billing account ID | Same |
| `WHATSAPP_ACCOUNT_ID` | Account identity in the actual signed callback's entry.id | Same |
| `WHATSAPP_API_VERSION` | Retain the working configured version, including v; the successful 18 October diag4 log used `v23.0` | Same |
| `WHATSAPP_ACCESS_TOKEN` | Existing encrypted system user token | Same |
| `WHATSAPP_APP_SECRET` | Existing encrypted Meta app secret | Same |
| `WHATSAPP_VERIFY_TOKEN` | Existing encrypted callback verification token | Same |
| `WHATSAPP_TEMPLATES_JSON` | Complete JSON from section 6 | Same |

Retain Roster Pages' existing `BRIDGE_SECRET` and `GOOGLE_CLIENT_ID`. The timer uses the dedicated service signature; it does not sign in as a teacher.

The same `ROSTER_SERVICE_SECRET` must also be stored in **both Deploy and Contacts Apps Script**. The Calendar secret must match Calendar's own configuration. Do not replace working secrets just to install this release.

Do not copy the template account ID into `WHATSAPP_ACCOUNT_ID` just because both fields mention an account. The account listings returned different account identities in this check. The signed callback's actual `entry.id` is the evidence needed for this filter. A successful callback challenge alone does not validate real message callbacks. Check the existing callback configuration before changing this field.

For Contacts review alerts, set `ROSTER_NOTIFICATION_ADMIN_IDS` in Deploy Script Properties to the comma separated Staff ID values of the Admin recipients. Those people must still be authorised Admin users in Contacts and have valid mobile numbers. An empty value means no Contacts review WhatsApp recipients.

Save variables before deploying the code that uses them. Redeploy Roster Pages after changes, and save/deploy the Worker. Do not set secrets as plain text.

## 3. Optional connection check for a new or paused installation

An ordinary code upgrade does not require stopping a working service or repeating this check. Diagnostics mode pauses the normal timer cycle; use it only during an intentional setup or diagnostic window, then restore normal operation.

1. On a fresh or deliberately paused installation, keep `WHATSAPP_ENABLED=false`, `WHATSAPP_MENU_ENABLED=false` and `ROSTER_AUTOMATION_ENABLED=false` in both projects.
2. Set `WHATSAPP_DIAGNOSTICS_ENABLED=true` in the notification Worker only, then deploy it.
3. Confirm its Cron trigger is `* * * * *`, which invokes it every minute.
4. Open Worker Observability and inspect the next `roster-notification-connections` event.
5. Check configuration, Meta sender, exact templates, signed backend/Contacts and Calendar.
6. Restore `WHATSAPP_DIAGNOSTICS_ENABLED=false`, then deploy the Worker again.

Diagnostic mode replaces the normal timer cycle. Leaving it true prevents scheduled allocation and message dispatch. The connection check sends no staff messages. It does not prove delivery or convert Pending approval into Approved.

The separate Worker's browser URL returns 404 by design. Its job is the timer, not a public page.

## 4. Enable the applicable functions

For an upgrade, keep each already working production value unless intentionally changing that function. The table describes activation of the complete notification/automation service. Core Inbox capture and queued replies do not require either the menu or allocation-automation flag.

| Flag | Roster Pages Production | Notification Worker | Purpose |
| --- | --- | --- | --- |
| `WHATSAPP_ENABLED` | `true` | `true` | Permit Inbox capture and replies, plus dispatch of enabled and approved notification routes |
| `WHATSAPP_TEMPLATES_JSON` | Section 6 JSON | Same JSON | Select all matching notification routes |
| `ROSTER_AUTOMATION_ENABLED` | `true` | `true` | Worker runs scheduled reports, reminders and allocation checks; Pages reports this setup state |
| `WHATSAPP_DIAGNOSTICS_ENABLED` | `false` | `false` | Leave normal operation active |
| `WHATSAPP_MENU_ENABLED` | `true` after the four menu settings below are verified | `false` | Incoming menu is served on Pages; the timer has no incoming webhook |

For the incoming menu, also set these **Roster Pages** text values:

| Setting | Value to enter |
| --- | --- |
| `WHATSAPP_CURRENT_RELIEF_URL` | `https://roster.diveanalytics.com/` |
| `WHATSAPP_LAYOUT_URL` | Actual deployed school Layout URL |
| `WHATSAPP_LORD_URL` | Actual school LORD device booking and return URL |
| `GENERAL_OFFICE_PHONE` | Verified General Office number in international format |

If these four values are not known, leave only the menu flag false. Template notifications can still operate. The menu responds to staff who message the school number; enabling a flag alone does not open a conversation window.

Save and deploy the Worker. Redeploy Roster Pages with the new Production values. A later Wrangler deployment applies its `wrangler.toml` values, so update that local configuration to match the intended active settings before using Wrangler again. The packaged file starts with false installation defaults.

## 5. Complete the Roster settings

1. Open SMC Duty Roster and select eligible SMC members and their duty start/end dates. SLs, AMs and OMs are excluded.
2. Open System Config as Admin and enable Scheduled automatic allocation if you want the 16:00 overnight allocation cycle.
3. Review the saved automatic rules. The one-time v0.7.16 migration puts Same teaching subject last and retains the relative order of the other rules; subsequent saved priority edits are preserved. Each of the six ranked rules and the two workload limits has an On/Off toggle. New workload defaults are 9 total and 6 consecutive periods, enforced as strict limits when enabled. Admin can edit; SMC can view. Maximum coverage within hard constraints remains the fixed first objective. Manual suggestions separately put remaining weekly R first.
4. Verify the active baseline and Calendar school date. Missing annual R history starts at zero; existing history is retained. A failed history load remains an error.
5. Configure duty-summary times in Singapore time. Defaults are 16:00 through 21:30 every 30 minutes for the following date, then 05:30, 05:45, 06:00, 06:15 and 06:29 for the current date. The first evening and 05:30 summaries are fresh, including zero absences; later unchanged summaries are suppressed after successful delivery. Recipients come from duty membership for the target date.
6. For Daily Updates email, select recipients, confirm both recorded addresses and choose the send time.

The configured SMC summary slots have a scoped quiet-hour exception for those summaries. Other routes retain their existing quiet hours. Automatic allocation timing and the handover to manual operation remain unchanged; no extra routine 06:30 summary is added outside the configured list.

The System Config allocation switch is separate from the Cloudflare scheduled service flag. Switching allocation Off preserves manual Auto-allocate, saved assignments, report scheduling and acknowledgement reminders. The timer does not publish for SMC.

Confirm a Stapler plan to make its latest saved version available to allocation, including future dates. Daily publication is separate: Publish Only releases the selected day without notices, while Publish & Notify releases it and queues notices for teachers with timetable changes. Daily Notify provides bulk, affected-only and individual notification actions.

Daily Updates uses email through the Deploy helper account, not WhatsApp. It sends once automatically after publication at the configured time, or immediately after first publication if that time has passed. Past dates and manual resends use the original stored report snapshot.

## 6. Copy the complete route JSON

Paste the complete one-line contents of `notification-worker/templates.activation.json` into `WHATSAPP_TEMPLATES_JSON` in both projects when activating routes. It is **4,135 UTF-8 bytes**, below the 5,120-byte variable limit encountered during activation. Keep it compact; pretty-printing the old file exceeded that limit. It retains all 21 route names, languages, body hashes, enable switches and summary limits. Runtime obtains approval status from Meta, so copied status and verification-date fields are unnecessary.

For a paused installation use `{}` or `notification-worker/templates.disabled.example.json`; all routes in that example remain disabled. Neither file contains credentials.

```json
{"mutual_request":{"name":"gsis_relief_request_v1","language":"en_GB","enabled":true,"bodySha256":"e2f88d19f08ce961bf513224028e820d8b6a08f258d36f2ce700d8fadfc7ad36","summaryMaxCharacters":1024},"mutual_override":{"name":"gsis_relief_changed_v1","language":"en_GB","enabled":true,"bodySha256":"749edb8920ccd75bdf30526742eec67cadfe392a75878baaf80e9f67f7aae5c3","summaryMaxCharacters":1024},"contact_review":{"name":"gsis_contact_review_v1","language":"en_GB","enabled":true,"bodySha256":"5e0c7080d0386968c042e19b1d4a5cb968e05953eb69ca6286b87d5000914e40","summaryMaxCharacters":1024},"relief_assignment":{"name":"gsis_relief_assignment_v1","language":"en_GB","enabled":true,"bodySha256":"dbbc03f5d5d708029b5c62c7025276bfc14ab6434244a3f9ad70a4835a583dd2","summaryMaxCharacters":1024},"relief_updated":{"name":"gsis_relief_updated_v1","language":"en_GB","enabled":true,"bodySha256":"07063c548041f467f9e7b1e9159efffc26afd6ae31bc9883e80222b3fe21fc0f","summaryMaxCharacters":1024},"relief_reminder":{"name":"gsis_relief_reminder_v1","language":"en_GB","enabled":true,"bodySha256":"85faa0c817ea716fa85db1fdbce59f383ee6ad6fdce28acf16e258365629ac57","summaryMaxCharacters":1024},"relief_unacknowledged":{"name":"gsis_relief_unacknowledged_v1","language":"en_GB","enabled":true,"bodySha256":"d998fc781f72ed863069c7171edf9bc6baa8e61e370c1544e5ec82719eece0cf","summaryMaxCharacters":1024},"relief_urgent":{"name":"gsis_relief_urgent_v1","language":"en_GB","enabled":true,"bodySha256":"9d9e8965667a01205be101d2d85524966c194b0c1cd223a4b0f02cddb948f5da","summaryMaxCharacters":1024},"relief_urgent_smc":{"name":"gsis_relief_urgent_smc_v1","language":"en_GB","enabled":true,"bodySha256":"04a471667a7b4ab196723faf083c03d3efa2564fe4b5e2d36e369f56c216d4c5","summaryMaxCharacters":1024},"relief_evening":{"name":"gsis_relief_evening_v1","language":"en_GB","enabled":true,"bodySha256":"2a304cb253c2a479054456b59eaee42bfcfd7f84ab850f253892dcec786811a7","summaryMaxCharacters":1024},"relief_morning":{"name":"gsis_relief_morning_v1","language":"en_GB","enabled":true,"bodySha256":"b3009ec5257e543007a1f4376ce17d3496c73242806d3ea2776ae68ea7f6f771","summaryMaxCharacters":1024},"absence_update":{"name":"gsis_absence_update_v1","language":"en_GB","enabled":true,"bodySha256":"a420012bd6329823f4230d2f07d3ce6b67fb66a08eec141d2780edf3e3d72ad5","summaryMaxCharacters":1024},"relief_manual_review":{"name":"gsis_relief_manual_review_v1","language":"en_GB","enabled":true,"bodySha256":"f5e3f7566836c327251efcf5098e9041b82edf2301514fd060b418ce0d7aaded","summaryMaxCharacters":1024},"capacity_warning":{"name":"gsis_relief_capacity_warning_v1","language":"en_GB","enabled":true,"bodySha256":"485c4c68a32d419879943334a6ea9c28bc146c94f33c7bb317862af1e7802066","summaryMaxCharacters":1024},"relief_final":{"name":"gsis_relief_final_v1","language":"en_GB","enabled":true,"bodySha256":"924dfff4c90543569170ba65da8705c6a444b2d92bc08d88aefed8742bd3d7cb","summaryMaxCharacters":1024},"conditional_relief_instruction":{"name":"gsis_relief_instruction_v1","language":"en_GB","enabled":true,"bodySha256":"93eb9ef8c917dd27080fb8f662eb2eee1aa8a277d18b9f24d3c4d2730da82723","summaryMaxCharacters":1024},"urgent_forward":{"name":"gsis_urgent_forward_v1","language":"en_GB","enabled":true,"bodySha256":"ff20ca9b56ac87b376e07dae5055e106b58ab1a29695a2cb42049b13e7df5356","summaryMaxCharacters":1024},"smc_attention":{"name":"gsis_relief_attention_v2","language":"en_GB","enabled":true,"bodySha256":"640ce7d7db1fed87483ea77c32c5286ea473b09c42f4ac9b3fcf292652bcc43e","summaryMaxCharacters":1024},"stapler_timetable":{"name":"gsis_timetable_updated_v1","language":"en_GB","enabled":true,"bodySha256":"b7ea3b9c0741face4f14e08d84793fe3588a2f010ec8d629d2801db59f3bffcb","summaryMaxCharacters":1024},"stapler_request":{"name":"gsis_timetable_sponsor_v1","language":"en_GB","enabled":true,"bodySha256":"740a0dbae98d03ada92af8e11602d180daa3054221fabc67d0442a7080a9a37f","summaryMaxCharacters":1024},"stapler_decision":{"name":"gsis_timetable_access_v1","language":"en_GB","enabled":true,"bodySha256":"f36a327edb998054baf402b6a7c6df03c77804ad00425d659d3936c7e72d63b5","summaryMaxCharacters":1024}}
```

## 7. Check one real daily flow

1. On a verified school workday, report your own test absence and arrange one real test assignment.
2. Select yourself in the duty roster if you want duty SMC alerts to reach only you during this test.
3. Publish for that day, then inspect WhatsApp Readiness and the notification status.
4. Open your individual timetable link and use its Acknowledge control.
5. Confirm the acknowledgement in Roster, then test a deliberate same day change and republication.

Selecting yourself for duty controls duty SMC alerts only. It does not redirect teacher notices, Contacts Admin alerts or urgent forwards to you. Those go to their actual recipients.

A WhatsApp delivered/read callback is not a Roster acknowledgement. A successful timer invocation is not proof of a message being sent. Check the specific notice status.

If a send is uncertain, inspect the message status and callback before requesting another send. The system holds an ambiguous send instead of blindly duplicating it.

## Pause sending

To intentionally pause the service, set `WHATSAPP_ENABLED=false` in both projects and `WHATSAPP_MENU_ENABLED=false` on Pages, then redeploy. This pauses new Inbox capture and WhatsApp sending; saved conversations remain readable. It does not stop allocation or email. To stop the full scheduled service too, set `ROSTER_AUTOMATION_ENABLED=false` on the Worker. To stop only automatic allocation, use System Config.

## References and evidence

Cloudflare's current documentation supports these deployment paths and settings:

[Pages direct upload](https://developers.cloudflare.com/pages/get-started/direct-upload/) supports a root `_worker.js` in a dashboard ZIP upload. [Pages variables and secrets](https://developers.cloudflare.com/pages/functions/bindings/) describes Production variables and encrypted secrets. [Cron triggers](https://developers.cloudflare.com/workers/configuration/cron-triggers/) describes the scheduled handler.

[Google MailApp](https://developers.google.com/apps-script/reference/mail/mail-app) documents the email scope and send service. The application's source contracts and `notification-worker/template-observation-20261018.json` record the matching Meta checks. Existing Cloudflare values and actual signed callback identity were not tested in this build. The 05:45 delivery confirmation is a user report, not a build-time live send.


## Inbox activation

The human Inbox is separate from the automated contact menu. Follow [the exact v0.7.18 Inbox activation steps](docs/INBOX_v0.7.18.md) for Pages settings, Meta callback, private voice storage, the separate minute Worker and a controlled post-deployment check. Enable optional WhatsApp duty alerts only after their dedicated template is approved. All SMC and Admin can access conversations. WhatsApp new-message alerts go only to current eligible duty SMC. Existing notice template approval does not establish approval of the separate Inbox alert template. The Inbox configuration display reports local setting presence and format only; it does not verify live capture or delivery. The package build made no live account changes or sends. The contact menu link opens Dive; it does not import its absence records.

The first configured slot in each summary phase is the fresh report. With defaults, 05:30 always starts a new morning summary even if nothing changed overnight. Moving or removing that first slot changes the start of the fresh morning cycle; an empty phase disables its summaries.

## Retained settings

Existing saved automatic allocation settings remain in Roster operations.json. Retain that file and the backend properties that locate it when updating code. The one-time `allocationRulesVersion:1` migration places subject matching last while preserving the relative order of the other rules; later saved priority choices and all rule toggles remain retained. The new limits default to 9 total and 6 consecutive periods only when absent. Inspect these saved settings after installation. A new backend with a new operational store starts with defaults. Cloudflare activation flags are separate from the saved Roster business rules.
