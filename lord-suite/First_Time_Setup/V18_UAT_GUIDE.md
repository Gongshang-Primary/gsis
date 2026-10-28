# LORD v1.8 UAT

This is the acceptance candidate. Do not rename it v2 LTS until the owner approves UAT. No live deployment, template submission or message delivery is claimed by this package.

## Start here

Use a copied transaction workbook, reference workbook, photo folder and archive folder with test Contacts and an approved test recipient. Follow FIRST_TIME_SETUP.md for a fresh instance, or UPGRADE.md for an existing deployment. Retain all existing secrets, peppers, URLs and triggers during an upgrade. No schema migration is required. Back up before upgrading. Keep the v1.7 package for rollback; never restore old transaction data over new declarations.

The clean first-time configurator produces v1.8 UAT Workers and Code.gs. Existing setup/self-test names including createLORDV17Schema and selfTestLORDV17 are compatibility entry points and remain valid. The diagnostic version is 1.8 and channel UAT.

## Review families

Open Review/LORD_V1.8_UAT_UI_REVIEW.html for compact, interactive fictional previews. F1 is teacher follow-up and exception confirmation; F2 is the OVERLORD incident line and drilldown; F3 is teacher WhatsApp consent. The actual mobile forms use the existing components. W6/W7 wording is a separate review family in Review/LORD_V1.8_UAT_WHATSAPP_REVIEW.html. W1–W5 retain approved wording. These previews are not proof of on-device acceptance.

## Acceptance runs

1. Make a booking for yourself and on behalf of another teacher. GSPS and valid CES addresses receive the existing booking email; existing creator copy also includes CES. Missing or malformed CES must not block GSPS delivery. WhatsApp goes only to the booked-for teacher.
2. With teacher delivery enabled in a test environment, book sufficiently far ahead. Check W5 after success, W3 within the five minutes before start and W4 within the five minutes before end. Delayed triggers must not backfill obsolete reminders. Cancellation or return before dispatch suppresses stale messages. Apps Script triggers do not promise exact-to-the-second delivery.
3. Open each link signed out, then sign in. It must open the exact current booking/collection/return page, without submitting. Test a different account, saved draft with photos, a cancelled booking, changed booking and already closed loan. Ordinary relief collection/return remains available through the existing menus.
4. At start + 30 minutes with no collection, test cancel, collecting later and already collected. Only already collected records an incident. Enter actual trolley quantities; test three trolleys and accessories. No fabricated photos should appear. Collect-later is unavailable after end. A booking ending at or before start + 30 gets no obsolete W6.
5. At end + 30 with an open linked loan, test normal photo return and already returned. The latter must immediately set DECLARED RETURNED, complete the booking and allow another reservation/loan. Photos and returned quantities remain unverified. Exactly one return incident remains. Test double tap, timeout retry, two simultaneous browsers and stale session ID.
6. Verify OVERLORD counts: collection, return, total and distinct affected bookings. One booking with two omissions counts as two incidents and one booking. Append an administrator review note; counts remain. Staff cannot access other incidents or resolve them.
7. After 18:00 with all custody resolved, preview REIGN. Counts must not reset. Force a test archive/Sheet failure: counts must remain. Complete REIGN: inspect Markdown/HTML/JSON archive totals and details, new period ID and preserved future bookings/consent. Repeat a close on the same day. Each successful close has a distinct ID.
8. Revoke teacher consent or change Contacts mobile: pending unsent messages must not go to the new number until consent is renewed. Grant admin access only after consent through existing OVERLORD Settings. Teacher consent alone must never grant admin privileges.
9. Measure first load and refresh on a real phone and concurrent clients for all three suites. Verify the prior STARLORD live-booking error and OVERLORD loading delay against real services. Offline operation counts are not latency evidence.

## WhatsApp setup and limits

Keep LORD_WA_ENABLED=false until W1/W2 v18 templates and credentials are ready. v17 template names no longer match the approved W1/W2 wording; explicit old names block configuration readiness. Set the new names deliberately. Telegram remains independent.

The existing token, sender ID, API version and language properties remain. Additional properties:

| Property | Value |
|---|---|
| LORD_WA_TEACHER_ENABLED | false by default; true after W3–W5 approval and test setup |
| LORD_WA_FOLLOWUPS_APPROVED | false by default; true only after W6/W7 wording acceptance and Meta approval |
| LORD_WA_LORD_BASE_URL | Exact deployed HTTPS LORD origin, with optional trailing slash |
| LORD_WA_BOOKINGSUCCESS_TEMPLATE | lord_booking_success_v18 |
| LORD_WA_COLLECTREMINDER_TEMPLATE | lord_collect_reminder_v18 |
| LORD_WA_RETURNREMINDER_TEMPLATE | lord_return_reminder_v18 |
| LORD_WA_COLLECTIONFOLLOWUP_TEMPLATE | lord_collection_followup_v18 |
| LORD_WA_RETURNFOLLOWUP_TEMPLATE | lord_return_followup_v18 |
| LORD_WA_OVERDUE_TEMPLATE | lord_cart_overdue_v18 |
| LORD_WA_FORCE_CLOSE_TEMPLATE | lord_force_close_v18 |

Use the template JSON as the review payload, replace REPLACE_LORD_HOST and the example URL with your deployment and matching flow. The URL button prefix is `https://your-lord-host/?`; the sent dynamic parameter is `bookingId=...&flow=...`. Templates use named server configuration, not browser-supplied recipient numbers. W1 contains an inline contact link; it has no wa.me URL button. Meta decides category/approval. No webhook or WhatsApp chat reply handler is provided; teachers respond on authenticated LORD pages.

The existing one-minute queue trigger schedules teacher messages. Queued network delivery is separate from Sheet commits. Provider acceptance is not delivered/read status. An ambiguous provider success followed by receipt-storage failure can cause a duplicate notification; exactly-once delivery across Meta and Google is not promised. Booking and incident mutations remain idempotent.

## Release decision

Record the test operator, dates, devices, concurrent-user count, outcomes, remaining issues and owner acceptance. When accepted, create a separate v2 LTS release commit and package. v1.8 remains the UAT record.

## Historical corrections

An old task link can load its archived booking through retained REIGN archive references. The teacher can explicitly record historical missing collection/return photos; these belong to the current recording period and retain the old archive reference. They do not reopen an archived loan or affect any newer loan. A previously logged phase is not counted again. OVERLORD's incident dialog also accepts an archived incident ID and review note, appending the correction to the current log. Archive reads are staged before the write lock. Old archives created before this release may need the maintainer to recover their original close marker before they are discoverable.
