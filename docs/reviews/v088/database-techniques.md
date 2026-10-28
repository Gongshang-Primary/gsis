# GSiS v0.8.8 concurrency and responsiveness research

Research date: 22 October 2026, Singapore time.
Scope: targeted source inspection of v0.8.7 and official external documentation. This document recommends changes; it does not claim production timing measurements, live deployment or successful WhatsApp delivery. No live records were changed during research.

## Decision

Retain the current Apps Script/Drive storage for this release. Reduce service calls and lock hold time, preserve a short authoritative commit, and make UI reads independent of slow work. Do not remove the mutex around a shared JSON read–modify–write. Adopt database patterns rather than building a database engine inside gCode.

Google explicitly recommends minimizing service calls, doing calculations in memory and batching reads/writes [1]. These recommendations fit GSiS better than increasing concurrent requests against the same serialized writer.

## Platform guarantees and limits

| Mechanism | What it guarantees | What it does not guarantee |
| --- | --- | --- |
| ScriptLock | One holder in that script project | Cross-project mutual exclusion or arbitrary row/date locks |
| UserLock | One holder for the same script and effective user | A named lock for each feature; execute-as-owner features share that owner lock |
| DocumentLock | A containing-document scope | A web app lock; the API returns null outside a containing document |
| Sheets batchUpdate | Validated requests in one call apply atomically | Isolation across an earlier read and later write; collaborator changes can still intervene |
| Application revision field | A stale-write check when compared under an authoritative commit lock | Atomic compare-and-swap when check and write are separate unprotected calls |
| CacheService | Faster reusable reads | Durable locking, receipts or authoritative commit evidence |
| Queue | Durable asynchronous work with at-least-once delivery | Exactly-once provider sending |

Lock scope comes from [2]; Sheet guarantees from [3]. Cache entries may be removed before their requested expiry [4]. Therefore an expiring cache marker cannot establish exclusive write authority. Cloudflare Queues can redeliver a message, so queue consumers must remain idempotent [5].

A new .gs file or another deployment of the same project does not create another ScriptLock. A different project gets a different lock and therefore cannot safely write the same JSON document without an additional shared coordinator. Splitting the Sheet or JSON files is helpful only when mutable ownership is split as well.

## Findings in this codebase

The existing hot-path design is already partly database-inspired:

1. `rosterAbsenceDispatch_` prepares external context before ScriptLock, rereads latest state inside it, checks a durable request receipt and applies absence consequences to the latest data.
2. `publish`, `notifyDaily`, `reliefBatch`, `autoAllocate` and `optimise` route to `rosterOperationsPreparedDispatch_`. Preparation is outside the lock; source/dependency checks and a three-way merge protect commit.
3. Generic mutation paths still call `rosterOperationsContext_` inside ScriptLock. Their context can load manifests, timetables, subject catalogues and quota data.
4. `RosterInbox.gs` still uses ScriptLock for Inbox mutations and provider callbacks, even though Inbox state is a different file.
5. `RosterNotificationStore.gs` uses UserLock for transport. `RosterAuditExport.gs` also holds UserLock while looking up folders, merging evidence and writing files. The two features can therefore contend.
6. Audit export takes UserLock then ScriptLock; notification migration/maintenance take ScriptLock then UserLock. This inconsistent order permits mutual waiting until a timeout.
7. `rosterOperationsCommit_` writes the whole JSON document. A logical cell patch avoids unrelated application mutation but does not become a physical partial Drive write.
8. Read paths sometimes perform reconciliation that writes. Treat such paths as writes when measuring latency; a method named `read` alone does not establish that it is side-effect free.

These are inspected source facts. They do not prove which one caused a particular historical timeout or uncertain send.

## Techniques to adapt now

| Database technique | GSiS adaptation |
| --- | --- |
| Optimistic concurrency | Prepare from a snapshot, then compare source and dependency versions under the short commit lock; retry preparation if they changed |
| Unique request constraint | Preserve actor, request ID and command digest with the durable result; a replay returns the same result |
| Transactional outbox | Commit publication and immutable send intent together; transport claims/sends/settles independently |
| Materialized read view | Return compact day/teacher/status projections; reuse scoped verified timetable snapshots |
| Index | Build maps by job ID, date, teacher and demand once per execution instead of repeated scans |
| Batch | Claim and prepare a bounded set; settle result rows together; avoid one Apps Script round trip for every recipient |
| Read-your-writes | Apply the confirmed save result to the UI immediately, then reconcile background deltas |

PostgreSQL illustrates why optimistic execution still needs conflict detection and retry: a stable snapshot does not by itself prevent every serialization anomaly, and the application must retry aborted transactions [6]. GSiS should preserve that discipline without claiming PostgreSQL isolation levels.

AWS documents the transactional outbox as a way to avoid a business record committing while its corresponding notification intent is lost. It also warns about duplicate processing [7]. The current frozen publication/intent model should be retained; do not mark a provider submission successful merely because a queue accepted work.

## Selected v0.8.8 audit mitigation

