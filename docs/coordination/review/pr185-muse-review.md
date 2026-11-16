# Review: PR #185 — Remove obsolete v1 Roster quiet mode (F08)

- Reviewer: Muse (owner, 16 Nov: Muse replaces Claude for v1 exact-head review until Claude returns; source `claude/zealous-archimedes-4i2lv1` at `12b06eb`).
- Verdict: **APPROVED at the exact head**.
- Exact head: `cc175dcf68e7da49153e77028984b32700c931bc`.
- Base: `6b6a402124ffeeed174b7eedbb9213a0ce6d934d` (accepted claim on main).
- CI run: [43799672125](https://github.com/helper-gsps/gsis/actions/runs/43799672125), green, all 5 jobs (4 regression shards + full-suite), plus the product check, at the exact head.
- PR: https://github.com/helper-gsps/gsis/pull/185 (Codex, branch `codex/v1-roster-remove-quiet-mode`).
- Task record: `docs/coordination/tasks/v1-roster-remove-quiet-mode.md` (in the PR; reviewer line still names Claude — stale, superseded by the owner's 16 Nov role switch noted in the PR body).

## What it does

Removes the obsolete Apps Script "Quiet mode" control and its polling from the v1 Roster (Assign Relief) screen only. Native D1 allocation, notification quiet hours, and the publish/send controls keep their behaviour. The v0.9 source is untouched: a small v1-only build adapter (`scripts/v1/remove-roster-quiet-mode.mjs`) strips the quiet-mode block, markup and hookup from the copied source at build time, with strict source-shape checks.

## Checks run (local worktree at the exact head, TZ=Asia/Singapore, Playwright chromium-1234)

- `npm ci`: exit 0.
- New test `tests/v1-product-roster-native-quiet.mjs`: **passed on the third local run** (see finding F1 below). Full pass line: "PASS F08: no quiet control/request; native allocation receipt, D1 persistence and reload; authentication intact".
- Existing test `tests/v1-product-operation-probe.mjs`: exit 0. 396 operations, 26 known missing (F08 removed, 27 to 26), 121 scripts, all 15 existing dynamic pins unchanged, negative controls retained.
- `npm run build`: exit 0, no generated drift (`git status` clean after build).
- Merge-tree against current main (`38aa133`): clean, no conflicts. The PR body's warning that the branch predates the #183 merge does not block merging: the tree merges cleanly.
- Scope: the diff against the base is exactly the five allowlist paths (task record, adapter, `build-web.mjs` import/call only, new test, allowlist JSON). No other files.
- Secrets scan of the diff: none.
- Read the adapter: it blanks the quiet-mode IIFE block while preserving line positions, removes the three markup/hook fragments only on exact match, and throws if any quiet-mode caller remains or the source shape changes. It cannot silently retain the retired caller.

## Findings

### F1 (minor, test robustness — not a product defect)

The new test's line-24 assertion counts the "Let teachers see" button with `count()` and no wait, immediately after waiting only for the "Estimated workload" text. Locally it failed twice with `0 !== 1` at that line, then passed on the third run, and it passed in CI. A debug run of the same steps showed the button present (publish-relief count 2, day-actions count 1, quiet count 0), so the publish toolbar renders slightly after the workload text and the assertion races it. The removal itself is not implicated: the quiet-mode control was absent (count 0) in every run.

Recommendation for a follow-up: wait for the publish toolbar (or use `expect().toHaveCount(1)`) before that assertion. No change required before merge; the test passes in CI at this head.

## Gates (Q01–Q08)

- Q01 Authority and scope: pass. Explicit owner consent (16 Nov work order item 3(c)); five-path allowlist held; no stacking on unreviewed heads.
- Q02 Design and ownership: pass. One v1-only adapter, strict shape checks, line positions preserved, no new feature logic in `build-web.mjs`.
- Q03 Security and privacy: pass. No auth change; anonymous mutation still denied (401, covered by the passing test). No secrets.
- Q04 Concurrency and recovery: pass. Native allocation commits with receipt, survives reload; no cross-D1 atomicity claimed.
- Q05 Resources and maintainability: pass. No dependency added; no background work added; the adapter fails loudly on source drift.
- Q06 Verification: pass with F1 noted. New test, probe, build and exact-head CI all green; the local flake is a test-timing race, reproduced and explained.
- Q07 Handoff and review: pass. This record; PR names the reviewer; no merge or deployment requested.
- Q08 Release boundary: not applicable. No deployment or activation; runtime UAT and T1B-01/T1B-02 remain Not tested; F5 OPEN.

## Release notes

v1 Roster Assign Relief no longer shows the obsolete Quiet mode control and no longer calls the missing `/api/roster/quiet-mode` endpoint. Native allocation, publishing and notification controls are unchanged. Rollback is code/build only: reverting restores the obsolete control and its broken request.
