# GSiS v0.7.03 performance checks

The browser keeps full immutable staff timetable models and their shared teacher, class and teaching-group indexes in memory. Up to eight models survive date changes. Warm name selection and timetable display use those models locally. Logout and owner changes clear them. Date and Calendar context expire separately after 60 seconds. Staff timetable data is not persisted in browser storage.

## Measured local changes

| Scenario | Previous behavior | v0.7.03 result |
| --- | --- | --- |
| Dates using models B/A/B/A | Four full model downloads | Two full models, then metadata-only contexts |
| Mutual candidates, 150 staff and 13 periods | 559,624-byte fixture | 199,342 bytes, about 64 percent smaller |
| Colleague matrix filters and warmed selection | Repeated rendering or per-period reads | Reuse existing rows and verified batch, no selection/filter request |
| Deploy ordering, 1,500 assignments | 38,801 class-list scans | One index build, identical stable order and objects |
| Cold Calendar bootstrap | Six data requests | Three, same 279 cells and zero writes |
| Calendar bootstrap with unavailable cache | Seven data requests | Three, same scope |
| Warm Calendar bootstrap | Three requests | Three requests |

A Chromium fixture with 150 staff and 17 periods measured about 21 ms of synchronous cold matrix work and 60 ms through the next frame. Warm opening was about 26 ms and 66 ms through the next frame. Filter handlers stayed at or below 0.6 ms. Restoring all rows took about 35 ms including layout. Period handlers stayed below 6.1 ms and target handlers below 0.4 ms. The final versioned run, concurrent with Node regression checks, measured about 129 ms to the cold frame and 94 ms to the warm frame. Its filter handler stayed at or below 0.3 ms, and clearing the filter took about 101 ms through the next frame. Both runs reused the warmed data without further selection requests. These are local synthetic measurements, not production response guarantees.

Multiple Calendar dates now share one request for up to 62 dates. The Worker keeps the 12-second Calendar and 25-second Deploy deadlines. It does not extend timeouts or fall back to 62 sequential calls. Display-only entry reads skip unused quota work. Normal Roster reads no longer write diagnostics at each intermediate phase; terminal and failure metadata remain available.

Contacts filters retain their input nodes. Concurrent Calendar bootstrap reads share one promise. Layout's existing coalesced public reads and local filters remain in place. These changes avoid redundant work without changing server authority or the existing mutation recovery protocol.

Evidence is recorded in verification/703-suite-review.md, verification/703-calendar-layout-review.md and verification/703-final-release-review.md, verification/703-mutual-browser-metrics.json and the matching 703-browser logs. The integrated source gate passed 277 Node scripts and five Chromium checks. Final release results are in RELEASE_SUMMARY.json and VALIDATION.md. A first uncached authority check still depends on school services. The reported intermittent live startup failure is not resolved by these local timings.
