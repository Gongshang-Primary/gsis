# GSiS 0.9.7 recovery

Recovery is an operator procedure. The app can record a verified native D1 checkpoint and display recovery status. It cannot restore a database, switch recovery mode or resume delivery. There are no automatic restores or recurring full-database exports.

D1 Time Travel is already enabled by Cloudflare for production D1 databases; `wrangler d1 info YOUR_DATABASE_NAME` must report `version: production`. Workers Paid currently provides up to 30 days of D1 history. A checkpoint is a bookmark into that history, not a separate backup and not a new 30-day retention period. The shared `GSIS_JOBS` database restores **as a whole**: Roster, Deploy, intake receipts, notification delivery state, job claims, timetable manifests, tombstones, health and checkpoint metadata all move back together. R2 objects, Cloudflare Queue messages, Google data, provider deliveries and environment variables do not move back.

Do not restore until every prerequisite below is complete. In particular, a green System Health page or the private backend's paused status cannot prove that all other writers have stopped.

## Prepare checkpoints

The optional **Record checkpoint** action is restricted to a verified school Roster administrator. Set these only on the private operations Worker:

| Setting | Value |
| --- | --- |
| `GSIS_RECOVERY_ACCOUNT_ID` | The Cloudflare account's 32-character ID. |
| `GSIS_RECOVERY_DATABASE_ID` | The UUID of the exact database bound as `GSIS_JOBS`. |
| `GSIS_RECOVERY_CF_API_TOKEN` | A secret API token with **D1 Read**, limited to the school account. Use the narrowest resources Cloudflare permits. Do not grant D1 Write for this action. |
| `GSIS_RELEASE_VERSION` | `0.9.7`. |

In Cloudflare, open the private operations Worker, then its **Settings** and **Variables and Secrets**. Add the token as a secret, save and deploy. Keep it out of Pages, browser JavaScript, URLs, logs, source control and downloaded diagnostic reports. The existing school session and live Roster administrator check authorize the app action; knowing a bookmark does not authorize restoration.

Cross-check the database UUID against **Bindings → GSIS_JOBS** before enabling capture. The Worker D1 binding does not reveal its UUID to application code. The provider API verifies a bookmark for the configured UUID; it cannot prove that a mistaken configuration names the bound database.

The action accepts `reason` equal to `manual`, `pre-migration`, `pre-upgrade` or `pre-restore` (default `manual`). `label` is an alias for the same fixed choices; free text and browser-supplied bookmarks are rejected. The server calls Cloudflare's native Time Travel bookmark API with a timeout, verifies the successful response, and records the returned bookmark, capture time, source version, reason and authenticated actor. It never substitutes a D1 session bookmark. `verified: true` means the provider returned that native bookmark at capture time; it is not a perpetual availability guarantee.

Only the latest 100 metadata rows within 30 days are kept, pruned when a new checkpoint is recorded. System Health shows at most 20 rows and excludes the actor, token, account ID and database ID. Reading status does not create or prune tables. Failed capture produces no successful checkpoint result. Capture is blocked while recovery mode is on, because storing its metadata would be another database write.

Without the optional API token, native D1 recovery still works. Before an upgrade or migration, the operator can run this read-only command from a Wrangler configuration that names the correct database:

```sh
npx wrangler d1 time-travel info YOUR_DATABASE_NAME
```

Save the returned bookmark, exact account/database UUID, UTC observation time, release version and operator identity in a school-controlled private recovery record **outside the database being restored**. Save the intended target checkpoint there too. The checkpoint table itself will rewind during a restore. Do not paste operational payloads or credentials into System Health.

## Stop every writer

