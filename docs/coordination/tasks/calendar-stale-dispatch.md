# calendar-stale-dispatch: a DISPATCHED save that never landed blocks its event forever

- Status: authorised for **Codex** (owner 6 Nov: "codex"); lane K (Calendar). Small.
- Reviewer/model: Claude

## Evidence
Calendar refused a change: "An earlier save or publication still has an unknown outcome…" (PENDING_EVENT_WRITE, calendar-backend/Code.gs `rc18AssertNoPendingEvent_`). GSPS-CoE → MutationLog had one DISPATCHED row: OperationID 4e49bd29-dea7-422e-9467-bd5c95c6ec7f, saveEvent, EventID EVT-d0034715-55ae-443b-b480-0c79ac0ff74f, created 2026-10-28T00:49:49+08:00.
`repairMutationReceipt_` and `resolveMutationRecord_` only clear a DISPATCHED save when the event row's LastMutationID equals the operation (it landed). If it never landed, the receipt stays DISPATCHED forever (resolveMutationRecord_ returns the outcome unchanged), so every later save of that event is refused. The owner resolved this row manually (State CANCELLED with an ErrorJSON note) after verifying LastMutationID.

## Required
1. A DISPATCHED event mutation older than a safe window (e.g. 1 hour; Sheets requests do not stay pending for hours) whose marker is not on the event row becomes FAILED (`STALE_DISPATCH`) under the writer lock, with an AuditLog entry; the same for YEAR: publication receipts after verifying the publication state.
2. The UI tells the original user: "Your save on <date> to <event> did not apply. Please redo it." and shows the event's current content.
3. Admin view listing unresolved receipts (state, age, event, user) with a "Check now" action that runs the same resolution.
4. Tests: landed → COMMITTED; never landed and old → FAILED and the event unblocks; young DISPATCHED still blocks; publication receipts.


## Codex claim, 6 November 2026

Owner/model: Codex. Reviewer: Claude. Branch: codex/calendar-stale-dispatch. Base: 69efd3ab9f0dbbb31f1a3bc7da9c86b3dc2ea348. Scope: Calendar mutation receipt resolution under its writer lock, original-user recovery UI, Admin unresolved receipts and Check now, tests and generated copies. Landed requests stay committed; only old non-landed requests fail with STALE_DISPATCH after verifying event/publication markers. Preserve young dispatched writes and idempotent receipts. No live mutation repair, messages, deployment or merge. Claim on task branch follows the owner continuation instruction and updated LANES order.

