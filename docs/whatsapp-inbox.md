# WhatsApp Inbox

The inbox uses the existing school number and authenticated Roster session. All SMC and Admin users can read conversations, assign them, mark them handled and reply. Assignment records ownership of the work; it does not hide conversations from other authorised users.

## Replies and message history

Incoming messages are retained independently of the automated menu setting. Each sender number identifies one conversation. Contacts supplies a display name only when the match is unambiguous. New inbound messages reopen handled conversations; an older out-of-order message does not undo a later handled decision.

Ordinary replies require a valid customer message within the preceding 24 hours. The server checks the latest provider timestamp when accepting a reply and again before sending it. Outgoing messages and delivery receipts never extend this window. Older incoming messages are retained without opening a new reply window.

Outside the window, the operator selects a currently approved text-body template and supplies its required fields. The worker checks approval with Meta again before sending. Templates with unsupported components are not offered. Sending a template does not itself reopen ordinary replies.

A reply is durably queued with the authenticated staff identity. The existing scheduled notification worker checks queued replies every minute, so closing the browser does not interrupt dispatch. It rechecks authority and eligibility before claiming a reply once. A reply never attempted within five minutes expires as failed; an attempted reply with an uncertain outcome is shown for review and is not automatically resent. The same request ID replays the existing record. Provider acceptance is shown separately from delivery and read receipts. Provider errors retain bounded Meta error codes and diagnostic fields.

## School contact menu

Report Absence is the first menu item, described as Open the current relief system. Set its `WHATSAPP_CURRENT_RELIEF_URL` target to `https://roster.gsps.edu.sg/` in Roster Pages Production and redeploy. This opens Roster; it does not itself submit an absence. The ordinary menu reply needs no new template. When optional durable ingress is enabled, the scheduled Worker also processes queued incoming messages, so mirror the menu flag, all four menu settings and applicable private media binding there. Existing HTTPS validation rejects missing, non-HTTPS, credential-bearing and fragment-bearing URLs with a configuration message.

Urgent Message, School Layout, Collect / Return ICT and Call General Office remain available with their existing selection IDs. Menu selections are retained in the Inbox before any automated reply. A service selection clears a pending urgent-text prompt. Voice notes and ordinary human replies continue through the Inbox independently of the menu setting.

## Images and voice notes

Voice notes use private object storage. The worker obtains media using the existing school-number credentials, checks its type and size, and stores the bytes privately. Playback rechecks SMC or Admin authority and streams through Roster with byte-range support. The browser never receives the provider access token or temporary media URL.

Incoming JPEG and PNG images retain their captions immediately. With ordinary ingress, image bytes load when an authorised SMC or Admin opens the conversation. Optional durable ingress also captures them during the queued background drain. The worker obtains a fresh Meta media URL, checks MIME type, file signature, a 5 MiB maximum and SHA-256 integrity, then retains the bytes in the same private R2 bucket. Subsequent views reuse those bytes after a fresh authority check. Simultaneous first views share a bounded capture in flight. If a stored object is missing, an authorised retry fetches it again when Meta still provides it. No temporary Meta URL is saved or sent to a browser. An image cannot be recovered from Meta after its provider retention has ended unless it was already captured in R2.

Images are lazy loaded with captions, an explicit open-image action and a visible retry message. SVG, video and document previews are outside this release; unsupported attachment records remain visible. Voice-note behavior and the 16 MiB audio bound remain intact.

Conversation metadata is kept in a separate private Drive document. Image and audio bytes are not put in timetable or relief JSON. List and message reads are paginated, and search covers all conversations. Metadata is limited to 20,000 messages and an approximately 8 MB document. Storage limits fail visibly rather than silently discarding old messages. Archiving beyond the initial capacity requires a separate authorised maintenance action; the service does not silently prune conversation history.

## Refresh performance

The conversation directory resolves Contacts phone numbers once per list read, including search. Identical overlapping browser reads share one request. A selected thread sends its last known revision during background refresh; unchanged responses contain the current authorised summary without retransmitting up to 100 messages. A full history read is required at least every 30 seconds so time-derived delivery states still update. Authentication, role checks and current duty checks remain server-side for every read.

