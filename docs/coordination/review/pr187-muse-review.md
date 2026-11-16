# Review: PR #187 — Prepare v1.01 deployment checklist without running it

- Reviewer: Muse (owner, 16 Nov: Muse replaces Claude for v1 exact-head review until Claude returns; source `claude/zealous-archimedes-4i2lv1` at `12b06eb`).
- Verdict: **APPROVED at the exact head**.
- Exact head: `b7dc2093a74e9037cd580308beb5c4ac26e91b12`.
- Base: `49ceb9ba6ddff4c95f1eb651bd7dbce45ee6b676` (accepted claim).
- CI run: [43800501093](https://github.com/helper-gsps/gsis/actions/runs/43800501093), green, all 5 jobs (4 regression shards + full-suite), at the exact head.
- PR: https://github.com/helper-gsps/gsis/pull/187 (Codex, branch `codex/v1-deployment-checklist-20261116`).
- Task record: `docs/coordination/tasks/v1-deployment-checklist-20261116.md` (in the PR; reviewer line still names Claude — stale, superseded by the owner's 16 Nov role switch noted in the PR body).

## What it does

Documentation only. It prepares the browser-based deployment checklist for changes merged since hosted source `26bbccd`, through inspected main `056e003`. It includes the #183/#184 merge evidence, Roster 0005, backups to take first, #176/#181 conditions, rollback limits and hosted Run B checks to repeat. It does not authorise or execute a deployment. No visible changes.

## Checks run (local worktree at the exact head, TZ=Asia/Singapore, Playwright chromium-1234)

- `npm ci`: exit 0.
- Existing G03 regression `tests/v1-product-roster-locks-browser.mjs`: **passed on rerun** (see note N1). Pass line: "PASS real built browser / Worker / D1 Stapler lock and native rename".
- `npm run build`: exit 0, no generated drift (`git status` clean after build).
- Merge-tree against current main: clean, no conflicts.
- Scope: the diff against the base is exactly the two documentation paths (task record, checklist). Zero application, test, CI, configuration, dependency or generated-output changes. `git diff --check` clean.
- Relative links: all 13 resolve to existing files in the worktree.
- Merge evidence in the checklist, verified against the repo:
  - Migration diff `26bbccd..056e003 -- v1/migrations`: exactly one addition, `v1/migrations/roster/0005_workload_snapshot.sql`.
  - #184 merge `5386513`: parents `ccab5f7` + `720fe38`, tree `96e962b`. Matches.
  - #183 merge `056e003`: parents `00a5e6d` + `cca9f21`, tree `1fd9545`. Matches.
  - #181 merge `1754c53` exists. #175 chain merge `334731c` exists; its "product tree matches reviewed d3f24176" claim is cited from the chain recheck document, not independently re-derived here.
- Read the checklist: it states plainly that no deployment, backup, migration or provider action has run; all hosted checks are Not tested; F5 OPEN; T1B-01/T1B-02 Not tested. No conflicting instruction found; it does not revive withdrawn recommendations and it names the outstanding backup/compatibility gates.

## Note

### N1 (informational — pre-existing test flake, not caused by this PR)

The G03 regression failed once locally (timeout waiting for the "Rename" button after clicking "Suspension dates") and passed on rerun at the same head. The test file is unchanged by this documentation-only PR, so the flake is pre-existing/environmental, not a defect in this change. No action required.

## Gates (Q01–Q08)

- Q01 Authority and scope: pass. Owner instruction 16 Nov: prepare, do not run; two-path scope held.
- Q02 Design and ownership: pass. Inventory pinned to exact SHAs; no policy introduced.
- Q03 Security and privacy: pass. No code or data change; the checklist explicitly forbids committing backups or staff data to the repo.
- Q04 Concurrency and recovery: pass. Backup/rollback prerequisites are stated as gates, not claimed as done.
- Q05 Resources and maintainability: pass. No dependency or runtime change.
- Q06 Verification: pass. Links, scope, whitespace, merge evidence and build checked locally; exact-head CI green; the one local flake is explained in N1.
- Q07 Handoff and review: pass. This record; PR names the reviewer; no merge or deployment requested.
- Q08 Release boundary: not applicable. No deployment authority exercised; the checklist is preparation, not a release approval.

## Release notes

None — documentation only. The next owner release decision is separate: whether to authorise deployment of a newly pinned, reviewed and green candidate after the backup and data-readiness evidence exists.
