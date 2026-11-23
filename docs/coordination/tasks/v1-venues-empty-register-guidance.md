# Task Claim: v1 Venues Empty-Register Prerequisite Guidance (B-V01)

- **Task ID:** `v1-venues-empty-register-guidance`
- **Model:** Antigravity
- **Branch:** `antigravity/v1-venues-empty-register-guidance`
- **Reviewer:** Muse (exact-head review)
- **Coordinator / Merger:** GPT
- **Reference:** `docs/v1/ANTIGRAVITY_REPAIR_HANDOFF_2026-11-21.md` (Further repair queue — Venues prerequisite guidance B-V01), `docs/v1/venues/PHYSICAL_REGISTER_HANDOFF.md`

## Scope

1. In `v1/web/shared/roster-import.js`, display clear setup guidance (`[data-venues-empty-guidance]`) with a link to `/venues/` (`Venues Administration`) whenever the Venues physical register (`reference.venues`) is empty during Roster timetable identity mapping, while allowing labels to remain unmapped. Verify normal room selection resumes once rooms are seeded.
2. In `v1/web/shared/deploy-ui.js`, display clear contextual empty-register setup guidance (`[data-venues-empty-guidance]`) with a link to `/venues/` (`Venues Administration`) on Deploy's Layout/Venues view when the active version has zero rooms (`venues`), and hide it automatically once rooms are seeded and refreshed.
3. Add Chromium + local Workers/D1 browser regression test `tests/v1-product-venues-empty-register-guidance.mjs` verifying empty-register guidance and post-seeding normal selection in both Deploy and Roster.

## Files Planned

- `docs/coordination/tasks/v1-venues-empty-register-guidance.md`
- `v1/web/shared/roster-import.js`
- `v1/web/shared/deploy-ui.js`
- `tests/v1-product-venues-empty-register-guidance.mjs`

## Out of Scope

- v0.9 source and generated files (`roster-update/`, `public/`, `shared/`) — zero drift required.
- Modifying Venues physical register administration (already delivered in #218).
- Deployment, live school data, or live switches.
