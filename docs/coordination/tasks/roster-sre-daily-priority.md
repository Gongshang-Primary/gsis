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
3. Daily limits for an SRE: the **existing** Settings → Daily workload limits, unchanged: "Maximum total daily periods" (`maxDailyPeriods`) and "Maximum consecutive periods" (`maxConsecutivePeriods`) in `workloadRules`, which already count lessons, relief and invigilation once per period for every teacher (roster-settings-ui.js ~line 125). No new setting and no numbers in code. The owner sets the values in Settings (owner intent: 8 a day; consecutive per the existing setting). Since SREs usually have no timetabled lessons, the daily total is in practice their relief count.
4. Among several eligible SREs: fewer periods already that day first, then the existing rotation order.
5. Existing hard rules still apply to SREs: restricted periods for SRE (default 0, 13 to 16 in `defaultEmploymentRestrictions`), absence, clashes, protected/manual/peer cells.
6. Non-SRE staff keep today's order and limits (school defaults: max 9 daily, max 6 consecutive).

## Current behaviour (source reading)
- `preferenceRules` in shared/roster-allocation.js orders candidates: annualUtilisation, alternatives, weeklyRemaining, rotation, levelMatch, subjectMatch. No employment-based priority exists.
- `workloadRules` already provides the two school-wide limits (code defaults 9 and 6; the live values are whatever Settings holds). They already apply to SREs. The new part of this task is only the SRE priority and the removal of R% from SRE ranking.
- SRE appears only in employment restrictions (restricted periods) and employment parsing (shared/relief.js).

## Open point for the owner
- Check Settings → Daily workload limits shows 8 for maximum total daily periods and the intended consecutive value; these apply to all staff, not only SREs.
- R% displays for SREs: show "Daily roster, no R%" (proposed default) unless the owner says otherwise.

## Acceptance
- With an SRE and a teacher with lower R% both free: the SRE is chosen.
- SRE at the configured daily total: not chosen. SRE at the configured consecutive limit ending at P: not chosen for P+1. Changing either existing setting changes the result with no code change (test two values each).
- Two SREs: the one with fewer periods today is chosen; tie goes to rotation.
- Non-SRE allocation results unchanged on existing seeded tests (roster701-r17-solver oracle cases).
- Manual, protected and peer assignments untouched.
