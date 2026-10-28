# GSiS 0.9.9: existing-school full-suite upgrade

This package contains all 18 production components at 0.9.9, plus a separately versioned timetable preparation package. Roster remains Google-first in production. Calendar continues to use its existing Google workbook and calendars. Building and reviewing this package does not install it, send messages, change records or transfer production authority.

The supplied P rollout report records all 18 P components installed, including the existing `gsis-calendar-jobs` Worker and its dedicated D1 database. Preserve that installation. The Q Calendar recovery changes are included here; the report does not establish that Q was installed. The separate preparation service remains an administrator-only shadow copy.

## Preserve the current installation

1. Keep copies of the currently deployed matched frontend/backend pairs and Worker code. Record existing deployment URLs, variable names, binding targets, enabled flags and triggers. Keep secret values in their existing secure settings.
2. Preserve the current `GSIS_SECRET`, including an existing working 33-character key. Preserve separate OAuth, session, provider and booking credentials. This upgrade does not require replacing secrets.
3. Save or record unsaved planning work before refreshing tabs. Check for active Calendar sync executions before changing backend code: a browser timeout, closing the page or Stop waiting does not cancel Apps Script work.
4. Preserve workbooks, calendar IDs, saved sync runs, uncertain receipts, notification records, rehearsal objects and database contents. Do not rerun first-time setup, recreate a workbook, wipe checkpoints or import a fixture schema over an existing database.

If an existing `GSIS_RELEASE_VERSION` environment pin is used for recovery provenance, update that pin to `0.9.9` alongside the installed code. It is a provenance label, not an authority toggle; preserve other configuration.

The current Calendar jobs database, `CALENDAR_JOBS_DB` binding, Calendar Pages `CALENDAR_JOBS` service binding, secret, backend URL and `* * * * *` cron remain in place. Keep `CALENDAR_SYNC_CONTINUE=false`. No new Calendar jobs Worker is needed.

## Install the Calendar pair

1. Open the existing Calendar Apps Script project. Replace its combined `Code.gs` contents with `Production/Calendar_Backend_v0.9.9.gs`. Preserve the project's existing settings, Script Properties and Calendar API v3 service.
2. Click **Save → Deploy → Manage deployments → pencil → New version → Deploy**. Keep the existing web-app `/exec` URL, execution identity and access settings. Saving the editor alone does not deploy the web app.
3. Open **Cloudflare → Workers & Pages → the existing Calendar Pages project → Create deployment**. Upload `Production/Calendar_Frontend_v0.9.9.zip`. If a folder is requested, extract that inner ZIP and select the folder containing `index.html` and `_worker.js`.
4. Preserve production variables and bindings. Open Calendar, refresh and confirm the visible version is `v0.9.9`.

Upload the individual frontend ZIP, not the full-suite ZIP or the review-source ZIP. Calendar continues using native SpreadsheetApp storage; this update does not re-enable Advanced Sheets for Calendar.

## Update the remaining production components

Every deployment file below is in `Production`. Install each backend before its associated frontend, keeping its existing project and URL. Install Contacts and Deploy before their consumers. Layout shares Deploy; the three LORD viewports share LORD. Preserve Google services required by those products.

| Product | Frontend upload | Backend code |
| --- | --- | --- |
| Contacts | `Contacts_Frontend_v0.9.9.zip` | `Contacts_Backend_v0.9.9.gs` |
| Deploy | `Deploy_Frontend_v0.9.9.zip` | `Deploy_Backend_v0.9.9.gs` |
| Layout | `Layout_Frontend_v0.9.9.zip` | Shares Deploy backend |
| Roster | `Roster_Frontend_v0.9.9.zip` | `Roster_Backend_v0.9.9.gs` |
| Calendar | `Calendar_Frontend_v0.9.9.zip` | `Calendar_Backend_v0.9.9.gs` |
| LORD | `LORD_Frontend_v0.9.9.zip` | `LORD_Backend_v0.9.9.gs` |
| OVERLORD | `OVERLORD_Frontend_v0.9.9.zip` | Shares LORD backend |
| STARLORD | `STARLORD_Frontend_v0.9.9.zip` | Shares LORD backend |
| Venues | `Venues_Frontend_v0.9.9.zip` | `Venues_Backend_v0.9.9.gs` |

Use the same **New version** Apps Script flow and inner frontend upload procedure for each pair. Keep Roster connected to its Google backend. Do not point production Roster at `gsis-roster-rehearsal`. Preserve Deploy's currently configured authority. Updating code does not authorize activating historical full-Roster D1 routes.

## Update the three existing service Workers

`Optional_Workers` contains the complete Worker modules listed below. The directory name describes conditional installation in other environments; the supplied rollout report says this school already has all three services. Update the corresponding existing service and preserve its settings. Do not add duplicate senders, schedules or databases.

| File | Existing destination | Keep unchanged |
| --- | --- | --- |
| `Roster_Notification_Worker_v0.9.9.txt` | `gsis-roster-notifications` | Sender flags, queue and data bindings, credentials and the existing three schedules |
| `GSiS_Operations_Worker_v0.9.9.txt` | Existing Operations Worker | Bindings and production authority controls |
| `GSiS_Calendar_Job_Worker_v0.9.9.txt` | `gsis-calendar-jobs` | Dedicated D1, `CALENDAR_APPS_SCRIPT_URL`, `GSIS_SECRET`, cron and `CALENDAR_SYNC_CONTINUE=false` |

