# GSiS v0.5.05 performance and reliability

The large settings I/O reductions introduced in v0.5.04 remain implemented and are now protected by an executable numeric gate. This release also reduces conditional catalogue transfer and redundant request-local index reads, caches public Layout snapshots briefly, avoids repeated unchanged draft projections, and strengthens diagnostics and uncertain-save handling. These are measured synthetic service counts and tested mechanisms, not evidence of lower live Google latency.

## Deploy measurements

The real dispatcher and field store run against in-memory native spreadsheet and Sheets API hosts with 159 teachers and either zero or 1,500 assignments. Native value reads and API value reads are counted; metadata calls are not treated as network requests. The table uses the 1,500-assignment fixture and the same operation sequence as the preserved baseline reports.

| Operation | v0.5.03 read cells | v0.5.04 read cells | v0.5.05 read cells | v0.5.05 API write cells | v0.5.05 flushes |
| --- | ---: | ---: | ---: | ---: | ---: |
| Fortnight toggle | 10,498 | 822 | 822 | 79 | 4 |
| First normalising Load Settings save | 64,940 | 827 | 827 | 61 | 3 |
| Steady Load Settings cell | 69,448 | 863 | 863 | 40 | 3 |
| Offload rate | 69,413 | 508 | 508 | 88 | 3 |
| HR Terms option | 69,422 | 457 | 457 | 139 | 3 |
| Membership label | 69,439 | 9,074 | 9,074 | 73 | 4 |
| Identical save confirmation | 50,604 | 7 | 7 | 0 | 0 |
| Receipt confirmation | 7 | 7 | 6 | 0 | 0 |

Each listed new save uses one API write request. Confirmation paths write nothing. The test asserts identical narrow-read cell counts at zero and 1,500 assignments, no more than one API write request and four flushes. Its read ceilings are Load 1,000, Offload 700, HR 650, Fortnight 1,000, Membership 10,000 and each confirmation 10 cells. Older indexes without complete per-root metadata still need a conservative upgrade read; that is separately covered by migration tests.

Full bootstrap remains broad: 35,671 cells and 293,033 response bytes in this fixture, compared with 35,632 cells and 292,575 bytes in v0.5.04. Relief defaults add document data. Reusing the already checked index removes one repeated index read, but full document loading is not converted into a narrow settings operation. An unchanged delta now reads one cell rather than two and returns 98 bytes. These response sizes exclude real HTTP framing and are fixture-specific.

## Catalogue, Contacts and Layout

Contacts computes a shared catalogue hash from fields, roles and people and can omit unchanged content. Deploy caches that content separately from identity. Every authoritative request still obtains fresh signed Contacts authority and a confirmed epoch/hash. Pending sources cannot confirm cached data. Missing chunks, invalid manifests or checksum mismatches cause a full signed fetch. The browser cursor binds the emitted version HR fields and roles as well as the Contacts source hash; the server catalogue cache keeps its independent source hash. Switching version catalogues cannot reuse a mismatched browser payload. Old clients without a hash continue to receive complete fields. The synthetic signed-dispatcher probe is `scripts/measure505-catalogue.cjs`; its report records bytes and service counts separately from production latency.

The unchanged Contacts workload fixture retains 3,371 API cells for a cold directory, Admin data or one-cell Admin save, and 20 API cells for a warm directory with current-authority verification. An ordinary Admin save retains two API write requests totaling 15 cells; receipt confirmation reads seven API cells and writes none. The two fresh source-marker property snapshots replace six individual property calls without removing either consistency boundary. These counts are not a complete measure of every native source read.

Recalculate remains a maintenance hotspot: the 180-record fixture performs 180 API write calls and 181 flushes while preserving historical formulas. No speed improvement is claimed for this path.

An unchanged Layout backend cursor still reads 25 cells and 565 counted read bytes. An owned TG-label update still writes 33 cells. The new Worker cache reduces how often callers reach that backend, not the per-request backend fixture counts. It holds complete public snapshots for 45 seconds, keyed by backend and year, then derives each caller's cursor response. One Worker instance coalesces concurrent pending reads; this is not a distributed lock. Only the existing public schema is cached, including its already-public teacher labels. Private Contacts profiles and authenticated active feeds remain outside the cache. Visible Layout tabs poll after 60 to 75 seconds of jitter; hidden tabs pause. Publication visibility can therefore lag until the next uncached refresh.

The browser retains one draft projection for an unchanged pending-edit queue. New edits and changes to session, version, baseline or catalogue invalidate it; an uncertain request keeps its exact projected edits. Offload inputs keep their incremental keystroke behavior. The regression counts projection clones and verifies visible assignments and baseline immutability; it does not measure real browser responsiveness.

## Diagnostics and retained boundaries

A trace reference connects browser attempts, Worker diagnostics and backend phases. Deploy preserves inner Contacts phases and bridge time, and records both writer lock wait and lock hold duration. These instruments make remaining latency attributable after installation; no live p50/p95 or contention measurements have been collected for this release.

Upstream timeouts do not automatically repeat a potentially continuing Apps Script execution. Eligible fast service failures retain a bounded jittered read retry; no automatic write replay was added. Receipt errors preserve the original request, actor and digest and restore confirmation controls.

New pending and final index values warn at 35,000 characters and reject over 45,000 before any journal, header, field or receipt mutation. Recovery can still complete an already durable older index up to the 50,000-character storage ceiling.

The global writer lock remains because versions share an index, global revision, pending marker and journal/receipt positions. Moving preparation outside it requires a global rebase and conflict proof, not only the edited version's revision check. Script Properties leases, static-asset permission checks and embedded layout seed parsing also remain. Production profiling and an equivalent safety argument are prerequisites to changing these mechanisms. The historical I/O inventory describes the v0.5.04 audit; it is not relabelled as exhaustive v0.5.05 runtime coverage.

## Reproduction and acceptance

Run `npm test` and the current-source probes `scripts/measure504.cjs`, `scripts/measure504-suite.cjs` and `scripts/measure505-catalogue.cjs`. The first two retain their historical filenames; `GSIS_MEASURE_SOURCE` selects source and `GSIS_MEASURE_OUTPUT` selects output. Current evidence is named `verification/505-deploy-counts.json`, `505-suite-counts.json` and `505-catalogue-counts.json`; older reports remain historical.

After installation, measure cold/warm usable views and durable confirmation for Load Settings, HR Terms, Membership, Offload and Contacts, with repeated runs and comparable data. Inspect the joined phases, confirm values after reload, and check simultaneous saves across versions and account revocation. Synthetic results cannot establish Google cold starts, real account permissions, quotas, network latency or end-user p50/p95. The reported production slowness remains an acceptance item until those measurements improve.
