# calendar-pending-write-autoclear: one unknown-outcome save blocks Publish and Sync for the whole year (v0.9 HOTFIX)

- Status: implemented; awaiting exact-head review (v0.9 hotfix; owner 25 Nov: "wish for v0.9 hotfix", after the 20 Nov freeze)
- Branch: `codex/calendar-pending-write-autoclear` from `07b4ead55668459a49815794ae527255662134d5`.
- Owner/model: Codex. Reviewer: Claude. Mirror in v1 Calendar afterwards.

## Evidence (Claude, read of GSPS-CoE via Drive, 25 Nov ~16:05 SGT)
- Owner sees "An earlier save or publication still has an unknown outcome…" (`PENDING_EVENT_WRITE`, calendar-backend/Code.gs:9619).
- MutationLog has exactly one `DISPATCHED` row: aa28ec26-0d0d-4b3d-8c43-4cfc7b9c84fb, chow.yoke.yeong, saveEvent, EVT-bc0ee00c-0a45-4a63-ba0d-879f0ee92f7c, 15:45:14. There is no Events row and no AuditLog entry for that event or request, so the save never applied.
- `rc18AssertNoPendingEvent_(..., anyEvent=true)` (Code.gs:1770, Publish version) and the per-event check inside sync (Code.gs:7211-7212) block on **any** `DISPATCHED` row. A stale row becomes `FAILED` only lazily, after `CALENDAR_STALE_DISPATCH_MS` = 1 hour, and only when its outcome is looked up (Code.gs:9320-9356). So one colleague's dropped save blocks Publish for everyone, for at least an hour, and longer if nobody looks it up.
- Context: 2027 has 400 live events, 362 not yet on the staff calendar. The 14:57 sync stopped after about 65 events; several users were editing at the same time.

## Required behaviour
1. **Self-heal stale rows in the check.** In `rc18AssertNoPendingEvent_` (and in `rc18PendingEventWrites_` users at Code.gs:6846, 6936, 6994), a `DISPATCHED` row older than the stale threshold is failed in place with the existing `failStaleMutation_` (audit `STALE_DISPATCH`, user told to redo), not treated as blocking.
2. **Shorter threshold.** Apps Script stops any execution at 6 minutes, so a dispatched write cannot land later than that plus lock wait. Set `CALENDAR_STALE_DISPATCH_MS` to 10 minutes, and state the reasoning in code.
3. **Fresh rows (under 10 minutes):** the error names who and which event, and when it clears: "Waiting for Chow Yoke Yeong's save to EVT… (15:45) to settle; this clears by 15:55. Try again then."
4. **Sync does not stop on a blocked event.** The batch skips an event blocked by another user's pending write, counts it in `blockedCount`, and continues with the rest. It does not abort the whole run.
5. **Tests:** a stale `DISPATCHED` row no longer blocks Publish and is marked `FAILED` with an audit; a fresh row blocks with the named message; sync skips a blocked event and completes the others; a row whose write did land (event row matches) is resolved `COMMITTED`, not `FAILED`.

## Out of scope
Sync speed and batch size, the change-push worker, and live sheet edits. Release as a v0.9 Calendar-only hotfix: Calendar backend plus Calendar Pages if the message changes.

## Implementation and handoff (25 Nov)

Publish and sync check pending receipts under the Calendar writer lock. A matching event mutation marker repairs the receipt to COMMITTED. After ten minutes a dropped event save fails with one STALE_DISPATCH audit and the original editor can redo it. A fresh event save identifies the editor, event and Singapore retry time. Ambiguous year publications retain their existing fence. Sync counts a blocked event and processes eligible neighbours.

The synthetic baseline reproduced three failures: Publish stayed blocked at ten minutes, the error omitted the editor and deadline, and sync skipped an expired save. The matching-event recovery check already passed. After the fix all 15 stale dispatch tests, 10 sync isolation tests, 15 publication tests and 63 native Sheets tests passed. The current-session recovery fixture now creates its fresh pending receipt using the harness clock.

The existing Pages client displays the pending-save message. See the expanded deployment inventory below. No live sheet, setting, provider call or deployment was used to verify this change.

Claude reviews the exact v0.9 PR head. The v1 Calendar mirror follows that review.

## Owner addition, 25 Nov: identify who committed the event

Saved event cards in Events and Weekly show their original creator. The event and parent-side edit forms also show the last event editor. Apps Script authenticates the read and verifies the current event's mutation ID against its receipt. This avoids naming the person who published the year as the author of an earlier event edit. Older events without evidence show “Not recorded”. Birthday source markers are displayed as “Contacts birthday import”. Queued proposals and new forms do not assert a creator.

For this expanded hotfix the owner deployment files are `Calendar_Backend_v0.9.9.gs` and `Calendar_Frontend_v0.9.9.zip` (includes the Pages Worker). Update the backend first, then Calendar Pages. Rollback uses the previous versions of both. The v1 web build inherits the event attribution UI and requires an explicit `LastEventEditor` from v1. Its existing `saveParentSide` writes the timestamp without updating the actor. Verify the actual receipt for historical records and correct that path in the mirror after Claude reviews this head.

The v1 web builder strips the Sheets-only attribution lookup and the operation inventory pins follow the same two Calendar runtime calls at their new lines. The local browser/Worker probe exercised 407 operations with zero missing handlers. An isolated D1 probe reproduced the v1 parent-edit attribution issue and confirmed an unrelated prepared save does not block year publication.

CI run 45575849449 also exposed a pre-existing Venues browser fixture issue at main 07b4ead5: its selected workday is 30 Nov and the 30-day coverage requested by the browser ends 30 Dec, while the fixture ends 28 Dec. The same test timed out on untouched main. A temporary fixture ending 30 days after the selected workday passed all three original browser scenarios.
