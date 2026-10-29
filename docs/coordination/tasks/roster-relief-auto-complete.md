# roster-relief-auto-complete: count ended published relief as done

- Status: proposed (changelog entry for Codex; build only after owner says go)
- Owner/model: Codex
- Reviewer/model: Claude
- Last updated (Asia/Singapore): 29 Oct 2026 10:30
- Branch: codex/roster-relief-auto-complete
- Base SHA: 1b9c915
- Current head SHA (or PR head; avoid self-referential commit hashes): none
- PR: none
- User-authorised scope: Song Wee, 29 Oct 2026: option 1, changelog for Codex.
- Files/domains owned (include generated outputs): shared/roster-allocation.js (accounted/completed rules), shared/roster-operations.js (confirmCompleted, correctRelief), backend `rosterPersonalCompletion_` (backend/Code.gs ~2292, backend/Relief.gs, edge-roster.js ~238 copy), roster-calculations.js text, generated backends, tests.
- Out of scope: quota formula, allocation scoring, Friday 30 Oct release.

## Problem (evidence)
- "My Calculations" shows "Confirmed completed relief: 0 periods" for every teacher.
- Completed relief counts only rows with `status==='completed'` or `completionStatus==='completed'`. Only the `confirmCompleted` operation sets that (shared/roster-operations.js ~line 999, SMC confirms "these relief duties took place").
- No frontend control sends `confirmCompleted` (only listed in `datedMutations`, roster-operations-ui.js line 84). So no relief is ever completed.
- Separately: a teacher with weekly quota R = 0 gets percentage "Unavailable" (entitlement 0). Owner chose not to change that now.

## Required behaviour
1. A published relief duty counts as completed once its period has ended (`periodEnded`), unless it is cancelled, removed, no-relief, or an SMC corrected it as not done.
2. SMC correction uses the existing `correctRelief` path; corrections win over automatic completion.
3. Count from the accounting year's start rule as today (zero-start 18 Oct 2026 stays).
4. Same result in Google backend and D1 edge copies.
5. Allocation fairness must not double count: published duties already count as `committed`; after the period ends they move to `completed`, never both.

## Acceptance checks
- Test: published duty, period ended → completed count includes it; before the period ends → not included.
- Test: cancelled, removed, no-relief, corrected-not-done → excluded.
- Test: allocator balance (`spent`) unchanged by the move from committed to completed.
- Google and edge copies return equal history for one fixture.
