# GSiS v0.5.04 performance and reliability

The priority was small Deploy settings saves that read nearly the whole draft and computed view. v0.5.04 loads their validated dependencies, maintains corresponding root indexes, and avoids repeated flushes and work on unrelated assignments. A broader review covers existing Contacts, Deploy, Layout, transport and editor maintenance paths.

These are synthetic service-count comparisons against v0.5.03 using the real dispatcher/backend with in-memory spreadsheet and API hosts. They measure no Google network latency, cold-start duration, live Contacts bridge round trip, real quota behavior or end-user production time. The performance issue is not declared resolved until the installed product demonstrates a material improvement.

## Deploy measurements

Fixture: 159 teachers and 1,500 assignments, with the same operation sequence in each version. Read cells include counted native value reads and API value reads. Metadata method calls are not assumed to be separate network requests.

| Operation | v0.5.03 read cells | v0.5.04 read cells | v0.5.03 / v0.5.04 flushes |
| --- | ---: | ---: | ---: |
| Fortnight toggle | 10,498 | 822 | 7 / 4 |
| First normalising Load Settings save | 64,940 | 827 | 7 / 3 |
| Steady Load Settings cell | 69,448 | 863 | 7 / 3 |
| Offload rate | 69,413 | 508 | 7 / 3 |
| HR Terms option | 69,422 | 457 | 7 / 3 |
| Membership label | 69,439 | 9,074 | 7 / 4 |
| Identical save confirmation | 50,604 | 7 | 1 / 0 |
| Receipt confirmation | 7 | 7 | 0 / 0 |

The first normalising Load Settings save previously wrote 11,068 API cells in 10 requests; this fixture writes 61 cells in one request. The steady save remains 40 API cells in one request. Offload audit payloads now record changed fields rather than duplicating the whole configuration. HR Terms includes added schema/index metadata, so every write-cell count is not lower. Structural capacity changes can require an additional flush.

Full bootstrap remains intentionally broad: this fixture reads 35,632 cells versus 35,462 before, reflecting added role/configuration data. The unchanged delta remains two index-cell reads. Narrow settings counts are independent of the fixture's assignment count; the probe also records zero-assignment runs. Older indexes may require one conservative read to construct complete root metadata. Destructive edits still read enough data to validate affected assignments.

## Contacts and Layout measurements

Contacts cold directory, Admin data and one-cell save each retain one three-range API source read of 3,371 cells in the fixture. Warm directory access retains its current-authority read of 20 cells. An ordinary Admin save retains two API writes totaling 15 cells over seven ranges; receipt confirmation reads seven API cells and writes none. Exact duplicate save confirmation writes none. Response sizes increase slightly with diagnostics. These numbers cover API value reads and the separately reported native writes/flushes, not a complete accounting of every native read.

Recalculate is a retained maintenance hotspot: the supplied 180-record fixture still performs 180 API write calls and 181 flushes while reconciling derived values and formulas, as in v0.5.03. Its correctness scope is now limited to operational fields, preserving history/backup formulas. This release does not claim a measured speed improvement for that path.

| Layout operation | v0.5.03 read / write cells | v0.5.04 read / write cells |
| --- | ---: | ---: |
| Full public snapshot | 78 / 0 | 78 / 0 |
| Unchanged public cursor | 78 / 0 | 25 / 0 |
| Confirmed identical store retry | 173 / 5,655 | 106 / 0 |
| Explicit repair, already identical tables | 145 / 5,655 | 5,778 / 0 |
| Owned TG label commit | 5,912 / 5,687 | 5,869 / 33 |

Snapshot cells can contain large JSON chunks; cell counts alone do not express payload size. Explicit mirror repair deliberately reads the mirror to avoid unconditional rewrites, so its reads increase. Ordinary confirmed retries no longer perform that repair implicitly. Full snapshot verification and publication consistency remain.

## Read/write review coverage

