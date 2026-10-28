# GSiS v0.9.4 deployment and ownership runbook

Read the [main README](../../README.md) first. This runbook covers the Roster/Deploy ownership change, not just file upload. The [staff manual](../GSiS-v0.9.4-User-Manual.html) explains normal use; the [release notes](../GSiS-v0.9.4-Release-Notes.md) describe scope and verification.

No command in this document authorises a production change by itself. Use the school's approved execution account and deployment window. A locally built package does not mean the live service has been migrated.

## The ownership rule

Roster and Deploy each have exactly one accepted operational writer. In the legacy state that writer is the designated Apps Script project. After a verified import and activation, the matching Worker/D1 owner accepts changes; the legacy writer stays fenced. Contacts, Calendar, LORD and Venues retain their separate Google-owned records.

Do not run both writers against copies of the same domain. Do not enable an old Apps Script allocator, publisher, recovery handler or direct edit path after cutover. Read-only compatibility endpoints must return the active owner's state, rather than a stale workbook that happens to exist.

| Store mode | Meaning | Permitted next step |
| --- | --- | --- |
| `legacy` | Empty D1 scope, not the operational authority | Import a verified source checkpoint while planning writes are paused |
| `imported` | Data and import receipt exist; operational writes remain closed | Verify digest/count and the signed legacy writer fence, then activate |
| `active` | Worker/D1 accepts revision-checked changes | Operate normally, or pause with a reason |
| `paused` | New operational writes are closed for investigation | Reconcile and reactivate with the fence still valid |

The shared store supports no direct `paused` to `legacy` transition. Rollback needs an explicit reconciled handoff. A mode flag or browser-supplied `legacyWritesDisabled=true` is not proof that the real Google writer has stopped.

## Inventory and backups

Before touching deployment settings, record the current release and the exact project/resource owners. Keep this inventory restricted; do not put secrets in the repository.

- Preserve existing Apps Script `/exec` URLs, Script IDs, Script Properties and executing accounts.
- Export the current workbooks, private Drive operational records, audit, receipts and pending work. Record capture time and source revision/digest.
- Export D1 and record its database ID. Save private R2 object inventories and retention settings.
- Record each Pages/Worker environment, variables, encrypted-secret names, D1 database ID, R2 bucket identity, Queue and cron.
- Record the deployed Meta template mapping and active webhook account/phone identity. Preserve private-link signing keys and LORD peppers.
- Retain unresolved absences, peer requests, STAPLER saves, uncertain provider sends and queued messages. An uncertain send is not safe to resend as a new job.

## Bindings and settings

Configure the correct production or preview environment in Cloudflare, then redeploy. A binding name is only an alias: compare the actual database or bucket ID in each consumer.

| Setting | Where | Required relationship |
| --- | --- | --- |
| D1 `GSIS_JOBS` | Roster Pages, Deploy Pages, notification Worker | Bind the intended shared database, including operational schema and existing transport tables |
| R2 `ROSTER_TIMETABLE_SNAPSHOTS` | Roster Pages and notification Worker | Same private bucket; immutable timetable objects and references must agree |
| R2 `WHATSAPP_INBOX_MEDIA` | Roster Pages and notification Worker if media is enabled | Same private bucket; never expose direct public object access |
| `DEPLOY_EDGE_AUTHORITY=d1` | Deploy Pages and notification Worker | Routing gate; activate only after the verified import/fence procedure |
| `DEPLOY_APPS_SCRIPT_URL`, `DEPLOY_BRIDGE_SECRET` | Notification Worker | Separate aliases for Deploy’s existing Google endpoint and browser bridge secret; do not replace the Roster endpoint/key |
| `DEPLOY_EDGE_SECRET` | Deploy Pages and Deploy Script Properties | Separate strong service secret, at least 32 characters, shared only by trusted server consumers |
| `DEPLOY_EDGE_URL` | Deploy Script Properties | `https://deploy.gsps.edu.sg/api/edge/service` |
| `ROSTER_EDGE_AUTHORITY=d1` | Roster Pages and notification Worker | Routing gate only; verified active Roster operational/register scopes are also required |
| `ROSTER_AUTHORITY_MAX_AGE_SECONDS` | Roster Pages and notification Worker, optional | Trusted reference maximum age; default 900 seconds, bounded to 3600 seconds |
| `VENUES_APPS_SCRIPT_URL` | Roster and Deploy Workers when Venues coordination is enabled | Existing Venues `/exec` URL |
| `VENUES_BRIDGE_SECRET` | Participating Workers and existing source/consumer Apps Scripts | Same dedicated Venues bridge value; not a browser secret |
| `VENUES_ROSTER_WORKER_URL` | Venues Script Properties | `https://roster.gsps.edu.sg/api/venues-source` after Roster cutover |
| `VENUES_DEPLOY_WORKER_URL` | Venues Script Properties | `https://deploy.gsps.edu.sg/api/venues-source` after Deploy cutover |