The release chooses the conservative repair, inspected in the current diff: defer text export when eligible queued/claimed/sending notification work exists; process one date per invocation; keep UserLock only for the canonical daily files; release it before ScriptLock watermark settlement; reject regressive watermark updates.

This removes the opposite nested-lock order and gives already-visible dispatch work priority. It does **not** provide complete lock isolation: a new notification batch can arrive after the precheck and wait for the current single-date export. No production duration for that residual window has been measured. If this remains significant, the staged-evidence design below or a separate export authority is the next step. Do not describe the release as eliminating all audit/notification contention.

## Safe audit-export repair without another Apps Script project

Do not replace UserLock with an unprotected expiring lease. An expired exporter can still overwrite the canonical text after a newer exporter has completed unless storage itself enforces a fence.

A viable small redesign:

1. Read the authoritative snapshot and committed archive pointer/version.
2. Outside all write locks, prepare text and merge old evidence; write a uniquely named immutable evidence version.
3. Acquire ScriptLock briefly and reread current metadata.
4. Skip if an equal/newer export is already committed; reprepare if the archived base pointer/version changed.
5. Update the single canonical text file and commit the new archive pointer/watermark while holding the lock.
6. Prune structured evidence only after the committed watermark proves it is archived.

All preparation and folder/archive lookup are outside the lock. The final canonical text and operations watermark writes remain serialized because Drive supplies no verified transaction spanning those files. A lost response after text writing must be recoverable by deterministic retry. A failed watermark commit must not be reported as completed. Orphan staged evidence is recoverable garbage, never authority.

This removes the notification UserLock collision and inverse nesting, but still makes two final Drive writes under ScriptLock. Measure that tradeoff. A simpler conservative alternative is to keep UserLock, defer export while notifications are pending, limit work to one date and settle watermarks only after releasing UserLock with monotonic guards. That reduces the risk but does not completely separate contention.

The inspected Drive v3 files.update contract [8] did not establish a supported content compare-and-swap primitive for this path. Do not ship a correctness dependency on assumed `If-Match` behavior without a verified contract and a concurrent integration test.

## Generic context preparation

Avoid a universal shortcut. Use an allowlist of operations whose context dependencies have been mapped. The existing prepared path checks manifests, quota identity, request digest, clock and state dependencies; reuse those contracts.

For a first safe conversion, prepare from the caller's exact state revision, calculate a dependency digest, then take ScriptLock, read latest state and validate both the dependency digest and current source manifests. If they differ, release and retry preparation. Recheck authorization and time-sensitive rules at commit. For record-only settings or receipt reads, skip timetable/quota context entirely rather than build and discard it.

The dependency map must cover fields used indirectly by context: name bridges, confirmed Stapler plans, timetable identity/parity, school calendar, policy, duty roster and quota reference. A same-cell rule is insufficient if another record can change eligibility. Avoid digesting every delivery status if delivery status does not influence the command.

## Measurement and verification

Record operation name, request correlation ID, payload bytes, external-call count, lock wait, lock hold, preparation, durable-write and projection time. Keep staff data and private-link tokens out of generic timing logs. Compare p50/p95 with 30 concurrent users; report provider acceptance separately from delivery.

Required scenarios: independent absence reports, same-cell conflicts, publication concurrent with an absence, lost save response and exact retry, duplicate queue wake, callback arriving before settlement, out-of-order audit preparation, export failure after text write, newer archive committed before an older exporter settles, and scope/permission changes while cached data is visible.

No benchmark was run in this research task. Synthetic timings must be labelled as synthetic; they cannot establish live Apps Script or Meta latency.

## Migration threshold

Consider a transactional operational store only if final JSON read/write latency remains the dominant morning p95 component after these changes, or if shared-file growth makes each small update materially more expensive. Preserve Sheets for reference/configuration/reporting if that remains useful.

SQLite-backed Durable Objects are one concrete later option because Cloudflare documents atomic storage transactions and rollback [9]. They could own a school's hot mutable state and expose compact projections. This would be an ownership migration, not a transparent cache. Before adopting it, design schema constraints, request receipts, access controls, backup/export, outbox, data location, replay, rollback and cutover. No storage migration is recommended as an unmeasured shortcut for this release.

## Official sources

1. Google Apps Script best practices: https://developers.google.com/apps-script/guides/support/best-practices
2. LockService: https://developers.google.com/apps-script/reference/lock/lock-service
3. Sheets batchUpdate: https://developers.google.com/workspace/sheets/api/reference/rest/v4/spreadsheets/batchUpdate
4. CacheService entry semantics: https://developers.google.com/apps-script/reference/cache/cache
5. Cloudflare Queues delivery guarantees: https://developers.cloudflare.com/queues/reference/delivery-guarantees/
6. PostgreSQL transaction isolation: https://www.postgresql.org/docs/current/transaction-iso.html
7. AWS transactional outbox: https://docs.aws.amazon.com/prescriptive-guidance/latest/cloud-design-patterns/transactional-outbox.html
8. Drive files.update: https://developers.google.com/workspace/drive/api/reference/rest/v3/files/update
9. SQLite-backed Durable Object storage: https://developers.cloudflare.com/durable-objects/api/sqlite-storage-api/
