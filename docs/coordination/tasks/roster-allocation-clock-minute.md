# roster-allocation-clock-minute: slow preparations are discarded whenever the clock minute changes (incident 5 Nov)

- Status: open; Codex, lane R, high priority (with roster-assign-relief-load-regression)
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

## Addendum (5 Nov ~08:35): clock hotfix live, Auto-allocate still stops
Owner deployed the hand-edited clock hotfix. SMC Auto-allocate log: 06:39 preparing → 06:39 calculating → 06:40 "Planning inputs changed; recalculating" → 06:42 "Allocation stopped. Review current records before retrying." Apps Script executions all Completed (no 6-minute timeout). Quiet mode was OFF (scheduled allocation active); absences kept arriving (uncovered 38 → 67).
Remaining cause: the commit-time `rosterOperationsDependencies_(state,p,ctx)` digest covers the WHOLE operations state except a small ignore list (revision, outbox, audit, receipts, deliveryEvents, smcAlerts, acknowledgements, scheduleReceipts, notificationWatermarks, inboundSessions, inboundEvents, dailyEmploymentMail, deliveryReview, allocationAuditExports, privateLinks). Any unrelated write during a 1-2 minute preparation (scheduled allocation, absence intake for other dates, inbox threads, peer mail, Stapler, etc.) discards the plan; one retry, then stop.
Add to the PR:
6. Scope the dependency digest to the inputs of the date being planned: that date's absences/demands, assignments, requests/peer arrangements, Stapler plan, day revision, timetable/quota references and allocation settings. Unrelated collections and other dates must not invalidate the plan; merge them at commit (rosterOperationsMergePrepared_) as today.
7. Interactive Auto-allocate must win against the scheduled cycle for the same date: while an SMC run is preparing, the scheduled run for that date skips (SKIPPED_BUSY), using the existing allocation run record.
8. Tests: an unrelated write during preparation commits; a same-date absence/assignment change conflicts; scheduled run defers to an active SMC run.
