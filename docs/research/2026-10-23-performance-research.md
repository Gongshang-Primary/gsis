# GSiS performance research, 23 October 2026

This study supports v0.8.10. It covers the v0.8.9c source at `30ef3b0`, current official documentation and user discussions. It proposes where to measure and improve the existing design. A source claim, a local test and a live service measurement are different evidence. This report does not establish production response times or a concurrent-user capacity.

## Recommendation

Keep the existing single writer for each mutable store. Reduce the work before and inside that writer. Serve immutable timetable models from the authorised local cache. Fetch small current records separately. Use Workers for durable background work and shared immutable reads, not as a second independent writer to the same Drive JSON.

The first target is fewer service calls and less repeated preparation. Google explicitly recommends local JavaScript work, batched reads/writes and caching to reduce service round trips [G1]. The inspected Roster already uses much of this design; adding another cache or another Apps Script project without tracing its owner can add complexity without reducing latency.

## What the source already does

| Source | Existing mechanism | Residual cost or boundary |
| --- | --- | --- |
| `backend/RosterOperations.gs` | Absence context preparation outside the write lock; source checks inside it; exact request receipts; prepared allocation merges | Each commit still reads and replaces a whole operational JSON file. Surgical commands are logical patches, not physical row updates. |
| `backend/RosterOperations.gs` | Lazy compressed Stapler plans with stored validation proofs | Do not inflate every plan for a narrow read or rebuild unchanged proofs. CPU and payload reductions do not eliminate Drive latency. |
| `backend/RosterTimetableBatch.gs` | Source keys, immutable model references, compressed baseline/suspended stages, unchanged responses | Current authority and source checks still matter. A warm payload cache does not remove authentication latency. |
| `roster-update/public/roster-timetable-preload.js` | Client timetable reuse and source validation | Preserve account/authority scope, daily first-load and hourly :20 checks, catch-up and missing-cache recovery. Do not reintroduce a 60-second model reload. |
| `backend/RosterNotificationStore.gs` | Separate mutable transport owner and lock | Inbox/operations paths still need individual tracing. Separate files do not automatically mean separate safe writers. |
| `notification-worker/index.js` | Independent scheduled work, durable backend claims, optional Queue wake-up | Worker concurrency can expose a backend bottleneck. Raising consumers does not enlarge an upstream lock or quota. |

## User forums consulted

The following discussions supplied hypotheses to test. Their benchmarks and individual incidents are not GSiS results.

