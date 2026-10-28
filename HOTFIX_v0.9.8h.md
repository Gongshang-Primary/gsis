# Install GSiS revision H

Version 0.9.8h builds on G. All 17 supplied components are matched to H. Read SETUP.html or SETUP.md before installation and use the component inventory in PATCH.json. No data migration or new infrastructure is required. The Operations Worker is supplied only for an existing deployment; do not activate it for this patch.

## Install the matched components

1. Preserve the current component files, Apps Script deployment versions and configuration for rollback. Keep data IDs, existing URLs, properties, bindings, queues, triggers and independent session/link credentials.
2. In each existing Apps Script project, replace the combined code using Contacts_Backend_v0.9.8h.gs, Deploy_Backend_v0.9.8h.gs, Roster_Backend_v0.9.8h.gs, Calendar_Backend_v0.9.8h.gs, LORD_Backend_v0.9.8h.gs and Venues_Backend_v0.9.8h.gs as applicable. Avoid duplicate old function files. Save, then use Deploy > Manage deployments > pencil > New version > Deploy to retain the existing web app URL and permissions.
3. Update the existing gsis-roster-notifications Worker using Roster_Notification_Worker_v0.9.8h.txt. Retain its current settings, bindings and triggers.
4. Upload each inner frontend ZIP to its matching existing Pages project: Contacts, Deploy, Layout, Roster, Calendar, LORD, OVERLORD, STARLORD and Venues. Do not upload the outer release ZIP to Pages.
5. Use GSiS_Operations_Worker_v0.9.8h.txt only if that Worker is already in use. Leave timetable cache flags, data authority and deferred migration settings unchanged.
6. Retain an existing working GSIS_SECRET, including a 33-character key. No new key is needed for this upgrade. If the setting is absent, legacy credentials remain available. If choosing a shared-key cutover, use the detailed coordinated steps in SETUP, with at least 32 printable non-whitespace ASCII characters. Invalid configured values fail closed.
7. Check existing sign-in, reference reads, System Health and revision labels. If startup reports GSIS_SECRET_INVALID, correct that configuration instead of replacing Google sign-in settings. Use read-only checks; do not create a live booking, absence or message as an installation test.

## Use the changes

SETUP explains standalone Stapler creation without a baseline, confirmed-plan authority across baseline uploads, lossless native import and reset history Preview/Restore. It also explains publication separately from WhatsApp communication, recipient snapshot privacy, UT automatic capacity and manual override, and administrator Background work review.

A ready restore preview is not proof of a completed live restore. Successful live incident restoration remains unconfirmed until the actual restore receipt and plan are checked. Provider acceptance or retirement is not message delivery.

## Rollback

Restore the preserved matched G component deployments if needed. Keep all saved data and queued work. A working shared key need not change for code rollback. If rolling back a deliberate shared-key cutover, remove GSIS_SECRET from every changed caller and receiver and restore the retained legacy configuration consistently, following SETUP. Restore deliberately paused triggers using their exact recorded schedules. Code rollback cannot undo saved plan changes or recall a provider submission.

This release preparation does not deploy production code, change live settings or send messages. No real keys, private recovery plans or incident payloads belong in the deployment archive.
