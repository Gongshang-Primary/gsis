# roster-fajt-levelling: after SREs, FAJT staff take relief before other staff, levelled among themselves by R%

- Status: approved, ready to claim after roster-sre-daily-priority (same ranking code). Owner clarified 30 Oct 2026: "FAJTs will reach higher R% before rest of the school".
- Owner/model: Codex
- Reviewer/model: Claude
- Last updated (Asia/Singapore): 30 Oct 2026 07:40
- Branch: codex/roster-fajt-levelling
- Base SHA: current main
- PR: none
- User-authorised scope: Song Wee, 30 Oct 2026: "after SRE; then FAJT but balance FAJT R% against all other EOs R%. rule 1: SREs first; rule 2: level up FAJT R% first to be equal with FAJT average R%; rule 3: annual R% levelling across all staff".
- Files/domains owned: shared/roster-allocation.js (candidate ranking, preferenceRules, balances), Roster settings text, generated copies, tests.
- Out of scope: R quota formula; Deploy specialist counts (separate task); SRE rule itself.

## Ranking order (owner, clarified)
1. SREs first (roster-sre-daily-priority).
2. FAJT staff next, as a group ahead of all other staff. Within FAJT, lowest annual R% first, so FAJT staff level among themselves.
3. Other staff only when no SRE or FAJT can take the period (absent, busy, restricted period, or at a Daily workload limit). Among them, today's annual R% levelling and tie-breakers.

Effect: FAJT staff, as supplementary manpower, absorb relief first and reach higher R% than the rest of the school. There is no target or cap on FAJT R% beyond the existing Daily workload limits.

## Rules kept
- Daily workload limits (existing Settings), restricted periods for FAJT, absence, clashes, protected/manual/peer cells.
- FAJT with no R entitlement (R% undefined): still in the FAJT group, ordered after FAJT staff with a known R%; listed in review.
- No hardcoded numbers.

## Acceptance
- A FAJT at 60% and a teacher at 10% both free: the FAJT is chosen.
- Two FAJT free at 30% and 50%: the 30% FAJT is chosen.
- FAJT at its daily limit or in a restricted period: the next candidate is a non-FAJT by annual R%.
- SRE free: SRE still chosen first.
- Non-FAJT, non-SRE ordering unchanged on existing seeded solver tests.
