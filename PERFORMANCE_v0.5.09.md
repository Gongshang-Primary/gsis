# GSiS v0.5.09 performance

The comparison uses unchanged real Deploy dispatcher/storage logic with in-memory native Spreadsheet and Sheets API adapters, 159 synthetic teachers and 1,500 assignments. `scripts/measure509.cjs` runs the same actions against v0.5.08 and v0.5.09, including a separately emptied relief cache. Results and source hashes are in `verification/509-actions-before.json` and `509-actions-after.json`. This is not a live workbook, Contacts bridge, school network or browser timing experiment.

| Complete exclusion save | v0.5.08 | v0.5.09 |
| --- | ---: | ---: |
| Warm-cache cells read | 6,125 | 210 |
| Cold-cache cells read | 33,654 | 226 |
| Warm/cold API read requests | 6 / 7 | 5 / 5 |
| Warm/cold API read ranges | 28 / 50 | 29 / 31 |
| Warm/cold relief calculations | 0 / 1 | 0 / 0 |
| Native key searches per save, including receipt lookup | 1 | 3 |
| API write requests per save | 2 | 2 |
| Warm/cold cells written, including transaction records | 102 / 75 | 102 / 75 |
| Warm/cold response bytes | 1,589 / 1,376 | 1,611 / 1,398 |
| Client requests per save | 1 | 1 |
| Required follow-up reloads | 0 | 0 |
| Explicit flushes | 0 | 0 |

The warm case creates the first exclusion record; the cold case adds another level to it. Compare each case with its matching baseline, not with the other case. The additional 22 response bytes carry the exact predecessor revision. No unchanged R rows are resent.

## Retained work and tradeoffs

Two bounded TextFinder searches scan the edit and view key columns on the server to discover stable addresses. The number of search batches grows with touched identities; one ordinary cell adds two searches. Narrow value reads use the existing bounded Sheets batch helper. This avoids a new large per-teacher index in the shared completion cell, but server scan cost still scales with projection size and must be timed in production. The values of untouched teachers, exclusions, subject rates and authorship history are not read. Structural array/object headers and their chunks remain necessary to preserve siblings. Current membership rules are retained for profile precedence.

The save still verifies current authority and uses the global writer lock. Journal preparation and final data/completion remain two API writes for these fixtures. Lock contention, metadata calls, bridge latency and network round trips are not represented by in-memory elapsed times. Do not infer a guaranteed latency percentage from cell counts or claim fewer total service transitions without timing the key searches.

Old projection layouts retain their broad dependency reads; original legacy documents may retain relief calculation while migrating safely. No cache is required for an exclusion-only save in a current projection. Such a save does not copy a potentially large cached source/result to the new revision; a later independent relief read may rebuild the current cache. Mixed workload/rule saves retain the existing dependency-aware source/calculation path, including shared T_avg effects.

## Browser work

The real-application DOM test stages, saves and applies an exclusion delta with one mocked backend call. The existing table, teacher rows, column width, scroll offsets and unrelated controls retain their DOM identity. Only affected checks and warning counts update. Toggle-back removes the redundant draft. The underlying complete client document still uses the existing flat-field delta application; this release removes the table rebuild, not all in-memory document traversal. `window.gsisPerformance` includes affected-control work in render time and distinguishes acknowledgement from a usable current view.

The tests exercise exact predecessor acceptance, missing/stale baseline rejection and durable-save/display separation. Actual Google service timing, lock wait/hold under contention, network time and short-screen/zoom geometry remain installed-product acceptance checks. No Chromium binary was available; its download failed, so no real-browser pixel or timing result is claimed.
