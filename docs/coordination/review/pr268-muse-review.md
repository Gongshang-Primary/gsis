# Review of PR #268 — Keep Calendar venue picker suggestions open on blur and immediate refocus

- **Reviewer:** Muse, at the exact head, under the owner's 16 Nov 2026 directive (Muse is the v1 reviewer at the exact head SHA, replacing Claude until Claude returns; source commit 12b06eb). No code, merges, or coordination by Muse.
- **PR:** #268, "Model: Antigravity / Keep Calendar venue picker suggestions open on blur and immediate refocus". Branch `antigravity/v1-calendar-venue-picker-focus`. Head reviewed: `5891c131`.
- **Status at review:** OPEN, not a draft. Product CI green at the head. MERGEABLE/CLEAN.
- **Verdict: APPROVED at the exact head 5891c131.** No findings.
- **Head note:** the head is a merge commit, "Merge origin/main (800585c8) into antigravity/v1-calendar-venue-picker-focus" — the PR is based on current main 800585c8, and both CI and the local checks below are verified at 5891c131.

## What it does

Repair from `docs/v1/ANTIGRAVITY_REPAIR_HANDOFF_2026-11-21.md` (Calendar venue picker focus):

- `scripts/v1/build-web.mjs`: transforms the built v1 Calendar venue picker blur handler (sourced from the v0.9 Calendar source, which is untouched) so focusing or typing cancels any pending delayed `close()` timer, and the 100ms blur timer only closes suggestions when `document.activeElement !== input`.
- `tests/v1-product-calendar-venue-picker-focus-browser.mjs` (new): Chromium + local Workers/D1 browser regression test — blur + immediate refocus keeps suggestions visible past 100ms, Escape cancels cleanly without dropping chips, multi-room `v-hall-a,v-hall-b` saves to D1.

## Scope and mergeability

- Diff against base 800585c8: exactly 3 files, matching the task record — `docs/coordination/tasks/v1-calendar-venue-picker-focus.md`, `scripts/v1/build-web.mjs`, `tests/v1-product-calendar-venue-picker-focus-browser.mjs`. 207 insertions, 0 deletions.
- `git merge-tree --write-tree --name-only origin/main 5891c131` produced a clean tree (7e5d4f93). No conflicts.
- `git diff --check` clean. Secrets scan of the diff: no matches (the single `token` hit is the test's own locally issued session cookie value, `admin.token`, on `gsis.example.invalid`).
- Zero v0.9 drift: `git diff --exit-code -- roster-update/ public/ shared/` clean after `npm run build`.

## CI verified at the exact head

- **Product ("Isolated v1 product"):** run 45017303229, completed, success, head_sha 5891c1319f2788e4ecbb28a08cf88554f6b2b965, attempt 1. It ran 32m47s — inside the 60-minute cap #274 raised it to.
- **Node/LORD ("Verify GSiS queue changes"):** absent — this is an `antigravity/**` branch and the workflow triggers only on `codex/**`, `muse/**` and `claude/**` branches. No waiver is hidden: under the owner's 20 Nov waiver ("review all done by antigravity, ignore difference in notation, i will orchestrate") and 21 Nov direction, this approval rests on green product CI at the exact head plus the full local verification below.

## Local verification (22 Nov 2026, TZ=Asia/Singapore, Playwright chromium-1234)

Worktree at the exact head 5891c131. `npm ci` root and `v1/` both exit 0.

- `node tests/v1-product-calendar-venue-picker-focus-browser.mjs` — PASS (blur + immediate refocus keeps suggestions open past 100ms, Escape cancels cleanly, multi-room selection saves to D1).
- `npm run build` — exit 0, zero legacy drift.
- `node scripts/v1/build.mjs` — exit 0 (380 artifacts, sourceCommit 5891c131).
- `node scripts/v1/verify-build.mjs` — exit 0.
- Working tree clean after the runs.

## Quality gates Q01–Q08

- Q01 (scope): confined to the built Calendar venue picker blur transform, one browser test, and the task record. Pass.
- Q02 (tests): the PR's browser test passes locally and in the product run at the head. Pass.
- Q03 (no live change): no Worker deployment, D1 migration, live-data change, or product behaviour change beyond the picker blur handling. Pass.
- Q04 (no secret in diff): clean. Pass.
- Q05 (regression): product CI green at the head; Node/LORD absent under the disclosed waiver (see CI above). Pass.
- Q06 (build): canonical build and v1 build + verify-build pass with zero drift. Pass.
- Q07 (docs): task record states the change, the verification, and the out-of-scope bounds. Pass.
- Q08 (review): this record is the exact-head review. Pass.

## Release notes

- The Calendar venue picker no longer drops its suggestions when focus leaves and returns immediately; Escape still cancels without losing chosen chips.
- No deployment authorised by this review.
