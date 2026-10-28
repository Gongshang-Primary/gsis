# GSiS v0.7.02 queued changes

Recorded: 15 October 2026, Singapore time.
Baseline: v0.7.01, commit 132687ac25d71c04a4373df8613438ff511948d7.
Status: implementation requested with Ponytail and Pstack on 15 October 2026. Code changes and the deployment-ready v0.7.02 ZIP were finalised after the user clarified that this is the intended meaning of commit. No production deployment, messaging activation or Git commit/tag is included. Preserve the v0.7.01 rollback package and school data.

## Roster UI and performance carried forward

1. SMC Home top row, left to right: Report Absence, Manage reported absences, Assign Relief. Exactly one horizontal divider, with all other functions below it. This supersedes the earlier grouped SMC layout.
2. Put breadcrumbs at the right of the existing status row, with status at the left. Remove the separate breadcrumb row. Retain hierarchical navigation instead of a complete top navigation list.
3. Model Assign Relief closely on STapler v4.3 Module 3. Preserve GSiS quota, eligibility, audit, publication and Undo rules. Use persistent absence cards, unresolved/selected/completed states, full-day period matrices, compact candidate mini-timetables, top-three shortlist, stable search focus and co-teacher context. Completed cards remain visible; zero affected periods counts as complete. Use the v4.3 document flow and expanding card bank, not the obsolete resizable split panes. Do not import a swap action that silently drops a candidate's own lessons.
4. Model Absences by Date on the supplied Daily Absences screenshot: date picker at the top right, Absent Teachers and Relief Assignments tabs, Excel export, search, striped sortable table and per-row action menu. Columns: number, date, absentee, absent periods, reason, remarks, reported by, reported at, action.
5. Make Check Availability's name directory load independently of timetable, Calendar and quota computations. Repair selection and keep the picker usable while results load.
6. Keep one current full staff baseline timetable in browser memory for reuse across Roster. Load in the background after login without delaying Home. Build indexes once; replace when the baseline ID changes and clear on sign-out. Timetable opens blank and shows a timetable only after a name is selected.
7. Reuse loaded data for view-only search, sort and tab changes. Refresh mutable absence/duty records separately without clearing useful content. Show last-check information and retain manual refresh. Keep saves authoritative, fresh, atomic and idempotent; remove incidental writes/reconciliation from read paths only where the contract permits.
8. Continue targeted loading improvements across Report Absence, Manage reported absences, My Relief Duties and Assign Relief. Use Pstack and Ponytail reviews, surgical edits and measured checks. Do not claim measured production latency from synthetic tests.

References: image(20261015-050708).png; image(20261015-051142).png; image(20261015-051732).png; Stapler_v4_3.html; Stapler_v4_3_Reference.md.

## WhatsApp setup corrections for the next release

1. Add `https://www.googleapis.com/auth/userinfo.email` to the Deploy manifest used by editor identity diagnostics. Preserve existing Sheets/Drive advanced services, scopes and web app execution/access settings. Document owner reauthorisation. Missing scope caused the diagnostic identity failure; it was corrected manually in the live project.
2. Remove school-specific hardcoded Apps Script URLs from diagnostics. Add one documented Deploy Script Property, proposed name `DEPLOY_WEB_APP_URL`, containing the existing Deploy `/exec` URL. Use that property first, then a validated `ScriptApp.getService().getUrl()` fallback. Validate HTTPS, script.google.com, and the exact `/macros/s/<id>/exec` shape. If neither exists, report a configuration problem rather than claiming the published app is unavailable.
3. Apply that URL resolution to both `diagnoseRoster` / Published Deploy Roster profile and the Layout diagnostic / Published web app response. A broad manual search initially changed the Layout diagnostic as well as the intended Roster check. Retain the original published URL and backend identity. Do not repurpose `CONTACTS_API_URL` or assume Cloudflare's `APPS_SCRIPT_URL` is automatically available in Apps Script.
4. Keep diagnostic settings, read access and service connectivity results separate. Clearly label historical cached failures with timestamps; an old failure must not override a current successful check. `ready: true` for backend read diagnostics must not imply the notification Worker or WhatsApp delivery has passed.
5. Correct the setup guide: `ROSTER_SERVICE_SECRET` must match in FOUR locations: Deploy Apps Script properties, Contacts Apps Script properties, Roster Pages secrets and the notification Worker secrets. Contacts uses it to authenticate `rosterServiceDirectory`. Never store secret values in this log or source.
6. Package a reproducible self-contained notification Worker for dashboard copy/paste deployment, alongside the source-based deployment. Resolve the shared gateway import at build time. Do not ask dashboard users to paste the isolated notification-worker/index.js. Include a copyable text delivery option for office laptops that block downloads. Verify source parity, module parsing, disabled no-network behaviour, and enabled-path contracts.
7. Ship a concise setup checklist with exact placement/type for every setting. Include Calendar URL and proxy secret, token, app secret, verification token, service/link secrets, sender/account/template IDs, public origins, API version, template configuration and cron. Preserve existing configuration and never ask users to disclose secrets.
8. Keep webhook event version distinct from outbound `WHATSAPP_API_VERSION`. The user selected v26.0; use the literal `v26.0` syntax in Cloudflare and validate compatibility before enabling. Do not silently change the version based only on a webhook screenshot.
9. Reconcile template contracts against live Meta records before enabling. The last full list contained 19 templates, including retired evening v1 and both attention v1/v2. Attention v1 was categorised Marketing; attention v2 was Utility. The source still references attention v1 and marks several submitted templates NOT_SUBMITTED. The conditional instruction template was absent from that list. Verify exact names, language, category, body, field order and hashes; do not auto-enable substitutes or weaken the Utility-only runtime check.
10. Document the actual Cloudflare interface: timer under Settings / Trigger events / Cron triggers; execution evidence under Observability. The supplied interface had no Past Events link. A successful disabled cron proves invocation only, not service connectivity.
11. Add a bounded non-sending diagnostic path for Worker configuration, Meta read access and signed backend/service connections. It must not claim notifications, mutate allocations, send messages, reveal secrets or staff data, or expose an unauthenticated administrative endpoint. Reuse existing transport/authentication contracts.