1. Schedule a maintenance window. Identify the exact shared database and private buckets, and inventory **every** Worker, Pages production/preview deployment, service route, Queue consumer, scheduled job and legacy integration able to write to them or send on their behalf. This includes any old deployment still reachable through an alias or service binding. Disable unattended deployment during the window.
2. Disable the notification Worker's minute trigger and daily cleanup trigger in Cloudflare, and pause **all** relevant Queue consumers using their Cloudflare controls. Keep existing queue messages; do not purge them. Pause any other cron, external scheduler or Apps Script trigger that can publish into this database, mutate a source timetable, drain intake or dispatch messages. Record the original settings so they can be restored deliberately.
3. Set the external environment variable `GSIS_RECOVERY_MODE` to the exact string `true` and deploy it on every participating v0.9.7 Worker and Pages environment. This includes the private operations Worker, notification Worker, Roster Pages, Deploy Pages and any other gateway with direct D1/R2 write paths. Update all active versions; a traffic split with an unpaused version is not safe. Pages environment changes need a new deployment. Preview/old deployment URLs must either be paused too or made unreachable, including to service callers. An older writer lacking this guard must be disabled or upgraded; do not proceed while it remains callable.
4. Keep queue producers and consumers, allocation, received-report drains, manual UI mutations, retries, webhook processing, reference/cache refresh, exports, health writes and R2 cleanup stopped. This includes actions presented as reads if they materialize a cache, write a nonce, create a table or refresh a stored reference. Setting ordinary automation flags to `false` alone is insufficient.
5. Inbound POST webhooks must return a retryable **HTTP 503** while paused, before acknowledgment or side effects. A `2xx` response that drops a message is forbidden. A separately designed durable holding store outside the restored database would be an alternative, but v0.9.7 does not introduce one. Monitor the provider's retry horizon and retained backlog during a long maintenance window; do not assume retries last forever. Existing accepted webhook/intake records must be preserved in the evidence step below.
6. Wait for already-running invocations and external requests to finish. A new environment deployment does not cancel old executions. Use Cloudflare invocation logs and queue metrics, plus provider receipts where relevant. Wait beyond the maximum allowed running/lease duration for every enabled execution path and verify no new side effects; include old invocations that could still have started before the pause. Do not rely on a single minute of quiet logs or on expired D1 leases alone.

`GSIS_RECOVERY_MODE` is deliberately independent of D1. Restoring an old database cannot clear it. Absent/empty/`false` retains normal operation for compatibility; therefore absence is **not** proof of a pause. Other nonempty values fail closed with `GSIS_RECOVERY_CONFIG`; fix them to the exact supported value. Paused API operations use `GSIS_RECOVERY_PAUSED`/503. Workers do not acknowledge-and-discard queued work merely because recovery is active.

## Authoritative all-paused check

The operator must verify the **active Cloudflare configuration**, not just local TOML files or a pasted checklist. Record the following for each inventoried participant in the private maintenance record. Use Cloudflare's deployed-version/settings screens or the corresponding authenticated configuration APIs. For Workers, verify every version receiving traffic and its bindings; for Pages, verify the actual production and reachable preview deployment configurations and aliases.

| Required evidence | What must be true |
| --- | --- |
| Identity | Correct school account, resource name, environment, exact active deployment/version IDs and verification time. |
| Database/buckets | Actual deployed `GSIS_JOBS` UUID and all writable R2 buckets match the inventory. Unknown writers or mismatched UUIDs stop recovery. |
| Pause | Every active writer uses the reviewed v0.9.7 guard and exact deployed `GSIS_RECOVERY_MODE=true`, or is authoritatively disabled/unreachable. |
| Triggers/routes | Cron and Queue consumers are paused; direct/legacy HTTP, service-binding and ingress paths are covered. |
| Runtime confirmation | A safe no-op request through each applicable entry path returns the recovery 503 without a D1 write, R2 mutation, enqueue or send. Do not use a real absence, publication or message as a test. |
| Quiescence | Logs show old in-flight work has ended; external send outcomes and queue state are accounted for. |

Only mark `allPaused=true` in the operator's external maintenance record once **all** rows pass for **all** resources. This is an operator sign-off backed by authoritative deployment evidence, not a flag stored in D1 and not an assertion made by System Health. If a component cannot be checked, leave recovery paused and stop. Repeat this verification immediately before the native restore.

System Health also requires a fresh stored Contacts administrator permission check. During a long pause, or after an older restore, that permission snapshot can expire and Health will refuse access. It does not refresh or write while checking access. Use the authoritative Cloudflare configuration to inspect the pause; do not resume writers merely to make the Health page available.

## Preserve evidence before restoring

After quiescence, obtain the current native bookmark with `wrangler d1 time-travel info` and save it externally as the **pre-restore undo point**. Verify the target bookmark still falls within D1's retained history and belongs to the same database. For a timestamp, `wrangler d1 time-travel info YOUR_DATABASE_NAME --timestamp="UTC_ISO_TIMESTAMP"` resolves the nearest available earlier point; inspect the returned point before choosing it.

