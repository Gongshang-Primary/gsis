# Calendar sync repair validation

Local checks run on 28 October 2026, with `TZ=Asia/Singapore` as used by the repository test runner. All listed commands exited successfully.

| Command after `TZ=Asia/Singapore` | Result |
| --- | --- |
| `node tests/calendar098o-sync-isolation.cjs` | 9/9: preflight; exact unknown-receipt/source preservation; per-event isolation; final provider-write guard; honest writes/errors; later explicit retry; YEAR fence. |
| `node tests/calendar098o-sync-ui.cjs` | Pass: partial/error completion messages and exact counts; completed processing stops the loop. |
| `node tests/calendar093-cooldown-ui.cjs` | Pass: sync/wipe deadlines, Singapore time, counts and manual-review stop. |
| `node tests/calendar098l-native-storage.cjs` | 9/9. |
| `node tests/calendar089-sync-concurrency.cjs` | 9/9. |
| `node tests/calendar093-provider-cooldown.cjs` | All checks pass. |
| `node tests/calendar/backend_tests.cjs` | 38/38. |
| `node tests/calendar/sheets_api_tests.cjs` | 63/63. |
| `node tests/calendar098j-source-reads.cjs` | Pass: full-year and incremental sync, interrupted native source read, persisted source deadlines and recovery. |
| `node tests/calendar-jobs/source-retry-ui.cjs` | Pass: bounded source retry and cancellation. |

The new isolation regression was observed failing before the repair (7 failures, one existing control passed). Additional regressions first reproduced a blocker arising during provider lookup and the incorrect provider-duplicate probe for a source blocker; both now pass. A review also checked receipt preservation, partial-result semantics and year-wide fences. `git diff --check` passes for the two runtime files.

These are local tests with simulated Calendar and Sheets services. No live Calendar provider writes or production deployment were performed by this validation. The separate live sheet repair verified only the appended AE `VenueID` header and unchanged event cells. The two original unconfirmed save operations are retained and unresolved.

The complete repository suite was not run as part of this focused Calendar validation. The production code's existing Monday diagnostic assumes the school timezone; running its harness under the container's UTC timezone produces an unrelated Monday self-test failure. The same core and Sheets programs pass under the repository runner's Singapore timezone.