Visible inbox lists refresh every 15 seconds. Selected threads refresh every 15 seconds, with a three-second delivery check while a reply is newly queued. Network failures back off to at most one list read per two minutes and one thread read per minute. Hidden tabs stop polling. Thread reads pause while the operator composes or plays audio; refresh preserves the draft, playback and focus. Loading additional conversation pages pauses automatic list replacement until a manual refresh so the extra pages are not removed while being read.

## Duty alerts

All authorised users can see the inbox. New-message alerts are restricted to the current Singapore duty date's verified duty SMC, and eligibility is checked again before dispatch. There is no fallback to all SMC or Admin when no eligible duty team exists. Historical messages do not trigger alerts; queued WhatsApp alerts expire after two minutes. Legacy urgent forwarding is suppressed for inbox-handled messages to avoid a second alert.

In-app alert flags remain available without an outbound template. WhatsApp alerts require the dedicated template proposed in `notification-worker/inbox-alert-template.proposed.json`. Existing urgent and relief-allocation templates are not repurposed for ordinary inbox notifications. The proposed template contains the sender name and a Roster link, not the message body.

## Activation prerequisites

Included in the source release. Follow [the v0.9 activation steps](WHATSAPP_ACTIVATION_v0.9.md) and [complete parameter reference](WHATSAPP_PARAMETERS.md) for current settings and post-deployment checks. The Inbox now shows local configuration readiness after an authorised conversation-list read. This does not verify the live webhook or the separate scheduled worker. No production deployment, template submission or live send has been performed.

Before activation:

1. Deploy the reviewed Apps Script inbox domain and adapter, Roster worker and frontend, and updated scheduled notification worker together. Retain the notification worker's every-minute Cron trigger: it is responsible for sending queued replies and alerts.
2. Keep the existing verified school WhatsApp account, phone-number ID, access token, webhook secret and configured Graph API version.
3. Bind a private R2 bucket as `WHATSAPP_INBOX_MEDIA` on the Roster worker. Keep the bucket inaccessible through public URLs.
4. Obtain Meta approval for `gsis_inbox_new_message_v1` in `en_GB`, using the exact proposed body. Set `WHATSAPP_INBOX_ALERTS_ENABLED=true` only after approval. The worker verifies the live approved body and its three parameters before sending. Leave the flag unset to keep WhatsApp alerts blocked while retaining in-app duty alerts.
5. Confirm an eligible current duty SMC roster. Use a controlled authorised message to verify ingestion, JPEG/PNG viewing, audio playback, reply delivery and duty-only alerts after deployment.

The existing `WHATSAPP_TEMPLATE_ACCOUNT_ID` must identify the school WhatsApp Business Account for approved-template checks. Template access and private media storage are additional activation prerequisites, not evidence that the service is live.

## Verification

Focused domain, backend, worker and real Chromium checks cover permission changes, duty-only alerts, historical messages, text-window expiry during slow storage reads, approved templates, lost responses, single-send claims, private image/audio authorization and retry, image MIME/signature/size/integrity checks, caption escaping, coalesced reads, hidden-tab pause, conditional history responses, delivery receipt ordering, assignment and handled state, search beyond the first page, escaped message text, mobile width, and preserving drafts and playing audio during refresh. The existing WhatsApp workflow and diagnostics checks also pass. All provider traffic in these checks is mocked.

## API references

Meta's official collection describes the customer reply window and status errors in its [Statuses Object](https://www.postman.com/meta/whatsapp-business-platform/folder/fuaee8l/statuses-object), [media handling](https://www.postman.com/meta/whatsapp-business-platform/folder/13382743-ecb27be5-4d27-4763-bbee-6a8002c04bf3), and [media URL retrieval](https://www.postman.com/meta/whatsapp-business-platform/request/ptjyi84/retrieve-media-url). Temporary media URLs are not durable storage.