Export the affected operational evidence from the live, paused database to a school-controlled private file or recovery bucket outside its rollback boundary. This is an on-demand incident record, not a cron export. Include everything in the interval from the target point through completed quiescence; include older unsettled work too. Use bounded pages and verify completion/counts. A partial export is not sufficient.

The maintainer must retain:

- Outbox notification IDs, publication/assignment fingerprints, request/idempotency keys, attempt histories, prepared/authorized-send states, claim IDs, provider message IDs and final/uncertain delivery evidence. Include inbox replies/alerts, inbound-event replies, peer email, daily employment email and delivery-review email—not only WhatsApp's main outbox. Save corresponding provider delivery evidence and Google email adapter acceptance evidence separately; a successful external send cannot be undone by D1.
- All accepted intake/webhook receipts and pending/claimed payloads needed to reconstruct legitimate reports after the target point. Relevant stores include `gsis_absence_transport`, `gsis_webhook_jobs`, `gsis_edge_receipts` and Roster's inbound/inbox collections in `gsis_edge_records`. These files can contain private staff information and must remain access controlled; they are not safe diagnostics.
- Current domain heads/revisions and unfinished publication/handoff/fence state, including `gsis_timetable_fences`, so restored source state can be compared with current Google/Deploy/R2 state.
- Queue job intentions, pending/running/parked generations and claims. Cloudflare queue contents remain live independently of restored D1.
- R2 source/plan references, live timetable manifests, the full current `gsis_timetable_part_tombstones` ledger and cleanup candidates/lease state. Preserve source timetables, saved plans, audit exports, media and recovery objects. Disable any independent bucket lifecycle rule that could delete them during the recovery window. An R2 object deleted before the restore does not reappear with D1.

Keep raw evidence out of the green status readout and application logs. Check that the record is readable and complete, includes its account/database identity and UTC time, and is stored somewhere that will survive the restore. The absence of a recorded send is **not** proof that a send did not happen. If external evidence cannot be recovered, treat the affected delivery as uncertain and keep dispatch stopped until it can be safely quarantined.

## Native restore, by the operator

This step changes the **whole** shared database. Repeat the all-paused check, verify the target bookmark/account/database again, and obtain the operator's explicit approval of that exact target. The normal checkpoint token has D1 Read only; use the operator's separately controlled restoration credentials.

```sh
npx wrangler d1 time-travel restore YOUR_DATABASE_NAME --bookmark=VERIFIED_TARGET_BOOKMARK
```

This command is documented for manual execution only. GSiS does not run it, embed it in a request, bypass its confirmation or automatically retry it. Save the command result, UTC restore time and any previous-bookmark/undo information externally. Cloudflare cancels in-flight D1 queries during a restore; that does not cancel an already-issued WhatsApp/email request, which is why the prior stop and evidence steps are mandatory.

Keep all `GSIS_RECOVERY_MODE=true` settings, disabled triggers and paused consumers in place. Do not use an older application release without the recovery guard to inspect the database. Read-only inspection and explicit, reviewed operator reconciliation are the only actions allowed in this phase.

## Reconcile and rebuild before resuming

