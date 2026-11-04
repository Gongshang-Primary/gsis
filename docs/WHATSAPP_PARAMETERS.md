# GSiS Suite v0.9.2 WhatsApp parameter reference

This is the current configuration reference for Roster and LORD notifications. It records source behaviour and retained observations as of 24 October 2026, Singapore time. No live settings, token validity, new template approval or delivery was verified during this release build. Preserve working secrets and operational data during an upgrade. Installation files contain no credentials.

Use the [main README](../README.md) for installation and activation order. Historical activation guides retain the settings known at their release date; use this document for current ownership and defaults. Roster and LORD send independently. A shared school sender does not automatically share configuration, consent records, callback handling or delivery receipts between them.

## Roster platform settings

“Both” means Roster Pages and the separate notification Worker, configured separately. “Required” means required for the named enabled feature; a disabled installation does not need fabricated placeholders. Secrets are encrypted Cloudflare values, never ordinary source variables.

| Exact name | Owner | Type | Requirement and purpose | Known value, default or upgrade handling |
| --- | --- | --- | --- | --- |
| `WHATSAPP_ENABLED` | Both | Text boolean | Required sending and incoming capture gate | Exact `true` enables; fresh install `false`. Preserve intentional live state. |
| `ROSTER_AUTOMATION_ENABLED` | Both | Text boolean | Worker scheduled allocation, reports and reminders; Pages setup status | Fresh install `false`. Independent of WhatsApp and saved allocation switch. |
| `WHATSAPP_MENU_ENABLED` | Pages; also Worker with durable ingress | Text boolean | Optional incoming school menu | Fresh install `false`; enable after all four menu values are valid. |
| `WHATSAPP_INBOX_ALERTS_ENABLED` | Worker; Pages if it dispatches an alert | Text boolean | Optional new Inbox message alerts to eligible duty SMC | Fresh install `false`; requires exact approved `gsis_inbox_new_message_v1`. |
| `WHATSAPP_DIAGNOSTICS_ENABLED` | Worker | Text boolean | Optional bounded connection check | Normally `false`. `true` replaces the entire normal scheduled cycle; restore after diagnosis. |
| `WHATSAPP_TEMPLATES_JSON` | Both | Text JSON object | Required notification route selection | Fresh install `{}` or disabled example. Preserve complete intended mapping; see contracts below. |
| `APPS_SCRIPT_URL` | Both | Text URL | Required standalone Roster backend | Existing Roster deployment ending `/exec`, not Deploy. Preserve installed URL. |
| `BRIDGE_SECRET` | Roster Pages and Roster Apps Script | Secret | Required authenticated browser to backend bridge | Existing matching secret; distinct from service secret. |
| `GOOGLE_CLIENT_ID` | Roster Pages | Text | Required staff Google sign-in | Existing configured client ID; not the notification token. |
| `CALENDAR_APPS_SCRIPT_URL` | Both | Text URL | Required authoritative school dates for scheduled work | Existing Calendar `/exec` deployment. |
| `CALENDAR_PROXY_SECRET` | Both and Calendar Apps Script | Secret | Required Calendar date service authentication | Preserve identical existing value. |
| `ROSTER_SERVICE_SECRET` | Both, Roster Apps Script, Contacts Apps Script | Secret / Script Property | Required signed notification, directory and dispatcher service calls | Same dedicated random secret of at least 32 characters in all four places. |
| `ROSTER_PUBLIC_ORIGIN` | Both; optionally Roster Apps Script | Text HTTPS origin | Required private timetable and action links | `https://roster.gsps.edu.sg`; no path, query, credentials or fragment. |
| `CONTACTS_PUBLIC_URL` | Both | Text HTTPS URL | Required Contacts review link | `https://contacts.gsps.edu.sg`; no credentials, query or fragment. |
| `WHATSAPP_PHONE_NUMBER_ID` | Both | Text numeric ID | Required Meta sender identity | Previously recorded school sender `1330932803442822`; preserve and verify installed sender. |
| `WHATSAPP_TEMPLATE_ACCOUNT_ID` | Both | Text numeric ID | Required template catalogue and billing WABA | Previously recorded `971916692625997`. Not proof of webhook account identity. |
| `WHATSAPP_ACCOUNT_ID` | Both | Text numeric ID | Required webhook and durable job account filter | Exact `entry.id` from an actual signed callback for the installed sender; not inferred from template account. |
| `WHATSAPP_API_VERSION` | Both | Text API version | Required outbound Graph API version | Retain working configured value. Recorded successful 18 October diagnostic used `v23.0`; not a fresh support claim. |
| `WHATSAPP_ACCESS_TOKEN` | Both | Secret | Required messaging and template catalogue access | Existing system user token with assigned assets and required scopes; no value packaged. |
| `WHATSAPP_APP_SECRET` | Both | Secret | Required signed Meta callback validation and configuration checks | Existing Meta app secret; do not reset during an ordinary upgrade. |
| `WHATSAPP_VERIFY_TOKEN` | Both | Secret | Required Meta callback challenge and configuration checks | Match the privately configured callback verification token. |
| `EXTERNAL_LINK_SECRET` | Both | Secret | Required recipient, purpose and date scoped Roster links | Preserve signing key; ordinary update must not invalidate existing links. |
| `EXTERNAL_LINK_PREVIOUS_SECRET` | Both | Secret | Optional deliberate key rotation overlap | Previous key accepted during the seven-day link lifetime; omit if not rotating. |
| `WHATSAPP_SEND_CONCURRENCY` | Worker | Text number | Optional maximum simultaneous notification sends | Source default 12, bounded 1 to 20. Does not change Meta limits. |
| `WHATSAPP_SENDS_PER_SECOND` | Worker | Text number | Optional local notification dispatch pacing | Source default 12, bounded 1 to 20. Does not prove provider throughput allowance. |
| `WHATSAPP_INBOX_MEDIA` | Pages; also Worker with durable ingress | Private R2 binding | Required audio/image bytes for enabled private media capture/viewing | Bind the same private bucket when both execute ingress. No public bucket URL. |
| `WHATSAPP_DURABLE_INGRESS` | Both | Text boolean | Optional D1-backed webhook persistence and minute drain | Default off/unset. Enable both only after shared D1 schema/binding and drain are ready. |
| `GSIS_JOBS` | Both | D1 binding | Required for durable ingress; also shared read claims | Same database, required `gsis_webhook_jobs` schema and index from source; retain data. |
| `NOTIFICATION_DISPATCH_URL` | Roster Pages | Text HTTPS URL | Optional immediate notification wake | Exact deployed notification Worker `/dispatch` URL; no query, fragment or credentials. Unset uses minute schedule. |
| `NOTIFICATION_QUEUE` | Notification Worker | Cloudflare Queue producer and consumer | Required for optional immediate `/dispatch` wake | Configure producer binding and consumer on the same Worker; payloads are wakes, durable job authority stays in Apps Script. |
| `WHATSAPP_CURRENT_RELIEF_URL` | Pages; also Worker with durable ingress/menu | Text HTTPS URL | Required Report Absence menu target | Change intended value to `https://roster.gsps.edu.sg/`. Upload alone does not change a live environment value. |
| `WHATSAPP_LAYOUT_URL` | Pages; also Worker with durable ingress/menu | Text HTTPS URL | Required School Layout menu target | Verified deployed school Layout URL. No live value asserted here. |
| `WHATSAPP_LORD_URL` | Pages; also Worker with durable ingress/menu | Text HTTPS URL | Required Collect / Return ICT menu target | Verified deployed LORD portal URL. No live value asserted here. |
| `GENERAL_OFFICE_PHONE` | Pages; also Worker with durable ingress/menu | Text phone | Required ordinary telephone contact menu item | Verified office number with leading `+` and country code; no invented number. |

