# Activate GSiS WhatsApp for v0.8.2

Install the matching full v0.8.2 backends first (Contacts and Calendar, then Deploy), the five frontend ZIPs, and the separate notification Worker using `notification-worker/dashboard-worker.mjs` (the `.txt` copy is identical). Keep the same URLs, secrets, private R2 binding, cron and intended flags. Roster supplies the local save, published-notice and private media flow; Contacts frontend supplies the new personal Google Contacts action. The Worker dispatches notifications, Inbox replies and audit exports independently of allocation.

The approved in-text URL template remains the default. The release also supports the prepared `gsis_timetable_updated_button_v2` timetable contract with **View Detail** and **Acknowledge** URL buttons. Switch only after Meta confirms approval of the exact body, language and button definitions. The disabled example is not evidence of current approval or an activation action.

Roster Pages and the separate notification Worker have separate settings. Uploading the Roster ZIP does not update the scheduled Worker or copy its variables. Both must receive the v0.8.2 code after the backend updates described below.

This guide prepares activation. No live flags were changed and no message was sent while building the package.

The existing approved notification routes can continue with their configured contracts. The optional two-button timetable variant requires its own exact approval and mapping; do not replace or edit an approved template body while assuming its earlier approval still applies. Human Inbox activation and its separate optional duty-alert template are covered in [the Inbox runbook](docs/INBOX_v0.8.2.md). Incoming images use the same private media binding as voice notes.

## Recorded approval and delivery observations

The user's 19 October 2026 Inbox screenshot showed the received texts Inbox Test and Inbox Test2. This confirms their capture and display. It does not verify outgoing reply delivery, private voice playback or optional duty alerts. Those remain separate checks.

The operator's later diag4 log on 18 October 2026 reported all 21 contracts matching, Approved and enabled, with `connectionsReady: true`. It reported Graph API `v23.0`. Earlier observations of four Pending contracts are historical. `sendingTested: false` describes that read-only check. The user later confirmed the 05:45 WhatsApp message arrived on 19 October 2026, Singapore time. This confirms that reported delivery; the v0.7.13 release recorded that observation. These are historical observations, not a fresh check of the v0.8.2 installation. Preparing this package sent no provider message.

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

The optional activation JSON below selects all 21 routes. The packaged false flags are fresh-install defaults; retain the intended active values when upgrading a working deployment. This file does not change live flags. Runtime verifies approval, exact body, language and URL buttons where applicable before sending. Expired or superseded jobs do not become valid again.

## 1. Install the applicable update

For the full release, use the existing projects in this order:

1. Update `Contacts_Backend_v0.8.2.gs` and `Calendar_Backend_v0.8.2.gs` at their existing web-app URLs.
2. Update `Deploy_Backend_v0.8.2.gs` at its existing web-app URL.
3. Upload the matching v0.8.2 frontend ZIPs, including Contacts and Roster, to the existing five Pages projects.
4. Deploy the complete `notification-worker/dashboard-worker.mjs` to the existing separate notification Worker; the `.txt` copy is identical.

Publish Apps Script as a new version of each existing deployment at the same `/exec`; saving editor code alone does not update the service. Preserve properties, records, active flags, private media binding and cron. See [Deployment](DEPLOYMENT.md). Installing the code does not configure Google Contacts consent, approve a template, publish a timetable or send a test message.

For a first installation or an older incomplete installation, follow [Setup and maintenance](docs/GSiS-Setup-and-Maintenance-v0.8.2.md). Install the required complete backend files, matching frontend ZIPs and the entire `notification-worker/dashboard-worker.mjs` or its identical `.txt` copy. Preserve URLs and records on an existing installation. Do not paste `index.js` alone into the Worker editor.

## 2. Confirm the shared connections

Open Cloudflare Workers & Pages, select the Roster Pages project, then Settings, Variables and Secrets. Select Production. Repeat in the separate notification Worker.

