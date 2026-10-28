# Calendar Q: exact-run recovery and bounded native service calls

Q lets an administrator check the original sync after a lost or slow response, then continue that same run from its saved state. It reduces avoidable native Sheets calls without changing the authority model, provider identities, five-event batch limit, source-write fences or checkpoint format. The workbook schema remains `v2 RC1.9`; an already compatible workbook needs no upgrade for Q.

## Read-only status contract

`calendarSyncStatus({syncRunId, year, target})` requires Admin both at dispatch and again after acquiring the existing short script lock. `target` is exactly `staff` or `parent`. It does not create a session, settle work, clear recovery data, retry errors, call the Calendar provider, write Sheets or change Script Properties.

- For the exact active run, it returns the existing progress fields plus `readOnly: true`, `inProgress` and `readyToResume`.
- An unexpired provider-work claim returns `inProgress: true` and a short polling interval. Source/provider cooldown and manual-review state remain effective.
- A saved `pendingSettlement` or finalisation checkpoint can return `readyToResume: true` without waiting the old claim lease. The existing same-run `syncYearBatch` path handles these states before its claim test, settling saved outcomes without replaying provider writes. Status itself performs no settlement.
- After the active marker has cleared, status reads only the deterministic `AUD-SYNC-<sha256(run ID)>` completion record. It validates run, year, target, action, entity, counters, blocked totals, completion consistency and any chunked-history reference. It never substitutes the latest unrelated run.
- `counts.errors` is an empty array in status responses; `counts.errorCount` contains the full retained count. Error details and blocked-event details remain in the existing history, keeping status responses compact. Chunked history must contain its explicit error count and matching top-level/count history references.
- Missing, mismatched or malformed proof produces a definite `SYNC_STATUS_MISSING`, `SYNC_STATUS_MISMATCH` or `SYNC_STATUS_UNREADABLE`. Corrupt active checkpoint storage retains `SYNC_CHECKPOINT_UNREADABLE`. These are stop conditions, not permission to create another run.

An existing run still excludes its retained `failedIds`. Q does not silently retry those failures. Once that run finishes, another explicit Sync can retry source `ERROR` rows. An unresolved `DISPATCHED` source receipt remains fenced independently. Running the schema upgrader does not erase retained failures or resolve an uncertain source save.

## No-flush scope audit

`withRC17WriteLock_` retains its default `SpreadsheetApp.flush()` before release. Only the following audited callbacks use the new `withCalendarCoordinationLock_` helper to omit a flush:

| Callback | Sheets activity | Other activity |
| --- | --- | --- |
| Exact-run status | Fresh role and exact history reads | Checkpoint/provider-state reads |
| Per-event source preflight | Fresh role and unresolved-receipt reads | None |
| Provider reservation | Fresh role and settings reads | Reserve the same provider lease in Properties |
| Provider release | Fresh role read | Release the matching provider lease in Properties |
| Provider pause | Fresh role read | Save quota/manual-review cooldown in Properties |
| Explicit reviewed provider resume | Fresh role read | Update reviewed provider state in Properties |
| Immediate pre-provider source fence | Fresh role and unresolved-receipt reads | None |

Every existing lock boundary, fresh role check, request-local cache reset, source fence and provider lease check remains. Source settlement, Calendar-link reservation/updates, normal event mutations and claim paths that may finalise history retain their default flushes. Properties commits do not depend on `SpreadsheetApp.flush()`.

## Native projection reduction

`rc18Projection_` joins only adjacent requested columns into one native read. It does not bridge unrequested columns, load a whole unused table, persist row locators or reuse data across lock boundaries. Requested field order, sparse row positions, blank cells and existing value conversion are retained.

The same synthetic fixture was run against retained P and Q: 1,295 source events, five creates, followed by five updates.

| Per five-event batch | P creates | Q creates | P updates | Q updates |
| --- | ---: | ---: | ---: | ---: |
| Native value reads | 83 | 77 | 69 | 63 |
| Native read cells | 21,228 | 21,228 | 21,098 | 21,098 |
| Native writes | 15 | 15 | 5 | 5 |
| Flushes | 43 | 23 | 23 | 3 |
| Lock acquisitions | 32 | 32 | 22 | 22 |
| Calendar provider calls | 22 | 22 | 12 | 12 |

A synthetic latency model charging 250 ms per native value read, 300 ms per native write, 200 ms per flush and 100 ms per provider call reduced each batch by 5.5 seconds. This is evidence of fewer service calls, **not a measured live Google throughput guarantee**. Metadata, TextFinder and Properties latency are not modeled by that calculation.

The optional Calendar job Worker's existing 35-second upstream deadline is unchanged. Q's browser recovery and these call reductions do not establish that every background job will finish inside that deadline. Existing saved-claim/provider-identity recovery remains necessary after a background timeout.

## Verification

The new tests were run before implementation: status failed with unknown action; native projection performed four reads instead of the required two; the cost comparison showed P's full flush count. These failures passed after the implementation. A reviewer then reproduced a missing compact error-count case; an added regression failed before its correction and passes afterward.

Evidence is in `verification/v098q/calendar-status-native-cost.json`, `calendar-native-cost.json`, `backend-regressions.json`, and `review-status/adversarial-status.cjs` with its result output. The focused tests cover active claims, saved settlement, cooldown, exact completion, large history, missing/mismatched/corrupt proof, role revocation while waiting, read-only side effects and native call reduction.

`calendar-current-session-recovery.json` also reproduces the observed state: 20 prior creates, 30 retained upgrade errors, 30 ready events and one unresolved source receipt. The current run completes its 30 ready events; a later explicit Sync retries the 30 former errors. Exact-run status retains the first run's 30 errors and reports zero errors for the later run. The replay makes exactly 60 additional provider writes with 60 unique new IDs, leaves 80 total provider events and preserves both the uncertain receipt and its source row unchanged. Status checks themselves perform no writes.

Existing Calendar concurrency, provider cooldown, native source-read recovery, native storage, source-write isolation, checkpoint recovery, venue schema and metadata/authority suites pass. `calendar609-api.cjs` passes 27/27 on both retained P and Q with the repository's required `TZ=Asia/Singapore`. Its first direct UTC invocation produced two fixture-date failures; the timezone-correct rerun resolved both. Separate UTC and Singapore-time P/Q logs retain that distinction. The full suite is run by release integration; these focused results do not claim that unrelated inherited failures are fixed.

Full-suite integration exposed four old native-range shape assertions in `tests/calendar/sheets_api_tests.cjs`. They required one service call per requested column. Those assertions now require the adjacent-column groups, while verifying the exact covered columns, selected EventID/row, unchanged source data and zero writes. Both pre-provider and post-provider eligibility scans and the independent identity scan remain asserted. The original P tests pass 63/63; Q passes the updated 63/63 plus all 38 inherited backend tests. `calendar605.cjs` also passes unchanged after the release label was finalised.

No live workbook, provider events or production deployment were modified during these tests.