The two optional Venues Worker URLs take precedence over their legacy `*_APPS_SCRIPT_URL` counterparts. Contacts and Calendar source URLs remain Google Apps Script endpoints. Install and configure the signed Worker routes before activating the corresponding owner. Set `VENUES_ROSTER_WORKER_URL` before Roster activation because the legacy Roster source is fenced after cutover. Keep booking admission closed during the transition, then verify direct source readiness once D1 is active. A configured URL does not itself prove coverage.

Retain the existing Google OAuth, browser/service bridge secrets, provider credentials and private-link keys listed in the README and [WhatsApp parameter ledger](../WHATSAPP_PARAMETERS.md). The v2 peer template does not introduce a new environment variable. Do not rotate working keys as part of this version upgrade.

### Connect the same D1 database

1. Open the intended D1 database in Cloudflare and record its database name and ID.
2. Open Roster Pages → Settings → Bindings. Add or edit a D1 binding named `GSIS_JOBS` and select that database.
3. Repeat on Deploy Pages and the separate notification Worker, selecting the same database ID each time.
4. Apply the supplied SQL migrations to that database, preserving existing transport tables and queued records.
5. Redeploy each changed consumer. Verify owner heads and controlled read/write results before enabling routine writes.

Creating three databases each called `GSIS_JOBS` does not meet this requirement. Never replace the existing capture database with an empty database while receipts or jobs remain unresolved.

### Timetable package and Venues coordination

Compressed timetable parts use private keys under `roster/timetables/v2/parts/<sha256>.json.gz`. `gsis_timetable_packages` holds current scoped package heads; `gsis_timetable_jobs` retains prewarm work. The standard client window is today through 30 days ahead. Complete R2 objects are written first, then the package reference is promoted only while the expected active Roster and register revisions still match.

Occupancy-changing Roster/Deploy commands coordinate with Venues when both its URL and secret are configured. `gsis_timetable_fences` retains `prepared`, `pending`, `committed` and `ready` phases around source begin/commit/complete. A failed or uncertain source acknowledgement keeps booking admission closed. Retry the original request to finish a committed handoff. Do not clear a pending fence by age. Absence, peer and draft-only saves do not wait for this occupancy fence.

### Notification ownership

In active D1 mode, the outbox, inbox, transport claims, pacing and results are D1-owned. Durable webhook ingress is enabled by that ownership mode even when the older optional ingress flag is absent. Preserve migrated notification metadata, outbox, inbox, peer-email work and uncertain outcomes.

Apply `migrations/0002-whatsapp-pacing.sql` to the same database. Sender and recipient pacing use separate D1 tables, avoiding unnecessary Roster business-revision changes.

Keep one minute cron on the notification Worker. Diagnostics mode must remain false/unset for normal processing. Automatic allocation and WhatsApp delivery enablement remain deliberate separate flags. A disabled sender is not permission to discard queued work.

A prepared send that times out becomes uncertain; do not blindly resend it. Duplicate status callbacks are idempotent, and correlated delivered/read evidence can resolve uncertainty. Unmatched receipts are retained for bounded reconciliation. Email uses a signed Google MailApp adapter with D1 claims and results; Apps Script is the mail sink, not the post-cutover domain owner. New daily delivery reports use private R2 keys under `gsis/roster/delivery-reports/`, with a D1 index and review acknowledgements. Current SMC/Admin can read an authorised report through `GET /api/whatsapp/reports/YYYY-MM-DD`. Existing Drive reports remain historical archives.

## Open the operator page

After deploying the matching frontend, sign in to the main Roster or Deploy app with the authorised school administrator account. In the same browser, open:

