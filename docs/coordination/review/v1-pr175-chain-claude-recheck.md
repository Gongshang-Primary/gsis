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
