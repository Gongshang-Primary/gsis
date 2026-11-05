# Claude reviews, 6 Nov ~03:40

## PR #85 roster-remove-why-capture, exact head a79f4a3: approve
- CI full-suite green (run 42089728613). Claude locally at a79f4a3: 9 programs pass (backfill edge, remove-why save, daily audit/edge/workbook/queue, drive backup, clock-minute, Stapler delink); canonical build clean; no `captureDecisionWhy`/`allocationWhy` left in shared, edge, RosterOperations or RosterAuditExport.
- Meets the task: saves run nothing extra; audit TXT byte-identical to pre-#82 (fixture); Drive TXT backfill from D1 audit; workbook, queue, ledger, capacity wording and #81 kept.
- Note: the branch drops the "Claim" section of tasks/deploy-remove-target-offload.md (stale base merge). Doc only; restore after merging if #86 does not re-add it.
- Merge order: #85 first; #84 (allocator) then rebases (both touch shared/roster-allocation.js).

## PR #86 deploy-remove-target-offload, exact head a1d0941: approve
- CI full-suite green. Claude locally: 6 programs pass (target ledger UI, target settings, release603/605/607, workload414); build clean.
- "Target offload %" gone from public/app.js and workload-ui.js; FAJT `targetRetained = fajtWeeklyPeriods / weeklyPeriods` from settings, `null` (Needs configuration) when settings are missing; no literal 65/84 left in workload code.

## Pending
- #84 (ad hoc priority reoptimise): large allocator change (+1032/-369); full review after #85 merges and #84 rebases.
- #83 (Muse, Contacts sync): no CI run yet at fd886f7; review when CI is green.
