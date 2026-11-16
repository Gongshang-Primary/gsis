# Review: PR #186 — Refuse ambiguous saved workload selection (#181 C-1)

- Reviewer: Muse (owner, 16 Nov: Muse replaces Claude for v1 exact-head review until Claude returns; source `claude/zealous-archimedes-4i2lv1` at `12b06eb`).
- Verdict: **APPROVED at the exact head**.
- Exact head: `4613bc643a3cd2fa50b2099c1dad62b5d5af6491`.
- Base: `4429b81077c7256f4c4123984ccceff82bcc316e` (accepted claim after #183 merged).
- CI run: [43800402580](https://github.com/helper-gsps/gsis/actions/runs/43800402580), green, all 5 jobs (4 regression shards + full-suite), plus the product check, at the exact head.
- PR: https://github.com/helper-gsps/gsis/pull/186 (Codex, branch `codex/v1-roster-ambiguous-workload`).
- Task record: `docs/coordination/tasks/v1-roster-ambiguous-workload.md` (in the PR; reviewer line still names Claude — stale, superseded by the owner's 16 Nov role switch noted in the PR body).

## What it does

When Roster has no published Deploy workload and several saved versions match the requested date, it now reports unavailable workload with an explicit reason instead of silently choosing the most recently edited version. A verified publication still takes precedence over draft edits. No zero R is invented.

The change is two lines in `v1/services/deploy/roster-workload.mjs`: the matching query goes from `LIMIT 1` to `LIMIT 2`, and the no-candidate guard becomes a not-exactly-one guard (`candidates.length !== 1`) returning the existing unavailable-source contract, with a distinct ambiguity reason when more than one version matches. The pointer and candidate rechecks are unchanged, and the verified-publication path is untouched.

## Checks run (local worktree at the exact head, TZ=Asia/Singapore, Playwright chromium-1234)

- `npm ci`: exit 0.
- New test `tests/v1-product-roster-ambiguous-workload.mjs`: exit 0. "PASS C-1 built browser/Workers/D1: overlapping and blank ranges unavailable; one match resumes; school/deletion isolation; no invented verified R/publication".
- Existing test `tests/v1-product-roster-workload-snapshot.mjs`: exit 0. Published workload survives draft saves and allows automatic publication; copies refresh on republish; receipts replay.
- Existing test `tests/v1-product-roster-estimated.mjs`: exit 0. Estimated availability, candidates and allocation; authority/revision/idempotency guards; no automatic publication; no verified R capture; durable restart replay.
- `npm run build`: exit 0, no generated drift (`git status` clean after build).
- Merge-tree against current main (`6d6ca0e`): clean, no conflicts.
- Scope: the diff against the base is exactly the four allowlist paths (task record, handoff doc, service change, new test). No probe allowlist change, as claimed.
- Secrets scan of the diff: none.
- Read the service diff: the only behavioural change is the LIMIT and the guard; the reason strings are explicit; no source ID is selected and no quota is fabricated when ambiguous.

## Findings

None. No findings.

## Gates (Q01–Q08)

- Q01 Authority and scope: pass. Owner work order 16 Nov item 3(a), #181 C-1; four-path allowlist held; no stacking on unreviewed heads.
- Q02 Design and ownership: pass. Bounded two-line query/guard change; Deploy owns the workload projection; Roster copies it, never pins it.
- Q03 Security and privacy: pass. No auth change; foreign-school and deleted rows still excluded (covered by the new test); no secrets.
- Q04 Concurrency and recovery: pass. Pointer/candidate rechecks preserved; no cross-D1 atomicity claimed; verified publication still wins.
- Q05 Resources and maintainability: pass. No dependency added; query bounded to two rows.
- Q06 Verification: pass. New test plus both existing workload regressions pass locally; exact-head CI green.
- Q07 Handoff and review: pass. This record; PR names the reviewer; no merge or deployment requested.
- Q08 Release boundary: not applicable. No deployment, migration or activation; hosted/runtime UAT and T1B-01/T1B-02 remain Not tested; F5 OPEN.

## Release notes

The estimated-workload banner now explains that matching saved versions are ambiguous instead of naming an arbitrary source. Rollback is code only: reverting restores the unsafe newest-version choice; no data conversion.
