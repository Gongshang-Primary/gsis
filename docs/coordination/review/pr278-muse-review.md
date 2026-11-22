# Review of PR #278 — Roster: 06:29 final-run outcome to duty SMC (W2)

- **Reviewer:** Muse, at the exact head, under the owner's 16 Nov 2026 directive (Muse is the v1 reviewer at the exact head SHA, replacing Claude until Claude returns; source commit 12b06eb). No code, merges, or coordination by Muse.
- **PR:** #278, "Model: Claude / v1 Roster: 06:29 final-run outcome to duty SMC (W2)". Branch `claude/v1-final-run-outcome`. Head reviewed: `c846a760`.
- **Status at review:** OPEN, not a draft. Product CI green at the head; Node/LORD CI green at the head. MERGEABLE/CLEAN.
- **Verdict: APPROVED at the exact head c846a76.** No findings.
- **Head note:** the PR body names the earlier head `c323cf17` as the reviewed head. That head was superseded: the branch was merged with origin/main (through ab19517, the #263 merge) and the current head is c846a76, a merge commit. This review is at c846a76, and both CI suites below are verified at c846a76.
- **Serial note:** the PR body states this is serial after #276 and #277 — all three touch `v1/services/roster/service.mjs` (different lines). #276 and #277 are approved but not yet merged. If either merges first and this branch's head moves (rebase or merge), this approval does not carry to the new head: a fresh exact-head review is required.

## What it does

Owner decision 21 Nov 2026 (template review rows 13/15/18, "Split: use 13 + 15"): the approved-but-unused templates become the 06:29 final-run outcome messages to the duty SMC. At the 06:29/06:30 scheduled ticks on a school day, after the shared logic runs:

| Final 06:29 run | To duty SMC | Template |
| --- | --- | --- |
| Complete, periods uncovered | uncovered list | `relief_manual_review` (APPROVED) |
| Complete, none uncovered | allocation summary + Relief Health | `relief_final` (APPROVED) |
| Not complete | unchanged shared alert | `smc_attention` |

One alert per date (`final-outcome:<date>`); a replayed tick or the 06:30 tick does not resend. The shared duty-SMC, quiet-hour and delivery rules apply (kind `smc_alert`, audience duty SMC).

- `v1/services/roster/final-run-notifications.mjs` (new, 38 lines): `queueFinalRunOutcome(next, c, tick)` runs only at slot minutes 389/390 (06:29/06:30) on a school day and only when a `T06:29` optimisation run completed; it dedupes on the `final-outcome:<date>` key in `smcAlerts`, computes health via `Allocation.health`, and queues the outcome through `Operations.smcAlert`. It is a v1-only module because the 06:29 code in `shared/roster-operations.js` also builds frozen v0.9 outputs.
- `v1/services/roster/service.mjs`: one call — `queueFinalRunOutcome(next, c, body.tick)` — after `refreshNewSummaries` in `scheduledCommunication`, before the tick's commit, so the alert is persisted with the tick's changes.
- Activation is configuration only: `WHATSAPP_TEMPLATES_JSON` needs `relief_manual_review` and `relief_final` mapped (both APPROVED). No live change is made.

## Call-site verification

The PR body and task record state openly that the call site inside the tick is not exercised end to end; the module is tested directly on the shared fixture. I verified the call site by code read: `scheduledCommunication(ctx, slot)` builds `body.tick = Math.floor(now / 60000) * 60000` (minute-aligned), the call passes exactly `(next, c, body.tick)` — the module's expected arguments — and sits after `refreshNewSummaries` and before `prepared(...)` commits, so the queued alert lands in the same commit as the tick's other changes. `body.tick` is already used by the surrounding code, so the value is established. The missing end-to-end tick test is a stated gap, not a finding: the module's five cases are all tested directly (see below).

## Scope and mergeability

- Diff against base ab19517: exactly 4 files, matching the task record's scope — task record, `tests/v1-product-roster-final-run-outcome.mjs` (new, 63 lines), `v1/services/roster/final-run-notifications.mjs` (new, 38 lines), `v1/services/roster/service.mjs` (2 added lines). 155 insertions, 0 deletions.
- `git merge-tree --write-tree --name-only origin/main c846a76` produced a clean tree (04b5be4a). No conflicts — against current main, which does not yet contain #276's or #277's product changes (see the serial note above).
- `git diff --check` clean. Secrets scan of the diff: no matches.
- Zero v0.9 drift: `git diff --exit-code -- roster-update/ public/ shared/` clean. The shared operations file is untouched.

## CI verified at the exact head

- **Product ("Isolated v1 product"):** run 44971522747, completed, success, head_sha c846a76, attempt 1. It ran 26m20s.
- **Node/LORD ("Verify GSiS queue changes"):** run 44971519999, completed, success, head_sha c846a76, attempt 1. All four regression shards and the full-suite gate pass. No waiver is needed or used: this is a `claude/**` branch and both suites ran green at the exact head.

## Local verification (22 Nov 2026, TZ=Asia/Singapore, Playwright chromium-1234)

Worktree at the exact head c846a76. `npm ci` root and `v1/` both exit 0.

- `node tests/v1-product-roster-final-run-outcome.mjs` — exit 0. Gaps → `relief_manual_review` with the uncovered summary to the duty SMC; the 06:30 replay sends nothing; covered → `relief_final` with the allocation summary and Relief Health; incomplete → nothing; off-slot → nothing.
- `node tests/v1-product-roster-service.mjs` — exit 0.
- `node tests/v1-product-roster-adhoc-delivery.mjs` — exit 0.
- `node tests/v1-product-operation-probe.mjs` — exit 0. 404 probes, knownMissing 0.
- `npm run build` — exit 0, zero legacy drift.
- `node scripts/v1/build.mjs` — exit 0.
- `node scripts/v1/verify-build.mjs` — exit 0.
- Working tree clean after the runs.

## Quality gates Q01–Q08

- Q01 (scope): confined to the final-run outcome module, its one call site, and one test. Pass.
- Q02 (tests): the new test proves all five module cases; the call site is verified by code read (see above) and its end-to-end gap is stated openly in the PR body and task record. Pass.
- Q03 (no live change): no Worker deployment, D1 migration, live-data change, or provider send in this PR; activation is a later configuration step. Pass.
- Q04 (no secret in diff): clean. Pass.
- Q05 (regression): roster-service, adhoc-delivery, and the operation probe pass; all four Node/LORD shards pass in CI. Pass.
- Q06 (build): canonical build and v1 build + verify-build pass with zero drift. Pass.
- Q07 (docs): task record states the behaviour table, the samples, why a v1 module, the activation mapping, and the not-covered item. Pass, with the head note above: the PR body names the superseded head c323cf17.
- Q08 (review): this record is the exact-head review. Pass.

## Findings

None.

## Release notes

- At the 06:29 final run, the duty SMC now gets one outcome message: the uncovered list when periods remain uncovered, or the allocation summary with Relief Health when everything is covered.
- A run that did not complete keeps the existing shared alert. A replayed or 06:30 tick never resends.
- The two outcome templates stay inactive until mapped in configuration.
- Hosted UAT is Not tested. No deployment authorised by this review.
