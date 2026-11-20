# Review: PR #238 — Implement Venues classSlotCapacity, slotMode admission and retained-conflict timetable adoption

- Reviewer: Muse, replacing Claude until Claude returns, per the owner's 16 November directive (source 12b06eb).
- Verdict: **APPROVED at the exact head** `1d75a5fd`.
- Branch: `antigravity/v1-venues-slot-capacity-and-conflicts`. Base: main `7ee24189`. PR status: open, MERGEABLE. GPT to merge.
- No deployment authorised.

## What it does

Implements the Venues slot-capacity and retained-conflict adoption contract from `docs/v1/venues/VENUE_ALLOCATION_LIFECYCLE_DESIGN.md`:

- `classSlotCapacity` is separated from pupil seating `capacity` across register, domain, and service: `null` = explicitly unknown, integer `1..20`, default `1` when unspecified (workbook blank maps to `null`). Unknown capacity fails closed with 409 `UNKNOWN_SLOT_CAPACITY` in both the domain (`available`, `book`) and the SQL guard (which returns `SELECT 0 AS ok`).
- Slot admission: one-slot (`slotMode: "slot"`, demand 1) vs whole-venue (`slotMode: "whole"`, default, demand = capacity). The domain's `segmentPeakDemand` is a sweep-line per-segment check that processes interval ends before starts at identical timestamps, so adjacent intervals do not falsely accumulate. Same-venue timetable uses and bookings contribute demand; other-venue related bookings (overlapGroup) still block outright; closures always block. The service's multi-slot SQL guard rejects closures, cross-venue overlapGroup uses, and overlapping whole-venue bookings, while exact per-segment capacity is serialized by a `venues_epochs` revision guard + increment in the same transaction.
- Retained conflicts (Owner Decision #6): on timetable source activation (`domain.mjs` `activate`) and baseline/`retainConflicts` adoption (`service.mjs` `sourceBegin`/`sourceComplete`), conflicting held bookings are retained with an explicit unresolved `sourceConflict` (status, reason, generation, timestamp, conflict list) instead of being displaced. `sourceBegin` skips the blocking "no overlapping booking" guards for baseline/retainConflicts adoption; `sourceComplete` flags overlapping held bookings with a per-booking revision guard and returns the flagged ids. Flagged bookings keep consuming capacity until authorized resolution: `resolveConflict` (new domain op — held status, ownership, revision, re-checks conflicts, fails closed on unknown capacity), `amend` (clears the flag after re-check), or `cancel`.
- The venues list view exposes the flagged bookings as `conflicted`.

## Scope, merge, secrets

- Diff vs origin/main: exactly 5 files, matching the task record's exact-file allowlist. 1101 insertions, 75 deletions.
- `git merge-tree --write-tree --name-only origin/main 1d75a5f` clean (tree dbe232b9), re-checked against current main.
- `git diff --check`: clean. Secrets scan of the diff: clean.
- No SQL migrations, no v0.9 source edits.

## CI at the exact head

- Isolated v1 product run 44623828580: **success at head 1d75a5f**.
- Node/LORD ("Verify GSiS queue changes"): **no run exists for this head**. The workflow `verify-queue.yml` triggers only on push to `codex/**`, `muse/**`, `claude/**` branches, so `antigravity/**` branches never trigger it. The owner waived this notation difference on 20 Nov 2026 ("review all done by antigravity, ignore difference in notation, i will orchestrate") and will orchestrate the workflow fix/merges. This approval rests on the green product CI at the exact head plus the full local verification below, and the waiver is recorded here rather than hidden.

## Local checks at the exact head

Worktree `wt238-review` at 1d75a5f, `npm ci` in root and in `v1/`, `TZ=Asia/Singapore`, Playwright Chromium:

- `tests/v1-product-venues-slot-capacity.mjs`: exit 0, PASS — ISH-1 2-slot admission, whole-venue default, multi-period per-segment checks, unknown capacity fail-closed, retained-conflict adoption.
- `tests/v1-product-venues.mjs`: exit 0, PASS.
- `tests/v1-product-venues-register.mjs`: exit 0, PASS.
- `tests/v1-product-venues-staged.mjs`: exit 0, PASS — 40,800 intervals, 160 durable chunks.
- `npm run build`: exit 0, no diff. `node scripts/v1/build.mjs` and `node scripts/v1/verify-build.mjs`: exit 0.

## Findings

None. One design note, not a finding: `sourceComplete`'s exceed check counts overlapping timetable scopes rather than running the domain's exact sweep-line, so it can flag a booking the exact check would clear; flagging is non-destructive (the booking stays held and counts toward occupancy) and `resolveConflict`/`amend` re-checks exactly and clears the flag.

## Quality gates

- Q01–Q06 pass at the exact head (bounded scope, fail-closed unknown capacity, exact-head product CI green, local checks green). Q07 is this review. Q08 is not applicable — no deployment authorised.
- Hosted/runtime UAT: **Not tested**.
