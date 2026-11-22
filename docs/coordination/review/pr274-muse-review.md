# Review of PR #274 — Raise product job cap from 30 to 60 minutes

- **Reviewer:** Muse, at the exact head, under the owner's 16 Nov 2026 directive (Muse is the v1 reviewer at the exact head SHA, replacing Claude until Claude returns; source commit 12b06eb). No code, merges, or coordination by Muse.
- **PR:** #274, "Model: Claude / v1 CI: raise product job cap from 30 to 60 minutes". Branch `claude/v1-ci-timeout`. Head reviewed: `fd446e07`.
- **Status at review:** OPEN, not a draft. Product CI green at the head; Node/LORD CI green at the head. MERGEABLE/CLEAN.
- **Verdict: APPROVED at the exact head fd446e0.** No findings.
- **Head note:** the PR body names the earlier head `019bd68d` as the reviewed head. That head was superseded: the branch was merged with origin/main (through ab19517, the #263 merge) and the current head is fd446e0, a merge commit. This review is at fd446e0, and both CI suites below are verified at fd446e0.

## What it does

One line in `.github/workflows/v1-build.yml`: the `product` job's `timeout-minutes: 30` becomes `60`. Nothing else changes.

Why: the v1 product job hit the 30-minute ceiling and was cancelled — not failed — on #265, #266, #271 and #273, and on the first attempts at #258's and #259's heads. The suite has grown to 177+ programs (about 27 minutes on main; the PR body reports about 40 minutes locally at 187 programs). Sharding `scripts/v1/test.mjs` is named in the PR body as the follow-up; it is not part of this PR.

## Scope and mergeability

- Diff against base ab19517: exactly 1 file, 1 insertion, 1 deletion — `.github/workflows/v1-build.yml`.
- `git merge-tree --write-tree --name-only origin/main fd446e0` produced a clean tree (c7b482e2). No conflicts.
- `git diff --check` clean. No secret, password, or key material in the diff (it is a workflow timeout value).
- Zero v0.9 drift: `git diff --exit-code -- roster-update/ public/ shared/` clean. No product code is touched.
- No task record file is included; the change is documented in the PR body (why, the one-line change, and the combined local verification). Not a finding.

## CI verified at the exact head

- **Product ("Isolated v1 product"):** run 44971515447, completed, success, head_sha fd446e0, attempt 1. It ran 24m46s — inside the new 60-minute cap.
- **Node/LORD ("Verify GSiS queue changes"):** run 44971510805, completed, success, head_sha fd446e0, attempt 1. All four regression shards and the full-suite gate pass. No waiver is needed or used: this is a `claude/**` branch and both suites ran green at the exact head.

## Local verification (22 Nov 2026, TZ=Asia/Singapore)

Worktree at the exact head fd446e0. `npm ci` root and `v1/` both exit 0.

- Workflow YAML parses cleanly; `jobs.product.timeout-minutes` is 60.
- `npm run build` — exit 0, zero legacy drift.
- `node scripts/v1/build.mjs` — exit 0.
- `node scripts/v1/verify-build.mjs` — exit 0.
- Working tree clean after the runs.
- The timeout value itself is exercised by CI, not locally: the product run above completed at this head under the new cap. No product test is added or changed by this PR.

## Quality gates Q01–Q08

- Q01 (scope): one workflow timeout value. Pass.
- Q02 (tests): no product test change; the change is verified by its own CI runs at the head. Pass.
- Q03 (no live change): no Worker deployment, D1 migration, or live-data change; no product behaviour change. Pass.
- Q04 (no secret in diff): clean. Pass.
- Q05 (regression): all four Node/LORD regression shards and the full-suite gate pass at the head. Pass.
- Q06 (build): canonical build and v1 build + verify-build pass with zero drift. Pass.
- Q07 (docs): the PR body states the why, the change, and the verification. Pass, with the head note above: the body names the superseded head 019bd68.
- Q08 (review): this record is the exact-head review. Pass.

## Findings

None.

## Release notes

- The v1 product CI job cap rises from 30 to 60 minutes, so the growing suite (177+ programs) is no longer cancelled by the timeout.
- No product behaviour changes. The sharding follow-up is still open.
- No deployment authorised by this review.
