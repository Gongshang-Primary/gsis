# Review: PR #251 — Venues classSlotCapacity register UI, slotMode booking & conflict resolution (V01–V04, V10–V18, V21)

- Reviewer: Muse, replacing Claude until Claude returns, per the owner's 16 November directive (source 12b06eb).
- Verdict: **APPROVED at the exact head** `02fd4bf`.
- Branch: `antigravity/v1-venues-slot-capacity-and-booking-ui`. Base: main `6461f4e`. PR status: open, MERGEABLE. GPT to merge.
- No deployment authorised.

## What it does

Browser UI for Venues multi-slot capacity, booking scope selection, and retained timetable conflict resolution, on top of the PR #238 backend:

- **Physical Room Register** (`v1/services/venues/domain.mjs`, `v1/web/shared/venues-register.js`): `classSlotCapacity` exposed in `publicVenue()`; a `Class-slot capacity` field (blank means unknown, or whole number 1–20, distinct from pupil seating `capacity`) added to the Add/Edit room dialog, preview table, and room register table. A new room defaults to 1.
- **Booking grid** (`scripts/v1/build-web.mjs`): slot-aware occupancy. Rooms with `classSlotCapacity === null` fail closed (`Class-slot capacity not configured`). Concurrent timetable lessons count 1 slot each; active ad hoc bookings count `classSlotCapacity` slots for `slotMode === "whole"` and 1 slot for `slotMode === "slot"`. When `usedSlots < classSlotCapacity`, the period stays selectable for a 1-slot booking, showing `Available (remaining/capacity slots)` when partially occupied. Partial occupancy is not blocking in `selectCell` (only non-`partial` occupancy opens the occupied dialog).
- **Review booking dialog**: a `Booking scope` selector (`slotMode: "slot"` One class slot vs `slotMode: "whole"` Whole venue) for multi-slot venues (`classSlotCapacity > 1`), re-evaluating the conflict preview live when toggled, and sending `slotMode` in the `book` command.
- **Booking cards and Manage booking**: `1 class slot` / `Whole venue` badges, retained `sourceConflict` badges (`Timetable conflict — review required`), and `Keep booking (resolve conflict)` (`resolveConflict`) plus `Cancel conflicted booking` (`cancel`) controls.
- **`replaceOnce` fix** (`scripts/v1/build-web.mjs`): the replacer now uses a literal function (`() => to`) so `$$` in injected browser helpers is not collapsed to `$` by `String.replace` — the new injections contain `$$` selectors, so without this fix they would be emitted broken.

## Scope, merge, secrets

- Diff vs the PR base: exactly 5 files, matching the task record's exact-file allowlist (task record, `scripts/v1/build-web.mjs`, new browser test, `v1/services/venues/domain.mjs`, `v1/web/shared/venues-register.js`). 354 insertions, 8 deletions.
- `git merge-tree --write-tree --name-only origin/main 02fd4bf` clean (tree 1418c66c); GitHub reports MERGEABLE/CLEAN.
- `git diff --check`: clean. Secrets scan of the diff: clean.
- `npm run build` produces zero drift in `roster-update/`, `public/`, `shared/` (verified locally with `git diff --exit-code`).

## CI at the exact head

- Isolated v1 product run 44858723317: **success at head 02fd4bf** (attempt 2; attempt 1 was cancelled before completion, then re-run).
- Node/LORD ("Verify GSiS queue changes"): **no run exists for this head**. The workflow `verify-queue.yml` triggers only on push to `codex/**`, `muse/**`, `claude/**` branches, so `antigravity/**` branches never trigger it. The owner waived this notation difference on 20 Nov 2026 ("review all done by antigravity, ignore difference in notation, i will orchestrate") and, on 21 Nov, directed review of these PRs after the gap was restated to him. This approval rests on the green product CI at the exact head plus the full local verification below, and the waiver is recorded here rather than hidden.

## Local checks at the exact head

Worktree `wt251-review` at 02fd4bf, `npm ci` in root and in `v1/`, `TZ=Asia/Singapore`, Playwright Chromium:

- `tests/v1-product-venues-slot-capacity-browser.mjs`: exit 0, PASS.
- `tests/v1-product-venues-register-ui.mjs`: exit 0, PASS.
- `tests/v1-product-venues-slot-capacity.mjs`: exit 0, PASS.
- `npm run build`: exit 0, zero v0.9 drift. `node scripts/v1/build.mjs` and `node scripts/v1/verify-build.mjs`: exit 0.

## Findings

None.

## Quality gates

- Q01–Q06 pass at the exact head (bounded scope, exact-head product CI green, local checks green). Q07 is this review. Q08 is not applicable — no deployment authorised.
- Hosted/runtime UAT: **Not tested**.
