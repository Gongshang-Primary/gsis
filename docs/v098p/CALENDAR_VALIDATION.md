# Calendar P validation

The Calendar runtime was frozen after the checkpoint-recovery review fixes. The following local programs passed against that runtime, using `TZ=Asia/Singapore`.

| Program | Result |
| --- | --- |
| `node tests/calendar098p-throughput-checkpoints.cjs` | 11/11 |
| `node tests/calendar093-provider-cooldown.cjs` | 13/13 |
| `node tests/calendar089-sync-concurrency.cjs` | 9/9 |
| `node tests/calendar098o-sync-isolation.cjs` | 9/9 |
| `node tests/calendar/backend_tests.cjs` | 38/38 |
| `node tests/calendar/sheets_api_tests.cjs` | 63/63 |
| `node tests/calendar098l-native-storage.cjs` | 9/9 |
| `node tests/calendar098j-source-reads.cjs` | Pass |
| `node tests/calendar608-publish.cjs` | 15/15 |
| `node tests/calendar093-cooldown-ui.cjs` | Pass |
| `node tests/calendar098o-sync-ui.cjs` | Pass |
| `node tests/calendar-jobs/source-retry-ui.cjs` | Pass |

Four additional independent recovery programs pass under `verification/v098p/review/`: interrupted source acknowledgement, unknown checkpoint schema, year-publication fence during recovery, and saved source-read cooldown during recovery. See `CALENDAR_CHECKPOINT_REVIEW.md` there for the defects reproduced before their fixes. The separate suite review may supply additional evidence.

The first targeted run reproduced the unnecessary healthy delay and the Properties value-size failure. The previous successful-sync cooldown expectation failed after the change because it explicitly required the retired 60-second delay; that one expectation now requires one second. Actual quota escalation tests retain their original deadlines.

Review exposed and corrected further recovery defects before the freeze: an acknowledged source row could precede its durable outcome checkpoint; unsupported checkpoint schemas could look like legacy state; nested settlement could skip a year-publication fence; and settlement recovery could ignore a source-read deadline. A real gzip/blob/base64 implementation was added to the shared Node harness when the capacity reserve began exercising compression in ordinary sync fixtures.

The 505-event throughput test follows the backend's actual returned wait deadlines. It does not advance a mock clock by an arbitrary minute after healthy batches. Its benchmark records 101 batches, 100,000 milliseconds of deliberate healthy waiting, and 302,500 milliseconds of simulated total time including one incremental update. This excludes real Google/network/startup latency.

The 500-Unicode-error test exercises real checkpoint encoding, cold decoding and final history persistence; the 125-event mixed test exercises the complete batch flow with 17 validation errors, a lost provider response and a rate limit. The independent suite reviewer also exercised 405 actual fixture provider outcomes: 400 validation failures plus five creates, interrupted final-detail acknowledgement, then cold recovery with exact failure identities and digest and no provider replay. Failure details are not synthetic success receipts, and no real Calendar events were written.

This file reports focused Calendar validation. It does not claim the full suite passed, that production has been deployed, or that a live school-year sync has completed. Root release validation records the broader suite result separately.
