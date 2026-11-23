# v1 Layout timed timetable occupancy UI (`V08`, `V09`, `V19`, `V20`)

- Task ID: `v1-layout-timed-timetable-ui`
- Model: `Antigravity`
- Branch: `antigravity/v1-layout-timed-timetable-ui`
- Status: **Ready for Muse review**
- Coordinator / Merger: `GPT` (ChatGPT)
- Reviewer: `Muse` at the exact head
- Base: `6461f4e2a78eb11ff9b6b254f775d68e12e48d52` (`v1.09` + follow-up changelogs)

## Files Claimed
- `docs/coordination/tasks/v1-layout-timed-timetable-ui.md`
- `v1/web/shared/layout-editor.js`
- `tests/v1-product-layout-timed-timetable-browser.mjs`

## Scope
1. **Timed Timetable Occupancy Panel (`v1/web/shared/layout-editor.js`)**:
   - Add a read-only "Timed timetable occupancy (aSc baseline)" section (`#v1LayoutTimetablePanel`) accessible to any signed-in user with `layout.read` (including users without `layout.edit`).
   - Fetch `GET /api/layout/timetable?year=<year>` (with optional `&date=<date>` filter).
   - Render each physical venue once per row (`V08`, `V19`), showing concurrent multi-slot lessons in the same time slot along with raw aSc room provenance labels (e.g., `ISH-1A`, `ISH-1B`, `V09`).
   - Keep the untimed Deploy classroom planning layout and Layout-owned data panel completely separate and unchanged (`V20`), and display any planning/timetable disagreements as non-blocking notices.
   - Clear rendered timetable DOM and state on `gsis:clear-protected-state`.
2. **Browser Regression Test (`tests/v1-product-layout-timed-timetable-browser.mjs`)**:
   - End-to-end Playwright + isolated Miniflare/D1/R2 verification.

## Local Verification (`TZ=Asia/Singapore`)
- `node tests/v1-product-layout-timed-timetable-browser.mjs` — **PASS**
- `node tests/v1-product-layout-timed-source.mjs` — **PASS**
- `npm run build && git diff --exit-code -- roster-update/ public/ shared/` — **PASS** (zero v0.9 drift)
- `node scripts/v1/build.mjs && node scripts/v1/verify-build.mjs` — **PASS**
- `git diff --check` — **PASS**
