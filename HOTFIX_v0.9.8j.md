# Install GSiS revision J

Version 0.9.8j upgrades I commit `f512ac6f584c26a027c1cf2aefb3b19d01fd6838`. Read `SETUP.md` or `SETUP.html` before changing existing deployments. Verify `PATCH.json`, `SHA256SUMS.txt`, `VALIDATION.md` and the final external `RELEASE_VERIFICATION.json`; pending validation is not a pass.

## Core production upgrade

1. Save I rollback deployments and record existing settings privately. Preserve projects, URLs, data IDs, Script Properties, secrets, bindings, schedules and Google production authority. A working 33-character `GSIS_SECRET` remains valid.
2. Replace the combined code in the existing Roster, Calendar and Venues Apps Script projects with their matched `Roster_Backend_v0.9.8j.gs`, `Calendar_Backend_v0.9.8j.gs` and `Venues_Backend_v0.9.8j.gs` files. Save, then **Deploy > Manage deployments > pencil > New version > Deploy** for each existing web app. Saving the editor alone does not update the deployed web app. Keep each `/exec` URL.
3. In the existing Calendar project, run `upgradeCalendarToRC19` once to append `VenueID`; rerunning is safe. Never reorder or delete existing headers. After both Calendar and Venues redeploy, set Calendar Script Property `VENUES_APPS_SCRIPT_URL` to the existing Venues `/exec` URL with its approved existing shared-key configuration.
4. Upload only `Roster_Frontend_v0.9.8j.zip` and `Calendar_Frontend_v0.9.8j.zip` to their existing Pages projects through the established workflow. Keep Calendar direct mode by leaving `CALENDAR_JOBS` absent until optional setup is complete.
5. Apply matched shared-helper Worker updates only to existing notification/Operations deployments. Preserve the notification crons `* * * * *`, `15 18 * * *` and `2-57/5 * * * *` UTC. Other optional matching component updates are listed in SETUP; do not create missing production projects merely to use every file.

Roster publication is a focused saved-work visibility change. The blue **Let teachers see and send WhatsApp to all** action publishes, then queues a separately durable notify-all command. A failure in the second stage keeps confirmed visibility. Use the reported receipt and pending stage for recovery; do not blindly repeat a completed stage. Learning, relief classification exclusions and final Excel fitting are included. Calendar Sync Staff uses native reads; glossary changes preserve the current editor/view and validated venue choices retain stable identity.

## Optional production Calendar queue

The 18th component `GSiS_Calendar_Job_Worker_v0.9.8j.txt` is an optional production Worker. Follow SETUP section 7 and `Calendar_Jobs_README.md`: create a new dedicated D1 database, apply `Calendar_Jobs_schema.sql`, bind `CALENDAR_JOBS_DB`, set `CALENDAR_APPS_SCRIPT_URL` to the existing Calendar URL and use the same existing canonical `GSIS_SECRET`. Deploy the supplied self-contained Worker, add its own `* * * * *` UTC cron, then bind existing Calendar Pages `CALENDAR_JOBS` to it and redeploy Pages. No additional job secret, R2 or Cloudflare Queue is used. Never reuse Roster rehearsal stores.

Keep `CALENDAR_SYNC_CONTINUE` absent or `false` initially. Optional `true` resumes at most one already persisted sync batch per cron invocation under the original Admin's current authority, maintenance/provider leases and stored pause/cooldown/retry deadlines. It cannot start a sync or choose an actor/year. Confirm scheduler ownership first; it does not replace another configured scheduler.

Accepted queue work is not yet saved to Google. Check the same command's receipt/status after interruption; unknown outcomes require review. Drain or review unresolved jobs before disabling the binding or reverting affected code. Keep queue records and receipts. Direct mode remains available when no service binding is configured.

## Rehearsal, rollback and evidence

The separate `GSiS_v0.9.8i_Rehearsal.zip` is unchanged I and stays outside the production ZIP. Its own `REHEARSAL_SETUP.md` describes dedicated D1/private R2 and simulated notifications. J adds no rehearsal feature or Activate action and does not switch production authority.

For core rollback, stop edits, retain receipts and restore saved I backend/frontend deployments in matched pairs. Preserve data, settings and schedules. Leave the appended `VenueID` column intact. If Calendar queue mode was enabled, first follow the queue drain/review procedure in SETUP. Code rollback cannot undo saved school changes or recall provider submissions. Local package and mock checks do not verify live Cloudflare storage, production latency or provider delivery. Preparation performs no live deployment, provisioning, school-data mutation or real send.
