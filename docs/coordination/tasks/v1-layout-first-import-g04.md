# Task Claim: v1 Layout First-Import Prerequisite (G04)

- **Task ID:** `v1-layout-first-import-g04`
- **Model:** Antigravity
- **Branch:** `antigravity/v1-layout-first-import-g04`
- **Reviewer:** Muse (exact-head review)
- **Coordinator / Merger:** GPT
- **Reference:** `docs/v1/ANTIGRAVITY_REPAIR_HANDOFF_2026-11-21.md` (Further repair queue — Layout first-import prerequisite G04)

## Scope

1. In `v1/services/layout/service.mjs`, distinguish "no snapshot head exists yet for the selected year" from "missing or corrupt R2 snapshot storage after a head exists":
   - When `!head` and `!empty`, return `404 SNAPSHOT_NOT_INITIALIZED` (`retryable: false`) with clear guidance to import the initial Layout/timetable snapshot for that year.
   - When a head exists but R2 storage is missing or corrupt, continue returning `503 SNAPSHOT_UNAVAILABLE` / `503 INTEGRITY_FAILED` (error).
2. In `v1/web/shared/layout-editor.js`, recognize `SNAPSHOT_NOT_INITIALIZED` on snapshot load and display clear first-import guidance (pointing to `Initial source setup` / opening the initial-source panel for admins) without breaking `#258`'s latest-date and session guards.
3. Update `tests/v1-product-layout.mjs` line 369 where an uninitialized foreign school previously expected `SNAPSHOT_UNAVAILABLE` to expect `SNAPSHOT_NOT_INITIALIZED`.
4. Add regression test `tests/v1-product-layout-first-import-g04.mjs` proving:
   - Uninitialized year returns `404 SNAPSHOT_NOT_INITIALIZED` (`retryable: false`) and Layout browser UI shows clear first-import guidance and opens initial source setup.
   - After an initial snapshot head exists, missing R2 object still returns `503 SNAPSHOT_UNAVAILABLE` and corrupt R2 object returns `503 INTEGRITY_FAILED`.
   - `#258` timed-read ordering & session guards remain intact.

## Files Planned

- `docs/coordination/tasks/v1-layout-first-import-g04.md`
- `v1/services/layout/service.mjs`
- `v1/web/shared/layout-editor.js`
- `tests/v1-product-layout.mjs`
- `tests/v1-product-layout-first-import-g04.mjs`

## Out of Scope

- v0.9 source and generated files (`roster-update/`, `public/`, `shared/`) — zero drift required.
- Deployment, live school data, or live switches.
