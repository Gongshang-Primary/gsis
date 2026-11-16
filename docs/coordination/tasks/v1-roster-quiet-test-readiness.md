# Roster quiet-mode regression: wait for toolbar readiness

Model: Codex. Coordinator: ChatGPT. Reviewer: Muse at the exact head. Status: merged; deployment pending. Updated: 16 November 2026 (Asia/Singapore). Branch: `codex/v1-roster-quiet-test-readiness`. Base: main `a14132856f5dacc4132118ed441c9f4c619ec15e`.

## Scope and authorization

This test-only correction supports the owner's authorized v1.01 release and fixes the already documented PR185 F1 test race. ChatGPT authorizes this independent two-file task alongside PR191 (release label) and PR192 (Memberships); all three scopes are disjoint. No additional product implementation or stacking on an unreviewed branch. Open PR182 is v0.9 and disjoint. Main, remote heads and all open PR file lists were refreshed before claiming.

Exact allowlist:

1. `docs/coordination/tasks/v1-roster-quiet-test-readiness.md`
2. `tests/v1-product-roster-native-quiet.mjs`

## Evidence and intended correction

`docs/coordination/review/pr185-muse-review.md` F1 identifies an immediate `count()` assertion after waiting only for the workload banner. The client emits the workload event before returning data to the Roster renderer; the toolbar appears later. The same unchanged test failed at line 24 in PR191 run `43811771561` and a local reproduction, although run `43811117828` passed 114/114 at the identical head. The test and involved Roster/client modules are byte-identical to current main.

Wait for the exact publish/send toolbar controls to become visible before counting them. Retain exact-count assertions, absence of quiet-mode UI/network calls, real allocation/receipt/D1/reload checks and unauthenticated denial. Do not add sleeps, retries, skipped assertions, relaxed counts, product changes or increased timeouts.

## Checks and boundaries

Run the real browser/Workers/D1 test, canonical build/no drift, runner discovery and required exact-head Node/LORD and product CI. Record the failed evidence and final outcomes in the PR. No visible product change, schema/configuration change, hosted access or provider send. No skill package invoked; the repository's systematic-debugging and verification principles apply directly. F5 OPEN; T1B-01/T1B-02 and hosted runtime UAT Not tested. Deployment remains subject to review, final candidate checks, fresh backups and the existing GitHub approval gate.

## Implementation and evidence

Accepted claim: main `5310ce9`. The change adds two exact-locator visibility waits inside `openAllocation`, before the unchanged assertions, so first load and reload both wait for their real UI dependency. Three test lines added; no production, workflow, timeout, retry or dependency changes.

`TZ=Asia/Singapore npm run build` passed with no generated drift. `TZ=Asia/Singapore GSIS_BROWSER_EXECUTABLE=/usr/bin/chromium node tests/v1-product-roster-native-quiet.mjs` passed all existing real browser/Worker/D1 checks. The unchanged test immediately before this correction failed at line 24 with `0 !== 1`, matching PR185 F1 and PR191 CI. Runner discovery and `git diff --check` pass. Required full Node/LORD and product CI evidence will be recorded against the pushed head in the PR; those gates and Muse review are pending. Q01–Q05 pass; Q06 full suites pending, Q07 review pending, Q08 no deployment from this test-only work.

## Claim closure and integration — 16 November 2026

[Merged PR #193](https://github.com/helper-gsps/gsis/pull/193) by merge commit [90103db](https://github.com/helper-gsps/gsis/commit/90103db0a82d5106c6b7b87fdf3e6e4a59e79f63), preserving reviewed head `d491d40379cf5dd6f5444d894988ee6663d21da2`. Muse approval is in [the review record](../review/pr193-muse-review.md), published on main at `45b9e55`. [Full Node/LORD CI](https://github.com/helper-gsps/gsis/actions/runs/43813919851) and [product/package CI](https://github.com/helper-gsps/gsis/actions/runs/43815243202) passed at that exact head. Earlier failures and their disposition remain in the review and PR; this closure does not erase them.

Clean mechanical merge; no hand edits to reviewed product/test files. Q06–Q07 complete for this implementation. The implementation claim is closed. Deployment remains pending final combined-source CI, fresh private backups and the existing protected GitHub environment approval. No deployment, hosted migration, staff-data write, credential change or provider activation has occurred in this integration. F5 OPEN; official T1B-01/T1B-02 and hosted/runtime UAT Not tested.