| Setting | Roster Pages | Notification Worker |
| --- | --- | --- |
| `APPS_SCRIPT_URL` | Existing Deploy web app URL ending in /exec | Same |
| `CALENDAR_APPS_SCRIPT_URL` | Existing Calendar web app URL ending in /exec | Same |
| `CALENDAR_PROXY_SECRET` | Existing encrypted Calendar secret | Same |
| `ROSTER_SERVICE_SECRET` | Existing dedicated encrypted service secret | Same |
| `EXTERNAL_LINK_SECRET` | Existing dedicated encrypted private link secret | Same |
| `EXTERNAL_LINK_PREVIOUS_SECRET` | Optional previous key during an intentional seven-day rotation overlap | Same |
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

Configured automatic SMC summary slots have their existing quiet-hour exception. An explicit **Send WhatsApp** click for an eligible published teacher timetable also requests immediate dispatch during quiet hours, including a future published date. Automatic teacher notices and reminders retain their schedules and deadlines. No extra routine 06:30 summary is added outside the configured list.

The System Config allocation switch is separate from the Cloudflare scheduled service flag. Switching allocation Off preserves manual Auto-allocate, saved assignments, report scheduling and acknowledgement reminders. The timer does not publish for SMC.

Manual edits in Assign Relief and Stapler remain local until **Save to online**. **Confirm** marks a saved Stapler plan ready for allocation and freezes the upcoming Confirmed preview available to eligible ordinary teachers. Later edits do not change that preview until another Confirm. **Let teachers see** separately releases saved arrangements; **Send WhatsApp** uses the publication. The combined action performs both named steps. Save and Excel export do not publish or message. SMC may overwrite allocations before or after publication and after a period starts, with an audit trail rather than an approval block.

The automatic daily employment report uses email through the Deploy helper account. It sends once after publication at the configured time, or after first publication if that time has passed. Past dates and explicit resends use the stored report snapshot. This is separate from ordinary teachers' **Daily Updates**, which shows grouped published absent/relief lessons and no Relief Load, private reasons or quotas.

## 6. Copy the complete route JSON

Paste the complete one-line contents of `notification-worker/templates.activation.json` into `WHATSAPP_TEMPLATES_JSON` in both projects when activating routes. It is **4,135 UTF-8 bytes**, below the 5,120-byte variable limit encountered during activation. Keep it compact; pretty-printing the old file exceeded that limit. It retains all 21 route names, languages, body hashes, enable switches and summary limits. Runtime obtains approval status from Meta, so copied status and verification-date fields are unnecessary.

For a paused installation use `{}` or `notification-worker/templates.disabled.example.json`; all routes in that example remain disabled. Neither file contains credentials.

