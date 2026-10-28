# v0.8.2 performance evidence

These measurements use synthetic local fixtures. They establish work reduction and tested recovery/concurrency behaviour, not production Google latency or peak school throughput.

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

## Responsiveness and remaining costs

The two visible Main Timetable sections reuse the already-loaded baseline and published-day projection; switching their shared selectors does not fetch a private draft or add a backend query.

Assign Relief and Stapler edit local memory immediately. Explicit Save to online submits a stable snapshot; local XLSX uses already-loaded data. Local recovery consumes browser storage and can retain separate tab copies. Storage failure is visible and requires keeping the tab open. Browser data and current permissions are still rechecked before shared changes.

The operations backend still persists one authoritative document. The short commit lock, fresh authority/dependency checks, Drive I/O and provider startup remain. Three-way merging prevents unrelated human edits from unnecessarily conflicting, but it is not database sharding and cannot guarantee a fixed morning throughput.

Daily audit transfer runs outside the planner writer lock. Exporters serialize on a separate lock, merge with durable dated evidence and confirm a watermark afterward. Failed exports remain pending without turning an accepted allocation into a failed save.

Audit facts are compressed/lazily decoded in the hot store and archived before eligible past facts are reclaimed. Seven-day private-link retention is independent of audit retention. No benchmark here justifies weakening authorization, silently overwriting a concurrent human choice or suppressing real save errors.
