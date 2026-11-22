# Review of PR #280 — CI: skip v0.9 regression shards for v1-only changes

- **Reviewer:** Muse, at the exact head, under the owner's 16 Nov 2026 directive (Muse is the v1 reviewer at the exact head SHA, replacing Claude until Claude returns; source commit 12b06eb). No code, merges, or coordination by Muse.
- **PR:** #280, "Model: Claude / CI: skip v0.9 regression shards for v1-only changes". Branch `claude/v1-ci-skip-v09-shards`. Head reviewed: `936bdbf2`.
- **Status at review:** OPEN, not a draft. Product CI green at the head; Node/LORD CI green at the head (all four shards ran — this PR is not v1-only, see below). MERGEABLE/CLEAN.
- **Verdict: APPROVED at the exact head 936bdbf.** No findings.
- **Head note:** the PR body names the earlier head `ce22c369` as the reviewed head. That head was superseded: the branch was merged with origin/main (through 5bbb9af, the #276 merge) and the current head is 936bdbf2, a merge commit. This review is at 936bdbf2, and both CI suites below are verified at 936bdbf2.

## What it does

Owner direction 22 Nov 2026 ("our work should be on v1 only" → "Stop v0.9 CI on v1 PRs"): v1-only PRs currently run all four v0.9 regression shards, and a flaky v0.9 test (`roster-d1-state-memory.mjs`) blocked #279 although it changes no v0.9 file.

- `.github/workflows/verify-queue.yml`: a new `scope` job computes whether the push is v1-only — every file changed since main (merge-base) under `v1/`, `scripts/v1/`, `tests/v1-*`, `docs/v1/`, `docs/coordination/`, or `.github/workflows/v1-*`. If so, the four v0.9 regression shards are skipped and the `full-suite` job still reports success. Any other path — including `shared/` (which v1 also imports), root files, and `verify-queue.yml` itself — runs every shard as before. The scope job fails closed: an empty diff is not v1-only, and if the scope job itself fails, its output is unset so the shards run.
- `.github/workflows/v1-build.yml`: runs the 16 v1 contract tests (`tests/v1-*.mjs` outside `v1-product-*`) that previously ran only inside the v0.9 shards, so a v1-only PR still runs them; the trigger is widened from `tests/v1-product*` to `tests/v1-*`.
- No v0.9 product code, test, or generated file changes.

## Scope predicate verified locally

I ran the scope script's exact predicate against four known diffs (correct bases, since the merge-base of an already-merged head is the head itself):

- #276's head (v1-only): v1only=true.
- #261's head (v1-only): v1only=true.
- This PR's head (changes `verify-queue.yml`): v1only=false — this PR itself runs every shard, which matches the CI below.
- #182's merge (v0.9 hotfix touching `public/` and `tests/*.cjs`): v1only=false.

## Scope and mergeability

- Diff against base 5bbb9af: exactly 3 files, matching the task record — `.github/workflows/v1-build.yml`, `.github/workflows/verify-queue.yml`, task record. 54 insertions, 2 deletions.
- `git merge-tree --write-tree --name-only origin/main 936bdbf2` produced a clean tree (b212bd94). No conflicts.
- `git diff --check` clean. Both workflows parse as YAML. Secrets scan of the diff: no matches.
- Zero v0.9 drift: `git diff --exit-code -- roster-update/ public/ shared/` clean.
- The PR body states this "touches `v1-build.yml` lines different from #274 (timeout); either order merges cleanly" — confirmed: #274 is merged and this diff applies cleanly on top of it.

## CI verified at the exact head

- **Product ("Isolated v1 product"):** run 44990663974, completed, success, head_sha 936bdbf2, attempt 1. It ran 23m14s. The product workflow at this head already includes the new contract-test step.
- **Node/LORD ("Verify GSiS queue changes"):** run 44990660598, completed, success, head_sha 936bdbf2, attempt 1. All four regression shards and the full-suite gate pass, plus the new `scope` job's check (pass, 7s). No waiver is needed or used: this is a `claude/**` branch and both suites ran green at the exact head.

## Local verification (22 Nov 2026, TZ=Asia/Singapore)

Worktree at the exact head 936bdbf2. `npm ci` root and `v1/` both exit 0.

- The 16 v1 contract tests, run with the workflow's exact loop (`tests/v1-*.mjs` except `v1-product-*`): 16 pass, 0 fail.
- `npm run build` — exit 0, zero legacy drift.
- `node scripts/v1/build.mjs` — exit 0.
- `node scripts/v1/verify-build.mjs` — exit 0.
- Working tree clean after the runs.

## Quality gates Q01–Q08

- Q01 (scope): confined to two CI workflows and the task record. Pass.
- Q02 (tests): the 16 contract tests pass locally and in the product run at the head; the scope predicate is verified against four known diffs. Pass.
- Q03 (no live change): no Worker deployment, D1 migration, live-data change, or product behaviour change. Pass.
- Q04 (no secret in diff): clean. Pass.
- Q05 (regression): all four Node/LORD shards pass at the head; the v1 contract tests now also run in the product workflow. Pass.
- Q06 (build): canonical build and v1 build + verify-build pass with zero drift. Pass.
- Q07 (docs): task record states the change, the verification, and the risk. Pass, with two notes below.
- Q08 (review): this record is the exact-head review. Pass.

## Notes (not findings)

- The task record says "`full-suite` is a required check, so it still always reports." The first half is not enforced: `main` has no branch protection (GitHub API returns 404 "Branch not protected"), so no check is required in the enforced sense. What the PR actually guarantees — and what I verified — is that `full-suite` still always reports (its `if: always()` is kept, and the v1-only path exits 0 only when the scope job succeeded with v1only=true and the shards are skipped). The behaviour is correct; only the "required" premise is overstated.
- The PR body names the superseded head ce22c369 (see the head note above).

## Release notes

- v1-only PRs no longer run the four v0.9 regression shards; the 16 v1 contract tests now run in the product workflow instead.
- Any change outside the v1 path allowlist — including `shared/`, root files, and the queue workflow itself — still runs every shard.
- The `full-suite` check still always reports.
- No deployment authorised by this review.
