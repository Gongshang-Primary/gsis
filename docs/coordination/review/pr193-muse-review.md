# Review: PR #193 — Wait for Roster toolbar readiness in the quiet-mode regression

- Reviewer: Muse (owner, 16 Nov: Muse replaces Claude for v1 exact-head review until Claude returns; source `claude/zealous-archimedes-4i2lv1` at `12b06eb`).
- Verdict: **APPROVED at the exact head**.
- Exact head: `d491d40379cf5dd6f5444d894988ee6663d21da2`.
- Base / accepted claim: `5310ce9cb747ceacd0d56a84c6c2f5d07f9634eb` (main).
- CI run: [43813919851](https://github.com/helper-gsps/gsis/actions/runs/43813919851), green, all 5 jobs (4 regression shards + full-suite), at the exact head. Product/package CI [43815243202](https://github.com/helper-gsps/gsis/actions/runs/43815243202) green at the exact head (113/113 product programs; artifact `gsis-v1-d491d40379cf5dd6f5444d894988ee6663d21da2`, ID 14203096117, SHA-256 `28f6c3937370bfdebfdc25b01a436d0e4fa7dabef59ca18700e153facc3cefb8`).
- PR: https://github.com/helper-gsps/gsis/pull/193 (Codex, branch `codex/v1-roster-quiet-test-readiness`).
- Task record: `docs/coordination/tasks/v1-roster-quiet-test-readiness.md` (in the PR; reviewer line already names Muse).

## What it does

Test-only fix for the timing race documented as minor finding F1 in `docs/coordination/review/pr185-muse-review.md`. The Roster quiet-mode regression waited for the workload banner, then immediately counted publish controls; the banner renders before the asynchronous toolbar, so the unchanged code alternated between pass and `0 !== 1`. This change adds two exact-locator visibility waits — for "Let teachers see" and "Send WhatsApp to all affected" — inside the existing `openAllocation` helper, before the unchanged assertions, so first load and reload both wait for their real UI dependency. Three test lines added. No sleep, test retry, timeout increase, skipped assertion, product, build or workflow change. No visible change. Disjoint from PR #191 (labels), PR #192 (Memberships) and PR #182 (v0.9); not stacked on an unreviewed implementation.

## Checks run (local worktree at the exact head, TZ=Asia/Singapore, Playwright chromium-1234)

- `npm ci` (repo root and `v1/`): exit 0.
- Corrected test `tests/v1-product-roster-native-quiet.mjs`: exit 0. "PASS F08: no quiet control/request; native allocation receipt, D1 persistence and reload; authentication intact".
- Unchanged `tests/v1-product-roster-tables.mjs`: exit 0 locally. "PASS Roster canonical XLSX validation; no writes before native preview/reason/save; real D1 commit with lost-response retry after restart; stale/foreign/duplicate/malformed/permission rejection; configured-only profile navigation."
- `npm run build`: exit 0, no generated drift (`git status` clean after build).
- `node scripts/v1/build.mjs`: exit 0.
- `node scripts/v1/verify-build.mjs`: exit 0. "PASS real Wrangler LOCAL upgrade from deployed 0001: additive migrations applied once, all five upgrade tables present; no cloud credentials or operations".
- Merge-tree against current main: clean, no conflicts.
- Scope: the diff against the base is exactly the 2 claimed paths, 9 insertions. `git diff --check` clean.
- Secrets scan of the diff: none.
- Read the full test diff: the two waits use exact accessible-name locators for the same buttons the unchanged count assertions then count; every original assertion (quiet-control/network absence, real allocation/receipt/D1/reload, authentication) is retained verbatim.
- Note on the first product run: the initial product CI run [43813920094](https://github.com/helper-gsps/gsis/actions/runs/43813920094) at the same head finished 112/113 — the corrected quiet-mode test passed (7.438s), but the unchanged `v1-product-roster-tables.mjs` reached the 45-second process limit (exit 143) after printing its assertions-passed message at 44.97 seconds, before Chromium/Miniflare/filesystem cleanup. The independent run [43815243202](https://github.com/helper-gsps/gsis/actions/runs/43815243202) passed 113/113 at the same head, with the unchanged table test exiting successfully in 36.775s, and it exited successfully locally as well. Earlier green CI runs completed it in 14.444s (label head) and 25.480s (Memberships head). This is evidence of timing variability, not a teardown hang or a product regression; no timeout was raised and the failed run remains recorded. If it repeats, investigate phase timings separately rather than retrying blindly.

## Findings

None. No findings. Finding F1 from the #185 review is now resolved by this change.

## Gates (Q01–Q08)

- Q01 Authority and scope: pass. Bounded test-only scope; two claimed paths only.
- Q02 Design and ownership: pass. Waits for the real UI dependency instead of a sleep or retry.
- Q03 Security and privacy: pass. Test-only; no auth, permissions, data or provider change.
- Q04 Concurrency and recovery: pass. The wait removes the race rather than masking it; no assertion weakened.
- Q05 Resources and maintainability: pass. No new dependency; no product change.
- Q06 Verification: pass. Corrected test passes locally; exact-head Node/LORD CI and the independent product/package CI run green.
- Q07 Handoff and review: pass. This record; PR names the reviewer; no merge or deployment requested.
- Q08 Release boundary: not applicable. No deployment, migration, live data, credentials or provider activation. F5 OPEN; T1B-01/T1B-02 and hosted/runtime UAT Not tested.

## Release notes

None. Test-only: the Roster quiet-mode regression now waits for the publish toolbar before counting its controls.