```json
{"mutual_request":{"name":"gsis_relief_request_v1","language":"en_GB","enabled":true,"bodySha256":"e2f88d19f08ce961bf513224028e820d8b6a08f258d36f2ce700d8fadfc7ad36","summaryMaxCharacters":1024},"mutual_override":{"name":"gsis_relief_changed_v1","language":"en_GB","enabled":true,"bodySha256":"749edb8920ccd75bdf30526742eec67cadfe392a75878baaf80e9f67f7aae5c3","summaryMaxCharacters":1024},"contact_review":{"name":"gsis_contact_review_v1","language":"en_GB","enabled":true,"bodySha256":"5e0c7080d0386968c042e19b1d4a5cb968e05953eb69ca6286b87d5000914e40","summaryMaxCharacters":1024},"relief_assignment":{"name":"gsis_relief_assignment_v1","language":"en_GB","enabled":true,"bodySha256":"dbbc03f5d5d708029b5c62c7025276bfc14ab6434244a3f9ad70a4835a583dd2","summaryMaxCharacters":1024},"relief_updated":{"name":"gsis_relief_updated_v1","language":"en_GB","enabled":true,"bodySha256":"07063c548041f467f9e7b1e9159efffc26afd6ae31bc9883e80222b3fe21fc0f","summaryMaxCharacters":1024},"relief_reminder":{"name":"gsis_relief_reminder_v1","language":"en_GB","enabled":true,"bodySha256":"85faa0c817ea716fa85db1fdbce59f383ee6ad6fdce28acf16e258365629ac57","summaryMaxCharacters":1024},"relief_unacknowledged":{"name":"gsis_relief_unacknowledged_v1","language":"en_GB","enabled":true,"bodySha256":"d998fc781f72ed863069c7171edf9bc6baa8e61e370c1544e5ec82719eece0cf","summaryMaxCharacters":1024},"relief_urgent":{"name":"gsis_relief_urgent_v1","language":"en_GB","enabled":true,"bodySha256":"9d9e8965667a01205be101d2d85524966c194b0c1cd223a4b0f02cddb948f5da","summaryMaxCharacters":1024},"relief_urgent_smc":{"name":"gsis_relief_urgent_smc_v1","language":"en_GB","enabled":true,"bodySha256":"04a471667a7b4ab196723faf083c03d3efa2564fe4b5e2d36e369f56c216d4c5","summaryMaxCharacters":1024},"relief_evening":{"name":"gsis_relief_evening_v1","language":"en_GB","enabled":true,"bodySha256":"2a304cb253c2a479054456b59eaee42bfcfd7f84ab850f253892dcec786811a7","summaryMaxCharacters":1024},"relief_morning":{"name":"gsis_relief_morning_v1","language":"en_GB","enabled":true,"bodySha256":"b3009ec5257e543007a1f4376ce17d3496c73242806d3ea2776ae68ea7f6f771","summaryMaxCharacters":1024},"absence_update":{"name":"gsis_absence_update_v1","language":"en_GB","enabled":true,"bodySha256":"a420012bd6329823f4230d2f07d3ce6b67fb66a08eec141d2780edf3e3d72ad5","summaryMaxCharacters":1024},"relief_manual_review":{"name":"gsis_relief_manual_review_v1","language":"en_GB","enabled":true,"bodySha256":"f5e3f7566836c327251efcf5098e9041b82edf2301514fd060b418ce0d7aaded","summaryMaxCharacters":1024},"capacity_warning":{"name":"gsis_relief_capacity_warning_v1","language":"en_GB","enabled":true,"bodySha256":"485c4c68a32d419879943334a6ea9c28bc146c94f33c7bb317862af1e7802066","summaryMaxCharacters":1024},"relief_final":{"name":"gsis_relief_final_v1","language":"en_GB","enabled":true,"bodySha256":"924dfff4c90543569170ba65da8705c6a444b2d92bc08d88aefed8742bd3d7cb","summaryMaxCharacters":1024},"conditional_relief_instruction":{"name":"gsis_relief_instruction_v1","language":"en_GB","enabled":true,"bodySha256":"93eb9ef8c917dd27080fb8f662eb2eee1aa8a277d18b9f24d3c4d2730da82723","summaryMaxCharacters":1024},"urgent_forward":{"name":"gsis_urgent_forward_v1","language":"en_GB","enabled":true,"bodySha256":"ff20ca9b56ac87b376e07dae5055e106b58ab1a29695a2cb42049b13e7df5356","summaryMaxCharacters":1024},"smc_attention":{"name":"gsis_relief_attention_v2","language":"en_GB","enabled":true,"bodySha256":"640ce7d7db1fed87483ea77c32c5286ea473b09c42f4ac9b3fcf292652bcc43e","summaryMaxCharacters":1024},"stapler_timetable":{"name":"gsis_timetable_updated_v1","language":"en_GB","enabled":true,"bodySha256":"b7ea3b9c0741face4f14e08d84793fe3588a2f010ec8d629d2801db59f3bffcb","summaryMaxCharacters":1024},"stapler_request":{"name":"gsis_timetable_sponsor_v1","language":"en_GB","enabled":true,"bodySha256":"740a0dbae98d03ada92af8e11602d180daa3054221fabc67d0442a7080a9a37f","summaryMaxCharacters":1024},"stapler_decision":{"name":"gsis_timetable_access_v1","language":"en_GB","enabled":true,"bodySha256":"f36a327edb998054baf402b6a7c6df03c77804ad00425d659d3936c7e72d63b5","summaryMaxCharacters":1024}}
```

## 7. Check one real daily flow

1. On a verified school workday, report your own test absence and arrange one real test assignment.
2. Select yourself in the duty roster if you want duty SMC alerts to reach only you during this test.
3. Use Save to online, then Let teachers see for that date. Inspect the published summaries and WhatsApp Readiness before an explicitly authorised Send WhatsApp test.
4. Open your individual timetable link and use its Acknowledge control.
5. Confirm the filled acknowledgement indicator in Daily Notify. Reopen the same private link, then check a deliberate saved and republished change requires acknowledgement of its current version.

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