All menu links reject non-HTTPS, embedded credentials and fragments. Changing `WHATSAPP_CURRENT_RELIEF_URL` changes an ordinary menu reply; it does not edit or submit a Meta template. With durable ingress enabled, the Worker processes queued incoming messages too, so mirror the menu flag, menu values and private media binding there when those features are enabled. In ordinary direct ingress, the menu and media capture are on Pages.

The Meta callback is `https://roster.gsps.edu.sg/api/whatsapp/webhook`, subscribed to `messages`. Its challenge uses `WHATSAPP_VERIFY_TOKEN`; POST authentication uses the raw-body `X-Hub-Signature-256` and `WHATSAPP_APP_SECRET`, then both account and phone filters. A successful challenge does not validate actual signed callbacks. The previously recorded business root ID `1367896852088548`, template/billing account and sender phone ID are different concepts.

## Apps Script configuration and retained state

| Exact name | Owner | Type | Requirement and purpose | Upgrade handling |
| --- | --- | --- | --- | --- |
| `CONTACTS_API_URL` | Roster Apps Script | URL Script Property | Required authoritative Contacts service `/exec` URL | Retain deployed Contacts URL; do not replace with public Contacts website. |
| `ROSTER_NOTIFICATION_ADMIN_IDS` | Roster Apps Script | Comma-separated Staff IDs | Optional Contacts review WhatsApp recipients | Empty means no recipients; each ID must still be an authorised Contacts Admin with a valid mobile. |
| `ROSTER_PUBLIC_ORIGIN` | Roster Apps Script | HTTPS origin Script Property | Optional backend link origin override | If set, keep aligned with `https://roster.gsps.edu.sg`; otherwise validated service input supplies it. |
| `ROSTER_OPERATIONS_FILE` | Roster Apps Script | Managed Drive file ID | Authoritative operational state, settings and notification intents | Preserve; never create a blank placeholder or point to a new empty store during upgrade. |
| `ROSTER_NOTIFICATION_TRANSPORT_FILE` | Roster Apps Script | Managed Drive file ID | Notification claim, delivery, retry and provider result state | Preserve; created/resolved by backend. |
| `ROSTER_INBOX_FILE` | Roster Apps Script | Managed Drive file ID | Conversations, messages, reply/alert state | Preserve; created/resolved by backend. |

