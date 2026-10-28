# GSiS revision J setup guide

Version 0.9.8j upgrades revision I, commit `f512ac6f584c26a027c1cf2aefb3b19d01fd6838`. Google stays authoritative for production records. Keep existing projects, data IDs, deployment URLs, credentials, bindings, writer ownership and migration settings. Preparation did not deploy code, provision cloud storage, change school records or send messages.

## 1. Choose the correct files

| File | Use |
|---|---|
| `GSiS_v0.9.8j_Updated_Deployments.zip` | Extract once; its inner frontend ZIPs and backend/Worker files go to their matched projects. |
| `SETUP.md` or `SETUP.html` inside that archive | This production upgrade guide. |
| `GSiS_Calendar_Job_Worker_v0.9.8j.txt` and `Calendar_Jobs_*` helpers | Optional production Calendar queue. Requires separate setup in section 7. |
| `GSiS_v0.9.8i_Rehearsal.zip` | Unchanged I administrator rehearsal, separate from production installation. |
| Source ZIP and full reachable history bundle | Maintenance and recovery; never Pages uploads. |

The production archive has 18 components: the existing nine frontends, six Apps Script backends and two Workers, plus the optional Calendar job Worker. The optional Worker is production infrastructure when configured; it is separate from the I rehearsal. The core J upgrade works in Calendar direct mode without a new database or Worker. Do not create infrastructure merely to use every supplied file.

Check `PATCH.json` for J, baseline I and the actual source commit; verify `SHA256SUMS.txt`. Its optional component inventory identifies the Calendar job Worker. Its `separatePackages` entry references the unchanged I rehearsal ZIP by hash with `productionInstallation: false`. Read `VALIDATION.md` and the final external `RELEASE_VERIFICATION.json` before installation. Pending checks do not establish a pass.

## 2. Record existing settings and rollback points

1. Save the I component files. Record the existing Apps Script project names, web app deployment IDs/versions and `/exec` URLs for Roster, Calendar and Venues. Record current Pages and Worker deployments.
2. Record Script Property names and keep their values in the school's private settings ledger or password manager. Preserve workbook/folder IDs, execution identity, access permissions and triggers. Do not paste private values into source or documentation.
3. Record Pages/Worker variables, secrets, bindings, custom domains, routes and cron lists. Preserve any existing production operations deployment and ownership state.
4. Retain the notification Worker's `* * * * *`, `15 18 * * *` and audit-only `2-57/5 * * * *` UTC cron expressions. J introduces no new notification cron. The I audit lane still exports at most one pending day per invocation to `Allocation Audit/YYYY/MM/YYYY-MM-DD.txt`.
5. Keep rehearsal D1/private R2 bound only to the separate rehearsal Worker. Never reuse those stores for the production Calendar queue.

A working `GSIS_SECRET` remains unchanged, including a 33-character value. Configured shared keys require at least 32 printable non-whitespace ASCII characters; an invalid configured key fails closed with `GSIS_SECRET_INVALID`. Retain existing supported legacy fallbacks where the canonical key is absent. Keep Google OAuth, `BRIDGE_SECRET`, `CALENDAR_SESSION_SECRET`, `LORD_SESSION_SECRET`, `EXTERNAL_LINK_SECRET`, booking peppers and provider credentials in their existing independent roles. J requires no general key cutover.

## 3. Update the existing Apps Script backends

Install the Roster, Calendar and Venues backends before their frontends. Use each product's own existing project and URL.

| Inner file | Existing destination | Purpose |
|---|---|---|
| `Roster_Backend_v0.9.8j.gs` | Roster Apps Script project | Compact publication receipt, safe learning/rules and relief candidate classification. |
| `Calendar_Backend_v0.9.8j.gs` | Calendar Apps Script project | Native sync reads, command adapter, glossary responses and venue identity. |
| `Venues_Backend_v0.9.8j.gs` | Venues Apps Script project | Bounded active venue catalogue for authorised Calendar lookup. |

For each project:

