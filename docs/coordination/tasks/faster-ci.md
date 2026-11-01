# faster-ci: isolated regression shards and locked caches

- Status: local implementation ready for independent review; full exact-head GitHub CI pending
- Owner/model: Codex
- Reviewer/model: parent Codex independent review, then Claude at the published exact head
- Last updated (Asia/Singapore): 1 November 2026
- Branch: `codex/faster-ci`
- Base SHA: local mirror `55265848fef13255bcb6920f246306c191fb4907`, tree `57ecdf7d2bf05f64dfa64ff59f28e9a4f52dddf2`; byte-identical source tree to actual main `84a71b50a7aa60f0f5d546cba651c4a3cc44ed3e`
- Current head SHA: implementation commit containing this record (parent records the published SHA)
- PR: parent task publishes after review; none opened here
- User-authorised scope: CI-only speed improvement; parallel test execution and locked dependency/browser caching without dropping or weakening any existing check.
- Files/domains owned: `.github/workflows/verify-queue.yml`, `tests/run.cjs`, `tests/runner-shards.cjs`, this task record.
- Out of scope: product code, package/lock changes, deployment, live flags, messages, main updates, pushes and PR creation.
- Acceptance checks: unchanged default Node selection plus the new runner regression; four deterministic, disjoint, exhaustive shards; invalid/empty shard configurations fail; child failure stays red; each CI shard retains build, all six browser portability checks and literal `npm test` including all 38 LORD programs; existing `full-suite` check fails unless every shard succeeds.

## Authorisation and coordination

The owner assigned all open work to Codex and allowed multiple held PRs, overriding the older one-PR/lane-serialization defaults. Product merges remain held until Monday 2 November 2026, 08:00 SGT and owner-controlled. This CI-only task may merge before the Sunday 19:00 cutover because its diff contains no product code. The parent task owns publication order and external GitHub changes. This worktree creates no direct main claim/update.

## Implementation plan

1. Add a behavioral runner regression using temporary real test programs. First observe failure because listing/sharding is absent; then implement strict paired shard environment configuration and a JSON `--list` mode. Keep historical rules and per-program timeouts unchanged; default `npm test` remains the full selection.
2. Use four isolated GitHub matrix jobs, sequential programs inside each VM, and `fail-fast: false`. Run the existing build, portability checks and `npm test` in every VM. Retain the `full-suite` job name as an `always()` aggregate that accepts only a successful matrix result.
3. Enable the existing pinned setup-node action's npm cache with `package-lock.json`. Add an official SHA-pinned browser cache keyed by runner OS, architecture and the lock hash. Always run Playwright's `install --with-deps chromium`, including on cache hits, so cached binaries never skip OS dependency installation or repair.
4. Verify runner behavior, exact baseline selection, aggregate failure cases, build/parity, LORD and bounded local diagnostic evidence. The full final-head GitHub Node/LORD run is a required external gate, not a local claimed pass.

## Decisions and changes

- Four 1-based shards select round-robin from sorted filenames. Both `GSIS_TEST_SHARD_INDEX` and `GSIS_TEST_SHARD_TOTAL` must be positive canonical safe integers, index must not exceed total, and total must not exceed the selected program count. An empty selection is an error. No shard configuration means the complete current selection.
- `--list` returns the selected filename array as JSON without running programs or creating verification output. Unknown CLI arguments fail. Historical explanatory output remains in ordinary runs.
- Default npm script is unchanged: `node tests/run.cjs && python3 lord-suite/tests/run_all_checks.py`.

## Primary-source verification