`ROSTER_SERVICE_SECRET`, `BRIDGE_SECRET` and `CALENDAR_PROXY_SECRET` ownership is specified in the preceding table. No extra `INBOX_ENABLED` flag exists. No extra webhook secret belongs in Contacts.

The same minute Worker can run Calendar continuations. These are not WhatsApp credentials: `CALENDAR_BACKGROUND_SYNC` (Worker boolean, off/unset by default), `CALENDAR_SERVICE_SECRET` (matching secret in Worker, Calendar gateway and Calendar Apps Script), and either `CALENDAR_GATEWAY` (Worker service binding) or `CALENDAR_GATEWAY_URL` (Worker HTTPS origin). Preserve separately enabled Calendar behaviour; WhatsApp diagnosis mode temporarily skips the entire scheduled cycle.

## Roster template routes and ordered parameters

Canonical bodies, hashes, IDs and exact button definitions are in `notification-worker/template-contracts.json` in the source archive. The complete activation mapping below is supplied for deliberate route activation. The tables below are generated from that file for this release. Every listed route uses `en_GB`, Utility category and positional text parameters. Parameter order is 1 through N from left to right. The names and contract versions are Meta identifiers; harmonising Suite version 0.9.2 must not rename them.

`WHATSAPP_TEMPLATES_JSON` is an object keyed by integration route. Each entry contains `name`, `language`, `enabled`, `bodySha256`, and optional `summaryMaxCharacters` (default 1024, integer 1 to 32000). Use the full compact mapping below to intentionally enable routes, or `{}` to keep them disabled. The source archive also contains `notification-worker/templates.activation.json` and `notification-worker/templates.disabled.example.json`. A one-route example must be merged into the complete mapping, not pasted over it. No `approved` flag can bypass runtime approval checks.

The activation file selects approved `gsis_relief_request_v2` for `mutual_request`. The five other private relief routes retain enabled v1 delivery and include `variants: {"buttons": {"enabled": false}}`. After Meta approves an exact registered v2 contract, the owner may set that nested `enabled` to `true` for the route. The outer `enabled` still controls the entire route. The Worker selects the canonical v2 name, language and hash; it checks the live Meta body and buttons before sending. An off variant keeps v1 even when Meta has approved v2. These nested selections use v1 on origins other than `https://roster.gsps.edu.sg`, because the registered buttons point at that origin. Keep the full map on both Worker projects. This source change does not update live variables or send messages.

The four staff-page button variants for `contact_review`, `relief_unacknowledged`, `relief_urgent_smc` and `smc_attention` are metadata only under `pendingVariants.buttons`. Their known names and IDs are retained without inventing BODY text, a hash or components. Their activation choices stay false. An accidental true choice still uses the current approved base template; directly configuring a pending name fails closed. Before these variants can become selectable, retain the exact provider BODY/hash/components as a verified contract, remove its pending marker, confirm approval and obtain owner activation.