Copy the complete module into its intended existing Worker. Do not paste example configuration over live settings. `Docs/WORKERS_INVENTORY.md` and `Optional_Workers/Calendar_Jobs_Setup.md` describe the component boundaries and optional additions.

## Optional Calendar change notifications

The 0.9.9 source prepares a change-notification path in the existing Calendar jobs service. It is optional and is not enabled by packaging. A notification means the browser should check for a newer revision; it does not itself commit an event or prove a provider write succeeded.

Keep the existing queue configuration while reviewing the optional setup in `Optional_Workers/Calendar_Jobs_Setup.md` and its example configuration. The optional binding is `CALENDAR_CHANGE_HUB`, implemented by exported class `CalendarChangeHub` in the same service. Its SQLite Durable Object migration is `calendar-change-v1`; the existing Calendar jobs D1 uses the separate additive `Calendar_Changes_schema.sql`. Review and approve that optional setup before enabling it. Merge only the needed binding and migration into existing settings; do not replace the configuration or create a second Calendar jobs Worker. Enable `CALENDAR_CHANGE_PUSH=true` on both the existing jobs Worker and Calendar Pages only after those prerequisites are installed. With that flag false or absent, the existing queue path remains available.

Background sync continuation is a separate setting. Leave `CALENDAR_SYNC_CONTINUE=false`; change notifications do not authorize enabling a new sync owner. No Durable Object, migration or production binding has been installed by this release preparation.

## Verify Calendar without losing recovery state

1. Sign in, select the intended year and check that the viewport, scroll position and any in-progress edit remain stable during background activity. Check the current change-awareness behavior described in the operating guide.
2. Inspect the existing saved sync before starting another. An uncertain batch response is recovered against the same run. Requests can wait up to 90 seconds; this is a timeout allowance, not a speed guarantee.
3. Keep the page open during direct sync continuation. **Stop waiting** stops local waiting; Apps Script may still complete. Do not repeatedly start new runs while an earlier execution may still be working.
4. Inspect successful writes, remaining records, failures and blockers separately. A processing pass can finish with unresolved items. A later explicit Sync may retry earlier failures once the current run has settled.
5. Preserve any still-unresolved save receipts. See `Docs/HANDOVER.md` for receipt-specific reconciliation status; one resolved receipt does not settle unrelated receipts or orphans. Do not blanket-clear MutationLog rows, regenerate provider IDs or rerun setup to make a counter reach zero.

Administrators can inspect Calendar venue lookup diagnostics through URLSetup. See `Docs/VENUE_LOOKUP.md` for the configuration and transport checks. This release adds diagnostic clarity; it does not establish that the live venue source is configured or repaired.

The P rollout report verified `saveEvent`, `relocateEvent` and `deleteEvent` through the queue; it did not verify `saveParentSide`. Check that path on its next genuine authorized use. Review queued jobs that stay in `NEEDS_ATTENTION` or `CHECKING`. Local test results do not establish new live provider outcomes.

## Keep timetable preparation separate

`Timetable_Preparation/GSiS_v0.9.9_Timetable_Preparation.zip` is the separately versioned shadow package. Its source protocol/schema identifiers may retain their compatibility revision; that does not make the production component labels inconsistent.

Update the existing `gsis-roster-rehearsal` service only when choosing to install that separate package. Preserve its `REHEARSAL_LEDGER` and `REHEARSAL_TIMETABLES` bindings, initialized D1, private R2 objects, request receipts and revision history. Do not rerun first-time setup or replace live settings with a template. Follow its enclosed setup guide for any genuinely additive change.

The established export path remains **Roster → System Health → Prepare timetable migration → Download timetable snapshot**. The P report records an unedited export accepted by the compatible preparation importer. Keep exports private. An unchanged import can report `noChange`; do not use a schema reset to force a new revision. Production Roster readers and absence intake keep using their Google path.

See `Docs/TIMETABLE_HANDOVER_STATUS.md` for the remaining Worker implementation and migration gates. The P report's rehearsal OAuth-origin separation and two-tab stale revision test remain operator follow-ups unless separate evidence closes them.

## Post-install verification and rollback

For each updated app, record the visible version and one normal authorized data load. Check the known real workflows without creating dummy school records solely for a version sweep. Confirm Calendar jobs still use the existing dedicated D1 and that notification schedules are unchanged. Preserve received, processing and saved distinctions for Roster reports.

Restore the previous matched code pair or Worker module at its existing destination if rollback is needed. Keep settings and all accepted work. Code rollback does not undo writes, remove accepted jobs or recall messages. Preserve unresolved receipts for reconciliation.

Finish an active P-or-later chunked Calendar sync before restoring pre-P code; older code cannot read that checkpoint format. If a run cannot finish, preserve its code and state while a maintainer reconciles it. Do not clear Script Properties to force a downgrade.

## Independent source review

The separate `GSiS_v0.9.9_Review_Source.zip` contains current source, build scripts, tests, concise recovery history, Q-to-0.9.9 changes and selected validation evidence. `SOURCE_INDEX.json` accounts for included and omitted original files by size and SHA256. Superseded manuals, generated archives, historical live-observation files and full Git history are excluded from that delivery; the live records and repository history are retained.

Read the changelog and validation record before installation. Full archive hashes, manifest checks and fresh non-Git recovery evidence identify the reviewed bytes. A recovered source check reuses locked local dependencies; it does not claim a fresh dependency download or a live deployment check.
