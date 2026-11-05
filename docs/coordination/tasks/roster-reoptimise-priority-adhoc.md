# roster-reoptimise-priority-adhoc: Auto-allocate must re-plan unpublished automatic relief so ad hoc/daily SRE priority applies

- Status: claimed; lane R; owner explicitly authorised work on this task in ChatGPT on 6 Nov 2026. Spec by Claude under the standing rule.
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

## Claim
- Owner/model: Codex
- Reviewer/model: Claude
- Last updated (Asia/Singapore): 2026-11-06 00:45
- Branch: `codex/roster-reoptimise-priority-adhoc`
- Base SHA: `fabc1c8c9c00c8635770f7fc402fe9c174d43321` (requested specification `05bfa9c`)
- Current head / PR: claim only; implementation not started.
- Files/domains owned: lane R allocator and operations in `shared/roster-*.js`, Assign Relief frontend, Google/D1 adapters only as required, focused regressions, this task record and changelog; canonical generated Roster/Deploy backend and Worker copies.
- User-authorised scope: all four Required items above.
- Out of scope: backups/daily outputs, Deploy/Contacts catalogue sync, live allocation, deployment, authority/configuration changes and notification sends.
- Acceptance checks: full-coverage reoptimise adopts priority-1 staff within limits; protected/manual/peer/Stapler-imported/published/started assignments preserved; durable date notice after activation changes; truthful idle reason categories; Google/D1 parity; canonical build then full Node and LORD suites with TZ=Asia/Singapore.

## Coordination
Owner's new work instruction advances the same Codex builder to this task. PR #81 has merged; PR #82 is frozen for review, with its source work complete. This branch starts from the accepted claim on current main and does not modify the daily outputs branch. Muse's Deploy/Contacts task stays outside this allocator/Assign Relief scope. No other active Roster implementer claim was found in the refreshed GitHub state.

## Verification
Not run yet for this task. PR #82's independent exact-head CI passed at `8ca0fc7a93eb9336b4cde759275c8ed76d1b6489`.

## Deployment
Not deployed to staging or production.

## Handoff
Codex will confirm the root cause, add regressions, implement the ordered objective, date notice and idle reasons, rebuild canonical outputs and run the full suite before a separate draft PR for Claude's exact-head review. Owner merges and releases.