## Observed live setup and test state

These are session observations and user confirmations, not credentials or a guarantee of current platform state.

* Worker: `gsis-roster-notifications`, dashboard code installed; every-minute cron observed with 19 successes and zero errors.
* Roster origin: https://roster.gsps.edu.sg ; Contacts: https://contacts.gsps.edu.sg .
* Meta app: GSiS Staff Notifications. Callback: https://roster.gsps.edu.sg/api/whatsapp/webhook ; verification accepted; messages subscribed, shown as v26.0.
* System user token: valid for the correct app, both WhatsApp management and messaging scopes present, no scheduled expiry shown, assigned assets with full access. User confirmed matching token in Pages and Worker. Actual token never recorded here.
* Deploy and Contacts reported installed at v0.7.01. Helper school account retained; no need to make that account SMC merely for diagnostics.
* `testRosterServiceConnection` passed at 16:34:57: Deploy can read the signed Contacts service directory. Temporary editor helper may be removed after testing.
* All five `diagnoseRoster` read checks passed at 16:52:09, `ready: true`, after manual permission and explicit diagnostic URL fixes. Old Contacts 404 at 14:28 remains historical evidence, not a current failure.
* User confirmed the setup values were saved during walkthrough; Cloudflare secrets and all Worker integrations have not been independently exercised.
* `WHATSAPP_ENABLED`, `ROSTER_AUTOMATION_ENABLED`, `WHATSAPP_MENU_ENABLED` remain false on Pages and Worker; `WHATSAPP_TEMPLATES_JSON` remains `{}`. Do not activate them for release preparation.
* No approved GSiS templates were returned by the last approval query at approximately 16:53 on 15 October. Approval is external to GSiS; do not infer readiness from submitted template IDs.
* User authorised eventual live testing with one selected recipient, then explicitly PAUSED it at approximately 16:54. No test message was sent by the assistant. Do not request an inbound test message, open a service window or resume sending until the user resumes the test. Do not retain the selected private mobile number in release artifacts.
* Pending acceptance: Worker-to-backend and Meta access; actual signed webhook processing; controlled recipient publication/delivery/acknowledgement/change/cancellation/failure; mobile menu; annual entitlement and duty-SMC schedule checks before any allocation automation.

## Parallel-chat reconciliation, 15 October

The user requested inclusion of the existing privacy clause and a review of other GSiS project chats. The original privacy.html and three contact images from GSiS_Roster_v0.7.00_Privacy_Images_Upload.zip are restored unchanged, with links from Roster and the private duties page. The manual's printed Wi formula now includes Other non-teaching, and the stale layout mapping note uses Pump Room D1-06C and the current venue counts. Deployment notes now distinguish baseline Git history from the final Source ZIP. PROJECT_RECONCILIATION_v0.7.02.md records evidence, superseded decisions, related external tasks and retrieval limits. The package test guards the privacy page, images, links and static route. No live configuration or messaging was changed.

## Release gates

Use Pstack and Ponytail for review. Verify the diagnostic URL property and fallback, no secret disclosure, both diagnostic callers, manifests, dashboard/source Worker parity, disabled behaviour, API/template contract matching, cache lifecycle and authoritative write behaviour. Record production limitations honestly. In this workflow, commit means finalise code and issue the deployment-ready ZIP. Actual deployment, messaging activation and Git commits remain separate actions.
