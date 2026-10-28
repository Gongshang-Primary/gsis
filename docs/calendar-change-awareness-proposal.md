# Calendar change awareness — proposal

**Status: historical 0.9.8q design proposal, superseded by the optional 0.9.9 implementation.** See [the current Calendar jobs and change-push guide](../calendar-job-worker/README.md) for the delivered contract, explicit enable gate and limitations. The 0.9.9 generic invalidation protocol differs from this original exact-commit aspiration: uncertain generic writes remain unresolved for review. No live infrastructure is changed by the prepared code.

The aim is zero idle browser data polling, with Calendar updating only after a relevant change. Google Sheets remains the authoritative event store and Google Calendar remains the publication destination. This is a notification layer, not a data migration.

**Environment as reported by the operator:** the attached 0.9.8p rollout report says `gsis-calendar-jobs`, its dedicated D1 database and the Production Pages `CALENDAR_JOBS` service binding are installed. Reuse these for cal-viewport; do not use the rehearsal D1 or create another jobs Worker or R2 bucket. `CALENDAR_SYNC_CONTINUE=false` is deliberate and must remain unchanged: queued Sheet saves do not imply automatic provider sync. The report records five successful live jobs (three saves, one relocation and one deletion); `saveParentSide` was not live tested. Its P-1 uncertain-save record remained blocked and is not established as cleared. These are operator-reported P results, not verification of the currently deployed Q version.

## What Q does today

| Path | Current behavior |
| --- | --- |
| Background event jobs | Checks `/api/calendar-jobs` every 15 seconds, including when there is no pending work. |
| Returning to the tab/window | Schedules a full bootstrap after 500 ms, whether anything changed or not. |
| Job completion | Usually applies the returned event locally; discovering a previously saved job can trigger a bootstrap read. |
| Calendar sync completion | Loads a full bootstrap, even when the operation reports that everything was already synced. |
| Uncertain operation | Performs bounded checks of the same operation identity. These checks protect against duplicate writes. |

The relevant frontend paths are `scheduleCalendarJobs`, `loadCalendarJobs`, `requestRefresh`, `bindRC17StaticEvents` and `recoverCalendarSync`. The existing 150 ms startup interval only waits for the Google sign-in library; it does not refresh Calendar data.

Existing event revisions, durable mutation receipts, authenticated Worker proxy and edit-preservation checks are useful foundations. `ROSTER_CALENDAR_REVISION` is **not** a sufficient Calendar ledger: it covers selected school-date fields, not every event field, glossary change, permission change or processing outcome.

## Proposed behavior

1. **Make the source change recoverable.** Under the existing write lock, durably establish a pending notification intent tied to the exact mutation identity **before** changing Google data. After the write, reconcile that intent against the exact saved mutation receipt; publish only proven committed changes. A crash between source, receipt or outbox writes must enter exact-mutation reconciliation, not blindly repeat the write. Missing or ambiguous commit proof retains the intent for recovery/review and emits no committed-change claim. Non-event writes need equivalent receipt coverage. Native multi-range Sheet writes, receipt writes and outbox writes are not transactional together; neither the lock nor a flush makes them atomic.
2. **Deliver reliably.** Retain each proven notification until the Worker acknowledges it; retry with the same source-change identity. Cloudflare atomically stores deduplication, the journal entry and the next monotonically increasing cursor within its authorized scope. A lost HTTP response must neither lose the notification nor repeat the Google mutation. Keep accepted jobs, committed event data and Google Calendar sync outcomes separate: a Google Sheet save does not confirm provider sync.
3. **Keep only notification metadata.** Each ledger entry contains a cursor, source-change identity, kind, scope, year, affected dataset, commit time and, where permitted, bounded affected event identifiers. It contains no event text, staff details or proposed edits. Processing-state entries do not advance the committed-data revision.
4. **Push the change.** A Cloudflare Durable Object sends small change hints over authenticated, hibernating WebSocket connections. A ledger records changes but cannot notify an idle browser by itself. This push connection is what removes the 15-second browser poll.
5. **Catch up safely.** On initial connection or reconnection, the server replays entries after the client's cursor. Subscription and replay must have a defined high-water mark so a change during connection setup cannot be missed. Duplicate or out-of-order hints are harmless. If the cursor is older than retained history, return a scoped snapshot-required signal. Focus return checks connection/cursor state; it does not reload the year automatically.
6. **Fetch and render narrowly.** Coalesce a burst of changes into one authorized delta request. Add a bounded endpoint returning changed visible events, removals and necessary metadata with source revisions. A removal must also cover an event becoming invisible to that user. Until that endpoint exists, a revision hint alone cannot provide surgical remote updates. Own successful saves can continue using their returned event result.

