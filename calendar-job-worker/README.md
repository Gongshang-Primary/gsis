# Calendar jobs and optional change push

Google Sheets remains Calendar's source of truth; Google Calendar remains the publication destination. This service stores accepted event commands, notification metadata and exact outcomes. It does not become a second event database.

## Existing production installation

The operator's 0.9.8p rollout report records the existing `gsis-calendar-jobs` Worker, dedicated `CALENDAR_JOBS_DB`, minute cron and Calendar Pages `CALENDAR_JOBS` service binding. Reuse them. Do not create a second Worker or bind the rehearsal database. Preserve the existing `GSIS_SECRET`, Calendar Apps Script URL and **`CALENDAR_SYNC_CONTINUE=false`**. Updating this module without the optional flag/namespace keeps the existing queue protocol; the new tables are not accessed in that mode.

The base `wrangler.example.jsonc` describes those existing bindings. Replace its database placeholder with the existing database identity, never create another database as part of this upgrade. `schema.sql` is the original command schema. `dashboard-worker.mjs` and `.txt` are generated copies of `worker.mjs`.

## Optional push addition — prepared, not deployed

One new Cloudflare affordance is prepared: SQLite Durable Object class `CalendarChangeHub` with namespace binding `CALENDAR_CHANGE_HUB`, on the existing Worker. It requires the operator's explicit individual approval before deployment/enabling. The optional `wrangler.change-push.example.jsonc` is a reviewable template; it leaves the flag false. No live resource is created by this source package.

After approval:

1. Back up/review the existing Calendar D1 and apply the additive `change-awareness.sql` migration to that same dedicated database. It does not alter command rows.
2. Deploy the existing Worker with its existing bindings/secrets/cron and the new class/namespace migration `calendar-change-v1`. Keep `CALENDAR_SYNC_CONTINUE=false`.
3. Deploy the matching Calendar backend and Pages code. Keep the existing Pages `CALENDAR_JOBS` binding. Enable `CALENDAR_CHANGE_PUSH=true` on the jobs Worker, then on Calendar Pages. Both flags and the namespace are required. The Apps Script backend needs no new secret, Sheet, trigger or database.
4. Confirm two signed-in browsers receive a generic change hint and a freshly authorized source delta, that private job status stays actor-private, and that an idle tab makes no recurring Calendar data/status requests. Test a disconnect and a source response lost after dispatch. Perform no test that repeats an uncertain source write.

To disable the optional layer, set the Pages flag false first and then the Worker flag false. Existing jobs continue. Keep the optional tables and DO so retained intents/history are not lost. The compatibility mode uses the previous 15-second job checks and focus refresh; it does **not** claim zero idle polling. Disconnected enabled clients keep their view and offer manual Refresh, with at most three reconnect attempts; they do not silently start data polling. WebSocket authorization renews after at most five minutes (and never beyond the signed Pages session) and rechecks Google permissions/year access without a data refresh when access is unchanged. These authorization reads remain idle Google requests; this is zero idle browser data/status polling, not zero idle network or Google activity.

## Delivery and source semantics

Every supported Calendar Pages `/api` write (including metadata, publication, birthdays and sync work) first captures a durable, immutable notification intent in D1 when push is enabled. If capture fails, the source write is not forwarded. Explicit read actions bypass capture. Success emits a generic **invalidation**, not a committed-data revision or provider-sync claim. A definite rejected response closes a still-unchecked intent without a change signal. A lost source/finish response retains the original intent, and the backend minute cron emits bounded reconciliation hints at approximately 1, 11 and 71 minutes before retaining it in `REVIEW`. It never resubmits the Google mutation. These hints require a current source read; they cannot prove an uncertain metadata write's final outcome. Review unresolved operations manually.

Queued event commands already exist durably before Google dispatch. A source `SAVED` checkpoint is established only through execution or exact mutation receipt recovery. The journal emits a distinct `committed` hint for that exact command and actor-private `job` hints for status changes. Accepted, source saved and provider synced remain separate states. A crash after source save or journal acceptance retries the same journal identity, never the source mutation. Unacknowledged notifications and unresolved intents are not pruned. Source mutation receipts remain the authority.

A transactional D1 batch records deduplication identity, ordered cursor and journal/head together. DO wake failures leave entries undelivered for the existing cron to retry. Replay is bounded to 200 relevant hints; older history or larger catch-up requires a scoped snapshot reconciliation. Retain up to seven days/5,000 acknowledged journal entries and 31 days of deduplication identities; unacknowledged work is retained with capacity backpressure. Cursor floors survive pruning. Shared hints carry no event text, proposed edits or event IDs. Job subscriptions use an opaque actor hash. Every reconnect and every delta rechecks current Google-backed permissions; permission changes close active subscriptions for renewal.

The source delta accepts at most 2,000 known event identities/revisions and at most 2,000 visible events. Larger years explicitly require manual Refresh; they are not silently truncated. The endpoint reads the current authorized year, returns changed visible events, removals (including lost visibility) and current metadata. It still reads the current source year to compute the delta; it is not a Google incremental-change API. The frontend coalesces hints, patches by identity, retains scroll/filter/focus, and defers applying updates while a draft or text selection is active. The cursor is advanced only after application. Permission changes clear stale owner data and drafts when access changes.

## Explicit boundaries

Direct Apps Script execution, other applications' Calendar Sheet/API writes, manual Sheet edits and direct permission edits do not pass through the Pages intent gateway. No installable Sheet trigger or scheduled source reconciliation is installed by this release; those changes require manual Refresh. Google documents that script/API writes do not fire edit triggers. The optional cron sync-continuation path is deliberately disabled and is not included in the Pages write coverage. Uncertain generic writes retained in `REVIEW` remain unresolved; the bounded reconciliation hints are not an all-writer exact-commit guarantee. Do not advertise arbitrary external edits as automatically detected.

## Local verification

Run `node --disable-warning=ExperimentalWarning tests/calendar099-changes.mjs`, `node tests/calendar099-change-gateway.mjs`, `node tests/calendar099-delta.cjs`, `node tests/calendar099-change-ui.cjs`, `node tests/calendar099-change-browser.cjs`, the existing Calendar job suite and the stable-view browser test. These are offline synthetic tests, not proof of live deployment or Cloudflare hibernation behavior. Run the repository suite and release packaging verification before distribution. Regenerate dashboard copies with `python3 scripts/build-calendar-job-worker.py`.

References: [Cloudflare hibernating WebSockets](https://developers.cloudflare.com/durable-objects/best-practices/websockets/), [D1 transactional batches](https://developers.cloudflare.com/d1/worker-api/d1-database/#batch), [Google installable trigger restrictions](https://developers.google.com/apps-script/guides/triggers/installable).
