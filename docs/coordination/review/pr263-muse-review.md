# Review of PR #263 — Persist Review teacher and class fixture in D1

- **Reviewer:** Muse, at the exact head, under the owner's 16 Nov 2026 directive (Muse is the v1 reviewer at the exact head SHA, replacing Claude until Claude returns; source commit 12b06eb). No code, merges, or coordination by Muse.
- **PR:** #263, "test(v1/deploy): persist Review teacher and class fixture in D1 after #260/#247". Branch `antigravity/v1-deploy-recovery-test-fixture`. Head reviewed: `31be52c8`.
- **Status at review:** OPEN, not a draft. Product CI green at the head. MERGEABLE/CLEAN.
- **Verdict: APPROVED at the exact head 31be52c.** No findings.

## What it does

Test-only repair of the Deploy save-recovery fixture — repair item 1 in the 21 November Antigravity repair handoff (draft PR #262). The native #247 Review looks up the saved version, so a fixture that exists only in the browser working copy is correctly reported as unavailable; this PR seeds the fixture in the saved version instead.

- `tests/v1-product-deploy-save-recovery-browser.mjs`: before opening native Review, the test now creates a real synthetic teacher (`Tan <Escaped> Teacher`) in Contacts, accepts the EO field, pulls it into the saved Deploy version with `acceptContacts` (lease + `/change`), and adds a real class `1Gc` to the version with `saveDraft`. The Review check uses the real staff id and finds the real class by ref. The working-copy mutations (`doc.classes = [...]`, `doc.teachers = [...]`, renaming the teacher in place and restoring it) are removed.
- The `Unavailable teacher` fallback is still tested, now only for a genuinely missing id: a second queued edit uses `staff-genuinely-missing`, and the test asserts a heading "Assign Unavailable teacher to … · Math" appears for it.
- The readable-label, HTML-escaping, `Assigned`/`Not assigned`, no-opaque-staffId assertions and the #245 Scenario 1 pre-dispatch refusal check are unchanged in intent; Scenario 1 now also uses the real staff id.
- No product code is changed. This PR clears repair item 1 from the handoff.

## Scope and mergeability

- Diff against the merge-base d6e05597: exactly 2 files, matching the task record's Files Claimed — `docs/coordination/tasks/v1-deploy-recovery-test-fixture.md` and `tests/v1-product-deploy-save-recovery-browser.mjs`. 120 insertions, 28 deletions. (The task record names base d6e05597; the PR's base ref is f833f67, the #254 merge — the diff against that ref also shows #254's changes as absent, because the branch forked before them. The merge-base diff above is the PR's actual change, and it matches GitHub's file list.)
- `git merge-tree --write-tree --name-only origin/main 31be52c` produced a clean tree (e9ae50df). No conflicts. The merge keeps #254's and #261's changes from main and applies only this test change.
- `git diff --check` clean. Secrets scan of the diff: no matches.
- Zero v0.9 drift: `git diff --exit-code -- roster-update/ public/ shared/` clean.

## CI verified at the exact head

- **Product ("Isolated v1 product"):** run 44909406109, completed, success, head_sha 31be52c, attempt 1. This is the first product run at a head where the save-recovery fixture test passes: the program that failed at #261's head (and in #262's CI) now passes.
- **Node/LORD ("Verify GSiS queue changes"):** no run exists at this head. The workflow triggers only on `codex/**`, `muse/**`, `claude/**` branches, and no manual dispatch was made for this head. Approval rests on green product CI at the exact head plus the full local verification below, under the owner's 20 Nov 2026 waiver ("review all done by antigravity, ignore difference in notation, i will orchestrate") and the 21 Nov direction to review the Antigravity queue.

## Local verification (22 Nov 2026, TZ=Asia/Singapore, Playwright chromium-1234)

Worktree at the exact head 31be52c. `npm ci` root and `v1/` both exit 0.

- `node tests/v1-product-deploy-save-recovery-browser.mjs` — exit 0. All 17 groups pass, including the repaired Review-labels group ("readable assignment-review labels show persisted teacher/class/subject, Unavailable fallback, and Assigned/Not assigned with escaped text") and the Scenario 1 group.
- `node tests/deploy-save-review-labels.cjs` — exit 0.
- `npm run build` — exit 0, zero legacy drift.
- `node scripts/v1/build.mjs` — exit 0.
- `node scripts/v1/verify-build.mjs` — exit 0.
- Working tree clean after the runs.

## Quality gates Q01–Q08

- Q01 (scope): confined to one test file and its task record. Pass.
- Q02 (tests): the repaired test passes locally and in product CI at the exact head; the fallback is now asserted only for a genuinely missing id. Pass.
- Q03 (no live change): test-only; no Worker deployment, D1 migration, or live-data change. Pass.
- Q04 (no secret in diff): clean. Pass.
- Q05 (regression): the save-review-labels check passes; the previously failing program now passes in product CI. Pass.
- Q06 (build): canonical build and v1 build + verify-build pass with zero drift. Pass.
- Q07 (docs): task record names the handoff item, the exact scope, and the verification. Pass.
- Q08 (review): this record is the exact-head review. Pass.

## Findings

None.

## Release notes

- The Deploy save-recovery browser test now seeds its Review teacher and class in the saved version, so the native Review resolves them instead of reporting them unavailable.
- The `Unavailable teacher` fallback is still covered, now asserted only for a genuinely missing teacher id.
- This unblocks product CI for the other open PRs that fail only on this fixture once they rebase onto a main containing this fix.
- Hosted UAT is Not tested. No deployment authorised by this review.
