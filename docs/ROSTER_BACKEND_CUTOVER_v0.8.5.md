# Move Roster to its own Apps Script backend

If the v0.8.4 cutover is already complete, update the existing split projects in place using DEPLOYMENT.md. The sequence below is only for an installation that still needs its first single-owner cutover or a deliberate rollback. Do not create a second active Roster writer.

v0.8.5 contains four complete backends: Contacts, Calendar, Deploy with Layout, and Roster. Roster owns baseline timetable files, operations, notifications, Inbox, leases and audit exports. Deploy and Layout retain their existing backend and workbook. Roster can still read the published Deploy source; the split does not move or duplicate Sheets or Drive data.

The purpose is to separate Roster execution and its ScriptLock from Deploy editing. Roster saves still share their own operations document and final lock. Published Deploy reads, shared account/platform quotas and Drive latency remain. This is not a promise of unlimited concurrency.

Each Roster operation uses a verified published Deploy snapshot bound to its source version. Existing pending-commit and manifest checks remain in place. Separate project locks cannot guarantee that this snapshot is the latest Deploy publication at the instant Roster commits. A subsequent verified source read or allocation cycle detects newer Deploy data. Roster still commits its own operations state, receipt and audit together under its sole-owner lock.

## Owner gates

The generated `Roster_Backend_v0.8.5.gs` has fixed `GSIS_BACKEND_KIND='roster'`. The Deploy artifact rejects Roster actions. The Roster artifact rejects Deploy/Layout writes and Deploy recovery paths. Do not alter the compiled kind to bypass these boundaries.

The new Roster project starts disabled. Configure these Script Properties. The first two are mandatory owner gates; the self URL also supports service-URL discovery when unset:

| Property | Required value |
| --- | --- |
| `ROSTER_WRITER_ENABLED` | `true` only after the old writers are stopped |
| `ROSTER_OWNER_SCRIPT_ID` | The new Roster Apps Script project's own script ID |
| `ROSTER_WEB_APP_URL` | The new Roster `/exec` URL for diagnostic self-requests |

An unset/false enable flag or an owner-ID mismatch fails with 503 `ROSTER_OWNER_INACTIVE`. Run `showBackendOwnership()` in the editor while paused to read the fixed kind, actual script ID, enabled flag and owner match without writing. This guard is project-local; it cannot disable historical unguarded code in another deployment. Never run both owners against the same operational files.

## Prepare without changing production routing

1. Record existing deployments, triggers, runtime file/folder IDs and the current routing. Back up the original operational data and properties using the school's normal private procedure.
2. Create a separate Roster Apps Script project under the maintained school account. Install the complete `Roster_Backend_v0.8.5.gs` and its required services/scopes.
3. Copy the existing Roster configuration and every retained runtime pointer to that project. Keep the original `ROSTER_ROOT_FOLDER_ID`, `ROSTER_ARCHIVE_FOLDER_ID`, `ROSTER_DATA_FOLDER_ID`, `ROSTER_INDEX_FILE`, `ROSTER_OPERATIONS_FILE` and `ROSTER_INBOX_FILE`. Preserve retained leases, journals, audit pointers and other `ROSTER_*` properties.
4. Preserve `DEPLOY_SHEET_ID` for published source reads, `CONTACTS_API_URL`, `CONTACTS_BRIDGE_SECRET`, `BRIDGE_SECRET`, `ROSTER_SERVICE_SECRET` and `ROSTER_NOTIFICATION_ADMIN_IDS`, plus the existing Calendar authority connections. Keep the original bridge/service secrets and private-key material needed by current requests, jobs and links. Keep `EXTERNAL_LINK_SECRET` and any `EXTERNAL_LINK_PREVIOUS_SECRET` on Roster Pages and the notification Worker unchanged; they remain worker settings. Do not paste secret values into release documents.
5. Set the new owner's script ID and leave `ROSTER_WRITER_ENABLED` unset or false. Run `authoriseRosterWrites()` and `authoriseRosterMail()` as needed while paused. These request scopes/check quota without saving or sending. Do not run setup or reset helpers on existing data.
6. Set `ROSTER_WEB_APP_URL` to the new Roster `/exec`. Roster diagnostics never use a copied `DEPLOY_WEB_APP_URL`; leave the original Deploy self URL unchanged in its project. If no self URL is configured, Apps Script service URL discovery is used. An invalid explicit URL fails configuration.
7. Prepare the Roster Pages and notification Worker production settings with the new Roster `/exec` destination, but do not route traffic to an enabled new writer yet.

For an existing school, never run blank setup, create replacement operational JSON, change Staff IDs, copy data into a second live store or replace retained file pointers merely to complete the split.

## Cut over with one writer

1. Stop new Roster requests and pause the scheduled notification Worker during the cutover window. Retain pending browser commands and uncertain receipts.
2. Deploy the guarded v0.8.5 Deploy backend on the existing Deploy project. It continues Deploy/Layout work and rejects Roster operations.
3. Disable every historical Deploy web-app deployment that can still execute unguarded Roster code. A new version on one deployment does not guard other historical deployments. Remove/disable old Roster time triggers and stop other saved callers targeting the old code.
4. Drain in-flight executions. Check Apps Script executions and scheduled work; do not enable the new writer while an old Roster execution may still commit.
5. Confirm the new project's copied IDs point to the original school data and its own `ROSTER_OWNER_SCRIPT_ID` is correct. Enable `ROSTER_WRITER_ENABLED=true` only now.
6. Route Roster Pages and the separate notification Worker's `APPS_SCRIPT_URL` to the new Roster `/exec`. Keep Deploy and Layout Pages routed to Deploy. Contacts and Calendar retain their existing destinations.
7. Create or resume Roster-specific triggers only in the new Roster project. Resume the intended Worker cron after the routing and owner checks pass. Keep the existing notification flags unless an intentional operational change is authorised.
8. Refresh old Roster browser tabs. Check the retained saved plan, revision, baseline and pending receipts before making a new save.

Publication, colleague requests, email and WhatsApp remain deliberate operational actions. The cutover itself does not authorise a test message or timetable publication.

## Verify and recover

Use `showBackendOwnership()` to check the new fixed kind and owner match. A paused self-request can correctly return 503 until deliberate enablement. Check that the old guarded Deploy endpoint rejects Roster actions and that the new Roster endpoint rejects Deploy writes. A disabled or incorrectly identified Roster owner must reject operational work. Verify Contacts authority, published Deploy reads, Calendar dates and existing Roster files through authorised read paths. Local fixture results do not prove the installed routes or Google permissions.

If cutover fails, stop the new writer and its triggers before selecting any rollback owner. Prefer the preceding compatible Roster-role build in the same sole-owner project, or perform a separately planned reverse cutover. Drain it, preserve exact request IDs/receipts and assess code/data compatibility. Never restore an old unguarded deployment while the new owner can write. A code rollback does not undo accepted saves, mail or messages. Keep one owner throughout recovery.

No live cutover is performed by building this package. Record the actual installed owner, URL, disabled historical deployments and completion time in the school's private installation record.