The frontend applies changes in place by event identity. It preserves table scroll, filtering, selection, keyboard focus and open drafts; it does not rebuild the whole visible table on an unchanged check. If a remotely changed event is being edited, retain the draft and flag the conflict. Fetches use owner/year guards, and the cursor advances only when the corresponding update has been applied or explicitly retained for later application.

The normal yellow bar carries concise messages such as “Saving in background”, “Saved — Calendar sync pending”, “Syncing in background” or “Updates available; your draft is retained”. Technical references stay in expandable administrator details. A disconnected connection preserves the current view and offers manual Refresh rather than silently starting idle polling.

## Permissions and operational boundaries

- Separate published-year changes, administrator changes and actor-private job statuses. Authenticate subscriptions and authorize their scope; never broadcast hidden event identifiers or another person's job details. Every delta fetch rechecks current Google-backed permissions.
- Permission changes invalidate affected subscriptions and cached views. Connections have expiring authorization and must authenticate again when renewed. Direct permission edits outside supported write paths share the detection limitations below; they cannot be assumed to revoke an open subscription immediately.
- Cover every supported application writer, including glossary, publication, birthdays, sync results and administrative operations. An authorized installable Sheet trigger can flag human edits. Google states that script/API writes do not trigger edit triggers, so other writers must explicitly emit change notifications. Without this coverage, detecting arbitrary external edits requires reconciliation or manual Refresh. Any optional scheduled **server** reconciliation must be described honestly as a fallback, not as purely event-driven detection.
- Existing Worker cron performs queued work; sync continuation is separately controlled and reported disabled by `CALENDAR_SYNC_CONTINUE=false`. Preserve that setting. This backend schedule is distinct from browser refresh polling and can remain. Retain bounded uncertain-operation recovery until the new notification/replay path provides equivalent recovery guarantees.
- Use a small D1 journal/outbox index alongside the existing dedicated Calendar jobs database. Bound acknowledged history by age and count; retain a durable per-scope head and deduplication records for at least the producer's retry horizon. For example, retain up to seven days of replay within a configured cap, then require a scoped snapshot for older clients. Do not silently prune unacknowledged outbox work; apply a capacity limit and surface failures. No R2 bucket is needed.

## Setup and approval

The concrete new Cloudflare affordance is **one Durable Object namespace binding and class deployment/migration for Calendar change push**. Under the user's earlier instruction, this requires individual approval before committing/enabling this new Cloudflare addition. Preparation and review can proceed first. The associated journal, authenticated publish/subscription routes, outbox handling and delta endpoint must be reviewed as part of that feature. Reuse the existing Calendar service binding, school authentication and `GSIS_SECRET`; do not expose the secret to browsers.

## Acceptance checks

| Scenario | Required result |
| --- | --- |
| Idle visible or hidden tab | No recurring Calendar data/status requests; no visible refresh. |
| Another user saves a visible event | One coalesced update; scroll, filter, focus and unrelated drafts remain intact. |
| Current event changes during editing | Local draft survives; conflict is explicit; no silent overwrite. |
| Google saves but notification delivery fails | Outbox retries the same identity; eventual update; no repeated Google write. |
| Disconnect, duplicate signal or expired cursor | Replay/deduplication or scoped snapshot; no missed changes or unnecessary whole-page render. |
| Hidden event, private job or permission removal | No unauthorized content/identifiers; subscription invalidation and fresh read authorization. |
| Job accepted, source saved, provider synced | Three accurate states; the yellow bar never implies a later stage has completed. |
| Direct Sheet/API edit | Covered writer/trigger emits a change, or the documented reconciliation/manual-refresh limitation applies. |

References: [Cloudflare Durable Object WebSockets and hibernation](https://developers.cloudflare.com/durable-objects/best-practices/websockets/) and [Google Apps Script installable trigger restrictions](https://developers.google.com/apps-script/guides/triggers/installable).