| Integration route | Template | Ordered BODY fields |
| --- | --- | --- |
| `mutual_request` | `gsis_relief_request_v2` | `recipient_name`, `requesting_teacher_name`, `duty_date`, `lessons_and_periods`; token in URL button |
| `mutual_override` | `gsis_relief_changed_v1` | `recipient_name`, `duty_date`, `change_details`, `private_published_duties_url` |
| `contact_review` | `gsis_contact_review_v1` | `recipient_name`, `request_date`, `contact_review_details`, `contacts_review_url` |
| `relief_assignment` | `gsis_relief_assignment_v1` | `recipient_name`, `duty_date`, `lessons_periods_venues`, `private_timetable_url` |
| `relief_updated` | `gsis_relief_updated_v1` | `recipient_name`, `duty_date`, `changed_or_cancelled_duties`, `private_timetable_url` |
| `relief_reminder` | `gsis_relief_reminder_v1` | `recipient_name`, `duty_date`, `lesson_period_time_venue`, `private_timetable_url` |
| `relief_unacknowledged` | `gsis_relief_unacknowledged_v1` | `duty_smc_name`, `assigned_teacher_name`, `duty_date`, `lesson_period_start_venue`, `roster_status_url` |
| `relief_urgent` | `gsis_relief_urgent_v1` | `recipient_name`, `duty_date`, `minutes_remaining`, `lesson_period_start_venue`, `private_timetable_url` |
| `relief_urgent_smc` | `gsis_relief_urgent_smc_v1` | `duty_smc_name`, `assigned_teacher_name`, `duty_date`, `minutes_remaining`, `lesson_period_start_venue`, `roster_status_url` |
| `relief_evening` | `gsis_relief_evening_v1` | `duty_smc_name`, `duty_date`, `absence_allocation_uncovered_summary`, `roster_plan_url` |
| `relief_morning` | `gsis_relief_morning_v1` | `duty_smc_name`, `duty_date`, `overnight_absence_allocation_summary`, `relief_health_summary`, `roster_plan_url` |
| `absence_update` | `gsis_absence_update_v1` | `duty_smc_name`, `new_absence_count`, `duty_date`, `additional_periods_allocation_summary`, `roster_plan_url` |
| `relief_manual_review` | `gsis_relief_manual_review_v1` | `duty_smc_name`, `duty_date`, `uncovered_periods_summary`, `roster_plan_url` |
| `capacity_warning` | `gsis_relief_capacity_warning_v1` | `duty_smc_name`, `duty_date`, `capacity_details`, `relief_health_summary`, `roster_plan_url` |
| `relief_final` | `gsis_relief_final_v1` | `duty_smc_name`, `duty_date`, `allocation_summary`, `relief_health_summary`, `roster_plan_url` |
| `conditional_relief_instruction` | `gsis_relief_instruction_v1` | `recipient_name`, `class`, `duty_date`, `period_and_time`, `conditional_instruction`, `absent_teacher_name`, `absent_teacher_contact` |
| `urgent_forward` | `gsis_urgent_forward_v1` | `recipient_name`, `original_message`, `sender_name`, `sender_contact` |
| `smc_attention` | `gsis_relief_attention_v2` | `duty_smc_name`, `duty_date`, `attention_details`, `roster_status_url` |
| `stapler_timetable` | `gsis_timetable_updated_v1` | `recipient_name`, `duty_date`, `change_details`, `private_timetable_url` |
| `stapler_request` | `gsis_timetable_sponsor_v1` | `recipient_name`, `requesting_teacher_name`, `duty_date`, `roster_plan_url` |
| `stapler_decision` | `gsis_timetable_access_v1` | `requesting_teacher_name`, `duty_date`, `change_details`, `roster_plan_url` |

The selected evening contract remains `gsis_relief_evening_v1`; historical proposals for v2 do not select it. Existing approved routes retain their exact wording and parameter counts. The historical `submissionState` in a file is not current approval. Runtime checks the exact Meta language, category, body and buttons before a notification send and caches that approval check for five minutes.

The optional `stapler_timetable` variant `gsis_timetable_updated_button_v2` uses BODY fields `recipient_name`, `duty_date`, `change_details`, followed by URL button index 0 “View Detail” and index 1 “Acknowledge”. Their respective registered bases are `https://roster.gsps.edu.sg/external.html#{{1}}` and `https://roster.gsps.edu.sg/external.html?action=ack#{{1}}`. Each button text parameter is the generated signed capability fragment only, not the full URL. Opening is not acknowledgement; the user must complete the acknowledgement action. Source records this variant approved on 22 October 2026. The retained 24 October read-only inspection also recorded it approved; neither observation verifies the installed route. An already enabled legacy timetable route on the GSPS Roster origin adopts this verified button contract; disabled routes stay disabled, and live exact approval is still required.

