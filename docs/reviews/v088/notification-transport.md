# v0.8.8 notification transport review

Scope: `backend/RosterNotificationStore.gs` and the `dispatchNotifications` region of `roster-update/public/_worker.js`, compared with v0.8.7. No live messages sent or live configuration changed.

## Implemented

Protocol 2 combines previous-batch result settlement, current eligibility checks, claiming and preparation in one locked transport commit. Meta requests still occur outside the Apps Script lock. A healthy drain of N batches needs N+1 backend calls instead of 3N+1. Protocol 1 and legacy per-recipient fallback remain supported.

Batch IDs are one use and bound to dispatcher/results. Replays cannot return prepared rows. Claimed recipient pacing, provider cooldown, current contacts and immutable publication checks remain. Result settlement now records the actual provider launch time for pacing, since preparation can precede a paced send. An ambiguous handoff never causes a retry of Meta submissions; known preceding results are settled separately, and unresolved prepared outcomes remain uncertain.

The lock helper reuses the transport state already read by ensure, avoiding one redundant Drive read per transport request. Durable state is still reread under the lock before applying changes.

Aggregate diagnostics now include backend call count, total elapsed time, first submission time and first acceptance time. They contain no recipient data or message contents.

## Verification

`tests/roster088-notification-batch.cjs`: atomic settlement/next handoff; prepared response replay; mismatched request identity; cooldown; lost ready response; malformed result batch; actual-launch recipient pacing.

`tests/roster088-notification-worker.mjs`: protocol 2 dispatch, bounded concurrency, rate-limit settlement, ambiguous handoff recovery, and 100 distinct recipients.

100-recipient synthetic fixture: 9 batches, 10 backend calls compared with 28 under protocol 1; all 100 unique provider sends and 100 settlements; 64% fewer backend calls. Recorded elapsed time approximately 4.97 seconds with immediate fake backend and 20 ms fake provider. This is not a production latency or delivery guarantee.

The twelve focused notification scripts run in this task passed: roster087-notification-store, roster087-notification-worker, roster087-notification-maintenance, roster088-notification-batch, roster088-notification-worker, roster087-delivery-review-close, roster701-delivery-lease, roster082-private-buttons-dispatch, roster082-notify-service, roster084-manual-dispatch, roster701-r20-notifications, roster083-template-dispatch. Later root release verification should run current integrated source.

## Limits

Actual Apps Script latency, Meta account throughput and handset delivery remain unmeasured. Concurrency defaults remain 12 with an existing hard cap of 20; no unverified account-limit increase. A lost prepared handoff remains ambiguous, as with the previous separate preparation response. SQL-style atomic local commits cannot guarantee exactly-once external Meta effects.

The main source of the speed gain is fewer cross-service round trips, not weaker locking. The durable Queue binding still determines immediate wake reliability; cron remains the recovery path.