- [actions/cache v4.2.4 ref](https://api.github.com/repos/actions/cache/git/ref/tags/v4.2.4) resolves to commit `0400d5f644dc74513175e3cd8d07132dd4860809`, verified through the official GitHub API on 1 November 2026. [Pinned action documentation](https://github.com/actions/cache/blob/0400d5f644dc74513175e3cd8d07132dd4860809/README.md) documents key/path caching and cache scopes.
- [Existing setup-node pin documentation](https://github.com/actions/setup-node/blob/49933ea5288caeca8642d1e84afbd3f7d6820020/README.md) documents `cache: npm`, lockfile hashing and `cache-dependency-path`; it caches downloaded packages, not `node_modules`. `npm ci` remains mandatory.
- [Playwright CI guidance](https://github.com/microsoft/playwright/blob/main/docs/src/ci.md#caching-browsers) says browser caching can cost as much as downloading, recommends a version-related key when caching, and requires separately installed Linux OS dependencies. The lock includes the exact Playwright version. Actual cache speed gains remain to be measured on GitHub; parallelization is the primary expected wall-time improvement.
- [GitHub workflow syntax](https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax) documents matrix `fail-fast`, job dependencies and `always()` for running despite an upstream failure. The aggregate's explicit success-only test fails for failure, cancellation, skip or an absent result.

## Verification

- After branch creation, `TZ=Asia/Singapore npm run build` passed: all 18 components. The final implementation also rebuilt all 18 successfully. Tracked product output remains identical to the base.
- Red/green: `TZ=Asia/Singapore node tests/runner-shards.cjs` first failed against the original runner because `--list` executed the fixture programs and propagated their failures. It then passed against the implementation, including real nonzero exits and signals, remaining-program execution after failure, default full execution, Singapore timezone, invalid/empty configuration, no-side-effect JSON listing and the 45,000/180,000 ms deadlines at the subprocess boundary.
- The same runner regression verifies the real inventory: **920 programs**, **230 per shard**, no duplicates, no drops, no empty shards and repeatable selection. The default includes every prior program plus `runner-shards.cjs`.
- A VM boundary comparison executed the base runner from `git show 55265848fef13255bcb6920f246306c191fb4907:tests/run.cjs` and the current runner with the same real directory/package inputs and intercepted only child process launch. **All 919 prior program names, order and deadlines match exactly**; the new runner regression is the sole added program. No historical exclusion or comparison rule changed.
- Parsed the final workflow with PyYAML, checked all four matrix entries, `fail-fast: false`, the six original portability commands, literal `npm test` and full 40-character action pins. Executed the aggregate's actual bash script with `SHARD_RESULT=success/failure/cancelled/skipped/''`: exit codes were **0/1/1/1/1**. No local actionlint installation was available; actual GitHub workflow execution remains required.
- Required post-switch `TZ=Asia/Singapore npm test`: baseline diagnostic, **interrupted with exit 130 after 193 completed programs (180 passed, 13 failed)**. It used the original runner loaded before implementation, so it is not a final-head gate. The run was deliberately bounded after reproducing the known unavailable browser/history inputs, as authorised in the task handoff; no full-suite result is claimed.
- The 12 browser failures were `absence080a-save-shortcut.cjs`, `absence718d-flow.cjs`, `asc0810-browser.cjs`, `baseline710-browser.cjs`, `calendar-stable-view-browser.cjs`, `calendar0810-birthday-responsive.cjs`, `calendar099-change-browser.cjs`, `contacts083-vcard-browser.cjs`, `contacts084-http-browser.cjs`, `deploy085-tg-review-browser.cjs`, `import708-browser.cjs`, `paid097-receipts-browser.cjs`. `package.cjs` failed because historical object `2efd6e003fa9ee3846cf590d07902a22309861ff` is absent (`fatal: Not a valid commit name`). These are retained failures, never counted as passes.
- Separate final `TZ=Asia/Singapore npm run test:lord` **failed**, after the preceding 14 programs succeeded, at `lord-suite/tests/gsis098h-background-ui.cjs`: Playwright's `chromium_headless_shell-1234` binary is absent. The remaining LORD programs did not run. **38/38 LORD is not claimed locally.** No browser installation bypass or test skip was added.
- Evidence logs retained beside this worktree: `../baseline-build.log`, `../baseline-test.log`, `../final-build.log`, `../final-lord.log`. No fresh local `npm ci` was possible/claimed: the exact shared locked dependencies were reused by the authorised `node_modules` symlink.
- `git diff --check` passed. The tracked delta is restricted to the workflow, runner, new runner regression and this record. No product/generated tree delta, deployment, provider send, flag update, main write, push or PR creation.

## Review

Pending parent independent review and final exact-head CI. No approval claimed.

## Deployment

Not deployed. No live setting, authority flag, school record, provider message or infrastructure change.

## Handoff

Parent task controls publication and owner handoff. Preserve the full-suite GitHub gate and record its exact head before calling the branch ready to merge. Four matrix jobs consume additional runner capacity and repeat setup/LORD checks; caches may provide little browser-time savings according to Playwright's guidance. Measure actual wall time on GitHub. Local Chromium/history limitations prevent a full local gate and must remain visible in the PR.