1. Open the existing project and check its deployment URL against your record. Replace its previous combined backend code with the entire matching `.gs` file. Remove duplicate old combined functions if an earlier project split that combined file into multiple files. Keep the manifest, Script Properties and current services.
2. Save. Saving the editor alone does not update the deployed web app.
3. Choose **Deploy > Manage deployments**, select the existing web app, choose the pencil/edit control, choose **New version**, then **Deploy**. Keep the existing execution identity and access permissions.
4. Confirm the `/exec` URL is unchanged. Retain the earlier deployment version for rollback; do not delete the deployment or create a replacement project.

After saving the new Calendar source, select `upgradeCalendarToRC19` in that existing Apps Script project's function selector and run it once as the authorised maintainer. Approve only that project's normal existing spreadsheet access when prompted. It appends the `VenueID` header after the existing columns and is safe to rerun; it preserves the old `LastMutationID` position, headers, historical rows and values. Do not insert, reorder, rename or delete existing columns manually. This is an append-only Calendar schema upgrade, not an authority migration. Retain the appended column if rolling code back.

To enable venue suggestions after both Calendar and Venues backends are redeployed, open the existing Calendar project's **Project Settings > Script properties** and set `VENUES_APPS_SCRIPT_URL` to the existing Venues web app `/exec` URL. Keep the existing canonical `GSIS_SECRET` consistently configured for this approved connection. The supported legacy venue bridge fallback is `VENUES_BRIDGE_SECRET` where canonical configuration is absent. This read returns only permitted active venue id, unit, name and aliases; it does not expose bookings or private staff information. Custom Location text remains valid without a venue selection.

The matching deployed Calendar backend enables the restricted Calendar command adapter used by section 7. It uses the existing canonical `GSIS_SECRET` (supported legacy Calendar fallback: `CALENDAR_PROXY_SECRET`); there is no separate `CALENDAR_JOB_SECRET`. The adapter rechecks the original signed-in actor's current authority at execution.

## 4. Update the existing Roster and Calendar Pages projects

1. Open each existing Pages project and keep its variables, secrets, routes and bindings.
2. Use the project's established deployment method. In a Direct Upload project, choose a new production deployment and upload only its inner `Roster_Frontend_v0.9.8j.zip` or `Calendar_Frontend_v0.9.8j.zip`. Each ZIP has `index.html` at its top level. Keep Git integration where already used.
3. Do not upload the outer release, source or rehearsal archive as site assets.
4. Open the existing site URL, refresh and sign in with the normal school Google account. Verify J labels. Leave the optional `CALENDAR_JOBS` service binding absent until section 7 is complete; Calendar continues to use its existing direct path.

Roster's **Save to online** is one toolbar row lower. **Let teachers see** remains a visibility-only action. The blue **Let teachers see and send WhatsApp to all** action publishes first, then submits a separate durable notify-all command. A notification-stage failure keeps confirmed visibility; resume the reported pending stage rather than repeating a completed publication. Standalone notifications remain independent.

**Learn about Auto Allocation**, after **My Relief Duties**, replaces the header Calculations button and retains access for teachers, SMC and administrators. Its three sections contain the existing calculations, the effective safe business rules and the existing audit-folder link with the exact copy prompt. MK, OSO, SAT and SL staff classifications are excluded from relief candidates, including Unavailable/search/counts; an application administrator role alone does not identify SL staff. Missing timetable data alone does not hide a genuine teacher.

Roster Excel exports omit `[DRAFT]` and fit final row content after all formatting and overlays. Calendar glossary saves update in place and preserve the current view and unsaved editor input. Selecting a valid venue records its stable `VenueID`; editing custom Location text clears a stale identity. Selection does not reserve a room or assert that it is free.

## 5. Retain existing Workers and background schedules

The matched `Roster_Notification_Worker_v0.9.8j.txt` and `GSiS_Operations_Worker_v0.9.8j.txt` contain embedded shared-helper parity. Update these through their existing deployments where already used; copy the whole self-contained file. Preserve their configuration, receipts, pending work, schedules and ownership settings. Use Operations only where it is already deployed. Do not activate historical migration or cache paths as part of J.

