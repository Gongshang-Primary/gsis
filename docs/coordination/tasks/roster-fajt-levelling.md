# roster-fajt-levelling: after SREs, FAJT average R% rises first until it leads the school by a set margin

- Status: implemented locally within combined PR #29; full verification and exact-head Claude review remain required.
- Owner/model: Codex
- Reviewer/model: Claude
- Last updated (Asia/Singapore): 31 Oct 2026
- Branch: codex/roster-weekly-quota-snapshot
- Base SHA: see roster-combined-weekly-quota.md for the current #30/main integration.
- PR: #29, incorporating #27.
- User-authorised scope: Song Wee, 30 Oct 2026: "after SRE; then FAJT but balance FAJT R% against all other EOs R%. rule 1: SREs first; rule 2: level up FAJT R% first to be equal with FAJT average R%; rule 3: annual R% levelling across all staff".
- Files/domains owned: shared/roster-allocation.js (candidate ranking, preferenceRules, balances), Roster settings text, generated copies, tests.
- Out of scope: R quota formula; Deploy specialist counts (separate task); SRE rule itself.

## Ranking order (owner, clarified twice)
1. SREs first (roster-sre-daily-priority).
2. While **FAJT average annual R% < school average annual R% + margin**, FAJT staff go before all other staff; within FAJT, lowest annual R% first.
3. Once the FAJT average reaches school average + margin, FAJT priority switches off: everyone (FAJT included) is ranked by today's annual R% levelling and tie-breakers. If the FAJT average later falls back below the threshold, FAJT priority switches on again.

Definitions (computed at each allocation run from current balances, the same annual utilisation that annualUtilisation uses):
- FAJT average R% = mean annual R% of active FAJT staff with an R entitlement.
- School average R% = mean annual R% of all other active eligible staff (not FAJT, not SRE) with an R entitlement.

Margin: a new Settings field beside Daily workload limits, "FAJT lead over school R% (percentage points)", with an On/Off toggle like the other rules. **Owner (30 Oct 2026): ship it Off.** The toggle defaults to Off for new and existing settings, so deploying changes no allocation until an SMC/Admin switches it On; the margin field still shows 20 ready for use. **Recommended default: 20 percentage points** (e.g. school 40% → FAJT priority until FAJT average reaches 60%). Stored in settings data, validated 0 to 100; no number in code paths other than the settings default.
Why points, not a ratio: early in the year all R% are small, and a ratio (e.g. 1.5×) would switch off after a handful of duties. Why 20: large enough that FAJT clearly carry more relief, small enough that teachers still see their R% move within the term. Annual R% changes slowly, so the switch will not flip daily; no extra hysteresis is needed at first. Review after four weeks of data.

## Rules kept
- Daily workload limits (existing Settings), restricted periods for FAJT, absence, clashes, protected/manual/peer cells.
- FAJT with no R entitlement (R% undefined): still in the FAJT group, ordered after FAJT staff with a known R%; listed in review.
- No hardcoded numbers.

## Acceptance
- School average 40%, margin 20, FAJT average 50%: a FAJT at 55% is chosen over a teacher at 10%.
- Same, FAJT average 62%: the teacher at 10% is chosen (normal levelling).
- Margin set to 10 in Settings changes the switch point with no code change (test two values); toggle Off gives normal levelling for everyone after SREs.
- Two FAJT free while priority is on: the lower-R% FAJT is chosen.
- SRE free: SRE still first. FAJT at a Daily workload limit or restricted period: skipped.
- Settings shows the current FAJT average, school average and whether FAJT priority is active, so SMCs can see why.
- Fresh deploy with existing settings data: FAJT priority is Off and allocations match the pre-deploy result; switching it On in Settings applies the rule.

## Continuation and dependency

Owner, 30 Oct: "do not wait for review on completion of changelog items keep on going". This task may progress on an isolated branch while review continues. Integrate the SRE FAJT basis from PR #20 at 16624d4de46caf8b3a1547069eea1e6ab9ab24aa before implementation. Reconcile predecessor changes, regenerate bundles and rerun the full suite before a final integration handoff. No merge, deployment, authority change or message send is authorised by this claim. Version-label work remains independently tracked under release-version-letter.

## Current bounded continuation

Model: Codex. Owner assigned row 2c on 31 Oct 2026. The previous prepared branch includes unrelated version-label work, so this continuation applies only FAJT policy, Settings, context and regression changes onto current main. Claude's version-label and specialist changes remain independent. The earlier branch is retained.

Scope: shared/roster-allocation.js, shared/roster-operations.js, backend/RosterOperations.gs, roster-update/public/roster-settings-ui.js, their deterministic generated copies, focused tests and the existing branch-scoped Linux verification workflow. No R quota formula changes, messages, deployment, or production authority changes.

The local shell and browser execution tools are unavailable in this session. No local build or test execution is claimed. Linux CI will build before the full suite. Any generated Worker differences will be retained and applied before final review; CI results and exact heads will be recorded.

## 31 October source handoff

Model: Codex. Isolated implementation on codex/roster-fajt-levelling-review, based on main 4a4001c. Only the FAJT source/test changes were transplanted from the earlier prepared branch. Current SIUE settings, specialist counts and collapsible exception controls are retained. Canonical code and deterministic backend/browser copies are included; the actual Linux builder will supply the remaining Worker outputs. Full suite and exact-head review pending. No merge or deployment.



## Combined continuation, 31 October 2026

Owner authorised combining PR #27 with #29. Active implementation is now codex/roster-weekly-quota-snapshot, PR #29. Original #27 commit history is retained; do not run parallel changes on the old branch. Nine focused FAJT cases pass after integration with current main. Full suite and Claude review pending.