`IO_INVENTORY_v0.5.04.json` records current-source hashes, route mappings, I/O/delegating functions and direct service call sites. The generated inventory is static coverage evidence, not a statement that every function was dynamically benchmarked. The probe scripts and JSON outputs provide the separate measured evidence.

| Operation family | Decision and retained dependency |
| --- | --- |
| Deploy bootstrap, sync, delta, active, public campus, landmark lookup/search and live refresh | Retain indexed full/unchanged projections, current access and publication identity; remove unnecessary value-read flushes. Full data loads still serialize their required response. |
| Deploy lease, draft changes, role truth table and settings | Keep current ownership/lease/conflict checks. Scope only proven root dependencies; membership semantics that affect roles still validate and resolve affected teachers. Assignment-wide/destructive changes retain broader validation. |
| Deploy receipts, notes, audit pages and notice acknowledgements | Confirm immutable requests before draft load where possible; use indexed note/notice projections and existing bounded audit pages. Keep current authorization. |
| Deploy publication/review, Contacts import and catalogue handoff | Preserve full review, identity/alias uniqueness and frozen publication semantics. Reject degraded authoritative imports. Matching newer catalogue revisions can advance the marker without rewriting identical tables. |
| Contacts bootstrap, directory, data, DIY, membership, options and offload | Preserve cached source reuse, live authority and before/after source markers. Safe fallback is display-only. Do not remove consistency reads during concurrent changes. |
| Contacts Admin/DIY save, approval, receipt and recovery | Share write planning, prepare capacity/ranges before durable writes, retain one final API commit with Applied, current actor/digest checks and no write retry after uncertain failure. |
| Contacts KP and signature settings | Skip an exact unchanged KP value; preserve validation, Admin access and existing small settings writes. The retired Admin-table route stays retired. |
| Contacts assignment feed, catalogue transactions and current-deployment helpers | Retain bounded chunks, manifest/final marker verification and recoverable publication. Equal catalogue content avoids repeat table mutation. |
| Contacts setup, backups, Recalculate, diagnostics and editor recovery | Keep explicit maintenance boundaries, original backup/history, current recovery authority and exact read-only permission diagnostics. Recalculate remains the measured hotspot described above. |
| Layout public/profile, bootstrap source and owned snapshots | Shortcut only verified unchanged heads. Changed payloads retain checksums, marker checks, public allowlist and year ownership. |
| Layout preparation, Admin save, mirror repair and publication retry | Reuse validated table reads; patch dirty rows; skip confirmed duplicate mirror work. Keep immutable snapshot readback, staging/head barriers and prior-head fallback. |
| Shared transport, Sheets value services, workbook setup and structural changes | Read response bodies within deadlines, start only full-budget retries, retain earlier references and measure named phases. Cache request-local sheet metadata; preserve flushes needed before API/structural crossings and durable commit boundaries. |

Shared `GSISSheets` counters expose API/native value calls, ranges/cells, upper-bound byte estimates, service time and metadata lookups. They do not count every native journal/index call outside that helper. Synthetic measurement hosts additionally count their supported native calls. No cell contents or private profiles are emitted by these counters.

## Evidence and production acceptance

Reproduce with `scripts/measure504.cjs` and `scripts/measure504-suite.cjs`. Their `GSIS_MEASURE_SOURCE` option permits the v0.5.03 baseline; `GSIS_MEASURE_OUTPUT` selects the report. Static coverage is regenerated by `scripts/inventory504.cjs`. Release evidence includes the current and baseline JSON reports; functional and browser checks are recorded in `VALIDATION.md`.

After installation, time cold and warm usable views, Load Settings, HR Terms, Membership, Offload, ordinary Contacts save and receipt confirmation. Compare operation phases and counts, confirm saved values after reload, and verify account change/current access. Real Apps Script opening, permission behavior and quotas may dominate remaining latency. The original protected-range incident was already resolved by the user and is not used as evidence of this release's speed.
