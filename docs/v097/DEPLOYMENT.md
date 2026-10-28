# GSiS v0.9.7 deployment and ownership guide

Read the [main README](../../README.md) and [release notes](../GSiS-v0.9.7-Release-Notes.md). This package is built and tested locally; it has not been installed in the school's Cloudflare account. Keep the existing resource IDs, data, URLs, credentials and writer fences. Do not reimport an already active D1 store.

## What to install

The full suite contains nine frontend ZIPs, six complete Apps Script backends/adapters and two self-contained Worker text files. The new private Worker is `GSiS_Operations_Worker_v0.9.7.txt`; the updated scheduled Worker is `Roster_Notification_Worker_v0.9.7.txt`. Upload only the matching inner frontend ZIP to each Pages project. Never upload the outer suite ZIP as a site.

The v0.9.6 timetable-cache and daily-cleanup changes are retained. The additional binding and Queue setup below is required to use the approved v0.9.7 architecture. A paid subscription alone does not create those resources or activate D1 ownership.

## Upgrade from corrected v0.9.6: click-by-click

Use the school-owned Cloudflare account that contains the current projects. The helper must be a member of this account; a separate empty account will not display these Workers. Save a private settings inventory and a recovery checkpoint before changing anything. See [Recovery](RECOVERY.md) for an actual restore procedure.