1. Verify restored domain data against the selected target and the source-version/schema compatibility. Restoring D1 does not roll Google Contacts, Calendar or timetable source systems back; compare source versions and resolve partial publication/handoff/fence state before allowing writes. Inspect Roster and Deploy together because they share the rollback boundary.
2. Have the maintainer compare the restored delivery/intake state with the preserved evidence. Preserve already-sent outcomes and idempotency receipts. Reapply legitimate accepted reports after the target once, using original identities/request IDs and reviewed domain operations; preserve subsequent manual relief decisions intentionally. Do not replay an entire webhook/intake dump or promote a transport receipt into an authoritative absence without review.
3. Any delivery that might have reached an external provider must stay `uncertain` or otherwise blocked from dispatch until reconciled. Match message/job IDs and publication fingerprints to external evidence, including jobs that disappeared in the restored database and might be generated again. Do not bulk-reset `sending`/`uncertain` to `queued`, clear send leases as a recovery shortcut, or use **Retry** to resolve uncertainty. Obtain human confirmation if needed. Keep a reviewed audit of reconciled and unresolved items; if the maintainer cannot express that safely with current domain transitions, leave dispatch disabled and prepare a reviewed repair instead of guessing at raw JSON updates.
4. Reconcile background intents against current canonical state before allowing queue consumption. A queue message is only a wake; its pre-restore existence does not authorize an old action. Reset stale claims only after quiescence is proven and each associated side effect is reconciled. Do not erase provider receipts or intake idempotency keys. Preserve pending accepted work that was newer than the restore target in the external recovery record until safely reapplied.
5. Merge the saved post-target R2 tombstones conservatively into the restored ledger before any package generation or cleanup: a key retired at either point remains retired. Do not clear/unretire tombstones. Check for any restored manifest referencing a key already deleted from R2. Keep immutable source timetables and saved plans; verify they are readable before rebuilding. A cache miss can regenerate derived parts; a missing source object requires separate source recovery.
6. With automation, inbound routes and other writers still isolated, the maintainer invalidates **derived** timetable package manifests, pending cache jobs/probe signatures and expired cache claims for `scope='roster'` in `gsis_timetable_packages`, `gsis_timetable_jobs`, `gsis_timetable_refresh_state` and `gsis_timetable_job_claims`. Review table existence and affected rows before an operator repair; this guide deliberately supplies no blind all-table deletion. Keep canonical records, source pointers, publication/fence state, receipts, audit, media and tombstones. Redeploy cold Worker instances so pre-restore in-memory data cannot survive into reopened service.
7. Perform a controlled maintenance rebuild from the reconciled source generations, with notifications, all other consumers, user writes and cleanup still externally disabled. The application pause must remain effective for those paths; an isolated maintainer-only rebuild may temporarily use an explicitly enabled backend after all other entry points are blocked. Reapply `GSIS_RECOVERY_MODE=true` immediately after the rebuild and verify it. Do not remove the global pause just to warm caches on publicly reachable endpoints. Confirm Report absence and Assign relief use the reconciled source, and Venues receives only permitted occupancy (including staff name) with no drafts/private fields.
8. Restart cleanup's candidate observation after restoration, preserving the tombstone union; do not immediately trust restored cursor/quarantine/lease ages. Run the cleanup dry-run only in the same controlled maintenance context, inspect the bounded candidate list and live-manifest protections, then leave actual deletion disabled. R2 cleanup is resumed last, after verified source availability, correct regenerated manifests and a fresh quarantine period.

Reconciliation is not automated in v0.9.7. There is no supported shortcut that makes all restored jobs safe to replay. The maintainer must supply the specific reviewed repair when necessary and keep the recovery record until outcomes are settled.

## Reopen in stages

Once the maintainer signs off data, idempotency, delivery quarantine, source availability and rebuilt-cache checks, the operator can restore the exact pre-maintenance configuration in stages. First make the reconciled backend/gateways available for permitted user operations; keep automatic dispatch, cron and cleanup disabled. Verify one controlled read and a reversible test write in the approved test context. Resume inbound capture so held provider events can be retained with their original IDs, and review that intake before broader automation. Resume queue consumers and minute scheduling only after delivery reconciliation is complete; expired timed actions must still pass normal eligibility rules. Resume R2 cleanup last.

Clear `GSIS_RECOVERY_MODE` to the exact string `false` on each deliberately reopened component and deploy it, checking active versions as before. Confirm all routes use the intended release, there are no unexpected duplicate sends, pending age is falling and the protected Venues projection is correct. Capture a fresh checkpoint after the reviewed recovery is complete. Keep the external incident evidence and native undo bookmark according to the school's access and retention rules.

If any validation fails, restore the external pause everywhere. Keep consumers and cleanup disabled. A second native rollback is another complete recovery procedure with its own evidence and all-paused check; do not automate it.

## Provider references

- [D1 Time Travel: retention, bookmarks and manual restoration](https://developers.cloudflare.com/d1/reference/time-travel/)
- [Cloudflare native D1 bookmark API and D1 Read permission](https://developers.cloudflare.com/api/resources/d1/subresources/database/subresources/time_travel/methods/get_bookmark/)

Provider behavior was checked against the official documentation during the 0.9.7 implementation. This release has local tests for checkpoint validation, pause behavior and bounded/private metadata. No production restore or live recovery rehearsal was performed while building it.
