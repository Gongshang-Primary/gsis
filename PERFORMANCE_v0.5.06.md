# GSiS v0.5.06 performance evidence

## What changed

Classes ability and class name set saves, teacher notes and level exclusions now load only their required version fields. Class rename and teacher profile saves retain their assignment dependencies, but omit unrelated version fields. Mixed or unsupported operations retain the conservative full editing path. Older stores without projection indexes retain their existing full read fallback and upgrade behaviour.

Scoped saves fetch edit values and the view projection's row addresses in one Sheets API batch read. The durable write stage reuses these addresses. Span of Control, Load Settings, HR Terms, Offload and the new scopes therefore use one Sheets API read instead of two in the measured fixtures. Metadata lookups during transaction planning are memoized only within that operation.

Audit summaries read four columns, containing ID, timestamp, actor and action. The two canonical field address columns are read only when a user opens an event's details. A complete 40-row page now reads 160 summary cells instead of 240. The initial and final index consistency checks remain. There is no new audit cache or stale-authority allowance.

The journal, pending marker, final index commit, live authorization, edit leases, request receipts, field conflict checks and uncertain-save recovery remain in place. A save is not reported as durable before the final marker succeeds.

## Reproducible synthetic comparison

The same in-memory spreadsheet fixture ran the actual v0.5.05 dispatcher and the v0.5.06 candidate dispatcher, with 159 teachers and either 0 or 1,500 IP assignments. Native calls and the Sheets API were counted. No school spreadsheet was opened or changed.

At 1,500 assignments:

| Operation | v0.5.05 cells read | v0.5.06 cells read | Sheets API reads before → after |
| --- | ---: | ---: | ---: |
| Classes: ability | 65,429 | 880 | 2 → 1 |
| Classes: name set | 69,894 | 325 | 2 → 1 |
| Classes: name edit | 69,903 | 49,390 | 2 → 1 |
| HR: teacher note | 69,912 | 5,319 | 2 → 1 |
| HR: level exclusion | 69,925 | 6,124 | 2 → 1 |
| HR: teacher field | 69,950 | 51,157 | 2 → 1 |
| Span of Control: one officer | 9,743 | 9,743 | 2 → 1 |
| Load Settings: steady one cell | 863 | 863 | 2 → 1 |
| Offload: one rate | 508 | 508 | 2 → 1 |
| HR Terms: one option | 457 | 457 | 2 → 1 |
| Duplicate save confirmation | 7 | 7 | 0 → 0 |
| Receipt confirmation | 6 | 6 | 0 → 0 |

The ability, name set, teacher note, exclusion and reporting read counts do not increase with unrelated IP assignment count. Class rename and teacher profile changes still read assignments because validation or reference updates require them.

Each measured scoped save used one Sheets API batch write and at most four explicit durable or structural flushes. In this fixture, the first v0.5.05 ability save also normalized unrelated teacher records, causing 10 API write requests and 11,041 written cells. The scoped v0.5.06 ability save writes 70 cells in one API write. These normalization savings depend on the starting document's shape and are not a claim that every production save previously issued 10 requests.

The comparison's 14-event audit list read 86 total cells before and 58 after, including its two index cells. The separate 40-event regression verifies the full-page 240 to 160 summary-cell reduction, zero full-history reads, lazy detail loading, Admin enforcement and rejection of a pending concurrent write.

## Verification

New regression scripts:

1. `tests/release506-storage.cjs` verifies unrelated-field preservation, class-reference updates, assignment guards, historical Contacts term reuse, invalid new term rejection, legacy partial teacher profile preservation, profile-based exclusion eligibility and old projection fallback.
2. `tests/release506-performance.cjs` enforces read-cell bounds, one Sheets API read and write per measured scoped save, simple-edit independence from unrelated assignments and four-column audit summaries.
3. `tests/audit-read-path.cjs` verifies the reduced summary range while preserving consistency and access checks.

Existing 504 and 505 storage, relief storage, recovery, class validation and Contacts publication checks also passed against canonical modules before release generation. The release's full-suite result is recorded separately by the release build.

Reproduce current counts with `node scripts/measure506.cjs`. To compare against the repository's existing v0.5.05 tag, set `GSIS_MEASURE_BASELINE=1`. Use `GSIS_MEASURE_OUTPUT` to choose the JSON result path. The script loads canonical modules in memory and does not rewrite generated application files.

Evidence: `verification/506-deploy-before.json` and `verification/506-deploy-after.json`. Both record their source hashes, exact requested ranges and request counters. Metadata method calls are counted as method calls, not asserted to be separate remote round trips.

## Limits

These are synthetic I/O counts, not production latency measurements. The fixture excludes Apps Script startup, network latency, the live Contacts authority callback, concurrent users and browser rendering. The reports of slow production saves therefore cannot be declared resolved by these numbers alone.

Live authorization remains mandatory. Cold audit loads still require that authority check and a backend execution. Span of Control still reads the staff snapshot, teacher state and reporting graph needed to validate reporting officers and cycles. Existing versions that lack the root projection indexes may pay a one-time broader read before reaching the steady-state counts above.

The existing request timing instrumentation can separate Contacts bridge time, lock wait, validation, persistence and serialization when the new frontend and backend are installed. A production timing comparison should confirm both installed versions before attributing a remaining delay to v0.5.06.
