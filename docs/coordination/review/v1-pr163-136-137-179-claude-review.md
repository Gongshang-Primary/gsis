# v1 PRs #163, #136, #137, #179 recheck at new heads, Claude

Project: **v1**. Model: Claude. Reviewed 15 Nov 2026 (Asia/Singapore). Advisory; the owner merges.

| PR | New head | Earlier reviewed head | Kind | Verdict |
|---|---|---|---|---|
| #163 Contacts save recovery (UAT004) | `c791713` | `175f34e` | code, main merged in | **Approve** |
| #136 Contacts policy and readiness design | `8d62eda` | `0081eea` | docs | **Approve.** R-1 done |
| #137 Accelerated spec and Rev 49 source | `2cdc58d` | `b6cd8f5` | docs | **Approve.** R-2 done |
| #179 Merge records | `75c5fc0` | none (new, draft) | docs | **Approve as document.** Mark ready |

Main at review time: `46df6ce`.

## #163

1. **The merge is mechanical.** `c791713` has parents `175f34e` (the head I approved) and `c69d30c` (main). `git merge-tree --write-tree 175f34e c69d30c` gives tree `b3832a6f`, identical to the tree of `c791713`. No hand edits.
2. **Suite at the exact head:** worktree at `c791713`, `npm ci` (root and `v1/`), `TZ=Asia/Singapore`, Chromium path set. `node scripts/v1/test.mjs`: **79 of 79 product programs pass.**

Not verified by me: CI at this head; canonical build drift; the hosted site. I ran on Node 22; the package asks for Node 24.15 or later.

## #136

R-1 asked for one stale sentence to be refreshed. The readiness design now says that main holds an authoritative Contacts D1 owner with `/readiness` and `/readiness/check`, and marks the older wording as historical. Main was merged in. Against main, `OWNER_DIRECTIVES.md` gains only the 13 Nov Contacts B1 row that this PR always carried; both 15 Nov rows from main are preserved. No application file changes.

## #137

R-2 asked for a header. The accelerated specification now opens with a note that it is the 13 Nov historical baseline and that `OWNER_DIRECTIVES.md` and later merged plans override it. The Revision 49 source is unchanged: SHA-256 still begins `8fce6177b98d8e5f`, matching the digest recorded on main. The specification's own digest changes because of the header; the task record says so.

## #179

Documentation only, seven task and changelog files. I checked its merge inventory against the repository: for each of the eight listed merges (#160, #164, #161, #144, #158, #159, #162, #177) the merge commit is on main and its second parent is exactly the reviewed head stated. The records say "not deployed", which is correct.

## Note for the remaining chain

#165 to #175 will each get a new head when main is merged in. A mechanical merge of an approved head still needs the suite rerun at the new head, because main now carries other merged fixes. I will recheck each as it appears.
