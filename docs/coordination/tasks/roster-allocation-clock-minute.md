# roster-allocation-clock-minute: slow preparations are discarded whenever the clock minute changes (incident 5 Nov)

- Status: in progress; Codex, lane R, high priority (with roster-assign-relief-load-regression)
- Reviewer/model: Claude
- Last updated (Asia/Singapore): 5 Nov 2026 06:20

## Evidence (5 Nov 05:20-06:15, Roster on Google, v0.9.9j backend, quiet mode on, no new absences)
- SMC Auto-allocate for 5 Nov repeatedly failed with "Planning inputs changed…" / "Auto-allocation could not be confirmed"; manual saves often hit DAY_CONFLICT / planning changed. Scheduled allocation was paused (quiet mode) and no absences arrived, so concurrency was not the cause.
- Cause: `backend/RosterOperations.gs` interactive prepared path (about lines 670-690): `preparedClock = ctx.today+':'+ctx.minute` at the start; at commit `finalClock.today+':'+finalClock.minute !== preparedClock` raises PREPARED_RETRY ("The school-day clock changed during preparation"). One retry, then 503 "Planning inputs changed while saving". With Auto-allocate now taking a minute or more on Google (and ordinary saves 20-40 s), almost every Auto-allocate and about half of the saves cross a minute boundary and are discarded. The scheduled path (about line 1108, `checkClock()`) has the same shape.

## Hotfix applied by Claude (owner request, not merged)
Branch `claude/hotfix-clock-minute` (134816a, on top of v0.9.9j 20d0783): new `rosterOperationsClockMoved_(ctx,preparedClock,finalClock)`: conflict only if the date changed, or a period's `startMinutes` lies in (prepared minute, final minute]; if period times are unavailable, keep the old strict behaviour. Owner applied it by hand in Apps Script (find/replace plus helper) on 5 Nov about 06:15.

## Ask (PR)
1. Make the clock rule permanent and correct on every prepared path (interactive, SMC Auto-allocate/optimise, scheduled `checkClock`, and the D1 edge path if it has the same check): the plan is invalid only if the date changed or a period started (or a relevant cutoff passed) during preparation. Use the same day/period source the allocator used. Keep the strict fallback when period data is missing.
2. Avoid the retry storm: when the clock rule truly fires, recompute once and return a clear "a period started while planning; re-run" message rather than the generic "Planning inputs changed".
3. Time budget awareness: record preparation duration per run (allocation run log and System Health), and warn in the UI when Auto-allocate exceeds 45 s on Google ("Google is slow; consider Auto-fill blanks").
4. Tests: a preparation spanning a minute with no period start commits; spanning a period start conflicts; crossing midnight conflicts; missing period data stays strict; the scheduled path the same; Google/D1 parity.
5. Fold in or supersede branch claude/hotfix-clock-minute (do not merge it as is). Base on main.
Full suite green. Draft PR with the exact head for Claude. No deploy.

## Implementation claim (5 Nov 2026)
Model: Codex. Branch: `codex/roster-allocation-clock-minute`. Base: `b374d18878c7520339874bec11e2cedcb93a2f6e`. Reviewer: Claude.

Owner's explicit high-priority assignment supersedes the serial queue default; existing PRs #78/#79 remain untouched. This PR supersedes `claude/hotfix-clock-minute` (134816a) without merging it.

Scope: shared allocator clock validation, Google prepared/scheduled paths, equivalent D1 commit checks, allocation run timing, existing UI/System Health projections and regression tests; canonical generated copies rebuilt. No deployment, authority changes, or live records.

Plan: reproduce harmless minute failures; centralise semantic boundary checks using the prepared allocator day; retain one recomputation and specific terminal errors; record preparation duration and the 45-second Google warning; run canonical build, targeted Google/D1/browser regressions and full Node/LORD CI before draft handoff.
