# Allocator lifecycle and morning concurrency review

The scheduler and manual allocator now expose a small per-date run record before loading planning context. Calculation stays outside the existing operational writer lock. Stable progress stages have bounded logs (12 entries, record below 7 KB); the dated history is bounded to 60 records and old terminal records are removed. The UI can read `allocationVersion` with `statusOnly: true` using current Contacts authority without reading the operational document, timetable index, or timetable models.

The final cancellation/ownership check shares the same ScriptLock as the durable operational commit. Run identities bind the trusted actor and exact request identity; each computation attempt has a separate private fence. Exact retries retain monotone log sequence numbers. A stale attempt cannot overwrite a newer run. After 10 minutes without progress the public record becomes abandoned, or uncertain if a commit had begun. A new attempt still checks authoritative receipts under the writer lock before replacing the fence.

Completion is defined by the existing durable request/schedule receipt, not by a status property write. If Drive wrote successfully but its response was lost, the receipt confirms completion and an exact retry performs no additional allocation write. If the write never happened, retrying the original request acquires the writer lock, reads current durable state, and safely fences/restarts the old attempt. A different request is blocked while an unexpired commit remains uncertain. `committing` and `uncertain` never promise cancellation.

Accepted cancellation persists a terminal `cancelled` receipt using the existing receipt store, without bumping the domain revision. This is one operational write on the first accepted cancellation; repeated cancellation does not write again. A replaced/expired status record cannot resurrect a cancelled command. The receipt endpoint reports cancellation explicitly instead of claiming the allocation was saved. A lost cancellation response remains safe even if the status property was never updated.

Scheduled cancellation stops only the allocation proposal. The scheduler then recomputes its reporting work from current records, queues the configured SMC summary/reminders, and completes the report part of the same schedule receipt. A busy or uncertain manual allocator also allows scheduled reporting without changing its fence or human choices. Report-only completion can cross 06:30; allocation commit still cannot cross the morning cutoff. The signed tick freshness limit remains unchanged.

## Evidence

`node tests/roster0812-allocation-run.cjs` passes 17 deterministic regressions against the real backend wrappers and new lifecycle helper:

- Begin before context loading, no calculation under writer lock, exact replay and trusted actor attribution.
- 30 simulated status viewers produce zero operational-document or timetable-index reads; role checks still apply.
- Concurrent start rejection; cancellation after a complete proposal preserves independent saves and prevents draft commit.
- Lost Drive response, failed pre-write Drive call, exact retry/new fence, and monotone retry logs.
- Status storage failure after durable commit cannot claim cancellation or duplicate an allocation.
- Expired attempt rejection; bounded log/history.
- Scheduled run status, cancellation and receipt replay; successful no-op cleanup; 06:30 commit cutoff.
- Cancel A, fail later run B, retry original A: A remains cancelled.
- Lost cancellation commit response before property update remains terminal.
- 05:30 cancellation still queues exactly one morning SMC summary.
- Cancelled final optimisation still commits its report-only work after 06:30.
- Scheduled reporting while a manual allocator runs leaves its identity and fence unchanged.
- A duplicate delivery of the same scheduled slot cannot replace its active allocator with a report-only receipt.

Also passed after integration:

```
node tests/roster0812-human-decisions.cjs
node tests/roster081-day-transactions.cjs
node tests/roster701-r17-service.cjs
node tests/roster713-smc-summary.cjs
node tests/roster712-absence-concurrency.cjs
node tests/roster0810-scoped-absence.cjs
```

The absence audit found no reproduced lost absence. Existing tests cover 30 overlapping absence preparations committed in reverse order, independent-teacher merges, stale same-row rejection, lost-response exact retries, and manual decision priority. Prepared allocator dependencies force stale proposals to recompute or reject before commit. This patch retains those guards.

## Limits

These are deterministic Node/VM and browser fixtures, not live simultaneous Apps Script executions or measured production latency. Status polling is cheap, while normal version checks and first cancellation still read the authoritative operational document. Cooperative cancellation does not interrupt a running solver; it prevents the proposal's durable commit. A Script Properties outage can temporarily leave a run showing a save in progress; a normal version check uses durable receipts to project the correct terminal state. No live deployment or messages were sent during this review.
