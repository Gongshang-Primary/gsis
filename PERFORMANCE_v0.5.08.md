# GSiS v0.5.08 performance and write boundaries

Measurements use 159 synthetic teachers and 1,500 assignments, comparing untouched v0.5.07 with v0.5.08 through the real Deploy dispatcher and storage code. Every save below includes its required follow-up request to obtain updated R. The baseline is not just the write acknowledgement. No live workbook or school data was used.

## Complete request sequence

| Action | Client requests before → after | Cells read before → after | Response bytes before → after |
| --- | ---: | ---: | ---: |
| cold bootstrap | 1 → 1 | 35,671 → 35,682 | 345,880 → 412,848 |
| warm bootstrap | 1 → 1 | 35,671 → 2 | 345,880 → 412,848 |
| unchanged delta | 1 → 1 | 1 → 1 | 98 → 98 |
| Fortnight toggle | 2 → 1 | 36,497 → 823 | 346,883 → 1,451 |
| Offload one rate | 2 → 1 | 36,183 → 509 | 345,929 → 109,649 |
| Load Settings steady one cell | 2 → 1 | 36,548 → 864 | 346,953 → 120,954 |
| Classes name edit | 2 → 1 | 85,079 → 49,403 | 347,000 → 121,178 |
| HR teacher field | 2 → 1 | 86,886 → 51,158 | 347,173 → 122,642 |
| HR exclusion | 2 → 1 | 41,823 → 6,125 | 347,052 → 1,589 |
| HR Terms one option | 1 → 1 | 457 → 458 | 1,800 → 1,950 |
| Span of Control one officer | 1 → 1 | 9,743 → 9,744 | 1,192 → 1,342 |
| HR teacher note | 1 → 1 | 5,319 → 5,320 | 1,187 → 1,338 |

Offload and routine workload saves now return updated results with the saved delta. Unchanged calculations use a small version/revision confirmation. Warm bootstrap reuses a verified raw document and pure result, while conditional unchanged refresh can return only its existing confirmation envelope. Cold opening still reads the source. Schema 3 exposes richer authorized breakdowns, so its full bootstrap response is larger. There is no claim that cold loading is solved by caching.

The measured Offload action moves from one API data write plus native journal/index work and three flushes to two API write requests, no flushes and a durable journal. One request prepares journal and pending marker; the other writes final data with the completion marker. API read request counts increase from two to six for this complete action because authoritative markers now use the same API transport as marker writes, instead of native reads that can be buffered. Less data and fewer browser round trips do not guarantee lower live latency; these marker reads and remaining broad HR/Class reads are explicit limits. Global lock waits remain.

## Contacts and Layout

The same 181-record Contacts fixture reduces Recalculate from 180 API write requests, 181 flushes and 367 native writes to 2 API write requests, 3 initial sheet/header native writes and 3 flushes. Dirty spans are coalesced by matching column width across adjacent rows. The new operation writes 14 ranges / 565 cells and reads 6,762 API cells, versus 6,742 before. The small extra read is live authority/transaction state; it also rereads after commit to return coherent Admin data. The fixture already has a backup marker, so a first real backup has additional copy cost. Fragmented and larger plans can require more bounded requests. These are not a single globally atomic transaction.

Contacts directory cold/warm reads remain 3,371 and 20 cells respectively; the warm read still refreshes current authority. Ordinary Contacts saves retain their existing two-request protocol. Layout changes only release metadata and retains its existing measured path.

## Safety and cache behavior

Deploy and Contacts validate write plans and bound API requests to 100 ranges, 500 rows per range and a conservative 1 MB request estimate. Completion is the final range in the final data request. Each API request is atomic individually; multiple requests use the durable journal and pending guard. Native writes retain flush/marker ordering. No API failure triggers native fallback. Lost acknowledgements are confirmed by receipt or the original request, without duplicate audit or writes. Readers refuse mixed Deploy state; Contacts presents its stored prior view while Recalculate is pending.

The calculation cache is keyed by workbook, version, store, commit, revision and model code. It stores pure source/results, plus the raw snapshot for warm opening, and never stores caller authority. Chunks are bounded and checked with metadata and digest. Missing or corrupt chunks rebuild; cache writes are optional for correctness. Reads check live source markers and each request checks current roles. The publication has a separate store identity even when its version ID matches a draft.

## Evidence and latency limits

`verification/508-actions-before.json` and `508-actions-after.json` contain both empty and 1,500-assignment probes, source hashes, range counts and complete backend request sequences. `508-suite-before.json` and `508-suite-counts.json` contain the before/after Contacts and Layout probes. `scripts/measure508.cjs` reproduces the Deploy comparison using `GSIS_MEASURE_SOURCE` for the baseline. LocalActionMs is in-memory CPU only, excluding network, Google execution, Contacts authentication callbacks and DOM rendering. JSON response sizes use the ASCII synthetic fixture.

The real frontend records action start, save acknowledgement, all subsequent requests, accumulated render time and completion in `window.gsisPerformance` (last 30 actions). Completion requires usable confirmed R. The DOM test verifies a one-request save through rendered R, revision mismatch refusal and stale-result handling. Its mocked network time is not a production latency measurement. Server traces retain service timing, lock wait/hold and cache-hit fields. Measure cold/warm opening and save through rendered R after installation; do not substitute acknowledgement time.

No live account, protected range, school-device or concurrent production acceptance is claimed.
