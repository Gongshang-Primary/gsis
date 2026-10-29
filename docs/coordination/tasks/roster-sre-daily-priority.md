# roster-sre-daily-priority: SREs are rostered daily first, not by annual R%

- Status: approved (owner request 30 Oct 2026; all logged items have owner go); confirm the two open points below before claiming
- Owner/model: Codex
- Reviewer/model: Claude
- Last updated (Asia/Singapore): 30 Oct 2026 07:10
- Branch: codex/roster-sre-daily-priority
- Base SHA: current main
- PR: none
- User-authorised scope: Song Wee, 30 Oct 2026: "SRE's do not count by accumulated R% but are rostered on a daily basis subject to the business rules of 8 max, no 8 consecutive. they will be priority 1 above annual R%".
- Files/domains owned: shared/roster-allocation.js (candidate ranking, eligibility limits, balances), shared/relief.js (employment parsing) only if needed, Roster settings UI text, generated copies, tests.
- Out of scope: quota formula for other staff; FAJT; Deploy figures.

## Rule
1. Staff with employment SRE are ranked before every other candidate (priority 1, above "Lower annual R utilisation").
2. SREs are not ranked or balanced by annual R%, weekly R remaining or R entitlement. Their relief does not need an R quota.
3. Daily limits for an SRE: at most 8 periods in the day (teaching, duties and relief counted the same way as today's daily-total rule), and never 8 consecutive periods (so at most 7 in a row).
4. Among several eligible SREs: fewer periods already that day first, then the existing rotation order.
5. Existing hard rules still apply to SREs: restricted periods for SRE (default 0, 13 to 16 in `defaultEmploymentRestrictions`), absence, clashes, protected/manual/peer cells.
6. Non-SRE staff keep today's order and limits (school defaults: max 9 daily, max 6 consecutive).

## Current behaviour (source reading)
- `preferenceRules` in shared/roster-allocation.js orders candidates: annualUtilisation, alternatives, weeklyRemaining, rotation, levelMatch, subjectMatch. No employment-based priority exists.
- `workloadRules` sets school-wide limits: dailyTotal 9, consecutive 6. No per-employment limits.
- SRE appears only in employment restrictions (restricted periods) and employment parsing (shared/relief.js).

## Open points for the owner (answer before build)
1. "No 8 consecutive" read as: at most 7 consecutive periods. Correct?
2. Should SREs still appear in R% displays (My Calculations, annual balances) or be shown as "Daily roster, no R%"?

## Acceptance
- With an SRE and a teacher with lower R% both free: the SRE is chosen.
- SRE with 8 periods already that day: not chosen. SRE with 7 consecutive ending at P: not chosen for P+1.
- Two SREs: the one with fewer periods today is chosen; tie goes to rotation.
- Non-SRE allocation results unchanged on existing seeded tests (roster701-r17-solver oracle cases).
- Manual, protected and peer assignments untouched.
