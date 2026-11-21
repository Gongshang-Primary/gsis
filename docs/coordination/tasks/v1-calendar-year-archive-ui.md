# v1 Calendar: repair year archive previewDigest and yearStructure/dayNotes counts

- Task ID: `v1-calendar-year-archive-ui`
- Model: `Antigravity`
- Branch: `antigravity/v1-calendar-year-archive-ui`
- Status: **Claimed for implementation**
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
   - Return both `digest` and `previewDigest` from `preview()` so archive and wipe confirmation requests match the verified preview digest.
   - Include `yearStructure` (`YearStructure`) and `dayNotes` (`DayNotes`) counts for the selected years in `preview()` counts and include their digests/counts in the preview payload so concurrent changes invalidate stale previews.
2. **Built Calendar archive caller (`scripts/v1/build-web.mjs`)**:
   - Pass `previewDigest: archivePreview.previewDigest || archivePreview.digest` (and same for `wipePreview`) and bind a stable per-preview `operationId` so retries recover the original operation after a lost response.
3. **Regression test (`tests/v1-product-calendar-year-archive-browser.mjs`)**:
   - In two synthetic years (2026 and 2027), preview and confirm archiving 2026 in the built Chromium browser, verify accurate `Events`, `YearStructure`, and `DayNotes` counts, prove stale/mismatched previews are non-mutating (`409`), verify 2027 remains untouched, and prove exact `operationId` recovery after a lost response.
