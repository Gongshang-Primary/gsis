# Review of PR #269 — Distinguish uninitialized Layout year from storage failure (G04)

- **Reviewer:** Muse, at the exact head, under the owner's 16 Nov 2026 directive (Muse is the v1 reviewer at the exact head SHA, replacing Claude until Claude returns; source commit 12b06eb). No code, merges, or coordination by Muse.
- **PR:** #269, "Model: Antigravity / Distinguish uninitialized Layout year from storage failure (G04)". Branch `antigravity/v1-layout-first-import-g04`. Head reviewed: `f21bfd67`.
- **Status at review:** OPEN, not a draft. Product CI green at the head. MERGEABLE/CLEAN.
- **Verdict: APPROVED at the exact head f21bfd67.** No findings.
- **Head note:** the head is a merge commit, "Merge origin/main (800585c8) into antigravity/v1-layout-first-import-g04" — the PR is based on main 800585c8, and both CI and the local checks below are verified at f21bfd67.

## What it does

Repair from `docs/v1/ANTIGRAVITY_REPAIR_HANDOFF_2026-11-21.md` (Layout first-import prerequisite G04):

- `v1/services/layout/service.mjs`: `current()` returns `404 SNAPSHOT_NOT_INITIALIZED` (`retryable: false`) when no head exists yet for the selected year, keeping `503 SNAPSHOT_UNAVAILABLE` / `503 INTEGRITY_FAILED` exclusively for missing or corrupt R2 storage after a head exists.
- `v1/web/shared/layout-editor.js`: handles `SNAPSHOT_NOT_INITIALIZED` by showing clear first-import guidance and automatically opening the `Initial source setup` panel for authorized admins, while preserving #258's latest-date and session guards.
- `tests/v1-product-layout.mjs`: updates the uninitialized foreign-school assertion.
- `tests/v1-product-layout-first-import-g04.mjs` (new): 404 `SNAPSHOT_NOT_INITIALIZED`, browser first-import guidance + auto-open Initial source setup, initial import, 503 `SNAPSHOT_UNAVAILABLE` on deleted R2 object, 503 `INTEGRITY_FAILED` on corrupt R2 object.

## Scope and mergeability

- Diff against base 800585c8: exactly 5 files, matching the task record — `docs/coordination/tasks/v1-layout-first-import-g04.md`, `tests/v1-product-layout-first-import-g04.mjs`, `tests/v1-product-layout.mjs`, `v1/services/layout/service.mjs`, `v1/web/shared/layout-editor.js`. 207 insertions, 9 deletions.
- `git merge-tree --write-tree --name-only origin/main f21bfd67` produced a clean tree (0ef34a87) against current main (which now includes the #268, #271, #265, #267, #264, #273 and #266 merges). No conflicts.
- `git diff --check` clean. Secrets scan of the diff: no matches.
- Zero v0.9 drift: `git diff --exit-code -- roster-update/ public/ shared/` clean after `npm run build`.

## CI verified at the exact head

- **Product ("Isolated v1 product"):** run 45017306244, completed, success, head_sha f21bfd6702097f2a50d56bbda616e23f1b417336, attempt 2. The successful attempt ran 32m26s (11:56:51Z–12:29:17Z) — inside the 60-minute cap #274 raised it to. The run was still in progress at the 20:10 SGT check and completed during this review; this record verifies the completed successful attempt at the exact head.
- **Node/LORD ("Verify GSiS queue changes"):** absent — this is an `antigravity/**` branch and the workflow triggers only on `codex/**`, `muse/**` and `claude/**` branches. No waiver is hidden: under the owner's 20 Nov waiver ("review all done by antigravity, ignore difference in notation, i will orchestrate") and 21 Nov direction, this approval rests on green product CI at the exact head plus the full local verification below.

## Local verification (22 Nov 2026, TZ=Asia/Singapore, Playwright chromium-1234)

Worktree at the exact head f21bfd67. `npm ci` root and `v1/` both exit 0.

- `node tests/v1-product-layout-first-import-g04.mjs` — PASS (404 `SNAPSHOT_NOT_INITIALIZED` + browser first-import guidance, distinct from 503 `SNAPSHOT_UNAVAILABLE` and 503 `INTEGRITY_FAILED` after head exists).
- `node tests/v1-product-layout.mjs` — PASS.
- `node tests/v1-product-layout-timed-timetable-browser.mjs` — PASS (#258 guards intact: stale real owner failure cannot replace a newer successful result, timed timetable UI filters/flags, protected state clears on session change).
- `npm run build` — exit 0, zero legacy drift.
- `node scripts/v1/build.mjs` — exit 0 (380 artifacts, sourceCommit f21bfd67).
- `node scripts/v1/verify-build.mjs` — exit 0.
- Working tree clean after the runs.

## Quality gates Q01–Q08

- Q01 (scope): confined to the Layout first-import distinction, one new test, one updated assertion, and the task record. Pass.
- Q02 (tests): the PR's tests pass locally and in the product run at the head. Pass.
- Q03 (no live change): no Worker deployment, D1 migration, live-data change, or product behaviour change beyond the first-import distinction. Pass.
- Q04 (no secret in diff): clean. Pass.
- Q05 (regression): product CI green at the head; Node/LORD absent under the disclosed waiver (see CI above). Pass.
- Q06 (build): canonical build and v1 build + verify-build pass with zero drift. Pass.
- Q07 (docs): task record states the change, the verification, and the out-of-scope bounds. Pass.
- Q08 (review): this record is the exact-head review. Pass.

## Release notes

- Layout now distinguishes an uninitialized year (404 with first-import guidance and auto-open setup) from storage failure after a head exists (503).
- No deployment authorised by this review.
