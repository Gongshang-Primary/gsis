# Review: PR #199 — Record selective v1 deployment as the default

- Reviewer: Muse (owner, 16 Nov: Muse replaces Claude for v1 exact-head review until Claude returns; source `claude/zealous-archimedes-4i2lv1` at `12b06eb`).
- Verdict: **APPROVED at the exact head**.
- Exact head: `02e6cd1f5004d05f0dd5f9f6f348b28b1d0db053`.
- Base before claim: `53f7e9850f0d1a20a0a37df4942c0aaed9e8b143` (the #198 merge). Claim `a638ed1` is already on main and records the exact owner wording for continuity.
- CI run: [43994399323](https://github.com/helper-gsps/gsis/actions/runs/43994399323), green, all 5 jobs (4 regression shards + full-suite), at the exact head. No separate product/package run was triggered for this documentation-only head; none is claimed.
- PR: https://github.com/helper-gsps/gsis/pull/199 (Codex, branch `codex/v1-selective-deployment-policy`; draft, not merged).
- Task record: `docs/coordination/tasks/v1-selective-deployment-policy.md` (in the PR; reviewer line already names Muse).

## What it does

Records the owner's standing instruction: **selective v1 deployment by default; full deployment only when explicitly instructed**. The directive applies immediately. It does not grant deployment authority or implement a workflow.

One directive row is added to `docs/coordination/OWNER_DIRECTIVES.md`; all previous directive content is preserved verbatim. The row records the owner's exact words ("unless explicitly instructed for full deployment, perform selective deployment"): for an authorised v1 rollout, deploy only the affected components and necessary dependencies, determined from built artifacts, shared dependencies and compatibility requirements rather than edited filenames alone. A full deployment requires explicit owner instruction; do not silently fall back to the all-services workflow or widen a rollout merely to refresh labels. The browser-triggered protected GitHub approval gate and applicable verification, backup, migration and recovery requirements are preserved. The row states plainly that the existing workflow currently deploys all nine Workers and does not yet implement selective deployment — this policy record is not evidence that a selective mode exists. It changes the default scope of future authorised deployments, not deployment authority.

## Checks run (local worktree at the exact head)

- Scope: the diff against the base is exactly the two claimed files, 16 insertions, no deletions — one added row in `OWNER_DIRECTIVES.md` and the new task record. No code, workflow, migration, configuration or live-system file changed. `git diff --check` clean.
- Merge-tree against current main: clean, no conflicts.
- Previous directives preserved: the diff shows only the single added row; every earlier row is untouched.
- Wording verified against the owner's own claim: commit `a638ed1d5cccdb9e5c8218dc0ff33a1fdccd501e` on main, authored by Song Wee, "Model: Codex / claim standing selective deployment directive", records the same instruction. The directive row quotes the owner's words exactly.
- Truthfulness: the row does not claim selective deployment exists. It says the existing workflow still deploys all nine Workers and that a browser-triggered selective workflow must be implemented and independently reviewed as separate work before a default v1 rollout is attempted. No application tests were run for this prose change, and none is claimed.
- No deployment is requested by this PR. The #198 full-deployment exception recorded in PR #200 stands as its own owner authorisation and is not widened by this default.

## Findings

None. No findings.

## Gates (Q01–Q08)

- Q01 Authority and scope: pass. The owner's own standing instruction, recorded first in their own claim commit; exact two-file documentation scope.
- Q02 Design and ownership: pass. Policy record only; implementation is explicitly separate future work.
- Q03 Security and privacy: pass. No permission, secret or live-data change; the protected approval gate is preserved, not bypassed.
- Q04 Concurrency and recovery: pass. No product behaviour changed; verification, backup, migration and recovery requirements are preserved in the directive.
- Q05 Resources and maintainability: pass. Docs only; no dependency or workflow change.
- Q06 Verification: pass. Wording checked against the owner's claim commit; exact-head Node/LORD CI green.
- Q07 Handoff and review: pass. This record; PR names the reviewer; draft, not merged.
- Q08 Release boundary: not applicable. No deployment authorised or performed. F5 OPEN; unperformed runtime UAT Not tested.

## Release notes

Policy only. Selective v1 deployment is now the recorded default; full deployment needs explicit owner instruction. The workflow to do selective deployment does not exist yet and is separate work.
