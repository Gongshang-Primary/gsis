# GSiS v0.7.04 performance checks

This release reduces repeated reads and work inside the shared save lock. It does not claim a measured production response-time improvement.

| Scenario | v0.7.04 behavior | Evidence and limit |
| --- | --- | --- |
| Idle Roster Home | No Report Absence request | Browser intent test |
| Point to, focus, press, then open Report Absence | One shared pending request | Browser test exercises real pointer and focus events |
| Reopen a fresh Report Absence view | No new request for 60 seconds from completion | The original verification time is retained |
| Initial Own Arrangements save | Save and candidate projection share context | One operational read, one register read, one model read and one durable commit in the fixture |
| Optional Own Arrangements quota | One read after the save lock is released | Failure leaves the saved absence intact |
| Loaded same-date absence details | View and Edit open without another request | Complete snapshots only; missing data still loads |
| Save response | Projection after unlocking | Authority, revision and durable commit remain protected |
| Subject Type edit | Read and write the affected setting through the existing draft system | No full deployment rewrite is introduced |

The v0.7.03 timetable cache remains. It holds up to eight immutable models and shared name indexes in browser memory. Date and Calendar context expire separately after 60 seconds. Logout and account changes clear cached staff data. Staff timetable data is not persisted in browser storage.

Colleague period selection, target selection and filtering reuse loaded rows. The final submission still checks current server availability. Multi-date operations still use Calendar's batched `rosterDates` action. The existing 12-second Calendar and 25-second Deploy deadlines remain.

Reduced-motion progress uses an opacity pulse. Normal progress rotates. The browser checks verify running animation and changed computed styles. These checks establish visible feedback, not a shorter network request.

`verification/704-review.md` and `verification/704-subject-types-review.md` record the source-draft evidence. Final integrated results are in `VALIDATION.md` and `RELEASE_SUMMARY.json`. Cold identity and school-service checks still depend on Google services. Live timings and matching diagnostic logs are needed to assess production latency and intermittent failures.
