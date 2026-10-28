# v0.7.17 performance evidence

Baseline: v0.7.16, commit 60f7a92fe8b2e4604c8136ff000ae531e9c52ff6. These are local comparisons of the actual code using controlled service adapters. School-service latency was not measured.

| Operation | Before | After |
| --- | --- | --- |
| Open an existing saved Stapler plan | 1 quota retrieval, 104 teaching-profile builds and 1 class-catalogue build in the school-sized fixture | None of those three operations; current timetable register/model and Calendar checks remain |
| Accept an Inbox reply, assignment or handled-state update | Mutation followed by another thread request | Mutation returns the current authorised thread snapshot; one request |
| Inbox duty state for a caller with no retained alert targeting them | Operations document read | No unused duty-state read; relevant duty alerts still read current state |
| Calculations, cold or returning | 3 Deploy index reads | 2 index reads, retaining the confirmed-source guard |
| Detailed personal calculation projection, 100-teacher fixture | 100 teacher projections followed by filtering | 1 teacher projection |

The Inbox comparison used a fixed synthetic 80 ms delay per API call. Reply acknowledgement was approximately 285 ms before and 150 ms after. A 5,000-thread/150-person list reduced phone lookups from 757,500 to 7,500 by avoiding unused name resolution while counting alerts. These measurements do not establish live response times.

The Calculations server comparison used 100 teachers, 3,000 history rows and a fixed synthetic 10 ms delay per remote read. Seven cold/returning pairs produced medians of 61.58 to 50.33 ms cold and 57.97 to 43.92 ms returning. Current relief history is still read on every open. Browser request count remains one, with no Calendar request and no Calculations request during login.

The Stapler local reopen timer was variable and did not establish an elapsed-time improvement. The deterministic benefit is removal of the unrelated quota-service dependency and school-wide reconstruction. The current baseline model is still read; this change does not claim to reduce that Drive read.

The gzip adapter comparison reproduces a failure when an untyped Blob is rejected by the host and verifies that typed gzip metadata opens the same retained bytes. It is not a live Apps Script execution or proof of the production cause. The existing 21 October draft must be checked after deployment.

Detailed evidence is included in the verification archive: 717-inbox-performance.md/json, 717-calculations-performance.md/json and 717-stapler-investigation.md with 717-stapler-reopen.json. Gateway errors now distinguish timeouts and carry safe failure stage, deployed backend version and request reference when available. Server-Timing retains the Calendar/backend split for failed operations as well as successful ones.

After deployment, compare first and returning opens, Inbox list/search/thread/reply acknowledgement, and saved planner opens separately. Inspect the named backend phases before choosing further changes. No numerical production latency target or universal speedup is claimed.
