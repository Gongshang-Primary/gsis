# Review of PR #259 — Calculate Deploy planning workload from version staff

- **Reviewer:** Muse, at the exact head, under the owner's 16 Nov 2026 directive (Muse is the v1 reviewer at the exact head SHA, replacing Claude until Claude returns; source commit 12b06eb). No code, merges, or coordination by Muse.
- **PR:** #259, "Model: Codex / Calculate Deploy planning workload from version staff". Branch `codex/v1-deploy-workload-planning`. Base 12472f5. Head reviewed: `0a4480a32df98f0915e4e434639b5dc70e9b6797`.
- **Status at review:** OPEN, DRAFT. The owner presented this PR for review on 21 Nov 2026; the draft flag is noted, not a blocker. Product CI green at the head; Node/LORD CI green at the head. MERGEABLE/CLEAN.
- **Verdict: APPROVED at the exact head 0a4480a.** No findings.

## What it does

The owner reported v1.09 Workload showing zero full-time teachers and empty specialist pools alongside nonzero assigned periods. Matched synthetic inputs pinned the cause: the v1 browser calculator's closed-over eligibility required accepted Contacts teaching evidence, so active draft teachers without accepted capacity facts were excluded from the pools while their assigned periods were kept. Changing the selector predicate in #204 did not change the calculator.

- `scripts/v1/build-web.mjs`: the embedded calculator now takes an explicit eligibility policy — `calculate(t, catalogue, eligibility=eligible)`. The internal guard uses `eligibility(t)`. The default stays the accepted-evidence `eligible`, so nothing else changes behaviour by default.
- `v1/web/shared/deploy-ui.js`: `window.workloadData()` passes version planning eligibility (`planningEligible`) as the calculator's eligibility argument, so Workload, Stats, and Ledger planning benchmarks (headcount, benchmark, specialist pools) use the selected version's staff and assignments. Unknown activity, excluded-staff rules, historical assignment totals, FAJT and part-time treatment, unavailable values for missing data, and existing formulas are preserved.
- The planning basis is labelled on screen: each of `renderWorkload`, `renderWorkloadStats`, and `renderWorkloadSummary` prepends "Planning estimate from this version. Relief quotas (R) use accepted Contacts evidence." and stamps the same basis onto the tables as `data-report-basis`.
- `v1/web/shared/core-table.js`: visible Excel report metadata includes "Calculation Basis" when the table carries `data-report-basis`.

What stays unchanged, by design and verified by the test: the default accepted-evidence calculator, server R calculations, published workload, Roster relief quotas, accepted Contacts facts, and saved Deploy documents. The change is browser calculation wiring plus shared visible-report metadata; no Worker, D1, migration, or deployment change. Rollback reverts the UI changes without rewriting stored data.

## Scope and mergeability

- Diff against base 12472f5: exactly 5 files, matching the task record's exact scope — `docs/coordination/tasks/v1-deploy-workload-planning.md`, `scripts/v1/build-web.mjs` (2 lines), `v1/web/shared/deploy-ui.js`, `v1/web/shared/core-table.js` (1 line), `tests/v1-product-deploy-workload-planning-browser.mjs`.
- The task record names claim base 0c98b728; the branch was rebased onto 12472f5 before review. The diff checked here is against the PR base 12472f5.
- `git merge-tree --write-tree --name-only origin/main 0a4480a` produced a clean tree (b57b3a6f). No conflicts.
- `git diff --check` clean. Secrets scan of the diff: no secret, password, API-key, or private-key matches.
- Zero v0.9 drift: `git diff --exit-code -- roster-update/ public/ shared/` clean.

## CI verified at the exact head

- **Node/LORD ("Verify GSiS queue changes"):** run 44889382013, completed, success, head_sha 0a4480a. This is a `codex/**` branch, so the verify-queue workflow ran; no waiver is needed or used for this PR.
- **Product ("Isolated v1 product"):** run 44890636374, completed, success, head_sha 0a4480a, 176/176 programs.
- The first product run at this head (44889381895) reached the 30-minute job limit after 175 passes with no failed assertion and was cancelled; the PR body states its one unfinished program (webhooks integration) passed locally. The PR-triggered run 44890636374 then passed all 176/176 at the same head. The timeout is recorded here as a CI ceiling, not a test failure.

## Local verification (21 Nov 2026, TZ=Asia/Singapore, Playwright chromium-1234)

Worktree at the exact head 0a4480a. `npm ci` root and `v1/` both exit 0. (Note: the first local run was interrupted by a runtime restart after the new browser test passed; the remaining checks were re-run from the verified checkpoint. The re-run is idempotent local verification with no external effect.)

- `node tests/v1-product-deploy-workload-planning-browser.mjs` — exit 0. Log asserts: planning Workload restores the full-time/specialist pools and retains excluded assignment totals; Stats and Ledger share the planning basis without inventing R; the visible report workbook retains the planning calculation basis; read-only browser reports leave owner documents, accepted relief, and publication paths unchanged.
- `node tests/v1-product-deploy-planning-eligibility.mjs` — exit 0.
- `node tests/v1-product-deploy-planning-eligibility-browser.mjs` — exit 0.
- `node tests/v1-product-contacts-projection.mjs` — exit 0.
- `node tests/v1-product-roster-workload-snapshot.mjs` — exit 0.
- `node tests/v1-product-roster-workload-browser.mjs` — exit 0.
- `npm run build` — exit 0, zero legacy drift.
- `node scripts/v1/build.mjs` — exit 0.
- `node scripts/v1/verify-build.mjs` — exit 0.
- Working tree clean after the runs.

## Quality gates Q01–Q08

- Q01 (scope): confined to Deploy planning workload calculation wiring, its basis labelling, and the Excel metadata line. Pass.
- Q02 (tests): the new browser test failed before the fix (0 full-time teachers) and passes after (2 full-time teachers, 3 core PE specialists, 1 supplementary FAJT specialist), with inactive, unknown, MK, and missing-Contacts teachers kept out of the pools while their historical assigned periods stay intact. Pass.
- Q03 (no live change): browser-only; no Worker, D1, migration, or deployment change. Pass.
- Q04 (no secret in diff): clean. Pass.
- Q05 (regression): planning eligibility, Contacts projection, and Roster workload snapshot/browser regressions all pass. Pass.
- Q06 (build): canonical build and v1 build + verify-build pass with zero drift. Pass.
- Q07 (docs): task record describes the bug, the matched-input reproduction, the fix, and the verification. Pass.
- Q08 (review): this record is the exact-head review. Pass.

## Findings

None.

## Release notes

- Deploy Workload, Stats, and Ledger now compute planning headcount and specialist pools from the selected version's staff and assignments. The planning basis is labelled on screen and in Excel exports.
- Published workload and Roster relief quotas still use accepted Contacts evidence. Server R is unchanged.
- Hosted UAT is Not tested. No deployment authorised by this review.