The separate Inbox duty alert is `gsis_inbox_new_message_v1`, `en_GB`, with three BODY fields in this order: duty recipient name, incoming sender name, `https://roster.gsps.edu.sg/#whatsappInbox`. It is outside `WHATSAPP_TEMPLATES_JSON` and gated by `WHATSAPP_INBOX_ALERTS_ENABLED` plus a live exact-body/three-parameter approval check. Human Inbox template replies use the selected currently approved template and its fields; they are not invented entries in the automatic route map.

## LORD, OVERLORD and STARLORD

These apps share the LORD Apps Script backend. The following settings belong in that backend's Script Properties, not in browser assets, Roster Pages or LORD Workers. Tokens may belong to the same authorised school sender, but source does not inherit Roster's configuration. Defaults identify contracts, not confirmed Meta approvals.

The v0.9.2 release includes the token-free correction and preserves all `LORD_WA_*` settings. Core LORD workbook/folder IDs, proxy secret, booking peppers and Telegram settings now use the nine Script Properties listed in [the main README](../README.md). Each LORD, OVERLORD and STARLORD Pages project receives text `LORD_BACKEND_URL` and encrypted `LORD_PROXY_SECRET`; the WhatsApp access token stays only in LORD Apps Script. Add settings before replacing code and retain a separate private ledger. Creating this source release does not deploy code or change live settings.

| Exact name | Type | Requirement and purpose | Default or upgrade handling |
| --- | --- | --- | --- |
| `LORD_WA_ENABLED` | Boolean property | Required LORD sending gate | Exact `true` enables; default false/unset. |
| `LORD_WA_ACCESS_TOKEN` | Secret property | Required Meta messaging token | Preserve securely; no value packaged. |
| `LORD_WA_PHONE_NUMBER_ID` | Numeric ID property | Required registered sender | Verify intended sender independently; no installed value asserted. |
| `LORD_WA_API_VERSION` | Version property | Required outbound API version | Required `vN.N`; retain verified working value. |
| `LORD_WA_LANGUAGE` | Text property | Required template language | Default `en`, distinct from Roster's `en_GB`. |
| `LORD_WA_OVERDUE_TEMPLATE` | Template name property | Admin equipment overdue alert | Default `lord_cart_overdue_v18`; old `lord_cart_overdue_v17` blocks readiness. |
| `LORD_WA_FORCE_CLOSE_TEMPLATE` | Template name property | Admin force-close summary | Default `lord_force_close_v18`; old `lord_force_close_v17` blocks readiness. |
| `LORD_WA_BOOKINGSUCCESS_TEMPLATE` | Template name property | Teacher booking accepted | Default `lord_booking_success_v18`. Exact property has no underscore between BOOKING and SUCCESS. |
| `LORD_WA_COLLECTREMINDER_TEMPLATE` | Template name property | Teacher collection reminder | Default `lord_collect_reminder_v18`. |
| `LORD_WA_RETURNREMINDER_TEMPLATE` | Template name property | Teacher return reminder | Default `lord_return_reminder_v18`. |
| `LORD_WA_COLLECTIONFOLLOWUP_TEMPLATE` | Template name property | Teacher collection follow-up | Default `lord_collection_followup_v18`. |
| `LORD_WA_RETURNFOLLOWUP_TEMPLATE` | Template name property | Teacher return follow-up | Default `lord_return_followup_v18`. |
| `LORD_WA_TEACHER_ENABLED` | Boolean property | Additional teacher-message gate | Default false/unset. Enable only after applicable templates are approved and tested. |
| `LORD_WA_FOLLOWUPS_APPROVED` | Boolean property | Additional collection/return follow-up gate | Default false/unset. Requires accepted wording and provider approval; flag itself is not proof. |
| `LORD_WA_LORD_BASE_URL` | HTTPS origin property | Teacher booking flow origin | Exact deployed LORD origin, without path/query/fragment. Match the approved template URL base. |
| `LORD_WA_SCHOOL_AGREEMENT` | Managed JSON property | Recorded school WhatsApp agreement | Use the authorised OVERLORD agreement workflow; retain existing recorded state. Do not invent JSON. |

