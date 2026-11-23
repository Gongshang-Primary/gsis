# Review of PR #271 — Allow provisional active:null records in LORD manual Contacts refresh

- **Reviewer:** Muse, at the exact head, under the owner's 16 Nov 2026 directive (Muse is the v1 reviewer at the exact head SHA, replacing Claude until Claude returns; source commit 12b06eb). No code, merges, or coordination by Muse.
- **PR:** #271, "Model: Antigravity / Allow provisional active:null records in LORD manual Contacts refresh". Branch `antigravity/v1-lord-manual-contacts-refresh`. Head reviewed: `ba3bc4b1`.
- **Status at review:** OPEN, not a draft. Product CI green at the head. MERGEABLE/CLEAN.
- **Verdict: APPROVED at the exact head ba3bc4b1.** No findings.
- **Head note:** the head is a merge commit, "Merge origin/main (800585c8) into antigravity/v1-lord-manual-contacts-refresh" — the PR is based on current main 800585c8, and both CI and the local checks below are verified at ba3bc4b1.

## What it does

Repair from `docs/v1/ANTIGRAVITY_REPAIR_HANDOFF_2026-11-21.md` (LORD manual Contacts refresh):

- `v1/services/lord/service.mjs`: `refreshReferences()` now accepts provisional Contacts records with `active: null` (unknown activity) instead of failing the manual refresh with `503 REFERENCE_UNAVAILABLE`. One line changed: the guard becomes `r.active !== null && typeof r.active !== "boolean"`.
- Records with `active !== true` are still excluded from `lord_references` (unknown activity and accepted authority preserved), and malformed non-boolean/non-null `active` values still fail with `503`.
- `tests/v1-product-lord-manual-contacts-refresh.mjs` (new): mixed active/inactive/provisional projection succeeds through manual refresh, imports only known active staff, preserves unknown activity, rejects malformed `active: "Y"` with 503.

## Scope and mergeability

- Diff against base 800585c8: exactly 3 files, matching the task record — `docs/coordination/tasks/v1-lord-manual-contacts-refresh.md`, `tests/v1-product-lord-manual-contacts-refresh.mjs`, `v1/services/lord/service.mjs`. 156 insertions, 1 deletion.
- `git merge-tree --write-tree --name-only origin/main ba3bc4b1` produced a clean tree (eba41c60). No conflicts.
- `git diff --check` clean. Secrets scan of the diff: no matches.
- Zero v0.9 drift: `git diff --exit-code -- roster-update/ public/ shared/` clean after `npm run build`.

## CI verified at the exact head

- **Product ("Isolated v1 product"):** run 45017311670, completed, success, head_sha ba3bc4b124a1c64d11aaf4a3623bd4a494991e30, attempt 1. It ran 24m38s — inside the 60-minute cap #274 raised it to.
- **Node/LORD ("Verify GSiS queue changes"):** absent — this is an `antigravity/**` branch and the workflow triggers only on `codex/**`, `muse/**` and `claude/**` branches. No waiver is hidden: under the owner's 20 Nov waiver ("review all done by antigravity, ignore difference in notation, i will orchestrate") and 21 Nov direction, this approval rests on green product CI at the exact head plus the full local verification below.

## Local verification (22 Nov 2026, TZ=Asia/Singapore, Playwright chromium-1234)

Worktree at the exact head ba3bc4b1. `npm ci` root and `v1/` both exit 0.

- `node tests/v1-product-lord-manual-contacts-refresh.mjs` — PASS (mixed active/inactive/provisional projection succeeds, imports only known active staff, preserves unknown activity, rejects malformed `active: "Y"` with 503).
- `npm run build` — exit 0, zero legacy drift.
- `node scripts/v1/build.mjs` — exit 0 (380 artifacts, sourceCommit ba3bc4b1).
- `node scripts/v1/verify-build.mjs` — exit 0.
- Working tree clean after the runs.

## Quality gates Q01–Q08

- Q01 (scope): confined to the LORD `refreshReferences()` guard, one regression test, and the task record. Pass.
- Q02 (tests): the PR's regression test passes locally and in the product run at the head. Pass.
- Q03 (no live change): no Worker deployment, D1 migration, live-data change, or product behaviour change beyond accepting provisional `active: null` records in manual refresh. Pass.
- Q04 (no secret in diff): clean. Pass.
- Q05 (regression): product CI green at the head; Node/LORD absent under the disclosed waiver (see CI above). Pass.
- Q06 (build): canonical build and v1 build + verify-build pass with zero drift. Pass.
- Q07 (docs): task record states the change, the verification, and the out-of-scope bounds. Pass.
- Q08 (review): this record is the exact-head review. Pass.

## Release notes

- LORD manual Contacts refresh no longer fails with 503 on provisional records whose activity is unknown (`active: null`); malformed activity values still fail.
- No deployment authorised by this review.
