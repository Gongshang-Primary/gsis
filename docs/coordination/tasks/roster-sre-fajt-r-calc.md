# roster-sre-fajt-r-calc: an SRE with a Deploy timetable gets the FAJT R calculation

- Status: implementing, separately from the merge-held row S by explicit owner instruction on 30 October 2026.
- Owner/model: Codex
- Reviewer/model: Claude
- Last updated (Asia/Singapore): 30 Oct 2026 08:10
- Branch: codex/roster-sre-fajt-r-calc
- Base SHA: 135b8a55fe027975facca29cbebeea5700f42e8e
- PR: none
- User-authorised scope: Song Wee, 30 Oct 2026: "SRE follows FAJT R calculation if their timetable is present in deploy".
- Files/domains owned: shared/relief.js (`employment()`, budget/factor), shared/workload.js only if it classifies employment, Roster ranking in shared/roster-allocation.js if the open point requires, generated Deploy/Roster copies, tests.
- Out of scope: FAJT formula itself; specialist counts.

## Current behaviour (source reading)
- `employment()` in shared/relief.js (~line 33) knows `SRE` as a modifier but returns `'FAJT'` only for FAJT, `'4/5'` for 4/5, else `'Full time'`. So **an SRE today gets the Full time R calculation** (budget `weeklyPeriods`, factor `timetablePeriods/weeklyPeriods`).
- FAJT calculation: budget `fajtWeeklyPeriods`, factor 1 (~lines 67-68).

## Required (owner, 30 Oct 2026: two SRE types)
- Long-term SRE = SRE with a Deploy timetable: reduced R quota via the FAJT calculation; applied per week; annual accumulation not used for ranking; R and R% still recorded and shown.
- Daily SRE = no Deploy timetable: no R; see roster-sre-daily-priority.

1. SRE **with** a timetable in the published Deploy version (one or more teaching periods in their Deploy row): R calculation uses the FAJT budget and factor, from the same settings fields (`fajtWeeklyPeriods`). No numbers in code.
2. SRE **without** a Deploy timetable: no R calculation; shown as "Daily roster, no R%" (roster-sre-daily-priority).
3. My Calculations explains which basis applies ("SRE with timetable: FAJT basis").

## Owner decision (30 Oct 2026): option B
A long-term SRE is ranked with other staff (after daily SREs and, when switched on, the FAJT rule), using **weekly R remaining** in place of annual R% utilisation; the remaining tie-breakers are unchanged.

## Acceptance
- SRE with Deploy teaching periods: R equals the FAJT formula for the same workload; changing `fajtWeeklyPeriods` changes it.
- SRE without teaching periods: no R, "Daily roster, no R%".
- Full time and 4/5 staff unchanged.
- Long-term SRE: weekly R remaining enforced; annual R% recorded and displayed but ignored by annualUtilisation ranking.
- Long-term SRE and a teacher both free: the long-term SRE's place is decided by weekly R remaining versus the teacher's annual R% ranking key, as specified in the ranking design; test both orderings.

## Claim and handoff

Model: Codex. The owner explicitly requested row S and row 2b2 as separate PRs now. This is the second bounded branch; row S retains its merge hold. No authority change, messages, live records or deployment. Claude reviews the exact head before owner merge.
