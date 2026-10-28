# Production services and separate timetable preparation

The full suite contains three production service modules at 0.9.9. The supplied P rollout report records all three already installed at this school. Update only those existing destinations, preserving current credentials, bindings and schedules. Packaging prepares files; it does not deploy or enable them.

| File | Destination | Installation boundary |
| --- | --- | --- |
| `Roster_Notification_Worker_v0.9.9.txt` | Existing `gsis-roster-notifications` | Preserve current enabled flags, queues, database/bucket bindings, secrets and the three existing schedules. No second scheduled sender. |
| `GSiS_Operations_Worker_v0.9.9.txt` | Existing Operations Worker | Preserve the current production route. Do not change `ROSTER_EDGE_AUTHORITY`, `DEPLOY_EDGE_AUTHORITY`, `GSIS_BACKEND` or `GSIS_BACKEND_REQUIRED` to activate a migration. |
| `GSiS_Calendar_Job_Worker_v0.9.9.txt` | Existing `gsis-calendar-jobs` | Preserve its dedicated `CALENDAR_JOBS_DB`, backend URL, secret and cron. Keep `CALENDAR_SYNC_CONTINUE=false`. Optional change notifications are a separate explicit setup step. |

The notification schedules in the current source are `* * * * *` for critical work, `15 18 * * *` UTC for daily cleanup, and `2-57/5 * * * *` UTC for bounded audit export. The Calendar jobs cron is `* * * * *`. Packaging does not change those live triggers or enable disabled automation.

Calendar Pages already has the production service binding `CALENDAR_JOBS` to `gsis-calendar-jobs`. That service has `CALENDAR_JOBS_DB`, `CALENDAR_APPS_SCRIPT_URL`, `GSIS_SECRET` and `CALENDAR_SYNC_CONTINUE=false`. Workers.dev and preview URLs were disabled in the rollout report. Keep these settings; the example configuration is a reference, not an instruction to replace them.

The optional `CALENDAR_CHANGE_HUB` binding uses exported `CalendarChangeHub` within the existing Calendar jobs service. It requires the `calendar-change-v1` SQLite Durable Object migration and additive existing-D1 `Calendar_Changes_schema.sql`. Explicit `CALENDAR_CHANGE_PUSH=true` is needed on both the existing jobs service and Calendar Pages; keep it false or absent until prerequisites are deliberately installed. Follow `Calendar_Jobs_Setup.md` before deliberately enabling it or applying additive storage setup. Absence of that binding retains the existing queue path. A change hint invalidates browser knowledge; it does not authorize a write, change Google authority or enable background sync continuation. No optional infrastructure is deployed by this package build.

Accepted Calendar jobs remain real work even if the Pages service binding is later removed. Preserve D1 and reconcile unresolved receipts during rollback. A queue acknowledgement means accepted; only the saved outcome proves the corresponding backend result. The Calendar workbook and Google Calendar remain the production record destinations.

The separately packaged `GSiS_v0.9.9_Timetable_Preparation.zip` is isolated under `Timetable_Preparation/`; it is outside the 18 production components. It targets the existing `gsis-roster-rehearsal` service, `REHEARSAL_LEDGER` and `REHEARSAL_TIMETABLES`. Preserve the initialized database, private objects, configured settings and history. It does not receive production absence reports or grant production record authority to D1/R2.

Only Calendar jobs SQL belongs beside these production service modules. Use it solely for the existing dedicated Calendar jobs database and only as described by the guide; do not apply it to Roster or preparation D1. Historical migration SQL and rehearsal fixture schemas in source are reference/test material, not upgrade commands.

Copy the complete module text into the correct existing service. Keep the current operator-selected shared `GSIS_SECRET`, including an existing valid 33-character value. No code-only update requires replacing the secret or pasting an example template over settings.
