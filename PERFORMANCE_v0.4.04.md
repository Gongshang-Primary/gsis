# GSiS v0.4.04 — save and write review

The review covered the current Deploy, Contacts and Layout write routes, their read dependencies, receipt/retry paths, publication bridges and refresh behavior. The previous single-cell-write checks missed a read-call cost that increased with retained save receipts.

## Measured improvement

Actual backend functions ran against an in-memory Sheets fixture with 159 synthetic teachers. A one-cell PLT member change was saved repeatedly. These are spreadsheet value-operation counts, not Google or network timings. TextFinder lookups and sheet metadata calls are distinct from these data-read counts.

| Earlier PLT saves | v0.4.03 data-read calls | v0.4.04 data-read calls | v0.4.04 cells read | Changed business fields |
| ---: | ---: | ---: | ---: | ---: |
| 0 | 7 | 5 | 10,474 | 1 |
| 10 | 16 | 5 | 10,483 | 1 |
| 100 | 106 | 5 | 10,483 | 1 |
| 1,000 | Not measured | 5 | 10,492 | 1 |

After history exists, a new save also makes one server-side exact receipt search. Search execution cost is not claimed to be independent of sheet size. Editing reads the current business dependencies and audit-order metadata; it does not read historical audit details or receipt payloads. The field-author map grows with distinct edited fields. This is not a claim that a one-cell edit reads only one cell.

The compact projection adds targeted index writes. At 100 prior PLT saves, this fixture uses 12 value-write calls and 56 physical cells, versus 8 calls and 70 cells in the earlier fixture. Only one business field changes. Audit, author, receipt, directory and transaction metadata account for the rest. Four flush barriers remain to protect recovery. The optimization trades a few small writes for removing many scattered reads.

A normal save now avoids the initial receipt lookup round trip and can include its authorized delta in the acknowledgement. In the exact-baseline case this reduces the normal browser sequence from receipt → change → delta to **one change request**. Stale baselines, role changes and uncertain acknowledgements retain safe fallback paths.

## Other representative paths

After 1,001 PLT saves:

| Operation | Spreadsheet data-read calls | Cells read | Result |
| --- | ---: | ---: | --- |
| IP add teacher | 5 | 10,492 | Confirmed save with inline delta |
| IP unassign one class | 5 | 10,522 | Only its venue and associated assignments change |
| IP remove teacher assignment | 5 | 10,531 | Teacher record retained |
| Save version note | 8 | 25 | Note, audit and receipt only; unrelated data preserved |
| Audit page | 4 | 243 | At most 40 event summaries |
| Audit detail | 5 | 43 | One selected PLT event; details load on expansion |

Audit detail size depends on the selected event. A historic bulk event may contain substantial detail. Initial access to an unupgraded version retains the legacy compatibility read; `preparePerformance404` builds the indexes before reopening editing.

Contacts checks with 1,000 historical journal rows:

- Ten steady-state readiness checks performed **zero journal range reads** when no recovery was pending.
- A receipt lookup used one exact server-side search and one five-cell row read.
- An identical catalogue-publication retry returned its receipt without writing another journal or rebuilding the projection. A changed payload at the same revision was rejected.

## Write-path inventory

| Path | Dependency / persistence behavior in this release |
| --- | --- |
| PLT, Dept, Committee, CCA, Events, Duty, Membership and HR choices | Field patches with expected-value checks; compact editable dependency index; fresh actor authority; dirty canonical and projection cells plus transactional metadata |
| IP assignments and class/TG venue moves | Same optimized draft path; stable class/TG identities; preserves siblings; no teacher record deletion |
| Subject Load, class definitions, ability, exclusions, teacher profiles/notes, Offload and fortnight splits | Same indexed read and dirty-field persistence; profile changes still obtain necessary live Contacts data; eligibility checks retained |
| Version note | Small root/note/audit-order projection reads, independent receipt, no full Contacts payload or full version refresh |
| Rename/dates and legacy cell saves | Indexed editable reads; changed fields and compact audit; inline delta where the baseline matches |
| New/duplicate version | Full source read and new version creation are intentional; creation receipt prevents duplicates; no source overwrite |
| Publish | Full reviewed frozen snapshot and journaled Contacts projection are intentional; publication does not become automatic on draft Save |
| Delete version / purge Audit | Admin authorization and scope guards retained; legacy cleanup reads the published pointer once and clears contiguous matching runs |
| Layout unit rename | Durable cross-sheet intent retained; only changed register fields are written; conflict/recovery checks retained |
| Contacts Edit Info / DIY | Whole-directory validation where uniqueness/derived values require it; only changed row runs are written; exact journal lookup and bounded pending marker |
| Contacts KP access | Fresh Admin/row-version checks and changed access cells; browser updates the confirmed access row without reloading the directory |
| Contacts recalculation / formula conversion | Explicit broad maintenance operation; derived cells remain dirty-only and contiguous formula cells are batched; sheets without formulas skip the value read |
| Contacts catalogue publication | Stable physical rows, changed runs, durable replay; identical committed revision/digest is a no-write retry |
| Recovery / upgrade / rollback | Intentionally broader, explicit maintenance paths; interrupted canonical, projection and receipt writes recover from one durable transaction; rollback exports modern receipts into the legacy document |

## Diagnostics and verification

Both backends return release identity, request correlation and numeric phase timings on success and failure. Deploy measures Contacts, lock wait, read, validation, journal, persistence/application, flush and delta work; serialization and total time are reported. Contacts measures recovery, lock wait, read, validation, journal, write and flush work. Phases may nest, so do not add them to calculate total time. Browser diagnostics include request duration, read-attempt number and rendering duration. Diagnostic logs omit staff values and submitted payloads.

Regression coverage includes partial-write recovery, same-ID retry, changed-payload rejection, stale patches, independent edits, role revocation, old receipts, audit pagination/detail/purge, publication isolation, one-time upgrade and rollback receipt export. Full raw counts are in `verification/performance404.json` and `verification/contacts-performance404.json`; reproduction is `node scripts/measure404.cjs`.

The reported live waits (>60 seconds Audit, >14 seconds PLT and >10 seconds IP) were not independently retimed. Install both backends and all three frontends, then use the returned phase timings to measure the school's actual service latency. No live software installation or production mutation was performed for this release.

The exact-lookup API follows Google's [TextFinder documentation](https://developers.google.com/apps-script/reference/spreadsheet/text-finder).
