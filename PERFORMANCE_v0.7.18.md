# v0.7.18 performance evidence

Baseline: v0.7.17 at `2ba81ff1a09d8e146da1987139b5a5980ab74ab1`. Separate deterministic work reductions from elapsed-time measurements. Controlled local adapters do not measure the deployed school's Google or Cloudflare service latency.

| Path | Work targeted by this release | Boundary retained |
| --- | --- | --- |
| Sign-in directly to Report Absence | Return profile and compact own-report data in one authenticated bootstrap | Current Contacts identity and trusted date context; normal read fallback for an unavailable combined result |
| Home | Defer unused baseline and absence warmups | Explicit navigation and user-intent preloading still load required data |
| Repeated reads | Share identical in-flight requests and coalesce repeated visibility checks | Changed dates, stale sources and pending input remain protected |
| Contacts directory | Read the required current tables directly without separate sheet dimension metadata calls | Fresh authority and required-header checks; native fallback when the batch service is unavailable |
| Baseline model reuse | Decode the existing immutable gzip cache reliably | Current register/source checks and validated Drive fallback |
| Uncertain absence acknowledgement | Inspect the exact durable receipt before repeating a mutation | Same actor, original request ID and identical payload; missing receipt remains unconfirmed |
| Concurrent writes | Reduce remote/reference work inside the shared write lock where revalidation permits | Current state, revision, dependency checks, receipts and bounded lock wait |

## Measured Contacts work

The controlled adapter compares the actual v0.7.17 and v0.7.18 source:

| Count per Roster Contacts request | v0.7.17 | v0.7.18 |
| --- | ---: | ---: |
| SpreadsheetApp metadata method calls | 16 | 4 |
| Sheets values batches | 1 | 1 |
| Directory derivations for a signed Roster read | 2 | 1 |
| Directory derivations for a service read | 3 | 1 |

Metadata method calls are not necessarily separate network round trips. The values batch was already one in v0.7.17; this release does not claim to remove duplicate batches. Thirty independent signed identities each used fresh values with no write or writer-lock acquisition in sequential local handlers. This is not a production concurrency benchmark.

The focused Contacts checks cover current revocation, commit markers, pending writes, failed service reads, native fallback and directory parity. The retained before-image reader also receives typed gzip metadata without changing stored bytes or hashes. See `718-contacts-performance.md/json` and `718-contacts-regression.log` in the verification archive.

## Controlled absence form measurements

The real Chromium fixture uses an 80 ms synthetic delay per API response and three runs per version/session. The endpoint fixture does not reproduce Apps Script startup, actual Contacts latency or all work inside a combined backend request.

| Session | v0.7.17 median usable form | v0.7.18 median usable form | Requests before save |
| --- | ---: | ---: | --- |
| new sign-in | 291 ms | 192 ms | 5 to 4 |
| returning | 339 ms | 211 ms | 4 to 3 |

The rapid date-change fixture reduced requests from 3 to 2, with elapsed values 160 ms and 161 ms. This run does not demonstrate faster date changes. Ordinary Submit still uses one mutation; its recorded fixture timings are not a production save-speed claim. The receipt path improves confirmation after a lost acknowledgement without repeating an accepted mutation. See `718-absence-performance.json` for all samples.

## Baseline cache, lease and concurrency adapters

Thirty warm immutable-model loads use zero Drive reads in the focused cache adapter. A corrupt cache entry falls back to one validated Drive read. Lease renewal reduces Script Properties reads from three to one and performs no operational-document read or write.

The deterministic concurrency checks interleave 1, 10 and 30 users with background delivery events and retain their reports/events. An exact receipt lookup uses no write lock, context construction or writes. These are controlled handler interleavings, not simultaneous production Apps Script executions.

Notification Contacts work moves before the write lock; current state and eligibility are sampled again under the lock. Active scheduler preflight adds one state read to move Contacts outside the lock, followed by the full current-state read and schedule decision under it. An idle scheduler acquires no lock and makes no Contacts request. This is a bounded tradeoff, not removal of all reads or serialisation.

See `718-bootstrap-cache.json` and `718-concurrency.json` for the actual fixture counts and assertions.

The final release records actual focused checks and regression results in VALIDATION.md, RELEASE_SUMMARY.json and the `718-*` verification reports. Counts, timings and concurrency outcomes must come from those reports. Existing v0.7.17 measurements describe the previous release and are not reused as v0.7.18 results.

Measure first and returning loads separately after installation: sign-in to usable absence periods, absence save acknowledgement, Baseline Timetable, Stapler dates and saved-plan open, Calculations and Inbox. Match failures by request reference, backend version and timestamp. Check simultaneous staff reports alongside the scheduled worker. A successful local concurrency fixture does not prove production throughput or remove the limits of Apps Script and the shared operational store.

The earlier baseline switch and 21 October saved-plan incidents remain open until installed readback succeeds. A date-list entry alone does not establish a successful plan read. No numerical production latency target or universal speedup is claimed.