1. **Find the existing storage.** In Cloudflare, open **Storage & databases → D1**, select the current GSiS database and record its name and UUID. Open **R2 object storage** and record the existing private timetable and media buckets. Preserve their contents. Record active ownership from the existing Roster and Deploy `/edge-setup.html` pages.
2. **Create the private Worker.** Open **Workers & Pages → Create application → Create Worker** (the dashboard may label this **Start with Hello World**). Name it `gsis-operations`. Open **Edit code**, replace the starter module with the complete contents of `GSiS_Operations_Worker_v0.9.7.txt`, then **Deploy**. Do not paste source modules individually.
3. **Keep it private.** On `gsis-operations`, open **Settings → Domains & Routes**. Disable the `workers.dev` URL and preview URLs; add no public domain or route. Existing staff traffic still reaches the Pages websites.
4. **Bind existing storage.** On `gsis-operations`, open **Settings → Bindings → Add binding**. Add D1 as `GSIS_JOBS`, selecting the existing database. Add R2 as `ROSTER_TIMETABLE_SNAPSHOTS` and, when enabled, `WHATSAPP_INBOX_MEDIA`, selecting the existing private buckets. Confirm resource IDs, not just the displayed aliases.
5. **Configure the private backend.** Under **Settings → Variables and Secrets**, add the domain endpoint aliases, exact origins and private service secret listed below. Copy the existing server-side integration settings required by the Roster/Deploy adapters, preserving their values. Use **Secret** for keys/tokens. Set `ROSTER_EDGE_AUTHORITY=d1` and `DEPLOY_EDGE_AUTHORITY=d1` only for the verified active ownership state. The migration section below applies if either store has not yet cut over.
6. **Create the Queue pair.** Open **Queues → Create queue** (under the account's storage/compute navigation). Create `gsis-background-jobs` and `gsis-background-jobs-dlq`. Set the dead-letter queue's retention to **14 days**. It holds failed wake messages for investigation; do not attach the same automatic consumer to it.
7. **Add Queue producers.** On both `gsis-operations` and `gsis-roster-notifications`, open **Settings → Bindings → Add binding → Queue**. Name the binding `GSIS_BACKGROUND_QUEUE` and select `gsis-background-jobs`. Set `GSIS_BACKGROUND_JOBS=true` on both only after the consumer and D1 settings are ready.
8. **Update the notification Worker.** Open `gsis-roster-notifications → Edit code`; replace its module with `Roster_Notification_Worker_v0.9.7.txt`. Preserve its provider credentials, existing D1/R2 bindings, notification enablement and automation settings. Add the private service settings and binding below. Do not copy disabled example flags over deliberately enabled live settings.
9. **Attach the consumer.** Open `gsis-background-jobs → Settings → Consumer` and select `gsis-roster-notifications`. Set maximum batch size **1**, batch wait **5 seconds**, maximum concurrency **1**, retries **3**, retry delay **60 seconds**, and dead-letter queue `gsis-background-jobs-dlq`. Keep the main queue's default paid retention unless the school deliberately changes it. These are wake messages; durable work stays in D1.
10. **Add service bindings.** For **Roster Pages**, **Deploy Pages** and **gsis-roster-notifications**, open **Settings → Bindings → Add binding → Service binding**. Name it `GSIS_BACKEND` and select the `gsis-operations` Worker in the same account. Add matching `GSIS_BACKEND_SECRET`, exact application origins and `GSIS_BACKEND_REQUIRED=true` under Variables and Secrets. Keep current bindings during the controlled upgrade; migration and compatibility routes still need their documented resources.
11. **Upload matching components.** Install the matched Google adapter/backends at existing `/exec` URLs, preserving Script Properties and advanced services. Upload each matching `*_Frontend_v0.9.7.zip` through its Pages project's **Create deployment → Upload assets** flow. The Roster and Deploy ZIPs already contain bundled `_worker.js` files. Redeploy every application whose bindings/settings changed. Existing D1 data is not reimported.
12. **Check cron triggers.** On `gsis-roster-notifications`, open **Settings → Trigger Events → Cron Triggers → Add**. Keep exactly one `* * * * *` minute trigger and one `15 18 * * *` daily cleanup trigger. Cron uses UTC: the cleanup is **02:15 Singapore time**. Remove accidental duplicate schedules. Normal operation requires `WHATSAPP_DIAGNOSTICS_ENABLED=false` or unset.
13. **Run acceptance below.** Check health, sign-in, controlled saves and expected source readiness before resuming normal use. Do not enable a second old Apps Script allocation or notification writer. The [recovery procedure](RECOVERY.md) covers a failure requiring data restoration; rolling back code alone does not undo data or messages.

### Exact new settings

| Name | Type and location | Value or relationship |
| --- | --- | --- |
| `GSIS_BACKEND` | Service binding: Roster Pages, Deploy Pages, notification Worker | Select `gsis-operations` in the same account |
| `GSIS_BACKEND_SECRET` | Secret: those callers and private operations Worker | One new random server-only value, at least 32 characters; never browser code |
| `GSIS_BACKEND_REQUIRED` | Variable: those callers | `true`; missing binding then fails closed |
| `ROSTER_PUBLIC_ORIGIN` | Variable: operations Worker and Roster/notification callers | Exact `https://roster.gsps.edu.sg`, without a path |
| `DEPLOY_PUBLIC_ORIGIN` | Variable: operations Worker and Deploy/notification callers | Exact `https://deploy.gsps.edu.sg`, without a path |
| `ROSTER_APPS_SCRIPT_URL` | Variable: operations Worker | Existing Roster `/exec` endpoint; maps to Roster adapter `APPS_SCRIPT_URL` |
| `ROSTER_BRIDGE_SECRET` | Secret: operations Worker | Existing Roster `BRIDGE_SECRET`, preserved |
| `DEPLOY_APPS_SCRIPT_URL` | Variable: operations/notification Worker | Existing Deploy `/exec` endpoint |
| `DEPLOY_BRIDGE_SECRET` | Secret: operations/notification Worker | Existing Deploy `BRIDGE_SECRET`, preserved |
| `ROSTER_GOOGLE_CLIENT_ID` | Variable: operations Worker | Exact `GOOGLE_CLIENT_ID` from Roster Pages; required for forwarded authenticated Roster routes |
| `DEPLOY_GOOGLE_CLIENT_ID` | Variable: operations Worker | Exact `GOOGLE_CLIENT_ID` from Deploy Pages |
| `ROSTER_SESSION_DAYS`, `DEPLOY_SESSION_DAYS` | Variables: operations Worker, if customised | Mirror each corresponding Pages app's `SESSION_DAYS`; unset defaults to 7 days, allowed range 1–30 |
| `ROSTER_SERVICE_SECRET` | Secret: operations Worker and existing Roster consumers | Preserve the shared Google Roster/Contacts service credential for reference and email adapters |
| `CALENDAR_APPS_SCRIPT_URL`, `CALENDAR_PROXY_SECRET` | Variable and secret: operations Worker and existing Roster consumers | Preserve the existing Calendar adapter endpoint and credential |
| `GSIS_BACKGROUND_QUEUE` | Queue producer: operations/notification Worker | `gsis-background-jobs` |
| `GSIS_BACKGROUND_JOBS` | Variable: operations/notification Worker | `true` after bindings and consumer are installed |
| `GSIS_RECOVERY_MODE` | Variable: every participating Pages/Worker | Normally `false`; `true` blocks writes and processing during controlled recovery |
| `GSIS_RECOVERY_ACCOUNT_ID` | Variable: operations Worker, optional checkpoint integration | Actual owning Cloudflare 32-character hexadecimal account ID |
| `GSIS_RECOVERY_DATABASE_ID` | Variable: operations Worker, optional checkpoint integration | Actual D1 UUID; operator must confirm it matches `GSIS_JOBS` |
| `GSIS_RECOVERY_CF_API_TOKEN` | Secret: operations Worker only, optional checkpoint integration | Scoped token permitting native D1 checkpoint lookup; never paste it into a page |

Keep the existing Roster service, external-link, Calendar, Venues, Contacts and provider settings required by enabled integrations. Copy those integration values to the private operations Worker as well as retaining them on their existing consumers. The private Worker reads domain-prefixed endpoint, bridge, Google client and session settings; an unprefixed `GOOGLE_CLIENT_ID` or `SESSION_DAYS` there does not substitute for the aliases above. The aliases prevent Roster and Deploy from accidentally sharing each other's Google endpoint/key or session configuration. Missing or wrong settings are configuration errors, not reasons to create a new empty database. The packaged [notification Worker example](notification-worker.example.toml) and [operations Worker example](operations-worker.example.toml) are configuration templates, not ready-to-run deployment files. Fill their real resource identities, bindings and approved live settings before using Wrangler; do not overwrite enabled production flags with example defaults. The [Queue setup notes](QUEUES.md) document the matching producer and consumer settings.

### Timetable storage and retention

The database holds current source/version metadata, manifest references, jobs and claims. R2 holds private compressed timetable parts and retained source objects. Cache preparation is requested after changes and recovered by compact due-work checks; cron does not serialize the whole timetable store on idle ticks. Readers reuse a current permission-scoped part and can repair a missing/corrupt derived part once. No browser is trusted to declare a stale part current.

Daily cleanup is limited to generated timetable parts at least 30 days old and then quarantined for 24 hours, with 50 listed/10 deleted per run. It preserves current manifests across all permissions, source timetables, saved plans, media and audits. Do not add a bucket-wide lifecycle rule that overrides this protection. Recovery pauses cleanup; a restored old manifest may require derived parts to be rebuilt from source.

### System Health and prudent paid usage

Sign in as a current Roster administrator and click **System Health** in the header. Check last successful allocation/notification work, failures, pending work, and cache/cleanup metadata. A cache metadata read may report freshness as unverified; it does not claim to have downloaded and validated every part. Parked-job retry only wakes durable work. It never resets uncertain provider outcomes. Completed green receipts are managed separately through Dismiss, Clear completed and History.

For actual CPU, open **Workers & Pages → gsis-roster-notifications → Metrics** and select the current deployment/time range. Check errors and CPU duration alongside request volume. Use **Observability → Logs** for the safe job code/reference. Repeat for `gsis-operations`. Inspect Queue backlog/oldest age and D1/R2 usage in their own dashboards. Paid capacity removes the Free plan's small per-invocation allowance; it does not repair an invalid integration or make retries free. Start with the supplied conservative queue settings, then adjust from measured school-day traffic.

Native D1 Time Travel is always on for supported D1 databases, with 30 days of history on Workers Paid. It restores the entire database and does not restore R2 or undo external delivery. Service bindings keep the operations Worker private; they are not a substitute for its domain access checks. Platform references: [D1 recovery](https://developers.cloudflare.com/d1/reference/time-travel/), [service bindings](https://developers.cloudflare.com/workers/runtime-apis/bindings/service-bindings/), [Queue limits](https://developers.cloudflare.com/queues/platform/limits/).

### Paid plan shown, but Observability says Free

The Workers plans page showing **Paid → Current plan** is evidence of the subscription on the selected account. The blue **200K events per day** banner describes the Free logging allowance, not a measured CPU limit. As of 26 October 2026, [Cloudflare documents](https://developers.cloudflare.com/workers/observability/logs/workers-logs/) Workers Logs as included with Workers Paid, with 20 million events/month. If both pages belong to the same account, those two displays are inconsistent; a separate logging upgrade is not required under that documented plan.

Compare the account ID in the two dashboard URLs, then refresh or sign in again. If the inconsistency remains, click **Support** at the top right and provide both screenshots and the account ID. The screenshots alone cannot distinguish a stale banner from an account-entitlement problem. For actual execution failures, open the Worker’s **Metrics → Errors → Invocation Statuses** and look for **Exceeded CPU Time Limits**; click a recent red error row in **Observability** to inspect its specific message. Logged errors alone do not establish CPU exhaustion.

## Controlled acceptance after installation

- Confirm both active D1 owners, existing source revisions, published effective dates and Google writer fences. Do not repeat import on active data.
- Sign in as a teacher, SMC and administrator using authorised test accounts. Only the administrator should see/use System Health. Cross-role and foreign-origin requests must fail.
- With an approved test record, save absence/relief and a Deploy edit, retry the same request identity and confirm one durable result. Refresh and verify the committed version. Do not use real medical evidence as a deployment probe.
- Read a warm timetable repeatedly, then make an approved source change and confirm the next prepared/read version. Verify Venues occupancy contains the permitted staff name without SMC drafts or private data.
- Confirm due background jobs complete; failed configuration produces a safe health reference and parks after bounded attempts. Do not force-resend an uncertain WhatsApp message. Observe an idle cron cycle for small due probes.
- Confirm daily cleanup is registered, remains within the generated prefix/bounds and leaves protected objects intact. Check first-run health after its scheduled time; avoid a blanket manual deletion.
- Dismiss a completed receipt, reopen it through History, and confirm pending/review work stays visible. Reload and change account to verify personal view separation.
- Exercise recovery only in an isolated installation with test delivery destinations. Follow the full pause/reconcile guide; do not perform a live Time Travel restore merely to test a button.

## Retained migration and ownership procedures

The following procedures apply when a domain has not yet cut over or requires a planned, reconciled ownership handoff. For v0.9.7, bind the same D1/R2 resources and required domain integrations on the private operations Worker as well as the documented migration/scheduler consumers. The private service is the normal operational route; these explicit admin migration endpoints remain protected setup bridges.

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
| D1 `GSIS_JOBS` | Operations Worker, Roster Pages, Deploy Pages, notification Worker | Bind the intended shared database, including operational schema and existing transport tables |
| R2 `ROSTER_TIMETABLE_SNAPSHOTS` | Operations Worker, Roster Pages and notification Worker | Same private bucket; immutable timetable objects and references must agree |
| R2 `WHATSAPP_INBOX_MEDIA` | Operations Worker, Roster Pages and notification Worker when inbox media or delivery reports use it | Same private bucket; never expose direct public object access |
| `DEPLOY_EDGE_AUTHORITY=d1` | Operations Worker, Deploy Pages and notification Worker | Routing gate; activate only after the verified import/fence procedure |
| `DEPLOY_APPS_SCRIPT_URL`, `DEPLOY_BRIDGE_SECRET` | Operations Worker and notification Worker | Separate aliases for Deploy’s existing Google endpoint and browser bridge secret; do not replace the Roster endpoint/key |
| `DEPLOY_EDGE_SECRET` | Operations Worker, Deploy Pages and Deploy Script Properties | Separate strong service secret, at least 32 characters, shared only by trusted server consumers |
| `DEPLOY_EDGE_URL` | Deploy Script Properties | `https://deploy.gsps.edu.sg/api/edge/service` |
| `ROSTER_EDGE_AUTHORITY=d1` | Operations Worker, Roster Pages and notification Worker | Routing gate only; verified active Roster operational/register scopes are also required |
| `ROSTER_AUTHORITY_MAX_AGE_SECONDS` | Operations Worker, Roster Pages and notification Worker, optional | Trusted reference maximum age; default 900 seconds, bounded to 3600 seconds; use a finite positive number |
| `VENUES_APPS_SCRIPT_URL` | Operations Worker and Roster/Deploy gateways when Venues coordination is enabled | Existing Venues `/exec` URL |
| `VENUES_BRIDGE_SECRET` | Participating Workers and existing source/consumer Apps Scripts | Same dedicated Venues bridge value; not a browser secret |
| `VENUES_ROSTER_WORKER_URL` | Venues Script Properties | `https://roster.gsps.edu.sg/api/venues-source` after Roster cutover |
| `VENUES_DEPLOY_WORKER_URL` | Venues Script Properties | `https://deploy.gsps.edu.sg/api/venues-source` after Deploy cutover |

The two optional Venues Worker URLs take precedence over their legacy `*_APPS_SCRIPT_URL` counterparts. Contacts and Calendar source URLs remain Google Apps Script endpoints. Install and configure the signed Worker routes before activating the corresponding owner. Set `VENUES_ROSTER_WORKER_URL` before Roster activation because the legacy Roster source is fenced after cutover. Keep booking admission closed during the transition, then verify direct source readiness once D1 is active. A configured URL does not itself prove coverage.

Retain the existing Google OAuth, browser/service bridge secrets, provider credentials and private-link keys listed in the README and [WhatsApp parameter ledger](../WHATSAPP_PARAMETERS.md). The v2 peer template does not introduce a new environment variable. Do not rotate working keys as part of this version upgrade.

### Connect the same D1 database

1. Open the intended D1 database in Cloudflare and record its database name and ID.
2. Open Roster Pages → Settings → Bindings. Add or edit a D1 binding named `GSIS_JOBS` and select that database.
3. Repeat on the private operations Worker, Deploy Pages and the separate notification Worker, selecting the same database ID each time.
4. Apply the supplied SQL migrations `migrations/0001-edge-operational-store.sql` then `migrations/0002-whatsapp-pacing.sql` to that database, preserving existing transport tables and queued records. Both use idempotent creation statements; do not drop or recreate existing tables. The new job-health, background-job and recovery-checkpoint metadata tables are created by their first permitted writes, not by opening System Health.
5. Redeploy each changed consumer. Verify owner heads and controlled read/write results before enabling routine writes.

Creating separate databases each called `GSIS_JOBS` does not meet this requirement. Never replace the existing capture database with an empty database while receipts or jobs remain unresolved.

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

1. Install the matching `Roster_Backend_v0.9.7.gs` containing the migration/fence adapter. Preserve all existing data pointers and pending receipts.
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

[Validation](VALIDATION.md) records the checks actually run, and [per-script results](validation-results.json) distinguish passing checks from missing historical-source dependencies. The supplied manual and architecture were rendered locally. These checks are not production cutover evidence.

## Maintainer handover

Keep one installed-version inventory with the exact deployed commit, matched gCodes/ZIPs, D1 migration version, owner-state evidence and acceptance results. Separate package validation from live installation acceptance.

A developer or LLM must trace each changed route to its actual write site, check current authority, preserve request IDs and staff identity, and test concurrent and uncertain outcomes. Log bounded codes, timings and correlation IDs. Never log secrets, full staff records, personal phone numbers or private capability URLs.
