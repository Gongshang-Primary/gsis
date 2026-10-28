# Calendar sync repair

The optional Calendar patch checks its source schema before contacting Google Calendar and lets unrelated events sync when an earlier save has an unconfirmed outcome. Google Sheets remains Calendar's source. This patch does not change Roster authority, enable the Advanced Sheets service, or migrate Calendar storage.

## What was found and repaired in the live sheet

The connected `GSPS-CoE` workbook's `Events` header ended at column AD, `LastMutationID`. Column AE, `VenueID`, was missing. The existing Calendar code requires both headers when reading or reserving a Calendar link. Without `VenueID`, each attempted record could fail with `UPGRADE_REQUIRED` before its provider write.

The missing AE header was appended after preserving the existing sheet contents. The header and unchanged event cells were then checked. No event values, publication choices, Calendar events or unknown receipts were changed by that repair. The earlier session's 30 errors remain recorded; repairing a header does not erase a failed run's history.

Two earlier `saveEvent` operations still have `DISPATCHED` receipts without a recorded result or error. Their exact references are:

| Operation | Event | Observation at inspection |
| --- | --- | --- |
| `9db06ad7-320e-45d5-b1f0-0ecd44842ea0` | `EVT-cf944212-4a4f-4b34-adc4-40d31ca7de90` | Existing source event has a different, earlier mutation marker. |
| `4e49bd29-dea7-422e-9467-bd5c95c6ec7f` | `EVT-d0034715-55ae-443b-b480-0c79ac0ff74f` | No matching source event was found. |

These observations do not prove whether the original proposals were applied. Both receipts remain unchanged. No year-wide pending-publication marker was present at inspection.

## What the code patch changes

- A missing required header stops the request once, before claiming a batch or contacting Google Calendar. An existing source-read cooldown is still respected before reading the schema.
- An unresolved event save excludes only that source event. Other eligible events can continue. The event is checked again immediately before a provider mutation, after lookup and pacing. Its pending source state and original receipt are preserved.
- A year-wide unresolved publication continues to stop the whole sync. Publication protection is not weakened.
- A session ends when it has processed all currently actionable records. If blocked records remain, its result is `completed: true`, `fullySynced: false`, `completionState: "blocked"`; `remaining` and `blockedCount` identify the outstanding blocked records. Here, completed means the processing pass ended, not that the whole year synced.
- Actual errors retain their event references and counts in that run and its existing SyncLog. Failed records are not retried automatically in the same run. A later explicit Sync click starts a fresh run and can retry still-pending errors. Already-synced records retain their existing provider identities.
- The screen distinguishes blocked records, errors and successful writes. A partial run does not say the whole year is complete or that nothing is pending.

## Applying and checking the optional Calendar patch

1. Install the Calendar backend and Calendar frontend from the matching revision package using the existing deployment process. Keep their versions matched. The source files changed for this repair are `calendar-backend/Code.gs` and `calendar-update/public/app.js`; the release package also carries its normal version labels.
2. Reload Calendar and select the intended year. Click **Sync Staff** once.
3. If an earlier session resumes, let it finish processing the eligible records. Its previous 30 errors remain visible in that session. The affected unconfirmed event can remain blocked.
4. After that pass ends, click **Sync Staff** again explicitly to retry the earlier failed records. Check the reported writes, errors and blocked count. A blocked count is outstanding work, not successful sync.
5. Investigate the two original save proposals separately using their references. Do not delete their journal rows, mark them successful, or resubmit their proposals under new identities merely to clear the warning. Their outcomes require evidence from the original operation and intended event content.

`inspectCalendarSyncSession()` and `inspectCalendarOperationSessions()` are existing read-only Apps Script diagnostics for the saved sync session. They do not settle unknown event saves or write provider events.

## Verification and limits

Local regressions exercise missing-header preflight, existing and newly appearing event blockers, a blocker arising during provider lookup, source acknowledgement after a provider write, retained errors and later explicit retry, year-wide fences, and the bounded partial-result screen. Native storage, concurrent edits and source/provider cooldown checks are also run.

The live header repair was verified against the sheet. The code patch has not itself been deployed or used here to write live Google Calendar events; local test results do not establish live provider delivery. The two unknown save outcomes remain unresolved.
