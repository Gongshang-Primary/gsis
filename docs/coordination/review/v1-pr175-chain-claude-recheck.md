# v1 chain recheck: PR #175 at `7783526` (covers #165 to #175), Claude

Project: **v1**. Model: Claude (session `session_01L5sZ14xpe864PwuPQKyrDF`, directed by the owner on 15 Nov to review v1). Reviewed 15 Nov 2026 (Asia/Singapore). Advisory; the owner authorises merges.

| Item | Value |
|---|---|
| Head rechecked | `778352626cb5c9eb7ba51633575b16bc7922a078` on `codex/v1-global-save-status` |
| Parents | `77e30ee` (head approved earlier) and `3248303` (main at merge time) |
| Tree | `d3f24176b859c6dc3fb10388adfa490a727d0c73` |
| Verdict | **Approve.** #165, #166, #167, #168, #169, #170, #171, #172, #173, #174 and #175 may merge in that order |

## Evidence I produced

1. **The merge is mechanical.** `git merge-tree --write-tree 77e30ee 3248303` gives tree `d3f24176`, identical to the tree of `7783526`. No hand edits.
2. **It contains main** as of `3248303`.
3. **Suite at the exact head:** worktree at `7783526`, `npm ci` (root and `v1/`), `TZ=Asia/Singapore`, Chromium path set. `node scripts/v1/test.mjs`: **93 of 93 product programs pass.**

Not verified by me: CI at this head (Codex reports both workflows green); canonical build drift; the hosted site. I ran on Node 22; the package asks for Node 24.15 or later.

## Why one recheck covers eleven PRs

The eleven PRs are one line and #175 contains the other ten. Each was approved at its earlier head (`v1-pr159-173-claude-review.md`, `v1-pr174-175-drafts-claude-review.md`). This head is those approved changes plus main, merged without edits.

## Conditions on the merge sequence

1. Merge in order with merge commits. No squash. No hand edits. Stop on any conflict.
2. After #175 merges, compare product paths between main and tree `d3f24176`: `v1/`, `tests/`, `scripts/`, `shared/` and every v0.9 source path. They must be identical. Files under `docs/` may differ, because review and task records reached main after this head was cut. Record both tree hashes. If any product path differs, stop and report before any further merge.
3. The intermediate states of main between these merges are not tested one by one. Nothing may be deployed from an intermediate state.

This approval grants no deployment or live-data authority.

## Amendment, 15 Nov 2026: merge #175 directly; do not merge #165 to #174 one by one

GitHub refused #165 after it was retargeted to main (HTTP 405, merge conflicts), while local Git merges it cleanly. Cause found: #165 at `38dabe6` and main have **two merge bases** (`57c9223b` and `175f34e5`), because main already holds #163 with main merged into it. Local Git resolves that case; GitHub's merge check does not. The same will happen for #166 to #174. This is not a content conflict.

Do not merge main into each PR. That would create ten new heads and ten new rechecks for no gain.

**Amended sequence. It replaces "Conditions on the merge sequence" item 1 above.**

1. Retarget **#175** to main. Its head `7783526` already contains main as of `3248303` and every chain head. `git merge-base --all origin/main 7783526` returns one base, `3248303`, so GitHub will merge it.
2. Merge #175 at exactly `7783526` with a merge commit. No squash. No hand edits. If the head has moved or GitHub reports a conflict, stop and report.
3. Verify the result. I computed the merge of main `7e4e36c` with `7783526`: tree `f958d207`. Against the tested tree `d3f24176` it differs in two files only, both under `docs/coordination/review/`. Product paths are identical. If main has moved again before the merge, repeat the comparison: only `docs/` may differ.
4. #165 to #174 then need no merge. Each head is an ancestor of `7783526` (checked for all ten: `38dabe6`, `5a2affa`, `af6065e`, `ecaa37e`, `f145434`, `01c1db1`, `eb63f82`, `d3d76fc`, `f7f9ea2`, `ba81883`). Close each one with a note that names the #175 merge commit that carried it, or let GitHub mark it merged where it does so. Record all eleven in the merge inventory with the same merge commit.
5. Undo the retarget of #165 only if it gets in the way; it changes no code.

This is safer than the first plan: main moves in one step from a tested state to a tested state, with no untested states in between. The approval above stands for head `7783526` and is unchanged.
