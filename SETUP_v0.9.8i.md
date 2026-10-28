# GSiS revision I setup guide

Version 0.9.8i, 27 October 2026. This guide upgrades an existing revision H production installation. Google remains the production source of truth. Keep existing data, web app URLs, sign-in settings, secrets, bindings and migration flags.

## 1. Choose the correct archive

| Archive | Use |
|---|---|
| `GSiS_v0.9.8i_Updated_Deployments.zip` | Existing production projects. Extract it once, then select the inner component files. |
| `GSiS_v0.9.8i_Rehearsal.zip` | Optional separate administrator rehearsal. Extract it separately and start with its `REHEARSAL_SETUP.md`. |
| Source ZIP and Git recovery bundle | Maintenance and recovery. These are not Pages uploads. |

The production archive supplies all 17 matched I components. Install the three changed Roster components below for the I fixes. The other 14 components have matching labels or embedded shared-helper parity and are optional updates for an existing H installation. Rehearsal setup is independent and can wait until after the production upgrade.

Check `PATCH.json` for version `0.9.8i`, baseline `0.9.8h` and its exact source commit. Check the files against `SHA256SUMS.txt`. Its `separatePackages` entry identifies the separate rehearsal ZIP by hash with `productionInstallation` set to false. Read `VALIDATION.md` and the final external `RELEASE_VERIFICATION.json` receipt. A pending or unperformed check is not a pass.

## 2. Record the current installation

1. Save the H deployment files and record the existing Roster Apps Script deployment version, notification Worker deployment and Roster Pages deployment. These are your rollback choices.
2. In the existing Roster Apps Script project, record the Script Property names and keep their values in the school's private settings ledger or password manager. Keep the current spreadsheet/folder IDs and web app URL.
3. In Cloudflare, open the existing notification Worker and Roster Pages project. Record their current variables, secrets, bindings, routes and triggers. Keep private values out of screenshots, this guide and source files.
4. Record the notification Worker's current cron list. Retain the existing `* * * * *` critical-work trigger and `15 18 * * *` daily cleanup trigger. The only additional trigger for this production upgrade is the audit-only cron in step 4.
5. Keep all current production authority and cache settings. Do not connect the new rehearsal database or bucket to a production project.

A working `GSIS_SECRET` stays unchanged, including a 33-character value. If it is absent, keep the existing legacy credentials. I does not require a key cutover. Configured shared keys require at least 32 printable non-whitespace ASCII characters and fail closed if invalid. Retain separate Google OAuth, `BRIDGE_SECRET`, `CALENDAR_SESSION_SECRET`, `LORD_SESSION_SECRET`, `EXTERNAL_LINK_SECRET`, booking peppers and provider credentials where used. These settings serve independent session, identity, link and delivery roles.

## 3. Update the existing Roster backend

1. Open the Roster Apps Script project already used by your production Roster. Check the current project and deployment against your record before replacing code.
2. Copy the entire contents of `Roster_Backend_v0.9.8i.gs` into the existing combined backend code file. Remove duplicate old combined functions if your project split an older combined file. Do not change Script Properties or replace the project with a new one.
3. Save the project. A saved editor file alone does not update the deployed web app.
4. Choose **Deploy > Manage deployments**, select the existing web app deployment, select the pencil/edit control, choose **New version**, then **Deploy**. Keep the deployment's existing execution identity and access permissions. Confirm that the web app URL is the same as before.
5. Keep the old version available for rollback. Do not delete the deployment or create a replacement URL.

