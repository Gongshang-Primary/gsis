# roster-suspended-baseline-view: align usual baseline below the suspended timetable

- Status: implementing
- Owner/model: Codex
- Reviewer/model: Claude
- Last updated (Asia/Singapore): 31 October 2026
- Branch: codex/roster-suspended-baseline-view
- Base SHA: ba1bb19969ae2018449ad28602b24f52b92d992a (rows 10 to 12 predecessor)
- User-authorised scope: queue row 13; align usual baseline below the suspended day in teacher, class and TG views and exports.
- Files/domains: shared/roster-operations.js, roster-update/public/roster.js, roster-export.js, roster.css, generated copies and tests.

## Decisions
The existing schedule-only read returns a redacted dated baseline reconstructed from the saved plan's original baseline. No private absence details, instructions, staff contact fields or quota data. The screen, PDF and Excel use one comparison projection with shared period columns and changed-cell highlights. The full recurring baseline section remains below. Ordinary days remain unchanged. Periods align by start and end time; unmatched intervals are marked unavailable rather than guessed.

## Verification
Pending a fresh Linux build and full suite after fixture repair. The baseline comparison fixture previously reused the actual timetable period array, so shifting the baseline interval also shifted the actual interval; the fixture now copies period objects independently. A pure JavaScript identity check reproduced the aliasing and confirmed the copy isolates the schedules. No local project test, live read, deployment or merge is claimed.

## Handoff
Controller opens the PR when authorised; Claude reviews the exact tested head.

