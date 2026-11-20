# Task: v1-layout-timed-timetable-adoption

- **Lane:** GSiS v1 (`v1/services/layout`, `v1/services/roster`, `tests/v1-product`)
- **Implementer:** Antigravity
- **Reviewer:** Muse (exact head commit)
- **Coordinator / Merger:** GPT
- **Branch:** `antigravity/v1-layout-timed-timetable-adoption`
- **Status:** Locally verified (ready for Muse exact-head review)

## Scope
Implemented the separate immutable timed-source (aSc timetable) adoption stream in Layout and durable Roster baseline delivery intent per `docs/v1/venues/VENUE_ALLOCATION_LIFECYCLE_DESIGN.md`:
1. Added `v1/services/layout/timed-source.mjs` and wired `POST /internal/adopt-timed-source` + `GET /timetable` into `v1/services/layout/service.mjs`:
   - Keeps Deploy planning allocations (`layout_heads`) and aSc timed timetables (`layout_rows` `table_name='timed_source'` + verified private R2 artifact) on completely separate sequence ordering; neither overwrites the other or Layout geometry/local annotations.
   - Supports both inline and staged Roster baseline projection chunks with digest verification.
   - Displays multi-slot venues like ISH-1 once with concurrent lessons and preserved raw A/B labels (`sourceLabels`), strips private staff details, flags planning-vs-timetable disagreements without refusing sources, and reports `covered: false` outside verified coverage.
2. Queued durable `roster-layout-timed` outbox delivery intent in `v1/services/roster/service.mjs` `baselineWrite()` and dispatched it to Layout `/internal/adopt-timed-source` (no Deploy prerequisite).
3. Added regression coverage in `tests/v1-product-layout-timed-source.mjs`.

## Local Verification (`TZ=Asia/Singapore`)
- `node tests/v1-product-layout-timed-source.mjs` — PASS
- `node tests/v1-product-layout.mjs` — PASS
- `npm run build` + `git diff --exit-code -- roster-update/ public/ shared/` — PASS (zero v0.9 drift)
- `node scripts/v1/build.mjs` + `node scripts/v1/verify-build.mjs` — PASS (all 9 Wrangler dry-runs + local upgrade check)
- `git diff --check` — PASS

## Remaining Gates
- Independent exact-head review by Muse; merge & coordination by GPT.
- Hosted runtime UAT, F5, and official T1B-01/T1B-02 remain Not tested / OPEN. No live deploy or provider activation performed.
