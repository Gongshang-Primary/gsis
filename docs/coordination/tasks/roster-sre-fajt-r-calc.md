# roster-sre-fajt-r-calc: an SRE with a Deploy timetable gets the FAJT R calculation

- Status: approved (owner request 30 Oct 2026); one open point below. Build with or right after roster-sre-daily-priority.
- Owner/model: Codex
- Reviewer/model: Claude
- Last updated (Asia/Singapore): 30 Oct 2026 08:10
- Branch: codex/roster-sre-fajt-r-calc
- Base SHA: current main
- PR: none
- User-authorised scope: Song Wee, 30 Oct 2026: "SRE follows FAJT R calculation if their timetable is present in deploy".
- Files/domains owned: shared/relief.js (`employment()`, budget/factor), shared/workload.js only if it classifies employment, Roster ranking in shared/roster-allocation.js if the open point requires, generated Deploy/Roster copies, tests.
- Out of scope: FAJT formula itself; specialist counts.

## Current behaviour (source reading)
- `employment()` in shared/relief.js (~line 33) knows `SRE` as a modifier but returns `'FAJT'` only for FAJT, `'4/5'` for 4/5, else `'Full time'`. So **an SRE today gets the Full time R calculation** (budget `weeklyPeriods`, factor `timetablePeriods/weeklyPeriods`).
- FAJT calculation: budget `fajtWeeklyPeriods`, factor 1 (~lines 67-68).

## Required
1. SRE **with** a timetable in the published Deploy version (one or more teaching periods in their Deploy row): R calculation uses the FAJT budget and factor, from the same settings fields (`fajtWeeklyPeriods`). No numbers in code.
2. SRE **without** a Deploy timetable: no R calculation; shown as "Daily roster, no R%" (roster-sre-daily-priority).
3. My Calculations explains which basis applies ("SRE with timetable: FAJT basis").

## Open point for the owner
In Roster allocation, does an SRE with a timetable still go first as an SRE (rule 1), or join the FAJT group (rule 2, ships Off) and be levelled by R% with FAJT staff? Proposed: **SRE with a timetable joins the FAJT group**, since it now has a real R%; SRE without a timetable stays rule 1.

## Acceptance
- SRE with Deploy teaching periods: R equals the FAJT formula for the same workload; changing `fajtWeeklyPeriods` changes it.
- SRE without teaching periods: no R, "Daily roster, no R%".
- Full time and 4/5 staff unchanged.
