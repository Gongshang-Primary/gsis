# roster-sre-daily-priority: SREs are rostered daily first, not by annual R%

- Status: implementing; focused policy, route and browser checks passed; full suite pending
- Owner/model: Codex
- Reviewer/model: Claude
- Last updated (Asia/Singapore): 30 Oct 2026 07:10
- Branch: codex/roster-sre-daily-priority
- Base SHA: 17fc352e905043c1eb95b441e6f89f622d068006
- PR: https://github.com/helper-gsps/gsis/pull/14
- User-authorised scope: Song Wee, 30 Oct 2026: "SRE's do not count by accumulated R% but are rostered on a daily basis subject to the business rules of 8 max, no 8 consecutive. they will be priority 1 above annual R%".
- Files/domains owned: shared/roster-allocation.js (candidate ranking, eligibility limits, balances), shared/relief.js (employment parsing) only if needed, Roster settings UI text, generated copies, tests.
- Out of scope: quota formula for other staff; FAJT; Deploy figures.


## Two SRE types (owner, 30 Oct 2026; supersedes earlier limit notes where they differ)
Type is decided by the published Deploy version, not by a separate flag:
- **Daily (ad hoc) SRE**: SRE with no timetable in Deploy. Rostered day by day. Daily limit = **new Settings field "Ad hoc relief max periods"** in system config, beside Daily workload limits, with On/Off toggle and 1 to 40 validation; **initial value 10** written as the settings default (owner), not a constant in allocation code. Consecutive limit = the existing "Maximum consecutive periods" setting. No R quota; shown "Daily roster, no R%".
- **Long-term SRE**: SRE with a timetable in Deploy. Reduced R quota from the FAJT calculation (roster-sre-fajt-r-calc). Their quota applies **per week** (weekly R remaining and caps work as for other staff), but **annual accumulation is not used for their ranking**. Their R value and R% are still recorded and displayed. Daily limits = the existing Daily workload limits settings.

Ranking (rule 1) applies to daily SREs. Long-term SREs rank with other staff by weekly R remaining (owner option B; roster-sre-fajt-r-calc).

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


## Codex preparation, 30 October 2026

Owner renewed the instruction to work through the changelog item by item as soon as possible. PR #13 is still open at 13eebf231ee8566cf828c40a6f2293e4fa974f5f, with Claude running its owner-authorised follow-up. Codex reviewed that exact follow-up and posted one reproduced name-resolution finding in comment 6512974388. No edits were made to Claude's branch.

This preparation changes documentation only. It does not claim any runtime files while PR #13 owns the serial Roster domain. The workflow permits documentation preparation in parallel, but only one open task may touch shared Roster code, backend/Code.gs, Roster frontend files or generated backends/Workers. Before implementation, refresh this branch against the actual merge and read any newer owner decisions. At most two PRs stay open.

### Bounded implementation sequence

1. Carry verified published Deploy teaching-period evidence into each Roster teacher projection. Classify SRE type from that evidence, never from a free selected day, a suspended plan or an absent R value. Missing publication/source evidence stays unknown.
2. Preserve required daily activation and its selected periods. An inactive SRE does not become available merely because its Contacts employment says SRE. Retain identity, absence, clash, restricted-period, weekly employment-cap and manual/peer safeguards.
3. Add the approved Ad hoc relief max periods setting to the existing workload-rule registry: initial 10, integer 1 to 40, standard On/Off control. Resolve the daily total per teacher so daily SREs use this setting and ordinary/long-term staff retain the existing total. Consecutive limits remain the existing configured rule.
4. Admit verified daily SRE capacity without an R quota. Enforce the daily and consecutive bounds in eligibility, the flow capacity, branch/forced coverage and final validation. Do not manufacture an R entitlement or change recorded relief costs/history.
5. Apply daily SRE priority before the configurable annual preferences in both ranked candidates and the whole-allocation cost vector. Among daily SREs, prefer fewer occupied workload periods today, then rotation. Retain maximum coverage and the existing repurposed-duty objective. Non-SRE seeded results must remain unchanged.
6. Show Daily roster, no R% for verified daily SREs in candidate/accounting, personal calculations and statistics projections. Keep their relief counts. Do not label unknown source data as daily roster. Preserve the current published-view and private-recipient boundaries.
7. Version/invalidate the affected prepared-input caches so an older quota row without classification evidence cannot be mistaken for fresh evidence. Reuse the existing source reads; do not add per-teacher network calls.
8. Regenerate all matching canonical copies and run focused policy, route, settings/UI and independent solver-oracle checks. Run the full suite before review; record baseline failures and exclusions separately.

