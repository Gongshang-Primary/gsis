# roster-sre-daily-priority: SREs are rostered daily first, not by annual R%

- Status: approved, ready to claim (owner decisions recorded 30 Oct 2026)
- Owner/model: Codex
- Reviewer/model: Claude
- Last updated (Asia/Singapore): 30 Oct 2026 07:10
- Branch: codex/roster-sre-daily-priority
- Base SHA: current main
- PR: none
- User-authorised scope: Song Wee, 30 Oct 2026: "SRE's do not count by accumulated R% but are rostered on a daily basis subject to the business rules of 8 max, no 8 consecutive. they will be priority 1 above annual R%".
- Files/domains owned: shared/roster-allocation.js (candidate ranking, eligibility limits, balances), shared/relief.js (employment parsing) only if needed, Roster settings UI text, generated copies, tests.
- Out of scope: quota formula for other staff; FAJT; Deploy figures.


## Two SRE types (owner, 30 Oct 2026; supersedes earlier limit notes where they differ)
Type is decided by the published Deploy version, not by a separate flag:
- **Daily (ad hoc) SRE**: SRE with no timetable in Deploy. Rostered day by day. Daily limit = **new Settings field "Ad hoc relief max periods"** in system config, beside Daily workload limits, with On/Off toggle and 1 to 40 validation; **initial value 10** written as the settings default (owner), not a constant in allocation code. Consecutive limit = the existing "Maximum consecutive periods" setting. No R quota; shown "Daily roster, no R%".
- **Long-term SRE**: SRE with a timetable in Deploy. Reduced R quota from the FAJT calculation (roster-sre-fajt-r-calc). Their quota applies **per week** (weekly R remaining and caps work as for other staff), but **annual accumulation is not used for their ranking**. Their R value and R% are still recorded and displayed. Daily limits = the existing Daily workload limits settings.

Ranking (rule 1) applies to daily SREs. Long-term SRE ranking: see open point in roster-sre-fajt-r-calc.

## Rule (original; read with the two types above)
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

## Owner decisions (30 Oct 2026)
- Ships On: the SRE rule applies from deploy (unlike roster-fajt-levelling, which ships Off).
- Superseded for daily SREs: they use the new "Ad hoc relief max periods" setting (initial 10); consecutive still the existing setting. Long-term SREs use the existing Daily workload limits.
- R% displays show SREs as "Daily roster, no R%" (My Calculations, annual balances, statistics).

## Acceptance
- With an SRE and a teacher with lower R% both free: the SRE is chosen.
- SRE at the configured daily total: not chosen. SRE at the configured consecutive limit ending at P: not chosen for P+1. Changing either existing setting changes the result with no code change (test two values each).
- Two SREs: the one with fewer periods today is chosen; tie goes to rotation.
- Non-SRE allocation results unchanged on existing seeded tests (roster701-r17-solver oracle cases).
- Manual, protected and peer assignments untouched.
- SRE rows on R% displays read "Daily roster, no R%".