Per-teacher agreement is recorded in `WHATSAPP_TEACHER_CONSENT` events. Admin opt-in is retained in the existing admin agreement record, including the `[LORD-WA:agreed]` marker. Changing a mobile requires renewed agreement. Provider acceptance audits do not mean delivered/read. LORD has no WhatsApp delivery-status webhook or quick-reply handler in this release; its teacher URL buttons open authenticated LORD flows. Existing Telegram and booking email are separate.

| LORD route | Ordered BODY fields | URL button 0 suffix |
| --- | --- | --- |
| `overdue` | resource/cart, booked teacher, collector, class/activity, subject, booking start to end, collected timestamp, device count, current booking-teacher contact link | None; contact link is BODY field 9 |
| `forceClose` | count closed, current formatted date, resource/collector summary | None |
| `bookingSuccess` | booked teacher, resource, quantity, booking date, start time, end time, class/activity | `bookingId=<encoded ID>&flow=view` |
| `collectReminder` | booked teacher, resource, quantity, class/activity, subject, start time | `bookingId=<encoded ID>&flow=collect` |
| `returnReminder` | booked teacher, resource, quantity, class/activity, subject | `bookingId=<encoded ID>&flow=return` |
| `collectionFollowup` | booked teacher, resource, quantity, class/activity, subject | `bookingId=<encoded ID>&flow=collection-response` |
| `returnFollowup` | booked teacher, resource, quantity, class/activity, subject | `bookingId=<encoded ID>&flow=return-response` |

Keep the original Meta contract names ending `_v18` when upgrading Suite code to 0.9.1. Source sends the above suffix only; configure the approved template's fixed URL base to the correct LORD origin. Consult LORD's packaged template review JSON before changing wording or URL bases. This release does not submit, approve or alter Meta templates.

With the GSiS reference bridge enabled, sending also depends on `LORD_BRIDGE_SECRET` (same dedicated secret in LORD, Contacts and Deploy), `LORD_CONTACTS_APPS_SCRIPT_URL`, `LORD_DEPLOY_APPS_SCRIPT_URL`, `LORD_GSIS_SNAPSHOT_FOLDER_ID`, and optional `LORD_GSIS_LOCAL_ACTIVITIES` in LORD. `LORD_GSIS_ENABLED`, `LORD_GSIS_SNAPSHOT`, `LORD_GSIS_CHECK` and `LORD_GSIS_SYNC_LEASE` are managed activation/snapshot state. Do not add blank placeholders. See the LORD setup section in the main README. A failed source check or Contacts verification older than five minutes defers new LORD WhatsApp sends; a cached phone is not unconditional permission to send.

## Scheduling and operational settings

All daily times below are Singapore time. Cron is `* * * * *` on the notification Worker; actual business schedules are saved in Roster System Config. Defaults are evening summaries 16:00 through 21:30 every 30 minutes and morning summaries 05:30, 05:45, 06:00, 06:15, 06:29. The first configured slot in each phase is a fresh duty-SMC report, including zero absences; later effective unchanged summaries are suppressed after successful delivery. Moving/removing slots changes the schedule. Automatic allocation's final handover remains 06:30. Manual publication and Send WhatsApp remain explicit actions; the timer does not publish on behalf of SMC.

Configured duty summaries have their quiet-hour exception. Explicit eligible teacher Send WhatsApp can request immediate dispatch; other automatic routes retain their own quiet-hour/deadline rules. 20-minute teacher reminders and 10-minute SMC escalation require a current unacknowledged duty and valid countdown. Cancelled, superseded, past or otherwise ineligible jobs are rejected. The queued future requirement for new absences after first publication and before 14:00 remains separate; listing the `absence_update` contract does not claim that change has shipped.

LORD's existing `processSecondaryQueueTrigger` runs each minute; install no duplicates. Booking acceptance can be sent within 24 hours of creation and before booking end. Collection reminders are within five minutes before start; return reminders within five minutes before end while the session is open. Gated follow-ups begin 30 minutes after start or end, subject to current booking/session checks. Operational admin notices expire after 24 hours. Preserve queue/receipt properties; an external send accepted before its local checkpoint can still duplicate on a later retry.

## Coverage and evidence

This document was reconciled against the current Roster gateway, notification Worker, Apps Script notification/inbox modules, canonical template JSON and LORD `whatsAppConfig_`, `teacherMessageValues_` and provider boundary. All literal `WHATSAPP_*` runtime settings, dynamic LORD template property names and canonical route field sequences are covered. The source archive evidence file `docs/reviews/v09/whatsapp-parameter-coverage.json` records the source scan, counts and omissions check. Historical runtime-state constants such as `WHATSAPP_CONTRACTS`, event names and managed queue keys are not extra operator credentials.