The next queue row, roster-sre-fajt-r-calc, owns the long-term SRE FAJT formula and weekly-ranking substitution. This row prepares the verified type boundary; it must not silently bundle that subsequent implementation or the FAJT group rule. Keep the latest two-type owner decisions above.

### Verification planned

Use synthetic published Deploy metadata to distinguish a free day with weekly teaching from a genuine daily SRE. Cover missing metadata, source/version changes, active versus date-activated staff, a lower-R% ordinary teacher, multiple daily SREs and rotation ties, different configured daily/consecutive limits and their disabled states, absence/restricted periods, protected/manual/peer work, combined lesson blocks and Google/edge parity. Run the existing 70 seeded independent maximum-coverage oracle cases unchanged and verify that personal displays retain counts without inventing R%.

No runtime implementation, build, tests, staging, deployment, provider send, authority switch or live school record mutation is claimed by this preparation.

## Runtime claim, 2026-10-30T10:20:46.989498+08:00

PR #13 is merged as 17fc352e905043c1eb95b441e6f89f622d068006. GitHub now shows only this draft PR open. This branch integrates that exact main before product edits. Codex owns the bounded daily-SRE implementation described above; Claude reviews its final exact head. The subsequent long-term SRE/FAJT formula and ranking rows remain separate. The previously reported My Relief Duties name-resolution callback miss remains logged on PR #13; it is not silently combined with this policy change.

The feature-branch claim path is retained because automatic approval review previously rejected direct main claims. No main mutation, authority change, live data edit, deployment or provider send is part of this task.

## Implementation and current evidence

The workload-rule registry now supplies Ad hoc relief max periods, initial 10, with the existing integer 1 to 40 validation and On/Off control. Daily SREs use that daily total and the existing consecutive limit. Other staff retain their existing daily limits. Ordinary preference order remains unchanged.

Verified published Deploy projections carry teaching counts and whether those counts are known. Google and edge readers share the same versioned evidence shape. A free selected day, absent R, old cache payload or incomplete teaching count cannot classify a teacher as daily SRE. Existing prepared-input cache keys and the edge reference key change for the new shape. The published calculation and source reads are reused; no per-teacher network read was added.

Verified daily SREs enter both the candidate order and whole-plan solver before annual preferences, without needing R. Their daily load, then rotation, break ties. Date activation, selected periods, identity/absence/clash checks, employment restrictions, configured weekly caps, protected/manual/peer cover and maximum coverage remain enforced. Composite SRE modifiers retain the SRE restricted periods. Consecutive subject blocks use the same daily cap in forced and residual flows.

Annual balance and personal projections retain completed/committed counts but suppress R entitlement and percentage for verified daily SREs. My Calculations and candidate cards say Daily roster, no R%. The activity Statistics view contains no R% column; its activity counts are unchanged. Long-term SRE calculation and ranking remain for queue row 2b2, as scoped; no FAJT priority rule is included.

Nine focused regressions pass, including actual Google/edge Deploy evidence, actual edge context, both configured limits, date activation and source uncertainty. Real Chromium verifies the new setting default, editing, toggle, save/reload and Admin-only writes, plus daily personal display and escaping. Existing 70 seeded maximum-coverage oracle cases pass. A separate 100-case exact old/new assignment comparison against merged 17fc352 passes for non-SRE staff. Existing R17 core and integration cases pass. Build passes with 18 production components and 85 Apps Script ES2020 files.

Full npm test and LORD results will be recorded before review. No fresh network installation, staging, school sign-in, live data/latency validation or real delivery is claimed. Google remains authoritative. No ROSTER_EDGE_AUTHORITY or live configuration change was made. Rollback uses the prior matched source and bundles; no stored-data migration is required.