- [Roster ownership setup](https://roster.gsps.edu.sg/edge-setup.html)
- [Deploy ownership setup](https://deploy.gsps.edu.sg/edge-setup.html)

The pages use the existing same-origin secure session. Do not paste a token or secret. They show bounded owner metadata, retain one import request identity per tab, and download a private JSON export without rendering staff payloads. No migration mutation runs automatically. A local review checkbox and confirmation express the operator's decision; the server still verifies current access, source and writer fence.

Use **Check status**, **Import / retry same import**, **Download private export** and **Activate verified owner** in order. The activation control requires the current export and its explicit review. Complete the platform settings and source prerequisites below before activation. If a request is uncertain, retain the tab and request reference and retry that action; do not create a new database or reset browser storage.

## Activation order

Activate Deploy first and verify an in-force publication whose effective dates cover the intended school day. Then import and activate Roster. Peer approvals and current relief quota checks use that published Deploy authority; a future draft or an unactivated Deploy store cannot supply it. Configure Venues Worker source URLs before the corresponding source cutover, and verify source readiness before reopening bookings.

## Deploy cutover

Retain Deploy Pages `GOOGLE_CLIENT_ID`, `APPS_SCRIPT_URL` and `BRIDGE_SECRET`. Install the matching Google adapter backend before the Worker cutover. Configure `DEPLOY_EDGE_URL` and the matching `DEPLOY_EDGE_SECRET` in Script Properties and Worker secrets. If configured together, `CONTACTS_APPS_SCRIPT_URL` and `CONTACTS_BRIDGE_SECRET` allow Deploy Worker to call Contacts directly; otherwise the signed Google adapter supplies that integration.

The operator page exposes the normal migration and maintenance actions. The authenticated, same-origin administrator route is `POST /api/edge/admin`. Its JSON body uses `operation`; permitted values are `status`, `import`, `activate`, `export`, `pause`, `resume`, `retryHandoffs` and `recoverVenuesFence`. `resume` rechecks the signed legacy fence before reactivating a paused owner. Import accepts an optional stable `requestId`. A current Contacts-verified Deploy Admin is required; this is not a public setup URL.

1. Check `status`. Preserve the existing source and stop concurrent planning writes for the migration window.
2. Call `import` with one retained request ID. The server reads the legacy export itself; do not upload a client-invented snapshot.
3. Call `export` and compare source revision, digest, stable records, publication history and receipts with the source checkpoint. Record the imported count and hash.
4. Call `activate`. The signed Google adapter checks the source revision under its lock and sets its durable fence before D1 activation. If the source changed, resolve that conflict; do not force a stale snapshot active.
5. Confirm active D1 status and the backend's managed `DEPLOY_EDGE_MODE=fenced` and `DEPLOY_EDGE_FENCE` evidence. Do not create or edit those managed values manually.
6. Set the intended `DEPLOY_EDGE_AUTHORITY=d1` routing configuration, redeploy and complete controlled read/write/publication acceptance before reopening planning.

In D1 mode, missing/inactive storage fails closed. A failed Worker call does not silently fall back to an old writable Google store. The original Google service endpoint forwards supported read-only consumers to the active Worker after fencing.

Deploy exposes signed read-only `/api/lord-source` and `/api/venues-source` routes using their dedicated bridge keys, plus `/api/edge/service` using `DEPLOY_EDGE_SECRET`. These routes preserve the published identity and do not turn a future draft into an in-force source. Retain existing LORD bridge URLs unless deliberately moving them to a supported direct route.

Warm Deploy reads and draft writes use a Contacts authority snapshot keyed to the verified email, subject and configured source, with a strict 60-second maximum age. A background refresh can begin after 30 seconds. An expired snapshot cannot grant permission when Contacts is unavailable. This gives role revocation a bounded window of up to 60 seconds on those paths. Publication, migration, create and Contacts-acceptance operations require fresh authority; a successful Contacts mutation invalidates the cached snapshot.

Contacts teacher approval remains a publication prerequisite. The D1 publication and catalogue/Layout handoff intent commit together; external handoffs run after that commit. A delayed Google handoff does not roll back a durable publication. Catalogue/Layout jobs retain strict publication order; an older failed job blocks a newer one until the older outcome is resolved, preventing a stale catalogue from overwriting a newer one. Managed `DEPLOY_EDGE_LAYOUT_REVISION_<year>` properties and Contacts catalogue revision/digest guards reject older handoffs. Do not create or edit these values as setup inputs. Use its visible job state and `retryHandoffs` for recovery, preserving idempotency. The notification Worker runs this as an independent cron task when its Deploy bindings are configured. A signed `/api/edge/service` `retryHandoffs` call is also available; it replays stored intent and does not accept a caller-supplied publication payload.

## Roster cutover

Keep `ROSTER_OWNER_SCRIPT_ID` bound to the existing Roster project and `ROSTER_WRITER_ENABLED=true` for its authenticated Google adapters. The managed `ROSTER_EDGE_AUTHORITY=d1` fence disables legacy business writes after cutover; setting the older project-activation flag to `false` would also disable reference refresh and the email transport. Do not manually clear the managed fence.

Retain Roster's `APPS_SCRIPT_URL`, `BRIDGE_SECRET`, `ROSTER_SERVICE_SECRET`, `CALENDAR_APPS_SCRIPT_URL` and `CALENDAR_PROXY_SECRET`. The Google URL and keys are still needed for migration, signed reference refresh and Google-specific adapters. Configure the same shared D1 and private timetable bucket on Pages and the notification Worker.

Use the authenticated administrator endpoint `POST /api/edge/migration`. Supported operations are `status`, `import`, `refresh`, `activate`, `export`, `restart`, `pause`, `resume` and `recoverVenuesFence`. Every operation, including status, requires verified Admin access before reading D1. The operator page exposes pause/resume; specialist fence recovery remains an API-only action. Resume verifies the signed legacy writer fence. Retain one `requestId` for the import. Activation supplies the exact exported `sourceDigest`; the server verifies the source and signed fence instead of trusting a client-side authority declaration.

1. Install the matching `Roster_Backend_v0.9.4.gs` containing the migration/fence adapter. Preserve all existing data pointers and pending receipts.
2. Pause school edits and scheduled legacy writes during the controlled snapshot/cutover window. Inspect current `status`.
3. Call `import` with the retained request ID, then `export`. Verify stable record IDs, source digest/count, timetable references, audit, acknowledgements, inbox/outbox and unresolved peer/mail/absence work.
4. Refresh the trusted reference snapshot and validate published Deploy identity and Calendar coverage.
5. Call `activate` with the verified digest. Confirm active D1 scopes and the signed Apps Script `ROSTER_EDGE_AUTHORITY` fence. Do not create that Script Property manually.
6. Ensure Venues already points to the signed Roster Worker source and has the matching bridge key. Enable the intended Cloudflare `ROSTER_EDGE_AUTHORITY=d1` routing configuration on Pages and the notification Worker, redeploy and run controlled acceptance.
7. Keep the one-minute Worker cron active for reference refresh and background work. Contacts refresh is internally paced to two minutes and Calendar to five minutes; normal warm operations use the trusted D1 references and private R2 models.

If a partial import no longer matches the legacy source, first download and review its export. **Restart incomplete import** archives each imported Roster scope to private R2 and verifies the archive before an imported-only reset. It preserves reset evidence and never resets active/paused stores or replaces the shared Deploy database. After confirmed restart, use a new import identity for the current source.

A source-age bound is a safety ceiling, not a guarantee that an expired reference may be used. Missing authority, expired reference evidence or inactive storage must remain visible failures. Changing a flag must not send a post-cutover write to the old Google file.

## Atomic boundaries and retries

`shared/edge-store.js` stores per-scope head, records, receipts and transition history in D1. `migrations/0001-edge-operational-store.sql` is the matching idempotent schema. A command checks the expected scope revision and uses one guarded D1 batch for the changed records and receipt. Audit/outbox records included by the domain command share that batch. A concurrent winner prevents stale rows from being written.

The same actor, request ID and command digest returns the original receipt. Reusing the ID for different content is a conflict. An uncertain database acknowledgement first checks the persisted receipt. A stale revision returns `409`; a caller must fetch affected changes and make an explicit reconciliation decision. It must not blindly replay stale human choices.

The store supports projected collection/prefix reads and preserves unseen rows during a matching projected commit. Callers can still read a whole scope to evaluate domain rules. Row-level storage is not a promise that every application query is already a single-row read. Retain this distinction when evaluating performance. Source-head guards can check other scope revisions in the same commit. Large immutable records belong in R2; D1 record and parameter bounds are enforced before the batch. Durable receipts are not automatically pruned, preserving repeat-request guarantees. Monitor database growth as part of normal maintenance.

R2 object creation and external Google/Meta calls are separate transactions. Write complete immutable timetable content before publishing its guarded reference. Commit notification intent before sending. Retain failures and uncertainty for recovery; do not represent these external operations as a single cross-provider transaction.

## Release acceptance

Before reopening routine writes, verify these results against controlled records:

1. Exactly one owner is active for each migrated scope; legacy Google entry points and scheduled paths cannot mutate it.
2. Import digest, stable IDs, record counts, request receipts, audit history and unresolved work match the export.
3. An absence is captured while the allocator is running. Retrying the same request produces the same result without duplicate absence or notification jobs.
4. Changing no-relief-needed to relief-needed retains the absence identity and validates the affected periods.
5. Two planners editing different records retain both changes. A genuine conflict names the overwritten human choice and leaves an audit trail.
6. A peer proposal is visible as tentative, acceptance becomes a protected human arrangement, and an SMC override is attributed.
7. STAPLER save, readback and confirmation survive a lost response. A confirmed suspension does not become daily publication automatically.
8. Warm timetable reads reuse unchanged parts. An updated suspension refreshes only the affected package, with draft/confirmed/published access kept separate.
9. Deploy distinguishes the in-force publication from future drafts. Contacts approval and catalogue/Layout delivery show their actual status.
10. Venues can read verified effective occupancy for a covered date. Missing source coverage keeps booking disabled with a useful source error.
11. Notification jobs retain claim/result history; uncertain sends do not automatically duplicate. Delivery callbacks correlate to the original provider message.
12. An unauthorised school account cannot read private data, R2 object keys do not grant access, and expired capability links cannot mutate records.

Run peak-hour concurrency and actual provider tests only with approved test records and recipients. Local mocks and browser checks do not establish production throughput, Google quota availability, mobile latency or delivered WhatsApp/email.

## Rollback and incident recovery

Pause new writes to the affected scope, preserve the D1 head and complete export, and stop any duplicate scheduled writer. Keep the legacy fence active. Resolve uncertain receipts and provider sends before replaying work.

Prefer repairing or rolling back application code while retaining D1 authority and its schema-compatible data. Restoring old code must not reactivate the old Google writer. A frontend rollback does not undo accepted absences, bookings, publications or messages.

If an operator must return ownership to Google, export and reconcile **all** accepted post-cutover changes, receipts, audit and pending work into the target first. Prove parity and make one controlled handoff. There is no automatic switch back to the stale pre-cutover snapshot. Preserve a recovery record with the actor, reason, revisions, digest and time.

For a known pending Roster/Venues or Deploy/Venues handoff, the matching signed Admin `recoverVenuesFence` operation takes the original `requestId`. It first revokes the in-flight writer guard, then reads current authority and completes that exact fence. This is a specialist recovery API; the operator page does not expose it as a general reset. Do not clear the table/property manually or complete a fence using a head read before revocation.

For an R2 publication failure, retain the durable job and last complete reference. Never point a manifest at an incomplete object. For a source-authentication failure, fix credentials/roles at the source; do not make a private bucket public or substitute a cached staff role.

## Documentation checks

[Documentation verification](documentation-verification.json) records local manual/diagram checks. [Operator browser verification](operator-browser-verification.json) records synthetic 403, private-export and activation tests. The [local source receipt](../architecture/v094-source-evidence.json) pins the architecture to committed Git bytes; Archify uses design mode because the actual local-bundle origin does not satisfy its hosted-repository rule. These are artifact checks, not production cutover evidence.

## Maintainer handover

Keep one installed-version inventory with the exact deployed commit, matched gCodes/ZIPs, D1 migration version, owner-state evidence and acceptance results. Separate package validation from live installation acceptance.

A developer or LLM must trace each changed route to its actual write site, check current authority, preserve request IDs and staff identity, and test concurrent and uncertain outcomes. Log bounded codes, timings and correlation IDs. Never log secrets, full staff records, personal phone numbers or private capability URLs.
