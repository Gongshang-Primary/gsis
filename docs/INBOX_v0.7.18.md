# Enable the school WhatsApp Inbox

The Inbox is implemented in this release. Uploading code does not connect Meta or supply private deployment settings. No live activation or messages were performed while preparing the package.

## 1. Deploy the matching code

For an existing v0.7.17 installation, publish the complete Contacts and Deploy backend files as new versions on their existing web apps, then upload the Roster frontend ZIP. Keep the existing `/exec` URLs, properties, records, active flags, private media binding and cron. The existing notification Worker remains compatible; its dispatch contract is unchanged. Keep the verified SMC/Admin directory and `ROSTER_INBOX_FILE`; do not create a blank replacement store.

## 2. Check Roster Pages settings

Keep the existing school account values. Do not put secrets in uploaded browser files.

| Setting | Required value or purpose |
| --- | --- |
| `APPS_SCRIPT_URL`, `BRIDGE_SECRET` | Existing authenticated Deploy backend connection |
| `ROSTER_SERVICE_SECRET` | Same secret as the deployed Deploy backend |
| `WHATSAPP_ENABLED` | `true`; the existing WhatsApp gate, not a new Inbox switch |
| `WHATSAPP_ACCOUNT_ID`, `WHATSAPP_PHONE_NUMBER_ID` | Existing school account and number IDs |
| `WHATSAPP_APP_SECRET`, `WHATSAPP_VERIFY_TOKEN` | Existing signing secret and webhook verification token |
| `WHATSAPP_API_VERSION`, `WHATSAPP_ACCESS_TOKEN` | Configured API version and school sender credentials |
| `WHATSAPP_INBOX_MEDIA` | Private R2 bucket binding for voice notes; no public bucket URL |
| `WHATSAPP_TEMPLATE_ACCOUNT_ID` | School WhatsApp Business Account used to check approved templates |

Open **WhatsApp Inbox → Setup details for Admin**. The page reports missing or invalid settings by name without disclosing values. “Settings present” checks local presence and format only. It does not prove valid credentials, secret agreement, a connected webhook, writable storage, an active Cron trigger, approved templates or message delivery.

The existing `WHATSAPP_ENABLED` gate also controls other WhatsApp sends. Preserve the current deployment values and intended sending policy when activating it. Do not change `WHATSAPP_MENU_ENABLED` or `ROSTER_AUTOMATION_ENABLED` merely to enable Inbox. Inbox capture and queued replies do not require either flag.

## 3. Connect incoming messages

In the existing Meta app, retain or configure the webhook callback as `https://<your-roster-host>/api/whatsapp/webhook`, with the matching verify token and the school account's **messages** subscription. The callback must reach the Roster worker without an interactive sign-in challenge; messages still require Meta's valid signature and matching account and phone IDs. Normal Inbox pages and voice playback remain authenticated.

## 4. Check the separate notification Worker

Keep its every-minute Cron trigger and matching backend URL, service secret, school phone ID, API version, access token and template account ID. Set `WHATSAPP_ENABLED=true` and use `WHATSAPP_DIAGNOSTICS_ENABLED=false` for normal operation. Diagnostics mode intentionally performs read-only checks instead of dispatching queued replies. Do not enable unrelated allocation or menu automation.

Ordinary replies are durably queued before dispatch. The separate worker checks the queue every minute and rechecks the sender's authority and reply window. Closing the browser does not cancel an accepted reply. Delivery and read status require the incoming status webhook connection.

Optional WhatsApp duty alerts are separate: obtain approval for `gsis_inbox_new_message_v1` in `en_GB`, set `WHATSAPP_INBOX_ALERTS_ENABLED=true` on the scheduled worker, and retain its correct `ROSTER_PUBLIC_ORIGIN` and current eligible duty SMC roster. Core Inbox operation does not depend on enabling these alerts. Approved template replies require their own currently approved template.

## 5. Verify after deployment

1. Use an authorised controlled sender to send one new text message to the school number; refresh Inbox and confirm it remains in its conversation.
2. Send one voice note and verify playback as SMC/Admin; an ordinary teacher must not gain access to the conversation or audio.
3. Send one authorised reply from Inbox and check queued, sent and delivered states; check the notification Worker if it remains queued.
4. Confirm handled conversations appear under **All conversations** and new messages reopen them; retries must not create duplicate messages or replies.

The package's signed webhook, backend persistence, duplicate handling, queued reply dispatch, delivery receipts and private media checks use synthetic accounts and provider responses. They do not verify a production account. Inbox captures new webhook events only; it does not import historical chats or recover previously missing messages.

## Slow Inbox or delayed replies

The retained v0.7.17 changes remove unnecessary operations-store reads and the immediate thread reload after an accepted mutation. Current message rows remain in place during refresh, so unchanged audio is not restarted. Authority and durable queue checks remain in force.

Measure opening the conversation list, opening a thread, refreshing a thread and accepting a reply separately. Record the action, time and request duration without exposing tokens or message content. A quick queue acknowledgement does not mean Meta delivered the reply. If an accepted reply remains queued, inspect the scheduled Worker and its current settings before creating another reply.

The user's 19 October 2026 screenshot showed both Inbox Test and Inbox Test2 in Roster. Incoming text capture is therefore observed for those messages. The earlier absence of a live log did not prove that the webhook failed. Outgoing delivery, private voice playback and optional duty alerts remain unverified until checked independently.
