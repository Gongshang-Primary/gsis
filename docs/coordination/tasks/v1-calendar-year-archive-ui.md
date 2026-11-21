# v1 Calendar: repair year archive previewDigest and yearStructure/dayNotes counts

- Task ID: `v1-calendar-year-archive-ui`
- Model: `Antigravity`
- Branch: `antigravity/v1-calendar-year-archive-ui`
- Status: **Ready for Muse review**
- Coordinator / Merger: `GPT` (ChatGPT)
- Reviewer: `Muse` at the exact head
- Base: `d6e05597` (`origin/main`)

## Files Claimed
- `docs/coordination/tasks/v1-calendar-year-archive-ui.md`
- `v1/services/calendar/service.mjs`
- `scripts/v1/build-web.mjs`
- `tests/v1-product-calendar-year-archive-browser.mjs`

## Scope
1. **Calendar archive preview contract (`v1/services/calendar/service.mjs`)**:
   - Returned both `digest` and `previewDigest` from `preview()` so archive and wipe confirmation requests match the verified preview digest.
   - Included `yearStructure` (`YearStructure`) and `dayNotes` (`DayNotes`) counts for the selected years in `preview()` counts and included their metadata rows in the preview payload so concurrent changes invalidate stale previews.
2. **Built Calendar archive caller (`scripts/v1/build-web.mjs`)**:
   - Passed `previewDigest: archivePreview.previewDigest || archivePreview.digest` (and same for `wipePreview`) and bound a stable per-preview `operationId` so retries recover the original operation after a lost response.
3. **Regression test (`tests/v1-product-calendar-year-archive-browser.mjs`)**:
   - In two synthetic years (2026 and 2027), previews and confirms archiving 2026 in the built Chromium browser, verifies accurate `Events 1 · YearStructure 2 · DayNotes 1` counts, proves stale/mismatched previews are non-mutating (`409 PREVIEW_CHANGED`), verifies 2027 remains untouched, and proves exact `operationId` recovery after a lost response.

## Verification (`TZ=Asia/Singapore`)
- `TZ=Asia/Singapore GSIS_BROWSER_EXECUTABLE=/usr/bin/chromium node tests/v1-product-calendar-year-archive-browser.mjs` — PASS
- `TZ=Asia/Singapore npm run build && git diff --exit-code -- roster-update/ public/ shared/` — PASS (zero v0.9 drift)
- `TZ=Asia/Singapore node scripts/v1/build.mjs && TZ=Asia/Singapore node scripts/v1/verify-build.mjs` — PASS
- `git diff --check` — PASS
