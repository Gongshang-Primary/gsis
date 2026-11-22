# Review of PR #273 — Add empty Venues register setup guidance in Deploy and Roster (B-V01)

- **Reviewer:** Muse, at the exact head, under the owner's 16 Nov 2026 directive (Muse is the v1 reviewer at the exact head SHA, replacing Claude until Claude returns; source commit 12b06eb). No code, merges, or coordination by Muse.
- **PR:** #273, "Model: Antigravity / Add empty Venues register setup guidance in Deploy and Roster (B-V01)". Branch `antigravity/v1-venues-empty-register-guidance`. Head reviewed: `c171f2a0`.
- **Status at review:** OPEN, not a draft. Product CI green at the head. MERGEABLE/CLEAN.
- **Verdict: APPROVED at the exact head c171f2a0.** No findings.
- **Head note:** the head is a merge commit, "Merge origin/main (800585c8) into antigravity/v1-venues-empty-register-guidance" — the PR is based on main 800585c8, and both CI and the local checks below are verified at c171f2a0.

## What it does

Repair from `docs/v1/ANTIGRAVITY_REPAIR_HANDOFF_2026-11-21.md` (Venues prerequisite guidance B-V01):

- Adds contextual empty physical venue register guidance (`[data-venues-empty-guidance]`) linking to `/venues/` (`Open Venues Administration`) in Deploy (`v1/web/shared/deploy-ui.js`: wraps `window.GSISrenderLayout` to display the notice when the selected version has zero rooms and automatically clears it once rooms are seeded and refreshed) and Roster (`v1/web/shared/roster-import.js`: displays the notice in the timetable identity mapping dialog when `reference.venues` is empty, while allowing labels to remain unmapped and resuming normal room selection once rooms are seeded).
- `tests/v1-product-venues-empty-register-guidance.mjs` (new): Chromium + local Workers/D1 browser test — empty-register guidance visible in both Deploy and Roster; after seeding Venues and refreshing Deploy, guidance clears and normal room selection resumes.

## Scope and mergeability

- Diff against base 800585c8: exactly 4 files, matching the task record — `docs/coordination/tasks/v1-venues-empty-register-guidance.md`, `tests/v1-product-venues-empty-register-guidance.mjs`, `v1/web/shared/deploy-ui.js`, `v1/web/shared/roster-import.js`. 269 insertions, 0 deletions.
- `git merge-tree --write-tree --name-only origin/main c171f2a0` produced a clean tree (5fb1abc3) against current main (which now includes the #268, #271, #265, #267 and #264 merges). No conflicts.
- `git diff --check` clean. Secrets scan of the diff: no matches.
- Zero v0.9 drift: `git diff --exit-code -- roster-update/ public/ shared/` clean after `npm run build`.

## CI verified at the exact head

- **Product ("Isolated v1 product"):** run 45017318263, completed, success, head_sha c171f2a0ab2e7cd14d91c4129f0c384b1d2ede7f, attempt 2. The successful attempt ran 32m58s (11:52:11Z–12:25:09Z) — inside the 60-minute cap #274 raised it to. The run was still in progress at the 20:10 SGT check and completed during this review; this record verifies the completed successful attempt at the exact head.
- **Node/LORD ("Verify GSiS queue changes"):** absent — this is an `antigravity/**` branch and the workflow triggers only on `codex/**`, `muse/**` and `claude/**` branches. No waiver is hidden: under the owner's 20 Nov waiver ("review all done by antigravity, ignore difference in notation, i will orchestrate") and 21 Nov direction, this approval rests on green product CI at the exact head plus the full local verification below.

## Local verification (22 Nov 2026, TZ=Asia/Singapore, Playwright chromium-1234)

Worktree at the exact head c171f2a0. `npm ci` root and `v1/` both exit 0.

- `node tests/v1-product-venues-empty-register-guidance.mjs` — PASS (Deploy and Roster show setup guidance linking to /venues/ when empty, and resume normal selection with guidance cleared after seeding).
- `npm run build` — exit 0, zero legacy drift.
- `node scripts/v1/build.mjs` — exit 0 (380 artifacts, sourceCommit c171f2a0).
- `node scripts/v1/verify-build.mjs` — exit 0.
- Working tree clean after the runs.

## Quality gates Q01–Q08

- Q01 (scope): confined to the empty Venues register guidance in Deploy and Roster, one browser test, and the task record. Pass.
- Q02 (tests): the PR's browser test passes locally and in the product run at the head. Pass.
- Q03 (no live change): no Worker deployment, D1 migration, live-data change, or product behaviour change beyond the new guidance notice. Pass.
- Q04 (no secret in diff): clean. Pass.
- Q05 (regression): product CI green at the head; Node/LORD absent under the disclosed waiver (see CI above). Pass.
- Q06 (build): canonical build and v1 build + verify-build pass with zero drift. Pass.
- Q07 (docs): task record states the change, the verification, and the out-of-scope bounds. Pass.
- Q08 (review): this record is the exact-head review. Pass.

## Release notes

- Deploy and Roster now show setup guidance linking to Venues Administration when the physical venue register is empty, and resume normal room selection once rooms are seeded.
- No deployment authorised by this review.
