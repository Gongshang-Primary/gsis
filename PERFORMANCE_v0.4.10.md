# GSiS v0.4.10 performance and write scope

Measured here means local call/read counts or simulated behavior, not production latency.

| Path | Change and verified boundary |
| --- | --- |
| Warm Contacts directory | Three source tables on a cold fixture build; only current access records on the next cached request. Roles are always fresh, including revocation. |
| Deploy sign-in | Uses eligible 30-second shared staff data. Explicit Refresh still requests current Contacts data. |
| Large cached data | UTF-8-safe bounded chunks and publish-last manifest; eviction, corruption and cache failure rebuild from Sheets. No role/permission cache. |
| Published teaching information | Contacts → Deploy, without the previous Deploy → Contacts callback: two backend executions rather than three. |
| Audit summaries | 40 rows × 6 columns, no canonical event-body read; two index checks rather than three. Details remain lazy and are reused across rerenders. |
| Deploy save acknowledgement | Protocol 410 acknowledgements apply their field delta without an unnecessary full-version reload. |
| Contacts save | Existing-row writes target dirty cell ranges and derived changes on affected rows. One-time whole-sheet backup moves to explicit upgrade preparation. |
| Late save response | Simulated 40-second acknowledgement is accepted without a second write. A failed acknowledgement triggers bounded receipt checks and retains immutable retry identity. Longer deadlines are resilience, not speed improvements. |
| Concurrent users | Fresh permission reads are independent of unrelated Contacts pending-data recovery. Script-wide write locks, atomic markers and per-field conflict handling remain. Real throughput/user capacity is unmeasured. |

Audit no longer uses nested fixed-height vertical scroll regions. Contacts Sys Admin keeps its single bounded scroll owner. SMC wording is display-only. Workload/geometry remain unchanged.

Remaining performance work needs live timing: cold Apps Script startup, shared writer-lock duration, full-data pending recovery and the full version snapshot read. Initial version loading still reads canonical history before omitting Audit from the response; shortening that read requires preserving conflict notices and other dependencies. Reference 8c201d4b still needs its corresponding gateway log and complete error message.
