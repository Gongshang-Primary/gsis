# v1 merge records — 15 November 2026

- Status: documented; exact-head CI and Claude review pending for the bookkeeping PR. The eight integration actions below are already merged.
- Owner/model: Codex. Coordinator: ChatGPT v1. Reviewer: Claude at the exact documentation head.
- Branch: `codex/v1-merge-records-20261115`.
- Refreshed main: `c69d30c682e11f10421e42efa746edc9b8729777`.
- Authority: owner instruction, "merge all applicable one by one logically". Workflow integration step 5 requires merged task claims to be closed. Eight reviewed PRs have already merged; this task records their status and the remaining gates. No new application work or deployment is authorised.

## Exact documentation scope

- `docs/coordination/tasks/v1-merge-records-20261115.md`
- `docs/coordination/tasks/v1-deploy-venue-publication.md`
- `docs/coordination/tasks/v1-deploy-clear-authority.md`
- `docs/coordination/tasks/v1-deploy-draft-status.md`
- `docs/coordination/tasks/v1-changelog-20261115.md`
- `docs/coordination/tasks/v1-uat-run-b-20261115.md`
- `docs/v1/accelerated-delivery/CHANGELOG_2026-11-15.md`

Only status/handoff text changes. Preserve every historical implementation/test entry. Existing open implementation PRs contain inherited copies of two task records; the same builder owns these records, and this bookkeeping PR must land after the affected implementation integrations or be refreshed to preserve their final statuses. It adds no implementation PR and does not deepen the implementation stack.

## Already completed merges

In order: #160, #164, #161, #144, #158, #159, #162, #177. All merged at reviewed heads with green exact-head CI; merge trees were verified against both parents with no hand edits. Main application commit is `c69d30c682e11f10421e42efa746edc9b8729777`.

## Acceptance and remaining gates

Exact seven-document scope; no application, workflow, dependency, configuration or generated-output changes; links and whitespace; prior historical text retained; merge evidence and pending review/CI stated accurately. Do not claim live deployment or runtime proof. No skill package executed; repository verification and simplicity principles applied manually.

PR163 was rejected by GitHub with HTTP405 despite a clean local merge. Its no-hand-edit main integration is `c791713cbf283fad9a63e66e963353e54d802636`; Claude recheck required before the dependent stack continues. PR136 R-1 refresh is `8d62eda95bb1e38ecab0ae0eeabcc67991623d10`; PR137 R-2 header is `2cdc58d039004f4be40e3c37ee96ec960672c84e`; both await Claude recheck. PR157 needs its author to preserve both owner-directive additions when resolving its conflict. PR132/#138 remain unreviewed historical drafts. F5 OPEN; official T1B-01/T1B-02 and unperformed runtime UAT Not tested.

No deployment, migration, provider send or live-data access. Documentation rollback changes records only, not the already-merged product.

## Verified merge inventory

| PR | Reviewed head | Merge commit |
| --- | --- | --- |
| [#160](https://github.com/helper-gsps/gsis/pull/160) | `ab24739203f3bcc03c5b7e6c96f8fa2144a84654` | `2d264b4fac63641218f15f922edcc8a8437b6d31` |
| [#164](https://github.com/helper-gsps/gsis/pull/164) | `11370014ed8b8eb73b8f0f15ec30eff744f7b1f9` | `507255c2e2b3b7d93dbf31542f26c980062ee50b` |
| [#161](https://github.com/helper-gsps/gsis/pull/161) | `1f4121a6b54de6f9973934992fea395fdc3cab81` | `706d9c8c274211c880d27e41711db49e721e3c6c` |
| [#144](https://github.com/helper-gsps/gsis/pull/144) | `1757b7fdc42f6264db9a81c95ecdc30aa4877470` | `7234882e9d1704b2289a27bed8a12fcc386de466` |
| [#158](https://github.com/helper-gsps/gsis/pull/158) | `16b718600d9a391afe90c00df5129095c73f8b57` | `78ec4a6c4de752f99b95a4f157bd64d200253a0f` |
| [#159](https://github.com/helper-gsps/gsis/pull/159) | `1dca6e7315431e7d8226c4e0b1555a34ebb1df21` | `d1fc7efd5c64a492be30624ad05f08eb12a150ba` |
| [#162](https://github.com/helper-gsps/gsis/pull/162) | `ee052420628e3567038df5141c448bc366d0d9ba` | `d0014c31f7e6288e9acd64815dbec7c95872474e` |
| [#177](https://github.com/helper-gsps/gsis/pull/177) | `89bc58022bc366ddb2e868150dec5a7afad3ad56` | `c69d30c682e11f10421e42efa746edc9b8729777` |

Verification: fetched main and all remote heads; read current instructions and branch-only reviews; inspected all 27 original open PR file inventories and exact-head CI. Each of the eight merges has its approved head as its second parent and a tree exactly equal to `git merge-tree --write-tree` on its two parents. Seven documentation paths only in this follow-up; prior chronological task/changelog entries are preserved. Relative-link and scoped whitespace checks pass. Application suites were not rerun for this prose-only change; its fresh full-suite CI and Claude recheck are separate gates. No skill package was executed.

PR163 integration: canonical and v1 builds passed without drift. The seven changed PR files are identical to Claude-approved `175f34e`; all other files match main `c69d30c`. Full regression CI [43721787634](https://github.com/helper-gsps/gsis/actions/runs/43721787634) passed at `c791713cbf283fad9a63e66e963353e54d802636`; product CI [43721792264](https://github.com/helper-gsps/gsis/actions/runs/43721792264) also passed. Both CI and the clean-head local product run passed 79/79 programs; the local report names `c791713` with workingTreeDirty:false. Full CI passed 1,178/1,178 current Node programs and 40/40 LORD on every shard, with discovery matching the unchanged runner and historical exclusions unchanged. Updated results are recorded in PR163 without rewriting the reviewed code.

Combined application main `c69d30c` is being tested by [43722379636](https://github.com/helper-gsps/gsis/actions/runs/43722379636) on `codex/v1-merged-ci-20261115-c69d30c`, a verification branch pointing to that exact existing commit. The workflow does not run on main pushes, so the branch supplies the ordinary configured CI trigger. It has no new commit, product change or implementation PR. Later main claim `46df6ceec9343b08dfecd3e39e8a79a9aac30178` adds only this documentation task.

Resume order after Claude rechecks PR163: #163 → #165 → #166 → #167 → #168 → #169 → #170 → #171 → #172 → #173 → #174 → #175. Retarget each child to main, recheck its actual diff/current head/CI, and return any changed head to Claude. Then retarget #176 and rerun at its head; bring #178 onto main and rerun as explicitly required. This approval does not waive either condition. Keep this bookkeeping PR after the affected code integrations or refresh it to preserve the final claim statuses.

PR136 and PR137 are documentation only at the heads above; their R-1/R-2 fixes need Claude recheck. PR157 remains on Claude's branch; its OWNER_DIRECTIVES conflict must retain all rows. PR132 and PR138 have no independent approval and are not merged or closed here. No further owner deployment decision is inferred from the current merge authorisation.
