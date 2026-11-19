# Task: v1-layout-timed-timetable-adoption

- **Lane:** GSiS v1 (`v1/services/layout`, `v1/services/roster`, `tests/v1-product`)
- **Implementer:** Antigravity
- **Reviewer:** Muse (exact head commit)
- **Coordinator / Merger:** GPT
- **Branch:** `antigravity/v1-layout-timed-timetable-adoption`
- **Status:** Claimed (in progress)

## Scope
Implement the separate immutable timed-source (aSc timetable) adoption stream in Layout and durable Roster baseline delivery intent from `docs/v1/venues/VENUE_ALLOCATION_LIFECYCLE_DESIGN.md`:
1. Add `v1/services/layout/timed-source.mjs` and wire `POST /internal/adopt-timed-source` + `GET /timetable` into `v1/services/layout/service.mjs`:
   - Keeps Deploy planning allocations (`layout_heads`) and aSc timed timetables (`layout_rows` `table_name='timed_source'` + immutable R2 artifact) on separate sequence ordering; neither overwrites the other or Layout geometry/local annotations.
   - Displays multi-slot venues like ISH-1 once with concurrent lessons and preserved raw A/B labels; omits private staff details; flags planning-vs-timetable disagreements without refusing sources; reports `covered: false` outside verified coverage.
   - Enforces monotonic sequence ordering, idempotent replay, SHA-256 artifact integrity, and school/capability boundaries.
2. Queue durable `roster-layout-timed` outbox delivery intent in `v1/services/roster/service.mjs` `baselineWrite()` and dispatch it in Roster's outbox handler (no Deploy prerequisite).
3. Add regression coverage in `tests/v1-product-layout-timed-source.mjs`.

## Guardrails
- No v0.9 source or generated files modified (`npm run build` zero drift).
- No cross-D1 atomicity claim; no live deployment or provider activation.
