# Optional Worker installation inventory

The full suite contains the current code for three production services. Presence in this archive does not enable a service. Keep the current production routing, credentials, bindings and schedules unless a specific setup step calls for a change.

| File | Destination | Installation boundary |
| --- | --- | --- |
| `Roster_Notification_Worker_v0.9.8p.txt` | Existing `gsis-roster-notifications` Worker | Replace code only where this service already runs. Preserve existing enabled flags, queues, secrets, database and bucket bindings, and the current three schedules. |
| `GSiS_Operations_Worker_v0.9.8p.txt` | Existing Operations Worker, if used | Code parity only. Do not create or activate a new Roster/Deploy authority from this file. Do not change `ROSTER_EDGE_AUTHORITY`, `DEPLOY_EDGE_AUTHORITY`, `GSIS_BACKEND` or `GSIS_BACKEND_REQUIRED` to force a migration. |
| `GSiS_Calendar_Job_Worker_v0.9.8p.txt` | Optional isolated `gsis-calendar-jobs` service | Follow `Calendar_Jobs_Setup.md`. The dedicated D1 stores accepted event proposals and receipts. It does not replace the Calendar workbook. Keep direct mode until setup is complete. |

The notification schedules retained by the current source are `* * * * *` for critical work, `15 18 * * *` UTC for the daily cleanup lane, and `2-57/5 * * * *` UTC for bounded audit export. Packaging does not enable disabled automation or change live triggers.

Calendar's `CALENDAR_SYNC_CONTINUE` remains `false` until an operator deliberately enables one continuation owner. When enabled, it resumes an existing saved sync; it cannot start a new sync. Accepted Calendar event jobs remain live work even if a Pages binding is later removed. Preserve the database and reconcile unresolved receipts during rollback.

The compatible **O timetable preparation package** is isolated under `Timetable_Preparation/`. It is not one of these production services. Its administrator-only importer cannot receive absence reports, and it does not grant production authority to D1 or R2. P's corrected export retains the O contract so the already verified preparation Worker does not need redeployment.

Only the Calendar jobs schema is included beside production Worker modules. It applies to that service's dedicated database. Historical migration SQL remains in review source for inspection; it is not an installation instruction. Never execute a rehearsal fixture schema against an existing production database.

Copy the complete module text into the intended existing dashboard service. Do not paste a configuration template over live settings. Keep the operator's current shared `GSIS_SECRET`; no new key is required for a code-only update.