Known non-secret account IDs and recorded Meta observations come from retained source/activation records and the 24 October read-only review. Production Cloudflare values, callback identity, sender token and LORD approval state have not been newly inspected. A package, readiness screen or successful local test cannot prove installed delivery.


## Venues notification settings

Venues owns a separate durable outbox and uses its own Apps Script minute task. It follows the school-managed operational notification agreement; no individual opt-in/out list is introduced. A shared sender does not share Roster or LORD delivery receipts. Keep new send flags disabled until the matching provider configuration and a controlled acceptance test are complete.

| Exact name | Owner/type | Requirement |
| --- | --- | --- |
| `VENUES_PUBLIC_URL` | Venues Script Property, HTTPS origin | Own authenticated management origin, `https://venues.gsps.edu.sg`, without a path |
| `VENUES_EMAIL_ENABLED` | Venues Script Property, boolean | Exact `true` enables live email; missing configuration remains visible as setup-required |
| `VENUES_WHATSAPP_ENABLED` | Venues Script Property, boolean | Exact `true` enables the school-managed WhatsApp route |
| `VENUES_WHATSAPP_ACCESS_TOKEN` | Venues secret Script Property | System-user token authorised for the configured sender/account |
| `VENUES_WHATSAPP_BUSINESS_ACCOUNT_ID` | Venues Script Property, ID | Account used to verify exact template approval |
| `VENUES_WHATSAPP_PHONE_NUMBER_ID` | Venues Script Property, ID | Sender phone-number ID |
| `VENUES_WHATSAPP_API_VERSION` | Venues Script Property, version | Supported configured Graph API version in `vNN.N` form; no fresh support claim is made here |
| `VENUES_WHATSAPP_TEMPLATE` | Venues Script Property, JSON | `{name,language,body,fields}` with exact provider-approved body and ordered fields below |

The ordered Venues BODY fields are `recipient_name`, `event`, `venue`, `date`, `status`, `manage_url`. No existing LORD device wording or URL-button approval is assumed reusable. Runtime verifies current approval, language, exact body and placeholder count. Recipient identity/contact details are resolved from current Contacts, not browser input. Email sends to the distinct current CES and GSPS addresses where present.

Booking and transfer commit first; provider work follows. A failed notice never releases a reservation. An uncertain accepted send is held for explicit review and is not automatically retried. Authentication is still required when opening a short management URL. No live template was created or submitted during this release build.

## Complete Roster activation mapping

This mapping intentionally enables the existing routes. Preserve working intended settings during upgrades. Use `{}` for a new paused installation and enable only the routes the school intends to use after exact provider approval. Never replace the full object with an unrelated one-route example.

