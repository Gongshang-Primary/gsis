# Install GSiS Roster v0.9.3b

Apply on top of GSiS v0.9.3 or v0.9.3a. This is a three-component Roster patch, including the earlier v0.9.3a changes. Other suite components remain v0.9.3.

## Verify existing settings

Check values in both **Roster Cloudflare Pages → Settings → Variables and Secrets / Bindings** and the **separate Roster notification Worker → Settings** before deploying:

| Setting | Required verification |
| --- | --- |
| `APPS_SCRIPT_URL` | Both point to the same current Roster `/exec` URL. |
| `ROSTER_PUBLIC_ORIGIN` | Explicitly set to `https://roster.gsps.edu.sg` on both. Use the same origin, with no path. |
| `ROSTER_SERVICE_SECRET` | Existing value matches between both Workers, Roster Apps Script and its Contacts service connection. Preserve it. |
| `BRIDGE_SECRET` | **New required check when D1 is enabled:** the notification Worker now also needs the existing Roster bridge secret, identical to Pages and Roster Apps Script. Copy the existing setting into that Worker if it is absent; do not generate or rotate it. |
| `CALENDAR_APPS_SCRIPT_URL`, `CALENDAR_PROXY_SECRET` | Both Workers retain the current Calendar connection needed to apply received reports. |
| Optional D1 `GSIS_JOBS` | If used, bind the **same D1 database ID** to Pages and the notification Worker. Matching binding names alone are insufficient. Keep the same Roster URL/origin because they identify the receipt namespace. |
| `WHATSAPP_DIAGNOSTICS_ENABLED` | Keep `false` or remove this setting in production. `true` makes the cron diagnostic-only and deliberately skips report processing, for both D1 and no-D1 capture. |
| Existing WhatsApp settings | Preserve provider credentials, enablement flags and approved template configuration. The patch does not create a new template. |

D1 is optional and recommended for urgent illness reporting. With `GSIS_JOBS`, Pages can return a durable receipt before Google responds; the absence table and index are created automatically. This receipt path does not require `WHATSAPP_DURABLE_INGRESS=true`. Without D1, the request is captured in the Apps Script Drive journal using UserLock. That fallback avoids the allocation ScriptLock but still depends on Google availability, current Contacts authorization and the shared UserLock.

Both D1 and no-D1 installations need the notification Worker's `ROSTER_SERVICE_SECRET` and working Calendar URL/proxy secret to apply reports, even if those Calendar settings were previously unused because allocation was disabled. Keep the notification Worker's existing `* * * * *` cron. With diagnostics mode off, report processing and peer email continue when `ROSTER_AUTOMATION_ENABLED=false`. Disabling WhatsApp sending does not disable absence capture or processing. Keep any existing notification Queue/wake configuration; cron remains the recovery path.

No new secret is needed. Do not manually create `ROSTER_ABSENCE_INTAKE_FILE`: the backend creates this managed Script Property and private Drive journal. Preserve all existing data pointers, secrets and owner settings.

## Install all three components

1. In the existing **Roster** Apps Script project, replace the combined backend with `Roster_Backend_v0.9.3b.gs`. The new intake, processing and email modules are already included; do not paste duplicate copies of their source files.
2. Save, run `showBackendOwnership()` and `diagnoseRoster()`, and verify the existing sole-writer configuration. Run `authoriseRosterMail()` if mail authorization is missing; it checks permission/quota without sending email. Preserve Sheets v4, Drive v3 and current scopes. Edit the existing web-app deployment to a new version, keeping its `/exec` URL and **execute as the school owner** setting.
3. Replace the separate scheduled notification Worker with the complete `Roster_Notification_Worker_v0.9.3b.txt` module. Retain its cron, bindings and existing intended flags. Recheck the same D1 database and Roster URL/origin after saving.
4. Upload `Roster_Frontend_v0.9.3b.zip` to the existing Roster Pages project. Include `_worker.js` and `_routes.json` at the deployment root; preserve Pages settings and D1 binding. Do not upload the outer patch ZIP as a website.
5. Reload open Roster tabs and confirm v0.9.3b. Keep IndexedDB; clearing timetable caches is not a deployment step.

Complete the component update in one maintenance window. An old Worker does not drain the new receipt queue reliably. Do not delete queued reports, receipts or journals to resolve a configuration error.

## Check the outcome

Use an authorized school test case with known recipients. Verify that **Submit absence** first confirms **received**, then the record becomes **applied** without a second submission. Reload or close/reopen the tab and confirm the same receipt remains recoverable. Check processing with `ROSTER_AUTOMATION_ENABLED=false` and with the allocator active, keeping `WHATSAPP_DIAGNOSTICS_ENABLED=false` in both cases. A deliberately diagnostic-only cron must remain read-only and must not consume queued reports. If the report stays pending, inspect the notification Worker's execution and Calendar/Contacts connection before retrying the same receipt.

Propose relief or a combination. The colleague should receive the configured WhatsApp notice and email at their current CES/GSPS addresses. The email opens their authenticated **My Relief Duties** page. Verify explicit acceptance creates peer-approved human relief; verify SMC override identifies the overwritten arrangement in audit. A provider timeout must remain visible as uncertain instead of triggering a blind duplicate email.

The full-day shortcut is removed. A full-day report still uses **Select All** and the normal review and **Submit absence** actions.

A durable receipt is not proof that Calendar validation, allocation or peer approval has finished. Known pending core reports hold affected-date allocation/publication and timetable notices. D1 and Apps Script are separate stores: a report received during an in-progress commit is applied by a subsequent update. Unforwarded D1 reports requiring review can be withdrawn only by an authorized SMC/Admin with a recorded reason; that control does not delete an already applied absence.

The patch includes source differences, checksums and an incremental Git bundle against v0.9.3 for maintenance. Local checks do not establish production throughput or provider delivery. No production deployment or live staff messages were performed while preparing it.

Reports rejected by the backend as invalid or unauthorized remain available for review but do not hold allocation. A business conflict still requires review; no rejected report is represented as an applied absence.
