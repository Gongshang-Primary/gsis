# Review: PR #252 — Layout timed timetable occupancy UI panel (V08, V09, V19, V20)

- Reviewer: Muse, replacing Claude until Claude returns, per the owner's 16 November directive (source 12b06eb).
- Verdict: **APPROVED at the exact head** `7bddf28`.
- Branch: `antigravity/v1-layout-timed-timetable-ui`. Base: main `6461f4e`. PR status: open, MERGEABLE. GPT to merge.
- No deployment authorised.

## What it does

Adds the read-only Timed timetable occupancy (aSc baseline) UI panel to Layout, on top of the PR #239 separate timed-source stream (`GET /api/layout/timetable`):

- A `#v1LayoutTimetablePanel` (`details.gsispanel`) accessible to any signed-in user with `layout.read` — including users without `layout.edit`, for whom the Layout-owned data panel stays hidden. It fetches `GET /api/layout/timetable?year=<year>` with an optional `date` filter, independently of Deploy planning publications (V20).
- Renders each physical venue once per row (V08, V19), showing concurrent multi-slot lessons in each period cell with raw aSc room provenance labels (e.g., `ISH-1A, ISH-1B`, V09), a concurrent-class count badge when more than one lesson or slot occupies a cell, and planning/timetable disagreements as non-blocking notices.
- The untimed Deploy classroom planning layout and the Layout-owned data panel are untouched. Timed timetable DOM and state are cleared on `gsis:clear-protected-state`.
- The head commit docks the panel into `#tgView` via `v1/web/shared/module-shell.js` (registers the `layout-timed-timetable` kind alongside `layout-data`).

## Scope, merge, secrets

- Diff vs the PR base: 4 files (task record, new browser test, `v1/web/shared/layout-editor.js`, `v1/web/shared/module-shell.js`). 440 insertions, 3 deletions.
- Minor note, not a finding: the task record's Files Claimed list names only three files and was not updated for the 3-line `module-shell.js` docking change in the head commit. The change is within the task's scope (docking the panel) and is covered by the new browser test.
- `git merge-tree --write-tree --name-only origin/main 7bddf28` clean (tree 64c25b0e); GitHub reports MERGEABLE/CLEAN.
- `git diff --check`: clean. Secrets scan of the diff: clean.
- `npm run build` produces zero drift in `roster-update/`, `public/`, `shared/` (verified locally with `git diff --exit-code`).

## CI at the exact head

- Isolated v1 product run 44879114782: **success at head 7bddf28**. (The earlier run at 995c0d1 failed on `v1-product-web-browser.mjs`; the builder fixed it with the docking commit at 7bddf28.)
- Node/LORD ("Verify GSiS queue changes"): **no run exists for this head**. The workflow `verify-queue.yml` triggers only on push to `codex/**`, `muse/**`, `claude/**` branches, so `antigravity/**` branches never trigger it. The owner waived this notation difference on 20 Nov 2026 ("review all done by antigravity, ignore difference in notation, i will orchestrate") and, on 21 Nov, directed review of these PRs after the gap was restated to him. This approval rests on the green product CI at the exact head plus the full local verification below, and the waiver is recorded here rather than hidden.

## Local checks at the exact head

Worktree `wt252-review` at 7bddf28, `npm ci` in root and in `v1/`, `TZ=Asia/Singapore`, Playwright Chromium:

- `tests/v1-product-layout-timed-timetable-browser.mjs`: exit 0, PASS.
- `tests/v1-product-layout-timed-source.mjs`: exit 0, PASS.
- `npm run build`: exit 0, zero v0.9 drift. `node scripts/v1/build.mjs` and `node scripts/v1/verify-build.mjs`: exit 0.

## Findings

None.

## Quality gates

- Q01–Q06 pass at the exact head (bounded scope, exact-head product CI green, local checks green). Q07 is this review. Q08 is not applicable — no deployment authorised.
- Hosted/runtime UAT: **Not tested**.
