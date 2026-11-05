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

## Added scope (owner 6 Nov: "yes target retained is necessary and should be variable driven, not hardcoded. remove target offload %")
6. FAJT `targetRetained` must come from the same configurable settings relief uses: `fajtWeeklyPeriods / weeklyPeriods` (shared/relief.js defaults 65 and 84), not the literal `65/84` in shared/workload.js line 213 and its copies (public/app.js ~1848, backend/Code.gs ~1729, generated edge-deploy-domain.js). One source of truth: pass the relief settings into the workload analysis (or a shared accessor); never duplicate the numbers.
7. If the settings are missing or invalid, Target shows "Needs configuration" for FAJT (no silent fallback to 65/84).
8. Help text "FAJT retains 65/84 with no appointment stacking" shows the configured values (e.g. "FAJT retains <fajtWeeklyPeriods>/<weeklyPeriods>").
9. Tests: with defaults, Target/At-load/Load status identical to today; changing `fajtWeeklyPeriods` (e.g. to 60) changes FAJT Target and relief R consistently; invalid settings → "Needs configuration"; no literal 65/84 left in workload code (grep test).

## Claim (6 Nov 2026, Model: Codex)

- Status: claimed; implementation starts after publication of roster-remove-why-capture.
- Owner/model: Codex; lane D (Deploy).
- Reviewer/model: Claude; owner merges.
- Last updated (Asia/Singapore): 6 Nov 2026, 11:18.
- Branch: `codex/deploy-remove-target-offload`.
- Base SHA: `e7d4f028ec1f6db499b44f14c0fea798fec55eca`; implementation branches from the accepted claim commit.
- Scope: all required items 1–9 above; canonical workload and workload UI, focused tests, documentation and canonical generated copies.
- Out of scope: relief formula/policy changes, Roster behavior, Contacts synchronisation, deployment and live records/settings.
- Coordination: prior Why and ad hoc branches have been uploaded. Their implementation is complete. This separate Deploy task is explicitly assigned by the owner; generated bundles must be rebuilt if another branch lands first. Muse owns Contacts catalogue sync and Stapler teacher search; their canonical files are not edited here.
- Acceptance: default FT/4/5/FAJT/RT outputs unchanged; FAJT Target and R use the configured budgets; missing/invalid settings show Needs configuration; removed column absent from all rendered views/exports/help; canonical build and full Node/LORD CI green.

## Plan

1. Add failing regression coverage for default arithmetic, changed budgets, missing/invalid settings, both ledger views and exports.
2. Read validated saved relief settings in workload analysis; remove the column and show configured values in help.
3. Regenerate all canonical copies, run focused checks and full CI, and record exact implementation/PR heads.

## Deployment

No deploy or live action. Claude reviews; owner merges.
