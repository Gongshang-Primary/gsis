# Review: PR #227 — Integrate Cursor Team Kit into the v1 skill policy

- Reviewer: Muse, replacing Claude until Claude returns, per the owner's 16 November directive (source 12b06eb).
- Verdict: **APPROVED at the exact head** `2c1defe5a56fcdc3091d2054b20d8abac30a33c6`.
- Branch: `codex/v1-cursor-team-kit-policy`. Base/claim: `c0e2e7843dea229d3200c895b5ae4db9eb99426c`. PR status: open, MERGEABLE. GPT to merge.
- Docs only. No deployment authorised.

## What it does

The v1 skill policy links Cursor Team Kit v1.2.0 and uses its Thermo-Nuclear rubric for the structural review pass. GSiS retains separate correctness and security passes, and the GSiS quality gates apply to all three passes. `verify-this`, `run-smoke-tests`, and `loop-on-ci` are optional methods within the existing claim and review workflow. Merge, deployment, and live-data actions still require their existing authorisation.

- `SKILL_POLICY.md`: the Thermonuclear row now names the Cursor Team Kit rubric for the structural pass, and a new Cursor Team Kit section links the upstream kit, the review rubric, the GSiS quality gates, and the coordination workflow. The "Availability and truthful reporting" safeguards are untouched.
- Task record: status, base, decisions, and verification sections updated.

## Scope, merge, secrets

- Diff vs origin/main: exactly 2 files, matching the task record's exact-file list (`docs/v1/skills/SKILL_POLICY.md`, `docs/coordination/tasks/v1-cursor-team-kit-policy.md`). 16 insertions, 6 deletions.
- `git merge-tree --write-tree --name-only origin/main 2c1defe5a56fcdc3091d2054b20d8abac30a33c6` clean (tree 49b6f9d216f1fdee7b5310b0a7222ad8c7304781).
- `git diff --check`: clean. Secrets scan of the diff: clean.
- No installation, vendoring, skill runs, application code, workflow, or release-authority change, per the task record's out-of-scope list.

## Upstream verification (pinned commit 35a90942a7f02e1ebbc2443643179815f2147954)

Checked live against the cursor/plugins repository at the pinned commit:

- Kit tree exists at the linked path.
- `.cursor-plugin/plugin.json`: name `cursor-team-kit`, version `1.2.0`, license `MIT`.
- `LICENSE`: MIT License, Copyright (c) 2026 Cursor.
- All four referenced skills exist: `thermo-nuclear-code-quality-review`, `verify-this`, `run-smoke-tests`, `loop-on-ci`.
- The review rubric `SKILL.md` exists at the exact linked path (12,437 bytes; "Run an extremely strict maintainability review").
- Both relative links in the policy resolve in the repo: `../engineering/QUALITY_GATES.md` and `../../coordination/WORKFLOW.md`.

## Thermonuclear pause

The owner's pause on executing Thermonuclear remains in effect. This PR is reference-only: it names the rubric as the method for the structural pass when Thermonuclear is used, but adds no execution trigger, installs nothing, and runs no skill. The task record states the pause remains in effect for this task. No finding.

## CI at the exact head

- Node/LORD run 44420510852: success at head 2c1defe (all four shards + full-suite).
- No product CI: docs-only PRs do not trigger the isolated product workflow (the product workflow excludes these paths). The PR body's `npm run build` pass for all 18 components is builder-stated; it was not re-run locally, as no product or package path changed.

## Local checks at the exact head

- Read the full diff of both files; verified every upstream link and the relative links above.
- No local tests or builds run: docs-only change, no product paths touched.

## Findings

None.

## Quality gates

- Q01 and Q05 pass (pinned source verified, safeguards preserved). Q06 passes (links, whitespace, scope, exact-head Node/LORD CI). Q07 is this review. Q02–Q04 and Q08 are inapplicable to this prose change, as the PR body states.
- Hosted/runtime UAT: **Not tested**.
