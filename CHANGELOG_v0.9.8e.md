# GSiS v0.9.8e

From v0.9.8d, no migration.

* Add completed-history delete and clear controls scoped to account and browser. Preserve server evidence and redisplay changed or reopened receipts.
* Enable SMC receipt review and withdrawal directly on Report Absence and Manage reported absences. Existing own-report visibility remains.
* Add safe failure codes, original-report retries and sequential selected retries. Keep explicit shorter-coverage choices and existing server validation.
* Add Apply reviewed report to the saved-coverage comparison. It requests processing of the original receipt, rather than forcing a save or changing report details. Check status distinguishes received, processing and saved.
* Add a close control and inline recovery to pending messages. Allocation uncertainty uses amber. Completed-run reconciliation requires the same manual request identity and refreshes saved records.
* Receipts can finish attendance without expired note/proposal dispatch, including past parts of mixed-date reports. Original text and proposals remain evidence. Current and future dates keep normal checks.

Only Roster frontend and backend change. Worker and LORD remain v0.9.8d.