The optional Calendar job Worker in section 7 is a new independent deployment. Its every-minute cron belongs to that Worker, not the notification Worker. It uses no R2 bucket or Cloudflare Queue binding.

## 6. Other matched component files

| Inner file | Existing destination | J requirement |
|---|---|---|
| `Contacts_Frontend_v0.9.8j.zip` | Contacts Pages | Optional matching label update. |
| `Deploy_Frontend_v0.9.8j.zip` | Deploy Pages | Optional matching label update. |
| `Layout_Frontend_v0.9.8j.zip` | Layout Pages | Optional matching label update. |
| `LORD_Frontend_v0.9.8j.zip` | LORD Pages | Optional matching label update. |
| `OVERLORD_Frontend_v0.9.8j.zip` | OVERLORD Pages | Optional matching label update. |
| `STARLORD_Frontend_v0.9.8j.zip` | STARLORD Pages | Optional matching label update. |
| `Venues_Frontend_v0.9.8j.zip` | Venues Pages | Optional matching label update. |
| `Contacts_Backend_v0.9.8j.gs` | Contacts Apps Script | Optional matching label update. |
| `Deploy_Backend_v0.9.8j.gs` | Deploy Apps Script | Optional embedded shared-helper and label parity. |
| `LORD_Backend_v0.9.8j.gs` | Shared LORD Apps Script | Optional matching label update. |

Use the same existing-deployment update steps for an optional Apps Script update and the same inner-ZIP workflow for Pages. Preserve each project's current settings and connections. LORD's photo reliability/service fragment files remain references; they do not instruct you to reset existing properties.

## 7. Optional production Calendar job queue

Complete the core upgrade first. This optional route durably captures the four event actions (`saveEvent`, `deleteEvent`, `saveParentSide`, `relocateEvent`) in its own D1 queue while Google remains the production event destination. Without `CALENDAR_JOBS`, Calendar uses direct mode. A background `waitUntil` task alone is not durable acceptance.

Read `Calendar_Jobs_README.md` with the supplied `Calendar_Jobs_schema.sql` and `Calendar_Jobs_wrangler.example.jsonc`. The example uses placeholders; replace only those with your new resource identifiers. Preserve all existing production configuration. Local test results do not verify live Cloudflare storage.

1. In Cloudflare **Workers & Pages**, create a new standalone Worker for production Calendar jobs, for example `gsis-calendar-jobs`. Do not select or overwrite Roster rehearsal, notification or Operations Workers.
2. Create a new D1 database dedicated to production Calendar jobs, for example `gsis-calendar-jobs`. Open that new database's SQL console and apply the supplied `Calendar_Jobs_schema.sql`. Check the selected database name before executing the SQL. Do not apply it to a production Roster/Deploy database or any rehearsal store.
3. In the new Worker's **Settings > Bindings**, add a D1 database binding named exactly `CALENDAR_JOBS_DB` and select that new database. There is no R2 or Cloudflare Queue binding.
4. Set `CALENDAR_APPS_SCRIPT_URL` to the existing Calendar backend `/exec` URL from section 3. Set the Worker's `GSIS_SECRET` as a secret to the exact existing canonical value already used by Calendar Pages and its backend. Keep a working 33-character value; do not generate a new shared or cross-API secret. This key signs a Calendar-specific service/purpose envelope and is not a user session secret. Set the plain variable `CALENDAR_SYNC_CONTINUE` to `false` initially; omitting it also leaves sync continuation disabled.
5. In the new Worker's code editor, replace its code with the entire `GSiS_Calendar_Job_Worker_v0.9.8j.txt`, then save/deploy through the normal module Worker workflow. This file is self-contained. The restricted adapter is enabled by the matching Calendar backend deployment; do not enable a historical production ownership migration. Disable the new Worker's public `workers.dev` route and preview URLs; Calendar Pages calls it through the service binding.
6. Add the new Worker's Cron Trigger `* * * * *` in UTC. It performs bounded queue processing and retention. Keep it separate from notification/audit cron triggers.
7. In the existing Calendar Pages project's **Settings > Bindings**, add a **Service binding** named exactly `CALENDAR_JOBS`, selecting the new standalone Worker. Keep all existing bindings and secrets. Redeploy the J Calendar Pages assets so the binding applies. Adding this binding selects queue mode; omit it to keep direct mode.
8. Record the actual Worker, database, binding and deployment identifiers privately. Verify sign-in and the reported processing mode using authorised read-only checks. Before routine use, an authorised operator must verify the new remote database/schema and cron in the actual account; release preparation has not performed those checks. Do not create a real event or send a provider message merely as an installation test.

