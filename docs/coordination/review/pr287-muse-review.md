# Review: PR #287 — Log Workload Settings entry and IMP behaviour (Muse, exact head 9fa9f2df)

Project: v1 documentation (UAT log). Reviewer: Muse, at the exact head SHA, under the owner's 16 Nov 2026 directive (source commit 12b06eb): Muse reviews v1 PRs at the exact head, replacing Claude until Claude returns; no code, merges or coordination. GPT merges.

## Verdict

**APPROVED at exact head `9fa9f2df5e8b2bfb2ff7fcb5fac9415441003fd0`.**

## PR

- #287, `codex/v1-deploy-workload-settings-uat`, "Model: Codex / Log Workload Settings entry and IMP behaviour".
- State at review: OPEN, not a draft, MERGEABLE/CLEAN. Base is current main `5119a9b9`.
- Docs only: DEP-23-004 (Workload Settings opens in edit mode) and DEP-23-005 (where IMP appears and how the subject list is populated), from the owner's v1.10 screenshot of the 2026 T4 post-PSLE saved draft.

## CI at the exact head

- Verify GSiS queue changes at the head: `full-suite` pass, `scope` pass, regression shards **skipped** by design under #280's scope rule (both changed files are under `docs/v1/` and `docs/coordination/`).
- No "Isolated v1 product" run: product CI has no automatic docs-only trigger. This PR changes documentation only.

## Scope

Diff against the merge-base (`5119a9b9`, current main): **2 files, 27 insertions, 0 deletions.**

| File | Change |
| --- | --- |
| `docs/v1/DEPLOY_WORKLOAD_SETTINGS_UAT_2026-11-23.md` | +23, new: the UAT log (DEP-23-004, DEP-23-005, verification) |
| `docs/coordination/tasks/v1-deploy-workload-settings-uat.md` | +4: evidence section naming the accepted claim `5119a9b9` |

- `git merge-tree --write-tree --name-only origin/main 9fa9f2df` returns a clean tree (`3942f5a8…`). No conflicts.
- `git diff --check` clean. No secrets (documentation only).
- The task record's relative link (`../../v1/DEPLOY_WORKLOAD_SETTINGS_UAT_2026-11-23.md`) resolves.

## Content verification (read and re-run, not trusted)

- **Pinned revisions.** The log's v1.10 source is `d726896c` — verified as the merge of #282 on main (after #281's merge `8da52634`), i.e. the v1.10 product source before the docs-only claim commits. The v0.9.9y source `d9d180c` matches the known final v0.9 release source.
- **Blob parity verified.** `public/workload-ui.js` is blob `cb315328…` and `shared/workload.js` is blob `ed19444d…` at both `d726896c` and `d9d180c` — identical, as the log claims.
- **DEP-23-004 mechanism verified in source.** `workloadSettings` calls `selectionEditor('Workload settings', …)` directly when building the page, and applying queues `setWorkload` for the normal save flow. Opening the editor alone queues nothing. The acceptance criteria (view-first arrival, explicit Edit, Cancel without queued changes) follow from that code path.
- **DEP-23-005 mechanism verified in source.** `subjects(d)` is the union of Subject Load keys across levels, excluding exact `FT`, with aliases PE→PHE, Science→Sci, TTT→PD, plus `PD`. `nonTeachingActivities` renders the "Countable non-teaching activities" summary from `workload.nonTeachingActivities` and omits it when the list is empty; the editor preserves existing activity records when saving subject settings (`nonTeachingActivities` cloned into the `setWorkload` value when defined). The validator rejects an activity code that collides with a subject or reserved name, comparing case-insensitively via `subjectIdentity`. The log's "Activity presence in the hosted draft unverified" and "Hosted version data and activity provenance were outside this investigation" are stated openly as open items, not claimed.
- **IMP UI test re-run locally.** `TZ=Asia/Singapore node tests/imp-nonteaching-ui.cjs` in the worktree at the exact head: exit 0 ("PASS IMP UI: confirmed relief breakdown and name, Ledger activities, read-only settings summary, category-save preservation and deletion impact review"). The first attempt failed only because the fresh worktree had no `node_modules` (`Cannot find module 'jsdom'`); after `npm ci` (exit 0) the test passes. The PR body's claim that it passed at the deployed v1.10 source is therefore verified at this head's tree, which contains that source.

## Findings

None.

## Quality gates

- Q01 (scope): two documentation files inside the task record's stated scope. Pass.
- Q02–Q04: no implementation change. Not applicable.
- Q05: queue CI green at the exact head. Pass.
- Q06: the IMP UI test passes locally; no build is affected by a docs-only change. Pass.
- Q07: records verified against live state as listed above. Pass.
- Q08: this exact-head review. Pass.
- F5 remains OPEN. This PR is a UAT log; it does not close it. The hosted activity and authoring requirement remain open, as the log states.

## Release notes

Docs only. No deployment, migration or live-data effect. GPT to merge.
