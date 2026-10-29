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
3. Daily limits for an SRE (owner correction 30 Oct 2026): a maximum number of **relief periods per day** (school currently means 8) and the **consecutive-periods limit** (school currently means 6). **No numbers in code:** both come from Roster allocation settings. The consecutive limit reuses the existing `maxConsecutivePeriods` workload rule (`workloadRules`, editable and switchable in Settings). The relief-per-day limit is a new setting in the same place, e.g. `maxDailyReliefSRE` with its default taken from settings data, shown and editable beside the other workload limits, with the same 1 to 40 validation and On/Off toggle.
4. Among several eligible SREs: fewer periods already that day first, then the existing rotation order.
5. Existing hard rules still apply to SREs: restricted periods for SRE (default 0, 13 to 16 in `defaultEmploymentRestrictions`), absence, clashes, protected/manual/peer cells.
6. Non-SRE staff keep today's order and limits (school defaults: max 9 daily, max 6 consecutive).

## Current behaviour (source reading)
- `preferenceRules` in shared/roster-allocation.js orders candidates: annualUtilisation, alternatives, weeklyRemaining, rotation, levelMatch, subjectMatch. No employment-based priority exists.
- `workloadRules` sets school-wide limits: dailyTotal 9, consecutive 6. No per-employment limits.
- SRE appears only in employment restrictions (restricted periods) and employment parsing (shared/relief.js).

## Open point for the owner
- "No 6 consecutive": the existing rule "Maximum consecutive periods = 6" allows 6 in a row and blocks a 7th. If "no 6 consecutive" means at most 5 in a row, set that rule's value to 5 in Settings (no code change). Builder applies the setting exactly as configured.
- R% displays for SREs: show "Daily roster, no R%" (proposed default) unless the owner says otherwise.

## Acceptance
- With an SRE and a teacher with lower R% both free: the SRE is chosen.
- SRE at the configured relief-per-day limit: not chosen. SRE at the configured consecutive limit ending at P: not chosen for P+1. Changing either setting changes the result with no code change (test both values).
- Two SREs: the one with fewer periods today is chosen; tie goes to rotation.
- Non-SRE allocation results unchanged on existing seeded tests (roster701-r17-solver oracle cases).
- Manual, protected and peer assignments untouched.