An accepted queue command is **queued**, not saved to Google yet. Track its completion or reported conflict/review state. A transport timeout is not permission to create a fresh operation identity. Retry/recover the same command, checking its durable receipt before a write; unknown outcomes require review instead of blind retry. Commands for the same event are serialised, and independent event edits can proceed. Current actor authority is rechecked when the backend executes the command.

`CALENDAR_SYNC_CONTINUE` is `false` by default. Set it to `true` only when this Worker should continue an already persisted Calendar sync session. After bounded event-job processing, cron can attempt at most one existing sync batch. The backend retains the original initiating Admin and rechecks current authority, its provider lease, and persisted pause/cooldown/retry deadlines; the Worker also holds a D1 maintenance lease. It cannot start a sync or choose an actor/year. Check existing scheduler ownership before enabling it: this setting does not replace another separately configured scheduler, and should stay `false` if that scheduler owns continuation.

To disable queue mode safely, first stop new event edits and retain pending-command IDs and receipts. Let known commands finish, or review unresolved outcomes with the operator before accepting direct edits to affected events. Remove only the Calendar Pages `CALENDAR_JOBS` binding and redeploy its assets; retain the dedicated D1 records and Worker evidence. Disable that Worker's cron only after unresolved work is accounted for. Do not delete the queue database to force a retry and do not move its bindings into rehearsal.

## 8. Read-only acceptance and rollback

1. Confirm existing sign-in, J labels and reference-data reads in Roster, Calendar and Venues. Check normal source connections and configuration without changing real plans, events or absences.
2. Confirm Calendar's current editor/view survives a glossary read/update during normal authorised work; confirm free Location text remains possible. Do not infer venue availability from catalogue presence.
3. Review the normal next publication outcome by its separate visibility and notification statuses. Do not trigger notify-all just to test installation. Existing audit status may validly be unchanged or skipped when verbose logging is off.
4. Retain I rollback deployments and record exactly which optional parity components and queue configuration were changed.

For core rollback, stop new edits, retain receipts and restore the preserved I Roster, Calendar and Venues backend/frontend deployments in matched pairs. Preserve all existing data, secrets, URLs, logs and schedules; leave the appended `VenueID` column in place. If optional Calendar queue mode was enabled, follow its drain/review procedure before reverting the Pages binding or affected code. Code rollback cannot recall a provider submission or reverse saved school records. Do not clear command receipts or pending state.

## 9. Unchanged separate I rehearsal and evidence limits

`GSiS_v0.9.8i_Rehearsal.zip` remains I, byte-for-byte from the I complete release. It is not nested in the J production deployment ZIP. Its `REHEARSAL_SETUP.md` remains the rehearsal authority: dedicated D1 and private R2, verified school Google identity, administrator allowlist server-side and simulated notifications. It supplies no Activate action, live scheduler, production queue consumer or Google write capability. J adds no rehearsal feature or authority cutover.

Live deployment, remote D1/R2 provisioning, storage verification, production latency and provider delivery are unperformed release-preparation checks. The I preparation record reports that Cloudflare authentication was unavailable. That historical observation does not certify current account access. Google stays authoritative; neither building nor recovering the source activates infrastructure or sends messages.
