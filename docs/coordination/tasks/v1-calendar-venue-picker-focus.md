# Task Claim: v1 Calendar Venue Picker Focus Stability

- **Task ID:** `v1-calendar-venue-picker-focus`
- **Model:** Antigravity
- **Branch:** `antigravity/v1-calendar-venue-picker-focus`
- **Reviewer:** Muse (exact-head review)
- **Coordinator / Merger:** GPT
- **Reference:** `docs/v1/ANTIGRAVITY_REPAIR_HANDOFF_2026-11-21.md` (Further repair queue — Calendar venue picker focus)

## Scope

1. In `scripts/v1/build-web.mjs`, transform the built v1 Calendar venue picker blur handler (sourced from `calendar-update/public/app.js:6770`, keeping v0.9 source zero-drift) so that:
   - Focusing or typing cancels any pending delayed `close()` timer.
   - When the delayed blur timer fires, it only closes suggestions if `document.activeElement !== input`.
2. Add Chromium + local Workers/D1 browser test `tests/v1-product-calendar-venue-picker-focus-browser.mjs` reproducing blur + immediate refocus deterministically, proving:
   - Suggestions remain open after blur + immediate refocus beyond the 100ms blur timeout.
   - Clicking a suggestion selects it cleanly.
   - Pressing `Escape` cancels/closes suggestions without losing chosen chips.
   - Selecting multiple rooms and saving persists multi-room `VenueID` in D1.

## Files Planned

- `docs/coordination/tasks/v1-calendar-venue-picker-focus.md`
- `scripts/v1/build-web.mjs`
- `tests/v1-product-calendar-venue-picker-focus-browser.mjs`

## Out of Scope

- v0.9 source and generated files (`roster-update/`, `public/`, `shared/`, `calendar-update/`) — zero drift required.
- Deployment, live school data, or live Google Calendar sync.
