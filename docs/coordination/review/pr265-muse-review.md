# Review of PR #265 — Calendar year archive: bind previewDigest and accurate YearStructure/DayNotes counts

- **Reviewer:** Muse, at the exact head, under the owner's 16 Nov 2026 directive (Muse is the v1 reviewer at the exact head SHA, replacing Claude until Claude returns; source commit 12b06eb). No code, merges, or coordination by Muse.
- **PR:** #265, "fix(v1/calendar): bind previewDigest and accurate YearStructure/DayNotes counts in year archive". Branch `antigravity/v1-calendar-year-archive-ui`. Head reviewed: `9c491c6c`.
- **Status at review:** OPEN, not a draft. Product CI green at the head. MERGEABLE/CLEAN.
- **Verdict: APPROVED at the exact head 9c491c6c.** No findings.
- **Head note:** the head is a merge commit, "Merge origin/main (800585c8) into antigravity/v1-calendar-year-archive-ui" — the PR is based on main 800585c8, and both CI and the local checks below are verified at 9c491c6c.

## What it does

Repair from `docs/v1/ANTIGRAVITY_REPAIR_HANDOFF_2026-11-21.md` (Calendar year archive):

- `v1/services/calendar/service.mjs`: `preview()` returns both `digest` and `previewDigest`, queries `yearStructure` and `dayNotes` rows for the selected years, includes their metadata in the preview digest payload, and returns accurate `YearStructure` and `DayNotes` counts.
- `scripts/v1/build-web.mjs`: the built Calendar archive caller sends `previewDigest: archivePreview.previewDigest || archivePreview.digest` (same for `wipePreview`) with a stable per-preview `operationId` for lost-response recovery.
- `tests/v1-product-calendar-year-archive-browser.mjs` (new): two synthetic years (2026 & 2027) in Chromium + Miniflare D1/R2 — accurate `Events 1 · YearStructure 2 · DayNotes 1` preview counts, stale-preview `409 PREVIEW_CHANGED` refusal, browser confirmation archiving only 2026, idempotent `operationId` replay.

## Scope and mergeability

- Diff against base 800585c8: exactly 4 files, matching the task record — `docs/coordination/tasks/v1-calendar-year-archive-ui.md`, `scripts/v1/build-web.mjs`, `tests/v1-product-calendar-year-archive-browser.mjs`, `v1/services/calendar/service.mjs`. 299 insertions, 3 deletions.
- `git merge-tree --write-tree --name-only origin/main 9c491c6c` produced a clean tree (76daa3cd) against current main (which now includes the #268 merge). No conflicts.
- `git diff --check` clean. Secrets scan of the diff: no matches.
- Zero v0.9 drift: `git diff --exit-code -- roster-update/ public/ shared/` clean after `npm run build`.

## CI verified at the exact head

- **Product ("Isolated v1 product"):** run 45017292480, completed, success, head_sha 9c491c6ce1289757eae4183b8ffdb91e35d3e013, attempt 1. It ran 24m35s — inside the 60-minute cap #274 raised it to.
- **Node/LORD ("Verify GSiS queue changes"):** absent — this is an `antigravity/**` branch and the workflow triggers only on `codex/**`, `muse/**` and `claude/**` branches. No waiver is hidden: under the owner's 20 Nov waiver ("review all done by antigravity, ignore difference in notation, i will orchestrate") and 21 Nov direction, this approval rests on green product CI at the exact head plus the full local verification below.

## Local verification (22 Nov 2026, TZ=Asia/Singapore, Playwright chromium-1234)

Worktree at the exact head 9c491c6c. `npm ci` root and `v1/` both exit 0.

- `node tests/v1-product-calendar-year-archive-browser.mjs` — PASS (previewDigest binding, accurate Events/YearStructure/DayNotes counts, stale-preview 409 rejection, Chromium browser confirm, idempotent replay).
- `npm run build` — exit 0, zero legacy drift.
- `node scripts/v1/build.mjs` — exit 0 (380 artifacts, sourceCommit 9c491c6c).
- `node scripts/v1/verify-build.mjs` — exit 0.
- Working tree clean after the runs.

## Quality gates Q01–Q08

- Q01 (scope): confined to the Calendar archive preview contract, the built archive caller, one browser test, and the task record. Pass.
- Q02 (tests): the PR's browser test passes locally and in the product run at the head. Pass.
- Q03 (no live change): no Worker deployment, D1 migration, live-data change, or product behaviour change beyond the archive preview binding. Pass.
- Q04 (no secret in diff): clean. Pass.
- Q05 (regression): product CI green at the head; Node/LORD absent under the disclosed waiver (see CI above). Pass.
- Q06 (build): canonical build and v1 build + verify-build pass with zero drift. Pass.
- Q07 (docs): task record states the change, the verification, and the out-of-scope bounds. Pass.
- Q08 (review): this record is the exact-head review. Pass.

## Release notes

- The Calendar year archive preview now binds the displayed preview digest with a stable operation ID, and reports accurate YearStructure and DayNotes counts; stale previews are refused.
- No deployment authorised by this review.
