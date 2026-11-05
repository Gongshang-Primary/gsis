# roster-reoptimise-priority-adhoc: Auto-allocate must re-plan unpublished automatic relief so ad hoc/daily SRE priority applies

- Status: changelog (owner 6 Nov ~00:xx, on D1 v0.9.9m); lane R; Codex when authorised. Spec by Claude under the standing rule.
- Reviewer/model: Claude. Related: roster-sre-daily-priority (PR #14, merged 30 Oct: daily/ad hoc SREs are priority 1 above annual R%).

## Owner report (verbatim)
"auto-allocate didn't reoptimse all unpublished allocation: evinced because I added an adhoc relief teacher but auto-allocate didn't give adhoc relief any periods"

## Evidence
6 Nov on D1: first Auto-allocate filled all periods (0 uncovered, 23:54). The owner then activated an ad hoc relief teacher and ran Auto-allocate again; the log says "Preparing to reoptimise blanks and unpublished automatic assignments" and "Allocation draft saved", but the ad hoc teacher received no periods.

## Likely cause (to confirm in code)
The reoptimise accepts a new plan only if it improves coverage or the R% fairness score (optimisationRuns record `reason: "higher coverage"`, `fairness.before/after`). With coverage already 100% and SREs excluded from R% fairness, moving lessons to the ad hoc teacher never counts as an improvement, so the existing draft stays. Priority 1 (PR #14) then only affects blanks.

## Required
1. Reoptimise re-plans every unpublished, unstarted, automatic assignment for the date from scratch with the current ranking (daily/ad hoc SRE first per PR #14 limits; then the existing order), and keeps the new plan when it is better on an ordered objective: (a) coverage, (b) use of priority-1 staff within their limits, (c) fairness, (d) fewest changes. Never move manual, peer, protected, Stapler-imported, published or started cells.
2. Activating or deactivating an ad hoc relief teacher marks the date "re-plan suggested" in Assign Relief (no automatic run).
3. The allocation log lists, for each priority-1 teacher who got no periods, the reason category (not available that period, restricted period, daily max reached, consecutive limit, activation window, no lessons to cover).
4. Tests: full coverage plan + newly activated ad hoc teacher → reoptimise gives them periods up to their limits; manual/published cells untouched; reasons logged when an SRE stays idle; Google and D1 parity.
