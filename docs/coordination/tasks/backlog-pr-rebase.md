# backlog-pr-rebase: Rebase the open backlog PRs onto current main

- Status: in progress (Model: Codex)
- Owner/model: Codex
- Reviewer/model: Muse
- Last updated (Asia/Singapore): 2026-11-13
- Base SHA: 5aac5f7ead21fe5a0e1c5ae7b837e05050167a60 (current main, 13 Nov 2026)
- Prompt: ~/workspace/gsis-work/codex-prompt-backlog-pr-rebase.md

## Scope

Rebase the nine open Codex backlog PR branches onto current main, one PR at a time, so each can be reviewed at a fresh exact head with fresh CI. No new product scope. No merges to main. No live changes.

| PR | Branch | Old head | Notes |
| --- | --- | --- | --- |
| #38 | codex/roster-inactive-teacher | 6d2a835 | Exclude inactive staff from new relief/delivery; preserve history. |
| #42 | codex/import-progress-total | e03cfda | Fixed work-item totals during import preparation. |
| #46 | codex/roster-relief-count | c1b2948 | Zero-quota calculations; relief counts. |
| #47 | codex/roster-statistics-r-percent | 6b67088 | Cumulative R% fairness table. Stacked on #46: rebase onto #46's NEW head, keep stacked until #46 merges. |
| #48 | codex/wording-timetabled-occupancy | ee8cadb | Confirmed timetabled occupancy wording. |
| #58 | codex/roster-post-activation-smoke | 8f247fe | D1 activation smoke harness (tests-only). |
| #60 | codex/roster-import-health-label | 69698a0 | Restore import job label in System Health (one label-map entry). |
| #72 | codex/roster-allocation-cycle-overlap | 6829397 | Allocation continuation and short commits. Rebase ONLY: the five confirmed blockers in the PR body remain; do not attempt the continuation/short-commit fixes here. Keep as draft. |
| #40 | codex/roster-weekly-quota-snapshot | 5d10650 | Weekly R snapshots and FAJT levelling (112-file stack). Rebase ONLY: the PR body says do not merge this old stack as-is. If the rebase forces it, separate immutable quota provenance from ranking changes; otherwise rebase as-is, keep as draft, and report what still blocks it. |

PR #103 (LORD return-form assertions, branch muse/lord-return-assertions-before-submit, head c6cf244) is Muse's PR, not Codex's. Muse rebases it separately; it is not part of this task.

## Method

For each PR, in the order #38, #42, #46, #47, #48, #58, #60, #72, #40:
1. `git rebase origin/main` on the PR branch. Resolve conflicts keeping the PR's intent. If a conflict cannot be resolved without changing intent, stop that PR, report it, and move to the next.
2. Run `npm run build` (must leave no diff) and the PR's affected tests with TZ=Asia/Singapore.
3. Push with `git push --force-with-lease` (rebase rewrites history; these are Codex's own branches).
4. Record the new head SHA and CI run ID; update the PR body with the new head and validation. Do not claim an old approval carries to the new head.

## Verification

- Each rebased PR: merge-tree clean against current main, canonical build no diff, affected tests pass, CI green at the new head.
- Report per PR: new head SHA, CI run ID, tests run with results, and what still blocks it (#40, #72).

## Out of scope

- Merging any PR (owner merges on their word only).
- Fixing #72's five blockers or #40's ranking/FAJT policy (rebase only).
- New features, policy changes, live data, deployments, or touching the v1 lanes.
