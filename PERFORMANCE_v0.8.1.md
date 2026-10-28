# v0.8.1 performance evidence

These are local work counts, source tracing and deterministic concurrency checks. They do not establish production service latency or simultaneous school-user throughput.

| Path | Previous | v0.8.1 | Boundary preserved |
| --- | --- | --- | --- |
| Evening Calendar lookup | 2 serial HTTP calls, 2 year reads | 1 authenticated batch, 1 year read | Released-year, date limit, service authentication |
| Pure Daily Notify | 1 Calendar call | 0 Calendar calls | Published snapshot, baseline and caller checks |
| Allocation preparation | Context/model/quota/solver inside shared writer lock | Prepare outside final lock, recheck and merge into fresh state | Atomic durable document plus receipt and intent |
| Worker notification start | Wait for allocation and employment mail | Independent notification lane | Durable claims and uncertain-send handling |
| Paused/no-change scheduler | Global plan revision churn | Persist scheduler receipt without unnecessary domain revision change | Scheduled idempotency |

Existing projection regression measured a 214,138-byte full timetable response versus a 1,635-byte names projection, with one model Drive read across repeated calls and a fresh register check per request. Candidate and availability calculations each build one teacher context. These optimizations are retained, not claimed as new v0.8.1 changes.

## Compression decision

A synthetic 150-teacher weekly JSON payload was 260,345 bytes; gzip was 3,328 bytes and base64 gzip 4,440 bytes. One local Node run took approximately 1.7 ms to compress and 0.5 ms to decompress, with byte-exact round trip. This deliberately repetitive fixture is not a production compression ratio or Apps Script CPU benchmark. Raw evidence: verification/81-compression-exploration.json.

Compression can reduce bulk transfer size but does not remove remote startup, Calendar/Contacts waits or lock contention. Existing Stapler data already uses compressed storage and lazy validated unpacking. This release adds no custom compressed wire format. Keep server checks authoritative and retain browser filtering/rendering of authorized snapshots. If deployment traces show transfer bytes dominating later, add a versioned, bounded codec with Unicode/signature, fallback and decompression-limit tests as a separate change.

## Remaining costs

Fresh Contacts authority, small source-manifest reads and full operations-document persistence remain. The optimistic path reads the operations document once for preparation and again at commit; this trades an extra state read for keeping slow context/solver work outside the writer lock. Relevant shared changes can trigger one bounded recomputation. The final shared lock is still required while this is one document. Physical date sharding is a separate migration if measured commit I/O remains too costly. See VALIDATION.md for the executed concurrency checks and known limits.
