# Review: PR #281 — Fix Venues browser test cleanup for v1.10 (Muse, exact head 5b79347a)

Project: v1 release. Reviewer: Muse, at the exact head SHA, under the owner's 16 Nov 2026 directive (source commit 12b06eb): Muse reviews v1 PRs at the exact head, replacing Claude until Claude returns; no code, merges or coordination. GPT merges.

## Verdict

**APPROVED at exact head `5b79347ab8de4836317b3ede80c670de7887282a`.**

## PR

- #281, `codex/v1-release-v110`, "Model: Codex / Fix Venues browser test cleanup for v1.10". Reviewer named: Muse (for the test repair).
- State at review: OPEN, not a draft, MERGEABLE/CLEAN. Base is current main `1041e392` (the v1.10 release claim; #275 merged as `23bc2404`).
- This head supersedes `bfbda08f`. The approval is for `5b79347a` only and does not carry to any other head.

## CI at the exact head

- Isolated v1 product, run 45032628317, head `5b79347ab8de4836317b3ede80c670de7887282a`, event pull_request, completed **success** (28m31s). The PR body states 190/190 programs passed, including the repaired Venues test; the run's success conclusion is verified here, and the repaired program's PASS is verified locally below.
- Verify GSiS queue changes, run 45032623038, head `5b79347a`, event push, completed **success**. Jobs: `scope` success, `full-suite` success, regression shards **skipped** by design under #280's scope rule (all three changed files are under `v1/`, `tests/v1-*` and `docs/coordination/`).
- This is a `codex/**` branch, so Node/LORD ran. No waiver needed.

## Scope

Diff against the merge-base (`1041e392`, current main): **3 files, 21 insertions, 6 deletions.**

| File | Change |
| --- | --- |
| `tests/v1-product-venues-empty-register-guidance.mjs` | Teardown only: wait for Roster toolbar images to settle, navigate pages to `about:blank`, drain routes with `{ behavior: "wait" }`, then close Chromium before the Worker closes. The PASS log line moves after cleanup. |
| `v1/release.mjs` | `RELEASE_LABEL` `v1.09` → `v1.10` (one line). |
| `docs/coordination/tasks/v1-release-v110.md` | Scope line updated to include the test teardown; new "Release test repair" section (22 Nov 22:17 SGT). |

- `git merge-tree --write-tree --name-only origin/main 5b79347a` returns a clean tree (`a11c6416…`). No conflicts.
- `git diff --check` clean. Secrets scan of the diff: no secret values.
- The label is display only (file header: "Product display label only. API, storage and workbook schema versions are independent."). It flows into the built web output via `scripts/v1/build-web.mjs` (page title, release badge, `asset-manifest.json` `releaseLabel`); verify-build output at this head shows `GSIS_RELEASE_LABEL ("v1.10")`.
- No migration files and no workflow files change, so the task record's claim that they match v1.09 holds by no-change. Previous live release v1.09 at `e107b5e` and implementation base `23bc2404` (#275 merge) both check out against main history.

## Failure and correction (verified, not trusted)

- The previous head `bfbda08f`, product run 45025967990, conclusion **failure**. The run log shows exactly one failing program — `v1-product-venues-empty-register-guidance.mjs`, status fail, exit 1 — at the same timestamp as `TypeError: fetch failed [cause]: SocketError: other side closed`. That matches the PR body's account: the feature assertions passed, then a pending browser route failed when the local Worker (Miniflare) connection closed during teardown.
- The fix changes teardown only. All feature assertions, the test timeout and the PASS message wording are unchanged. The new sequence (wait for `document.images` to complete → `about:blank` → `unrouteAll({ behavior: "wait" })` → close Chromium → close the suite) addresses the exact race the failure shows: late Roster toolbar image loads racing the Worker shutdown.

## Local verification at the exact head

Worktree `~/workspace/gsis-work/review/wt281-review` at `5b79347a`. TZ=Asia/Singapore, NODE_NO_WARNINGS=1, GSIS_BROWSER_EXECUTABLE / ROSTER_TEST_CHROMIUM / LORD_TEST_CHROMIUM = Playwright chromium-1234.

- `npm ci` (root): exit 0. `npm ci --prefix v1`: exit 0.
- `node tests/v1-product-venues-empty-register-guidance.mjs`: exit 0, **twice in a row** (the failure was a teardown race, so stability across repeat runs is the check that matters). PASS line printed after cleanup both times.
- `node tests/v1-product-venues-register-ui.mjs` (neighbouring Venues program): exit 0.
- `npm run build`: exit 0. `git diff --exit-code`: zero tracked drift.
- `node scripts/v1/build.mjs`: exit 0. `node scripts/v1/verify-build.mjs`: exit 0.
- **Artifact digest verified independently.** Artifact 14758464741 (`gsis-v1-5b79347a…`, 14,110,746 bytes, not expired) downloaded from run 45032628317; its SHA-256 is `d6e5c02e3d8d5841a17ecd025e0e63251c3bb2b70b17819eb99b54fcee8c3815`, exactly the digest stated in the PR body.

## Findings

None.

## Quality gates

- Q01 (scope): three files — one test teardown, one display-label line, one task-record section. All inside the release task's stated scope. Pass.
- Q02–Q04: no implementation change to product behaviour. The label is display only; the test change is teardown sequencing. Not applicable beyond the checks above.
- Q05: product CI green at the exact head (run 45032628317); queue CI green (run 45032623038). Pass.
- Q06: root and v1 builds pass; zero drift; artifact digest matches. Pass.
- Q07: records verified against live state as listed above. Pass.
- Q08: this exact-head review. Pass.
- F5 remains OPEN. This PR is a test repair and a label increment; it does not close F5. Hosted signed-in UAT, provider sends, template activation and hosted restore remain untested, as the task record states.

## Release notes

- v1.10 label only; no product behaviour change. The eight fresh private D1 backups, the final-main-tree verification and the owner-approved deployment gate are still ahead and are not covered by this review — they are the task record's own next steps, not this PR's.
- GPT to merge. Deployment is the owner's call through the existing protected workflow.
