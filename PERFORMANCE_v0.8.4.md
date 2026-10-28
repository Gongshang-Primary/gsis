# v0.8.4 performance evidence

These are synthetic local measurements, not production Google latency or morning throughput guarantees. Current gate results are in `VALIDATION.md` and `RELEASE_SUMMARY.json`.

## New v0.8.4 measurements

| Fixture and path | Measured result | Limit |
| --- | --- | --- |
| Backend compact report, 104 teachers | Plain 20,538 bytes; gzip response 6,422 bytes, 68.7% less; unchanged-key response 4,957 bytes, 75.9% less | Synthetic fixture. Dynamic fields remain fresh; unchanged repeats call gzip once. |
| Browser suspended report, 104 teachers × 17 periods | Plain 51,270 bytes; cold packed response 2,930 bytes; warm key-only response 273 bytes; decoded timetable pair 51,205 bytes | More compressible synthetic fixture than the backend test; the figures are not interchangeable. |
| Browser request and restore | Cold 9.4 ms, warm 4.2 ms, new date 5.8 ms; three online reads, two decompressions | One local run, no injected network delay, native Chromium gzip. Warm read reuses the decoded pair. |
| Own arrangements, three matched runs with 200 ms injected save/read delay | Median initial feedback 220 → 6 ms; ready chooser 220 → 221 ms; fixture DOM nodes 109 → 38 | Immediate feedback improved. The verified ready time remains bound by the simulated server work. |
| Consecutive-subject allocator, 80 teachers, six PAL blocks and 12 ordinary lessons | 30/30 coverage, coverage proved, 128 nodes, 2,482 ms | Synthetic final local run. Preferences remained bounded, not proved optimal. |
| Own arrangements, 150-teacher chooser | Cold dialog 5.1 ms synchronous work / 12 ms to first frame; warm 2.7 ms; search 0.1–0.3 ms handler / at most 3.2 ms through layout; period/target selection at most 1.8 ms | Synthetic Chromium fixture. Selection makes no network request. |

Reproduce report measurements with `tests/release084-report-backend.cjs` and `tests/release084-report-transport-browser.cjs`. The browser result is recorded in `verification/084-report-transport.json`. Own arrangements measurements are in `verification/084-absence-browser.json` and `verification/084-mutual-150-teachers.json`, with the reproduction commands in `VALIDATION.md`. Node regression scripts also cover exact instruction-cell comparison and concurrent unrelated edits.

## Work reduction and memory

Only baseline/effective timetable data is compressed and retained. Every read still verifies authority and fetches current operational fields. ScriptCache can reuse compression for unchanged scoped content for up to six hours; its 90 KB entry ceiling is a cache limit, not a permission boundary.

The browser retains at most 24 decoded snapshots and 8 MiB of decoded UTF-8 JSON, with a 4 MiB per-snapshot limit. Actual memory is higher because JavaScript objects and caller copies have overhead. Logout, account/role changes and affected-date invalidation clear relevant entries. LRU eviction bounds retained payloads. An unsupported gzip browser uses plain reads; invalid or missing cached data gets one plain read retry. Offline reads show failure rather than claiming fresh saved data.

Saved instruction patches validate only their changed lesson keys against original/current values after current absence/source checks. Unrelated instruction cells can merge. This does not skip authority, overlap, source or structural checks for other operations. New absences and broader timetable changes retain their existing validation.

## Retained measurements from v0.8.2

The following measurements were carried in v0.8.3 and remain historical evidence. They were not rerun as new v0.8.4 benchmarks.

| Path | Evidence |
| --- | --- |
| Unchanged inbox thread | 100-message fixture: full response 109,148 bytes; conditional response 1,115 bytes. |
| Inbox contact matching | 5,000 threads and 150 contacts: 150 phone reads using one index, rather than repeated per-thread directory scans. |
| Stapler date list | 903-byte eligibility projection versus 43,083-byte full directory in the focused fixture; no plan decompression, quota load or full baseline rebuild. |
| Stapler first usable view | 104 teachers / 676 tiles, injected 120 ms read latency: recorded median 201.5 ms until editable and 227.2 ms until paint. Local browser results vary. |
| Private timetable read | Published payload projection; no operations writer lock, reconciliation, Contacts rebuild or Calendar lookup on the normal private view. |
| Teacher Daily Update | Frozen publication projection without full model/quota loading, planning reconciliation or writer lock. Local group-tab changes need no network. |
| Allocation change checks | Lightweight version/token polling; actual conflicts compare cell base/local/current values. Distinct human edits can merge. |
| Audit hot-store retention | Independent archived-history fixture: 30,000 captured events shrink from 12,774,710 to 5,847 characters after durable archive and text watermarks, preserving newer unexported facts. |

Source evidence: verification/082-inbox-performance.json, verification/082-review-correctness.md, verification/082-review-ui-reliability.md and the corresponding current regression scripts. The archive-size measurement concerns metadata/evidence compaction; accounting and actual-duty history remain intact.


## Remaining shared costs

The separate Roster project isolates its execution and ScriptLock from Deploy editing. Roster still reads published Deploy data, so that read dependency and any shared executing-account/platform limits remain. No production concurrency benchmark is claimed for the split. Each Roster operation uses a verified version-bound Deploy snapshot, but separate locks do not make Deploy publication and Roster commit one transaction. Existing source checks remain; a subsequent source read or cycle picks up newer Deploy data.

The server still builds current authoritative context, projects and hashes timetable content. Writes still persist one authoritative Drive operations document under a final ScriptLock. Shared Drive I/O, fresh dependencies and provider startup remain. Cell comparison and RAM reuse do not provide independent date stores or guarantee fixed concurrent-user throughput.

Local Excel and planner edits retain their existing offline behavior. Daily audit export remains outside the planner writer lock and cannot undo an accepted save. The release does not weaken validation or suppress genuine conflicts to report faster success.
