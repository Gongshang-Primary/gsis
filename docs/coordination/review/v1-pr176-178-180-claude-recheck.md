# v1 PRs #176, #178, #180 recheck at new heads, Claude

Project: **v1**. Model: Claude (session `session_01L5sZ14xpe864PwuPQKyrDF`). Reviewed 16 Nov 2026 (Asia/Singapore). Advisory; the owner authorises merges.

| PR | New head | Earlier reviewed head | Verdict |
|---|---|---|---|
| #176 Contacts direct editing | `de4d2834bbd6391db4a0df291c941770b3d9233f` | `5e44fdf` | **Approve to merge.** Deployment conditions C-1 and C-2 still stand |
| #178 Operation probe | `530a7add936a168184becaaacb82a24deaf5da18` | `bf2067c` | **Approve** |
| #180 Merge inventory | `fc256d771b44121e7375f620c7ec859ee8a66590` | none (new) | **Approve as document** |

Main at review time: `5ae8115`.

## #176

1. **The merge is mechanical.** Parents are `5e44fdf` (the head I approved) and `334731c` (main at the chain merge). `git merge-tree --write-tree 5e44fdf 334731c` gives tree `77e7396034fb`, identical to the tree of `de4d283`. No hand edits.
2. **Suite at the exact head:** `node scripts/v1/test.mjs`, **97 of 97 product programs pass.**
3. The findings and conditions in `v1-pr176-claude-review.md` are unchanged. Merging is approved. **Deploying is not**, until the owner confirms C-1 (Memberships filled for current staff) and C-2 (Contacts D1 backup taken immediately before deployment).

## #178

1. Rebased onto main. Still three paths: the task record, the probe program and its allow file.
2. **Missing-handler allow list unchanged:** the same 29 entries as at `bf2067c`. None added, none removed.
3. **My note N-2 is applied.** The 15 run-time call sites are pinned by file, line and kind, each with a reason. The program fails on an unpinned site, a stale pin, a duplicate pin, or a pin without a reason, and it carries its own negative controls for each.
4. **Suite at the exact head:** **94 of 94 product programs pass.**
5. **Mutation at this head:** I removed one pin. The program failed with "Unpinned runtime call site". Restored.

Note (low): pins use line numbers in the built v0.9 files. An edit that shifts those lines fails the program although nothing is missing. The right response is to update the pin with a reason, never to loosen the check. N-1 (run time against the 45 second bound) remains a thing to watch in CI.

## #180

Documentation only, 17 task and changelog files. I checked its inventory against the repository. For each merge the commit is on main and its second parent is exactly the reviewed head:

| PR | Reviewed head | Merge commit |
|---|---|---|
| #163 | `c791713` | `ea76563` |
| #136 | `8d62eda` | `59a1bd8` |
| #137 | `2cdc58d` | `5e077e2` |
| #179 | `75c5fc0` | `3248303` |
| #175, carrying #165 to #174 | `7783526` | `334731c` |
| #157 | `c68e8a9` | `5ae8115` |

The tree of `334731c` matches my tested tree `d3f24176` in every path outside `docs/`. The record states "not deployed" and keeps C-1 and C-2 as owner gates. Both are correct.

## Evidence limits

Worktrees at the exact heads, `npm ci` (root and `v1/`), `TZ=Asia/Singapore`, Chromium path set, Node 22 (the package asks for Node 24.15 or later). Not verified by me: CI at these heads; canonical build drift; the hosted site.

## What is now true on main, and what is not

After these three merge, main holds every v1 fix reviewed on 15 and 16 Nov. **None of it is deployed.** The hosted site was last verified at `26bbccd`. No hosted behaviour follows from any approval here.
