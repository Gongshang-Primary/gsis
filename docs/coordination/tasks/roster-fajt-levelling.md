# roster-fajt-levelling: after SREs, bring FAJT staff up to the other EOs' average R%

- Status: approved (owner request 30 Oct 2026); confirm the reading of rule 2 before claiming. Build after roster-sre-daily-priority (same ranking code).
- Owner/model: Codex
- Reviewer/model: Claude
- Last updated (Asia/Singapore): 30 Oct 2026 07:40
- Branch: codex/roster-fajt-levelling
- Base SHA: current main
- PR: none
- User-authorised scope: Song Wee, 30 Oct 2026: "after SRE; then FAJT but balance FAJT R% against all other EOs R%. rule 1: SREs first; rule 2: level up FAJT R% first to be equal with FAJT average R%; rule 3: annual R% levelling across all staff".
- Files/domains owned: shared/roster-allocation.js (candidate ranking, preferenceRules, balances), Roster settings text, generated copies, tests.
- Out of scope: R quota formula; Deploy specialist counts (separate task); SRE rule itself.

## Ranking order (owner)
1. SREs first (roster-sre-daily-priority).
2. FAJT staff whose annual R% is below the target are next, lowest R% first, until they reach the target.
3. Then today's annual R% levelling across all staff (including FAJT at or above the target), followed by the existing tie-breakers.

## Reading of the target (to confirm)
Owner wrote both "balance FAJT R% against all other EOs R%" and "equal with FAJT average R%". Proposed reading: **target = average annual R% of all non-FAJT, non-SRE EOs** (annual utilisation, the same figure annualUtilisation uses), recomputed at each allocation run from current balances. A FAJT teacher below that average is preferred; at or above it, they join normal levelling.
Alternative reading: target = average R% of FAJT staff themselves (levels FAJT among each other only). Owner to pick.

## Rules kept
- Daily workload limits (existing Settings), restricted periods for FAJT, absence, clashes, protected/manual/peer cells.
- FAJT with no R entitlement (R% undefined): treat as at target (not prioritised) and show in review.
- No hardcoded numbers; the target is computed from data.

## Acceptance
- Two candidates free, a FAJT at 20% and a teacher at 10%, other-EO average 40%: the FAJT is chosen.
- FAJT at 45% with other-EO average 40%: normal levelling decides (the teacher at 10% is chosen).
- SRE free: SRE still chosen first.
- Non-FAJT, non-SRE results unchanged on existing seeded solver tests.