[Google's deployment guide](https://developers.google.com/apps-script/concepts/deployments) explains updating the version used by an existing deployment.

## 4. Update the notification Worker and add the audit trigger

1. In Cloudflare **Workers & Pages**, open the existing Roster notification Worker, normally `gsis-roster-notifications`. Check its name against your record. Do not select the new rehearsal Worker for this step.
2. Open **Edit code** and replace the Worker code with the whole `Roster_Notification_Worker_v0.9.8i.txt` file. Save and deploy through the existing workflow. This file is self-contained; do not paste the unbundled source `index.js`.
3. Keep every existing variable, secret, binding, route and custom domain. Do not add rehearsal D1/R2 bindings, a new queue consumer or provider credentials.
4. Open the Worker's **Settings > Trigger events** or its **Triggers** area, then add a **Cron Trigger** with expression `2-57/5 * * * *`. Cloudflare cron expressions use UTC. This runs the audit lane at minutes 2, 7, 12 and every five minutes through 57 each hour.
5. Keep `* * * * *` and `15 18 * * *` unchanged. If `2-57/5 * * * *` is already present, keep one copy. Record the final trigger list.

| Cron expression, UTC | Purpose |
|---|---|
| `* * * * *` | Existing critical absence, allocation and notification work. |
| `15 18 * * *` | Existing daily cleanup. |
| `2-57/5 * * * *` | New audit-only export, at most one pending day per invocation. |

Without the new audit trigger, retained export work remains pending. The audit invocation does not allocate staff or submit notifications. It yields to active notification work. It writes the existing Google `Allocation Audit/YYYY/MM/YYYY-MM-DD.txt` files from retained evidence, keeps export receipts and respects verbose logging off. Do not turn verbose on solely to force a check.

[Cloudflare's Worker deployment guide](https://developers.cloudflare.com/workers/versions-and-deployments/) and [Cron Triggers guide](https://developers.cloudflare.com/workers/configuration/cron-triggers/) describe the deployment and trigger controls. Dashboard labels can vary.

## 5. Upload the Roster frontend

1. Open the existing Roster Pages project in **Workers & Pages**. Keep its variables, secrets and bindings unchanged.
2. Use its current deployment method. For a Direct Upload project, choose **Create a new deployment**, select the production environment used by the existing site, and upload `Roster_Frontend_v0.9.8i.zip` as the site assets. The ZIP has `index.html` at its top level.
3. Upload only the inner Roster frontend ZIP. Do not upload `Updated_Deployments.zip`, the suite, source archive or rehearsal ZIP to Pages.
4. If the project uses Git integration, retain that workflow. Cloudflare's dashboard drag-and-drop does not replace an existing Git-integrated deployment. Have the current maintainer deploy the matched assets through that project's established path.
5. Open the existing Roster URL, refresh and sign in with the normal school Google account. Check for the I version label.

[Cloudflare Direct Upload instructions](https://developers.cloudflare.com/pages/get-started/direct-upload/) cover ZIP uploads and updates to an existing Direct Upload project.

## 6. Check the production upgrade

1. Confirm the existing school sign-in works and reference data loads. If startup shows `GSIS_SECRET_INVALID`, repair the configured shared key consistently; do not replace OAuth settings to hide that error.
2. Open an existing Stapler plan read only. The control says **Show baseline comparison** and starts on for a fresh session. Turn it off and back on. The plan's contents, timings and confirmation remain the same. A missing baseline may show unavailable comparison; it does not block the plan.
3. Review existing relief history on a confirmed suspended date. Ordinary workload exemption and cumulative R are separate. Assigned/performed relief retains its existing accounting contribution. The UT automatic employment cap and deliberate SMC override remain.
4. Read the rule summary below before the next operational allocation. Do not create an absence, alter a real plan or send a message as an installation test.
5. Open **System Health > Scheduled and background work > Daily allocation audit export**. Check its last completed successful export, exported/pending/failed counts and safe failure details. Pending counts are from the latest audit check and may be stale. An unchanged recent success or an empty backlog is valid. If verbose is off, expect a skipped status and reason rather than a newly written file.
6. If there is a backlog, allow later audit-only ticks to catch it up one pending day at a time. Critical work retains priority. A lock or active notification may defer an export. Check status and receipts before any retry; do not clear receipts, history or jobs to force progress.

When the configured FORM=2 consecutive rule is enabled, FORM pairing follows actual effective source blocks for the same class, group and absent teacher. The default PAL=3 rule remains unchanged. An adjacent two-period FORM lesson shares one relief teacher across its covered block. A genuine single FORM lesson allocates normally. Partial absence inside a real pair does not invent a new single lesson or additional coverage. Explicit SMC choices remain. Other subjects keep their configured policy.

Daily plaintext export uses the existing Google folder hierarchy `Allocation Audit/YYYY/MM/YYYY-MM-DD.txt`. Exporting retained evidence does not allocate staff or send messages. A recovered old file does not mean an old notification was resent. Provider acceptance, review and retirement remain distinct from delivery.

## 7. Optional matching updates for the other products

These components carry I version labels for the matched suite. Deploy backend and Operations Worker also contain embedded shared Roster helper parity. They introduce no separate I feature for those products. An existing H installation can leave these components deployed at H while installing the three functional Roster changes. Do not create missing production projects to use every file.

| Inner file | Existing destination | I upgrade requirement |
|---|---|---|
| `Contacts_Frontend_v0.9.8i.zip` | Contacts Pages project | Optional label update. |
| `Deploy_Frontend_v0.9.8i.zip` | Deploy Pages project | Optional label update. |
| `Layout_Frontend_v0.9.8i.zip` | Layout Pages project | Optional label update. |
| `Calendar_Frontend_v0.9.8i.zip` | Calendar Pages project | Optional label update. |
| `LORD_Frontend_v0.9.8i.zip` | LORD Pages project | Optional label update. |
| `OVERLORD_Frontend_v0.9.8i.zip` | OVERLORD Pages project | Optional label update. |
| `STARLORD_Frontend_v0.9.8i.zip` | STARLORD Pages project | Optional label update. |
| `Venues_Frontend_v0.9.8i.zip` | Venues Pages project | Optional label update. |
| `Contacts_Backend_v0.9.8i.gs` | Contacts Apps Script project | Optional label update. |
| `Deploy_Backend_v0.9.8i.gs` | Deploy Apps Script project | Optional shared-helper and label parity. |
| `Calendar_Backend_v0.9.8i.gs` | Calendar Apps Script project | Optional label update. |
| `LORD_Backend_v0.9.8i.gs` | LORD Apps Script project | Optional label update. |
| `Venues_Backend_v0.9.8i.gs` | Venues Apps Script project | Optional label update. |
| `GSiS_Operations_Worker_v0.9.8i.txt` | Existing Operations Worker only | Optional shared-helper and label parity. Keep migration and activation disabled. |

For an optional Apps Script update, use the same save and existing-deployment update steps as section 3. For an optional Pages update, use the same inner-ZIP workflow as section 5. Keep each product's current properties, routes, URLs, permissions and source connections. LORD's existing photo reliability and service fragment files remain installation references, not instructions to reset its settings.

## 8. Set up the separate rehearsal when ready

1. Leave the production installation and its bindings in place.
2. Extract `GSiS_v0.9.8i_Rehearsal.zip` into a separate folder. Open the included `REHEARSAL_SETUP.md`. The source copy is [docs/v098i/REHEARSAL_SETUP.md](docs/v098i/REHEARSAL_SETUP.md).
3. Follow that guide to create a new Worker with dedicated D1 and private R2 in the same Cloudflare account. The guide includes bounded provisioning commands and the SQL schema, so no existing staging facility is needed. Bind those resources only to the new Worker.
4. Configure verified school Google identity and the explicit rehearsal administrator allowlist server-side. Missing configuration fails closed. Keep the R2 bucket private. Do not add real notification provider secrets or production queue bindings.
5. Start with the supplied synthetic school day. All rehearsal notification delivery is simulated. Follow the guide's tests for save/read, absence, assignment, automatic allocation, command replay, stale edits and snapshot import/export.
6. Record local test results separately from real remote D1/R2 reads and writes. Live creation, deployment and current storage checks were not performed during preparation because Cloudflare authentication was unavailable.

The rehearsal persists isolated test changes and command receipts. It has no production activation endpoint, Google write capability or live scheduler. The production migration remains disabled and Google stays authoritative. Account quotas remain shared. A later cutover requires a separate verified handover, reconciliation of in-flight work and a tested durable intake path. Revision I supplies no Activate action.

## 9. Record completion and rollback

| Item | Record privately |
|---|---|
| Production component versions | Roster backend, notification Worker and Roster Pages deployment IDs. |
| Trigger list | Existing critical and cleanup triggers plus the audit-only expression. |
| Read-only checks | Sign-in, version labels, baseline comparison and audit status. |
| Optional products | Any version-label updates actually deployed. |
| Rehearsal | Separate Worker/database/bucket names and actual local or remote test status. No secret values. |

If production rollback is needed, restore the saved H versions of the three Roster components. Remove only the added I audit cron if it was absent before I. Restore the exact original trigger list. Keep all data, logs, receipts, queues and credentials. Rolling code back does not recall a provider submission or reverse saved school changes.

Rehearsal can remain unused without affecting production. Do not move its resource bindings into a production Worker. Delete isolated test resources only after retaining any test evidence you need. Preparing these packages did not deploy production code, change cloud configuration, mutate school records or send messages.
