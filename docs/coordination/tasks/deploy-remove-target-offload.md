# deploy-remove-target-offload: remove the "Target offload %" indicator from the Deploy ledger

- Status: authorised (owner 6 Nov ~01:30: "log for codex to remove the target offload indicator totally"); Codex; lane Deploy (not Roster). Small.
- Reviewer/model: Claude

## Today
The Deploy workload ledger shows a "Target offload %" column = (1 − targetRetained) × 100 (public/app.js ~line 1897, public/workload-ui.js line 23; computed from `row.targetRetained` in shared/workload.js line 213: FAJT fixed 65/84, others from Teaching rules, RT "—").

## Required
1. Remove the "Target offload %" column everywhere it is shown: Deploy ledger table (summary and detail views), any Layout/Contacts copies of the workload UI, and every export of that table (Excel/CSV/PDF/print) and its headings/tooltips/help text.
2. Keep the underlying calculations unchanged: Target, At-load range, Load status and relief R must give identical numbers before and after (test on a fixture with FT, 4/5, FAJT, RT teachers).
3. Remove now-unused code that exists only for the column; keep `targetRetained` because Target uses it.
4. Canonical build so generated Deploy/Layout bundles follow.
5. Tests: column absent in table and exports; Target/status/R unchanged.

## Noted, not in scope (Claude, for the owner)
shared/workload.js hard-codes FAJT 65/84 while relief reads the configurable `fajtWeeklyPeriods`/`weeklyPeriods`; if an Admin changes the FAJT budget, the ledger Target and relief R disagree. Separate task if the owner wants it.
