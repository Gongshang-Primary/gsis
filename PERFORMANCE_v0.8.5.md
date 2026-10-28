# v0.8.5 performance and concurrency evidence

The component audit and focused fixture measurements are recorded below; integrated source and package verification are recorded in VALIDATION.md. No production latency, 30-user throughput or peak mobile memory figure has been established for this release.

## Work reduction implemented for item097

1. Render Roster icons before starting timetable preload.
2. Send each distinct applicable baseline once for a 31-date window, then send authorised saved suspension previews in a second request.
3. Restore and retain immutable models in browser RAM, and yield between baseline model validations.
4. Reuse preloaded confirmed timetable-day data for up to 60 seconds before an authoritative refresh.
5. Avoid Calendar/Deploy quota reads and the writer lock in the dedicated batch operation.

Each stage has a 64 MiB decoded JSON limit, with 128 MiB combined serialized-payload accounting. JavaScript object overhead, decompression buffers and caller copies are additional memory. Oversize or failed batches fall back to ordinary date loading with an explicit state; dates are not silently truncated. The older selected-report cache retains its separate 24-entry/8 MiB total/4 MiB single-snapshot limits.

The two stages share a baseline manifest key bound to authority, date window, register revision and immutable source identities. A source change restarts both reads once. This is coherent staged reading with atomic installation per stage, not a transaction across every backend service.

## Suite read/write audit

The detailed audit is in [GSiS-Read-Write-Audit-v0.8.5.md](docs/GSiS-Read-Write-Audit-v0.8.5.md). It covers Contacts, Calendar, Deploy/Layout, Roster and the notification service.

| Measured fixture | Result | Interpretation |
| --- | --- | --- |
| Inbox: 100 ms remote Contacts lookup, 5 ms Inbox read, 5 ms duty read, 10 ms commit | Writer-lock occupancy falls from 120 ms to 20 ms. | The remote wait moves outside the lock; fresh duty/state validation and the commit remain inside. This is injected time, not production latency. |
| Calendar warm event edit | Read batches 5→6, read cells 66→218; writes remain two batches/26 cells, including six event cells. | The extra batched metadata read closes a reproduced stale-cache correctness failure. Four configuration tables are fetched once per writer and reused. |
| Deploy unchanged refresh / steady Load Settings cell save with 1,500 assignments | Refresh reads one cell; the cell save reads 863 and writes 45. | Existing indexed reads and differential persistence remain; the full bootstrap still reads 35,682 fixture cells. |
| Contacts directory, 30 independent identities | 30 read batches, zero writer locks and zero writes. | Sequential fixture accounting, not a live 30-user load test. |

IP Deploy filtering and draft correction run locally on the loaded model; normal save checks remain authoritative. Existing changed-field saves and receipts are retained across the suite. Roster physical writes still replace the operations document. Deploy publication handoffs retain their writer lock because releasing it safely requires a durable handoff protocol. Broad new compression and extra send parallelism remain deferred until real transfer sizes, queue age and memory use are measured.

Broad integrated regression results and package checks are recorded in VALIDATION.md. Historical v0.8.4 measurements remain in PERFORMANCE_v0.8.4.md; they are not new measurements of v0.8.5.

## Retained guarantees

Server authority controls saves. Client previews are not saved state. Disjoint logical edits can merge where the route supports base/current comparison; conflicting edits remain explicit. Receipts and immutable request identities protect uncertain-save recovery. Roster still serializes its operations document at its own final writer lock. Compression does not turn a whole Drive-file replacement into a partial physical write.