The human Inbox is separate from the automated contact menu. Follow [the v0.8.2 Inbox runbook](docs/INBOX_v0.8.2.md) for Pages settings, the verified Meta callback, private voice/JPEG/PNG storage, the separate minute Worker and a controlled installed-service check. All SMC/Admin can access conversations; new-message alerts go only to eligible current duty SMC. Ordinary teachers cannot fetch private attachments. Enable optional WhatsApp duty alerts only after their dedicated exact template is approved. Readiness indicates configuration, not proven capture or delivery. The contact-menu link opens the configured relief portal without importing its records.

The first configured slot in each summary phase is the fresh report. With defaults, 05:30 always starts a new morning summary even if nothing changed overnight. Moving or removing that first slot changes the start of the fresh morning cycle; an empty phase disables its summaries.

## Retained settings

Existing saved automatic allocation settings remain in Roster operations.json. Retain that file and the backend properties that locate it when updating code. The one-time `allocationRulesVersion:1` migration places subject matching last while preserving the relative order of the other rules; later saved priority choices and all rule toggles remain retained. The new limits default to 9 total and 6 consecutive periods only when absent. Inspect these saved settings after installation. A new backend with a new operational store starts with defaults. Cloudflare activation flags are separate from the saved Roster business rules.


## v0.8.2 timetable buttons and seven-day links

Keep the complete `notification-worker/templates.activation.json` mapping for the existing approved routes while the button variant is pending. The latest recorded Meta check on 21 October 2026 is PENDING. After checking Meta approval, merge the `stapler_timetable` entry from `notification-worker/templates.buttons.pending.example.json` into that complete JSON and intentionally set its `enabled` value to true. Apply the same complete mapping to both Roster Pages and the notification Worker. The example contains one route only and remains disabled; pasting it as the full map would drop the other routes. Check the exact contract in `notification-worker/template-contracts.json`, including **View Detail** and **Acknowledge** button text, order and URL base.

The two-button variant has three body parameters and two URL-button parameters. The existing in-text URL template keeps its four body parameters. Runtime validates the selected contract and normalises dynamic body fields to avoid invalid linebreak/tab formatting; template paragraph layout belongs to the approved template itself. Do not manually mix parameters between variants. A pending, rejected or mismatched variant is blocked rather than sent under another contract.

The private page needs no Google sign-in. Keep `external.html`, its assets and `/api/external` outside a blanket sign-in wall, while retaining the signed capability checks and normal protection on staff APIs. Timetable links are recipient/date scoped, repeatedly accessible and valid for seven days from original issuance. Opening and acknowledgement do not consume the link or extend its deadline. Preserve the link secret during deployment; during a planned rotation retain the old key as `EXTERNAL_LINK_PREVIOUS_SECRET` on both services for outstanding links.

The Acknowledge URL opens the acknowledgement action at the top of the private page; navigating to it does not acknowledge on the teacher's behalf. A changed publication requires review and acknowledgement of the current notice. A filled Daily Notify indicator means confirmed acknowledgement; grey means pending. Meta accepted, delivered and read states remain distinct.

An eligible day must be published before individual or bulk teacher notification. Allow advance publishing governs releasing a new future day; an already published future date can be notified immediately. All affected includes a correction owed after an earlier changed notice. Baseline-identical teachers without an outstanding correction are excluded. Teachers absent for the full school day are excluded from timetable WhatsApp and the acknowledgement population. For partial absences, only changed timetable content or a correction owed during periods they are present qualifies; absent-only changes do not. Saved online absences are checked again before queued dispatch; publication content remains unchanged. A response timeout or uncertain provider result must be reconciled with its original job/receipt before retrying; it does not authorise a duplicate send.

## Independent audit export

Normal minute-worker operation also calls the signed allocation-audit exporter; it does not require enabling WhatsApp just to write the trail. The existing Deploy account needs write access beneath the configured Roster root. Confirm `Allocation Audit/YYYY/MM/YYYY-MM-DD.txt` and its private structured Evidence file after accepted allocation changes. Export failures retry independently and do not undo saved SMC choices. Diagnostics mode replaces the normal cycle, so restore it to false after diagnosis. See the setup guide for archive-watermark retention and capacity recovery.
