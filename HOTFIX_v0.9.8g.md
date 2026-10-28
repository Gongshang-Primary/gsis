# Install GSiS revision G

Version 0.9.8g builds on F. This is a matched suite patch because shared API configuration touches every service. It requires no data migration and no new active Worker, Queue or cron. Roster's timetable cache behaviour and authority settings remain unchanged.

Read SETUP.html or SETUP.md first. That guide separates installing code, an optional coordinated GSIS_SECRET cutover, and optional empty storage preparation. Install the code with existing secrets unchanged before switching to the shared key. The release contains no real key.

## Install the matched components

1. Preserve the current component files, deployed versions and configuration for rollback.
2. Update the six existing Apps Script projects using Contacts_Backend_v0.9.8g.gs, Deploy_Backend_v0.9.8g.gs, Roster_Backend_v0.9.8g.gs, Calendar_Backend_v0.9.8g.gs, LORD_Backend_v0.9.8g.gs and Venues_Backend_v0.9.8g.gs as applicable to the services already deployed. Replace combined code, not the project or its properties. Avoid duplicate old function files.
3. Save each Apps Script project and use Deploy > Manage deployments > pencil > New version > Deploy. Keep its existing web app URL and permissions.
4. Replace the existing gsis-roster-notifications Worker code with Roster_Notification_Worker_v0.9.8g.txt. Keep its current bindings, triggers and settings.
5. Upload each inner frontend ZIP to its matching existing Pages project: Contacts, Deploy, Layout, Roster, Calendar, LORD, OVERLORD, STARLORD and Venues. Keep current bindings and settings. Do not upload the outer release ZIP to Pages.
6. GSiS_Operations_Worker_v0.9.8g.txt is supplied only for an Operations Worker already in use. Do not create or activate that Worker for this patch or timetable preparation.
7. Check that existing sign in, normal reference reads and System Health load before changing any secrets. The matched components display revision G.

## Verify the requested changes

1. In a planning deployment, rename a class to an occupied class name at any level P1 to P6. The prior holder becomes level(undefined), retaining its own teachers and allocations.
2. Repeat for other rows. Multiple undefined rows may coexist. Reload in the same browser and signed in account to recover the draft.
3. Save remains blocked until every displaced row has a valid unique name. Resolve all names, review and save. A resolved swap or cycle is validated as one batch against the latest source.
4. A recovered draft with conflicting saved class names requires review. An uncertain submitted save retains its original request identity rather than generating a second command.
5. When ready to use your chosen GSIS_SECRET, follow the setup guide's maintenance and coordinated configuration steps. Do not paste the key into source, chat or this guide.
6. Export a Stapler plan and check Teacher Summary and Class POV tabs. Check the source start and end time row immediately above the period headings and its inclusion in the frozen rows.
7. Sign in as a teacher, open Stapler, select a confirmed suspended date and use My suspended timetable to open that teacher's view. Existing approved planning requests remain available separately.

Existing per connection secrets remain the fallback only while GSIS_SECRET is absent. A configured invalid value fails closed. Browser session credentials, private link keys, booking peppers, Google, Meta and Cloudflare credentials retain their separate purposes and current values.

## Timetable storage

The guide checks existing GSIS_JOBS and ROSTER_TIMETABLE_SNAPSHOTS resources first. New preparation resources remain empty and unbound. The intended later cache covers baseline and confirmed suspended timetables over 31 Singapore dates. Revision G does not populate, activate or redesign it. Do not enable an old migration, import SQL or replace the existing notification database for this setup.

## Rollback

If the shared key was configured, remove GSIS_SECRET from every changed service and redeploy settings as required to resume the retained legacy configuration. Restore matched previous component code if necessary. Keep data IDs, old credentials, queues and saved records. Restore any deliberately paused existing triggers using their recorded expressions. Code rollback cannot recall a message submitted to a provider or undo a saved deployment change.

No production deployment, live configuration change, message send or school data edit was performed while preparing this release.

The later publishing, independent WhatsApp, friendly notification timestamp and UT auto cap requests are queued for the next patch, as explicitly selected by the user. They are listed separately in QUEUED_AFTER_v0.9.8g.md and are not part of G.