```json
{"mutual_request":{"name":"gsis_relief_request_v2","language":"en_GB","enabled":true,"bodySha256":"8d1496eda9cb385716226219d725c2e1d43b62c23dcccdcd9b8b0ad3a2232244","summaryMaxCharacters":1024},"mutual_override":{"name":"gsis_relief_changed_v1","language":"en_GB","enabled":true,"bodySha256":"749edb8920ccd75bdf30526742eec67cadfe392a75878baaf80e9f67f7aae5c3","summaryMaxCharacters":1024,"variants":{"buttons":{"enabled":false}}},"contact_review":{"name":"gsis_contact_review_v1","language":"en_GB","enabled":true,"bodySha256":"5e0c7080d0386968c042e19b1d4a5cb968e05953eb69ca6286b87d5000914e40","summaryMaxCharacters":1024,"variants":{"buttons":{"enabled":false}}},"relief_assignment":{"name":"gsis_relief_assignment_v1","language":"en_GB","enabled":true,"bodySha256":"dbbc03f5d5d708029b5c62c7025276bfc14ab6434244a3f9ad70a4835a583dd2","summaryMaxCharacters":1024,"variants":{"buttons":{"enabled":false}}},"relief_updated":{"name":"gsis_relief_updated_v1","language":"en_GB","enabled":true,"bodySha256":"07063c548041f467f9e7b1e9159efffc26afd6ae31bc9883e80222b3fe21fc0f","summaryMaxCharacters":1024,"variants":{"buttons":{"enabled":false}}},"relief_reminder":{"name":"gsis_relief_reminder_v1","language":"en_GB","enabled":true,"bodySha256":"85faa0c817ea716fa85db1fdbce59f383ee6ad6fdce28acf16e258365629ac57","summaryMaxCharacters":1024,"variants":{"buttons":{"enabled":false}}},"relief_unacknowledged":{"name":"gsis_relief_unacknowledged_v1","language":"en_GB","enabled":true,"bodySha256":"d998fc781f72ed863069c7171edf9bc6baa8e61e370c1544e5ec82719eece0cf","summaryMaxCharacters":1024,"variants":{"buttons":{"enabled":false}}},"relief_urgent":{"name":"gsis_relief_urgent_v1","language":"en_GB","enabled":true,"bodySha256":"9d9e8965667a01205be101d2d85524966c194b0c1cd223a4b0f02cddb948f5da","summaryMaxCharacters":1024,"variants":{"buttons":{"enabled":false}}},"relief_urgent_smc":{"name":"gsis_relief_urgent_smc_v1","language":"en_GB","enabled":true,"bodySha256":"04a471667a7b4ab196723faf083c03d3efa2564fe4b5e2d36e369f56c216d4c5","summaryMaxCharacters":1024,"variants":{"buttons":{"enabled":false}}},"relief_evening":{"name":"gsis_relief_evening_v1","language":"en_GB","enabled":true,"bodySha256":"2a304cb253c2a479054456b59eaee42bfcfd7f84ab850f253892dcec786811a7","summaryMaxCharacters":1024},"relief_morning":{"name":"gsis_relief_morning_v1","language":"en_GB","enabled":true,"bodySha256":"b3009ec5257e543007a1f4376ce17d3496c73242806d3ea2776ae68ea7f6f771","summaryMaxCharacters":1024},"absence_update":{"name":"gsis_absence_update_v1","language":"en_GB","enabled":true,"bodySha256":"a420012bd6329823f4230d2f07d3ce6b67fb66a08eec141d2780edf3e3d72ad5","summaryMaxCharacters":1024},"relief_manual_review":{"name":"gsis_relief_manual_review_v1","language":"en_GB","enabled":true,"bodySha256":"f5e3f7566836c327251efcf5098e9041b82edf2301514fd060b418ce0d7aaded","summaryMaxCharacters":1024},"capacity_warning":{"name":"gsis_relief_capacity_warning_v1","language":"en_GB","enabled":true,"bodySha256":"485c4c68a32d419879943334a6ea9c28bc146c94f33c7bb317862af1e7802066","summaryMaxCharacters":1024},"relief_final":{"name":"gsis_relief_final_v1","language":"en_GB","enabled":true,"bodySha256":"924dfff4c90543569170ba65da8705c6a444b2d92bc08d88aefed8742bd3d7cb","summaryMaxCharacters":1024},"conditional_relief_instruction":{"name":"gsis_relief_instruction_v1","language":"en_GB","enabled":true,"bodySha256":"93eb9ef8c917dd27080fb8f662eb2eee1aa8a277d18b9f24d3c4d2730da82723","summaryMaxCharacters":1024},"urgent_forward":{"name":"gsis_urgent_forward_v1","language":"en_GB","enabled":true,"bodySha256":"ff20ca9b56ac87b376e07dae5055e106b58ab1a29695a2cb42049b13e7df5356","summaryMaxCharacters":1024},"smc_attention":{"name":"gsis_relief_attention_v2","language":"en_GB","enabled":true,"bodySha256":"640ce7d7db1fed87483ea77c32c5286ea473b09c42f4ac9b3fcf292652bcc43e","summaryMaxCharacters":1024,"variants":{"buttons":{"enabled":false}}},"stapler_timetable":{"name":"gsis_timetable_updated_button_v2","language":"en_GB","enabled":true,"bodySha256":"c045ccb418e1680e2f528de915ba3897511bd7514eb9941b67f83fab2917c5b0","summaryMaxCharacters":1024},"stapler_request":{"name":"gsis_timetable_sponsor_v1","language":"en_GB","enabled":true,"bodySha256":"740a0dbae98d03ada92af8e11602d180daa3054221fabc67d0442a7080a9a37f","summaryMaxCharacters":1024},"stapler_decision":{"name":"gsis_timetable_access_v1","language":"en_GB","enabled":true,"bodySha256":"f36a327edb998054baf402b6a7c6df03c77804ad00425d659d3936c7e72d63b5","summaryMaxCharacters":1024}}
```
