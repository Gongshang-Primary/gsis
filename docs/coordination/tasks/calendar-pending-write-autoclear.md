# calendar-pending-write-autoclear: one unknown-outcome save blocks Publish and Sync for the whole year (v0.9 HOTFIX)

- Status: proposed (v0.9 hotfix; owner 25 Nov: "wish for v0.9 hotfix", after the 20 Nov freeze)
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
