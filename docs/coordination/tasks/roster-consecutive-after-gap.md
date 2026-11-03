# roster-consecutive-after-gap: consecutive check ignores timetabled periods after a free period (bug)

- Status: reported 3 Nov 2026 (owner relayed); not yet assigned
- Owner/model: Codex (lane R) when authorised
- Reviewer/model: Claude

## Report (verbatim)
"The consecutive check at a free period ignores timetabled periods that come after it. Example: Chuan Song, 2 Nov, P6. Own lessons P5 and P7 to P12."
Expected: assigning relief at P6 makes P5-P12 a run of 8 occupied periods, so it must trip the 6-consecutive rule ("Six or more consecutive occupied periods", `streakViolation`) and the configured `maxConsecutivePeriods`.

## Code path (Claude, main 573f1ed)
- `shared/roster-allocation.js` `eligibility`: `set=consecutivePeriods(t,[...additions,prospective])`, `consecutive=runAt(set,p,t.periodCount)`, `streakViolation=consecutive>=6`; workload limit uses `longestRun(consecutivePeriods(..., true), t.periodCount)`.
- `runAt` itself scans both directions correctly, but stops at `right+1<total` where `total=t.periodCount=dd.periods.length`.
- `consecutiveBase` = `raw.activities` minus subjects in `consecutiveCountExclusions`, keyed by **`a.period` only**.

## Hypotheses to test, most likely first
1. **Multi-period lessons counted once:** a lesson block P7-P12 (or doubles) stored as one activity with a start period, so only P7 enters the set (or none if a later block starts at P8). Then the run around P6 is P5-P7 = 3 and no violation. Fix: expand each activity to every period it occupies.
2. **Exclusion list:** Chuan Song's P7-P12 subject matches `consecutiveCountExclusions` (System Config), so they are deliberately not counted. If so, it is configuration, not a bug: report which subject.
3. **`periodCount` too small:** `dd.periods.length` shorter than the highest period index (non-contiguous or 1-based periods), so the right-hand scan stops early. Fix: use the max period index + 1.

## Requirement
Reproduce with the 2 Nov baseline (timetable `14a50c1e-…`, Chuan Song) on Google and D1; identify which hypothesis holds; fix the cause in the shared allocator (Google and D1 share it); keep the six-consecutive and configured limits unchanged in meaning. Tests: P5 + P7-P12 with P6 prospective → violation; a real gap (P5, P8-P12) → run of 2 → no violation; excluded subject behaves as configured; multi-period block expanded.

## Owner information (3 Nov)
"chuan songs: some periods are on Dont need relief list, not the count-consecutive list". So hypothesis 2 (consecutive exclusion list) is ruled out.

## Claude's follow-up reading (main 6540d97)
For a **candidate** (the teacher being considered for relief), occupancy comes from `teacherSource`: every non-empty timetable cell is added to `base` and `activities` (`occupied=c=>Array.isArray(c)&&c.some(...)`), and `consecutiveBase` drops only `consecutiveCountExclusions` subjects. The "Don't need relief" policy (`noReliefRequired` / `resolve(dem).reliefRequired`) is applied to **demands** (an absent teacher's lessons), not to a candidate's occupancy, in the code read so far. So if the P7-P12 periods vanish from the run, check: (a) whether anything removes no-relief-policy activities from the candidate's `base`/`consecutiveBase` elsewhere (e.g. teaching-group overrides, `consecutiveExcludedDemands`, absence on those periods, Stapler plan for 2 Nov replacing the baseline), (b) hypothesis 1 (multi-period blocks) and (c) hypothesis 3 (`periodCount`). Reproduce with the exact 2 Nov data before changing code. Owner expectation: periods on the "Don't need relief" list are still **occupied** for the consecutive check.

## Owner information 2 (3 Nov)
"2 Nov was a Stapler day. but Chuan Song's schedule for that day is as per baseline."
**Leading hypothesis now:** on a Stapler day, candidate occupancy comes from the Stapler (suspended-timetable) plan, not the baseline. If the plan carries only the rows or periods that changed (or drops unchanged cells, or mis-maps a teacher whose day is "as per baseline"), Chuan Song's P7-P12 can be missing from `blocks`/`base`, so the consecutive run at P6 looks short. Reproduce with the 2 Nov plan (Stapler revision for 2026-11-02) versus the baseline, compare Chuan Song's `base`/`consecutiveBase` from each, and fix so that an unchanged teacher on a Stapler day keeps the full baseline occupancy (all periods, including "Don't need relief" subjects).
