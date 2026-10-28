# GSiS v0.7.01 performance

## Roster follow-up, 15 October 2026

The following are deterministic fixture measurements, not school-network latency promises.

| Work | Supplied Ready baseline | Revised release |
| --- | ---: | ---: |
| Initial Home requests | Profile plus speculative absence read | Profile only |
| Timetable picker response, 80 teachers | 214,138 bytes | 1,635 bytes |
| Timetable model download before selection | Yes | No |
| Candidate teacher-context builds, 44 people | 43 | 1 |
| Availability teacher-context builds, 2 selections and 17 periods | 34 | 1 |
| Explicit allocation projections | 2 | 1 |
| Rank computations across four filter changes | 5 | 1 |
| Date formatter constructions across 1,000 date renders | 2,000 | 0 |
| Upstream calls for a personal absence list | 2 | 1 |

Run `node tests/roster701-backend-speed.cjs` and `node tests/roster701-speed-gateway.mjs` for backend and request-count checks. The current DOM and Chromium speed tests verify interactive behavior. They use synthetic staff and intercepted APIs.

Immutable model caches can expire or be evicted. A cold read still loads and validates the Drive model. Models above the cache size limit use the original read path. Authority and timetable validity are never cached by these changes. My Relief Duties displays its personal records before loading its baseline overlay.

Operations still replace one durable JSON document under a script lock. They do not patch individual JSON fields in Drive. Revision and request-ID checks remain authoritative. Lightweight reads no longer write workload warnings based on quota data they deliberately omitted.

Measure installed endpoint timing with the same account, date, and dataset before claiming a live speed improvement. Gateway responses retain Server-Timing for Calendar and backend work.

## Earlier v0.7.01 work

Local measurements are in `701-performance.json`; they are not school-network latency promises. Timing checks measure deterministic Node fixture computation and Chromium rendering.

Changes: share authenticated timetable/context projections; avoid quota work on teacher-scoped reads; render absence period preview before persistence; cache reference models rather than operational truth; build candidate and publication indexes once per operation; rerank 150 candidate rows across P0–P16 without network requests; preserve inputs on concurrent rejection; no candidate-matrix polling; manual Refresh and mutation results update the view.

Notification claims share an index of current assignments, snapshots and acknowledgements instead of rescanning history for each row. Immediate pre-send validation remains authoritative. Idle scheduler minutes avoid rebuilding expensive context when no allocation, report or active reminder is due. Live approval reads are short-lived cached; pending routes do not burn send attempts.

Persistence remains a full operational JSON replacement under a script lock, not a surgical Drive patch. Scoped reads and reduced computation improve the request path, but the 12 MB store guard and lock contention remain capacity considerations. Archive/prune only through approved maintenance; never silently discard audit or publication history.

No synthetic benchmark justifies enabling automatic delivery or claiming a production response-time target. Measure the installed service before and after on the school's actual data.
