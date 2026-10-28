# Roster morning operations UI review

Date: 24 October 2026, Singapore. Prepared source only. No release commit, deployment or staff message.

## Source trace

`roster-update/public/roster-operations-ui.js` already keeps Report Absence progress inline, avoids its generic modal progress, preloads report records, validates current records at the backend, and retries saved absences through receiptStatus. Manual relief choices are projected locally and sent only through Save to online as a surgical reliefBatch. Existing comparison offers original/local/current decisions and retains uncertain request payloads.

Assign Relief previously checked allocationVersion every 20 seconds (60 seconds after read failure), but skipped checks while typing, while a modal was open, and during writes. It had no shared allocator-run log or cancellation controls. Manual auto-allocation's dated task already suppresses the generic progress modal, but still makes this window's editing body inert until its command settles. This protection is retained and explained in the run panel. Scheduled runs from elsewhere do not make the current editor inert.

## Implemented UI

A nonmodal allocator panel lives outside the replaced/inert operations body. Manual Auto-allocate opens it expanded immediately. The panel consumes server run states, actor/trigger, and timestamped log entries. Minimise/Show log remains usable during an unresolved request. Status updates preserve focus and log position. No estimated percentage or fabricated progress is shown.

The panel's Cancel run sends cancelAllocationRun with date, runId and a stable requestId. A lost response retains that exact cancellation command. A successor run resets the old run’s cancellation spinner and request; a late cancellation response cannot disable the successor’s controls or attach old-run feedback to it. Accepted means cancellation was requested before commit, not that saved allocations were undone. A too-late result only says allocations were saved when the returned state is completed; committing/uncertain states say save confirmation remains pending. Record conflicts stop the run and direct attention to its log/current records rather than falsely reporting successful allocation.

Polling stays at 20 seconds while idle, with a 60-second error backoff. A known active run uses a five-second timer; these extra polls set statusOnly and use the backend property-only route. Full allocation version checks remain no more frequent than the existing 20-second interval. Typing/open dialogs receive status updates without a full record redraw. A completed run can trigger one normal version check when the editor can safely refresh.

Automatic allocation commands are persisted before their first send, scoped by user and immutable request ID. A storage failure blocks dispatch. Existing same-date requests from another tab are not overwritten; simultaneous records use separate keys, and successful cleanup removes only the matching request. Assign Relief restores retained date/command after a UI reload. ALLOCATION_IN_PROGRESS and ALLOCATION_UNCONFIRMED leave the original command pending. Authority, actual completion and cancellation boundaries remain server decisions.

Manual relief commands retain the server cell-provenance token from the first local edit. This detects changes that return the visible allocation to its old value (A to B to A). Comparison names the latest editor/time and requires an explicit choice. Replace with my choice and Keep latest send a fresh expected provenance token and auditable resolution. Keep latest leaves the current cell visible while awaiting its audit receipt. Surgical acknowledgements merge returned cellStates and cellProvenance rather than keeping old tokens.

## Verification

- `tests/roster0812-allocation-monitor-browser.cjs`: PASS in Chromium. A held Auto-allocate promise permits Minimise/Expand and Cancel; no generic progress dialog blocks controls. Lost cancellation response retries an identical command. A held cancellation response for run A arriving after run B is observed leaves run B cancellable with its own feedback. Active polling is statusOnly. A scheduled run displays while an input retains focus with no full records read. Reloading the UI module with native localStorage restores the pending original command; both lifecycle 409 codes keep its ID. Full storage prevents a new dispatch, and an existing other-tab command remains intact.
- `tests/roster-draft-auto-retry-browser.cjs`: PASS. Existing exact allocation replay, manual ownership, lost acknowledgement, no duplicate allocation, no implicit publication or WhatsApp remain protected.
- `tests/roster0811-conflict-save.cjs`: PASS. Updated fixture attaches real domain provenance like the backend; A/B/A changes require an explicit choice and show the current editor. A further online change forces another comparison. Keep latest submits its compact audit choice instead of silently discarding the record of the decision.

## Limits

Tests use synthetic staff and deterministic APIs/domain operations, not a live morning load test with 30 users. Backend cancellation/commit and error-envelope tests are covered by the backend/root owners. No production latency reduction is claimed. Report Absence's existing inline progress/read/save flow was traced but not redesigned. Generic durable pending storage for other operations is outside this bounded auto-allocation change. Extra same-cell edits queued while an earlier manual save is still in flight may require conservative comparison against the newly accepted token; they are not silently overwritten.