1. [Google Developer forum: large Sheets updates](https://discuss.google.dev/t/best-way-to-handle-large-google-sheets-updates-with-apps-script/399979), September–October 2026. Contributors favour one in-memory transformation and one appropriately sized write, avoiding tiny calls and repeated flushes. They suggest resumable batches for long jobs and testing the Advanced Sheets Service when the spreadsheet service is the measured bottleneck. Google’s own guidance supports reducing service calls [G1]; it does not supply a universal batch size.
2. [Stack Overflow: setValues versus setValue](https://stackoverflow.com/questions/63604878/is-setvalues-slower-than-setvalue), August 2020. The answer distinguishes number of calls from size of data and links experimental comparisons. This motivates measuring both, rather than assuming one large write has constant cost. Its timing results are historical and environment-specific.
3. [Apps Script community: asynchronous collisions](https://groups.google.com/g/google-apps-script-community/c/Pkua79JpAcw), 2021. The discussion points to LockService. Official lock scopes [G2] are the authority: a script lock protects that script, not all applications editing the same external resource.
4. [Cloudflare community: consuming Queues](https://community.cloudflare.com/t/musings-on-consuming-queues/435833), November 2022. The search-indexed discussion asks how multiple consumers affect delivery. The page could not be retrieved in full. Current official delivery and concurrency documentation, not this older discussion, determines the design [C1, C2].

## SQL behaviours worth emulating

| SQL idea | Safe GSiS equivalent | What it cannot promise |
| --- | --- | --- |
| Indexed lookup | Build request-local maps by stable staff ID, date and demand ID; cache immutable projections by content/source key | An in-memory map is not a durable database index. Avoid a new remote lookup for every cell. |
| Optimistic concurrency | Prepare from revision N; compare relevant dependency revisions under the owning lock; merge unrelated changes; reject real conflicts | A revision comparison outside the owner’s critical section is not compare-and-swap. |
| Transaction receipt | Persist accepted command digest, actor and result with its state change; retry the same request ID | A lost HTTP response is not proof of failure. Never issue a fresh ID automatically. |
| Materialised view | Derive teacher/day reads from an immutable timetable revision and narrow current absence data | Do not return an obsolete permissions projection because a cache is warm. |
| Outbox | Commit intent with domain state; perform external work later; settle the exact claim/result | A provider side effect is not part of a Drive, Sheets or D1 transaction. |
| Partitioning | Separate independent ownership domains after mapping invariants and migration/cutover rules | Separate `.gs` files, spreadsheets or projects alone do not create safe row locks. |

LockService supplies mutual exclusion, not rollback [G2]. Keep the authoritative reread, compare and commit protected. Move model preparation, provider calls and report rendering outside that section where safe; the durable write itself remains within its owner. An arbitrary “no I/O under locks” rule would remove the protection this storage model requires.

For Sheets-backed stores, a supported `spreadsheets.batchUpdate` groups its changes atomically within the request [G4]. That does not make a prior separate read and later write a transaction, and it cannot atomically include Drive or WhatsApp. For Drive JSON, a write-ahead intent or a single document receipt can support recovery; it must not be described as SQL isolation across services.

CacheService may evict entries before the requested expiry and limits each value to 100 KB [G3]. Store only regenerable material there. Receipts, accepted absences, delivery outcomes and the only copy of a plan need durable storage. Compression must preserve a source identity and a verified decompressed-size bound.

## Highest-value implementation checks

1. Report Absence: measure preparation reads, lock wait, locked reread/validation, commit and response projection separately. Avoid reading unrelated transport or timetable detail only if the command still preserves its notification invariants. Keep incomplete/lost-response saves visible and retry-safe.
2. Manage Absence: obtain current owned records through a narrow projection. Do not reload the entire timetable for a history filter or to display a saved receipt. Reuse the existing cache when editing a date whose source key is unchanged.
3. Assign Relief: retain the local draft, indexes and candidate data while filtering. Deduplicate equal requests in flight. Save only changed commands with dependency tokens; revalidate mutable availability at commit. A displayed cached free period cannot guarantee a successful concurrent assignment.
4. Timetable: make selecting another teacher/class/TG a local operation after the model arrives. Keep baseline and suspended models independently keyed. A failed current-date check must be shown, not converted to a blank timetable.
5. All four: cancel or discard stale response generations; do not let a slow earlier date response replace the user’s latest selection. Measure cold, warm and post-edit paths independently.

These are source-informed optimisation targets. The release’s validation report must state which were implemented and measured, rather than imply that this list itself changes runtime behaviour.

## Further Worker opportunities

| Priority | Application | Benefit and condition |
| --- | --- | --- |
| Now | Continue immutable R2 timetable projections and shared build claims | Many users can reuse one prepared payload. Authorise the current manifest first. R2 object operations are strongly consistent, but same-key concurrent writes are last-writer-wins; immutable revision keys avoid older builds replacing newer ones [C5]. |
| Now | Daily Drive report and Calendar continuations | Take durable work off the browser response path. Settle only the captured version after external persistence. Resume the same work after failure. |
| Now | Bounded notification/Inbox consumers | Use explicit per-message acknowledgements and retry delays. Tune to upstream capacity, observe queue age and failure rates, and preserve idempotency [C1, C2]. |
| Next, measured | Deploy/Roster revision hints through a Durable Object WebSocket hub | Send small “online version changed” hints. Preserve local drafts; refresh only clean views or after user choice. Hibernation supports idle connected clients [C6]. The hint is not an authoritative saved state. |
| Next, measured | D1 indexes for job due state, claim expiry and receipt identity | Narrow queries scan less data [C3]. A D1 batch is transactional within D1 [C4]. Do not add a second job authority without a migration contract. |
| Optional experiment | Smart Placement for fetch gateways that make several upstream trips | Compare measured request durations before enabling broadly. Current documentation limits Smart Placement to fetch handlers; it is not a fix for the scheduled cron handler [C7]. |
| Defer | Migrate operational records to D1 or SQLite Durable Objects | This can provide real transactions and narrower physical writes, but requires authority, receipt, audit, publication and recovery migrations. It is not a quick cache change. |

Each D1 database processes queries serially; shorter indexed queries improve capacity, while long queries reduce it [C8]. Durable Objects offer private transactional storage and a natural coordinator, but their memory can disappear on restart [C9]. Neither product gives unlimited throughput or an atomic WhatsApp send.

Queues provide at-least-once delivery [C1]. A duplicate wake-up must converge on the same durable intent. If an external send result is unknown and the provider has no equivalent idempotency/reconciliation guarantee, retain `uncertain`; do not promise exactly-once delivery or blindly resend.

Workers KV is eventually consistent and is not suitable for the sole current save receipt, mutable permission decision or lock [C10]. A derived immutable blob can be cached broadly; access authority cannot be inferred from its existence.

## Measurement and acceptance

Record payload bytes, service-call counts, model inflations, state read/write count, lock wait and hold time, total server time, browser time to usable controls, and final durable-save confirmation. Correlate by diagnostic ID without staff content or tokens. Use p50/p95 from repeated runs with the same data and separate warm/cold samples.

Required concurrency scenarios: two teachers reporting different absences; the same save retried after a lost response; two SMC users changing disjoint cells and then the same cell; timetable revision changing during preparation; notification/report work while an absence saves; cache unavailable; report file saved but settlement interrupted. Verify both final records and retained drafts. Browser responsiveness alone does not prove that a save completed.

This research pass did not run production load tests. Any local fixture measurements belong in the implementation validation report, labelled with their data size and host environment.

## Primary references

Checked 23 October 2026. Direct links are retained for a human or future maintainer.

| ID | Official source |
| --- | --- |
| G1 | [Apps Script best practices](https://developers.google.com/apps-script/guides/support/best-practices) |
| G2 | [LockService scopes](https://developers.google.com/apps-script/reference/lock/lock-service) |
| G3 | [Cache limits and eviction](https://developers.google.com/apps-script/reference/cache/cache) |
| G4 | [Sheets batch updates](https://developers.google.com/workspace/sheets/api/guides/batchupdate) |
| C1 | [Queues delivery guarantees](https://developers.cloudflare.com/queues/reference/delivery-guarantees/) |
| C2 | [Queues consumer concurrency](https://developers.cloudflare.com/queues/configuration/consumer-concurrency/) and [batching/retries](https://developers.cloudflare.com/queues/configuration/batching-retries/) |
| C3 | [D1 indexes](https://developers.cloudflare.com/d1/best-practices/use-indexes/) |
| C4 | [D1 batch and session APIs](https://developers.cloudflare.com/d1/worker-api/d1-database/) |
| C5 | [R2 consistency](https://developers.cloudflare.com/r2/reference/consistency/) |
| C6 | [Durable Object WebSockets and hibernation](https://developers.cloudflare.com/durable-objects/best-practices/websockets/) |
| C7 | [Worker placement](https://developers.cloudflare.com/workers/configuration/placement/) |
| C8 | [D1 concurrency FAQ](https://developers.cloudflare.com/d1/reference/faq/) |
| C9 | [Durable Object storage](https://developers.cloudflare.com/durable-objects/best-practices/access-durable-objects-storage/) |
| C10 | [Workers KV consistency](https://developers.cloudflare.com/kv/concepts/how-kv-works/) |
