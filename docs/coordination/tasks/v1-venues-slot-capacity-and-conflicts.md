# Task: v1-venues-slot-capacity-and-conflicts

- **Lane:** GSiS v1 (`v1/services/venues`, `tests/v1-product`)
- **Implementer:** Antigravity
- **Reviewer:** Muse (exact head commit)
- **Coordinator / Merger:** GPT
- **Branch:** `antigravity/v1-venues-slot-capacity-and-conflicts`
- **Status:** Locally verified (ready for Muse exact-head review)

## Scope
Implemented the Venues slot-capacity and retained-conflict adoption contract from `docs/v1/venues/VENUE_ALLOCATION_LIFECYCLE_DESIGN.md`:
1. Separated `classSlotCapacity` (`null` = explicitly unknown, integer `1..20`, default `1` when unspecified) from pupil seating `capacity` across `v1/services/venues/register.mjs`, `v1/services/venues/domain.mjs`, and `v1/services/venues/service.mjs`. Unknown `classSlotCapacity: null` fails closed (`409 UNKNOWN_SLOT_CAPACITY`) in both domain and SQL guards.
2. Implemented one-slot (`slotMode: "slot"`) vs whole-venue (`slotMode: "whole"`, default) booking admission with sweep-line per-segment concurrent demand checking across multi-period intervals, multi-slot SQL guards, and `venues_epochs` serialization.
3. On timetable source activation (`domain.mjs` `activate`) and baseline/`retainConflicts` adoption (`service.mjs` `sourceBegin` + `sourceComplete`), retained conflicting held bookings (`confirmed`/`pending`) with explicit unresolved `sourceConflict` status instead of calling `displace`; unresolved bookings continue to consume capacity until authorized resolution (`resolveConflict` / `amend` / `cancel`) rechecks current occupancy.
4. Added regression coverage in `tests/v1-product-venues-slot-capacity.mjs`.

## Local Verification (`TZ=Asia/Singapore`)
- `node tests/v1-product-venues-slot-capacity.mjs` — PASS
- `node tests/v1-product-venues.mjs` — PASS
- `node tests/v1-product-venues-register.mjs` — PASS
- `node tests/v1-product-venues-staged.mjs` — PASS
- `npm run build` + `git diff --exit-code -- roster-update/ public/ shared/` — PASS (zero v0.9 drift)
- `node scripts/v1/build.mjs` + `node scripts/v1/verify-build.mjs` — PASS (all 9 Wrangler dry-runs + local upgrade check)
- `git diff --check` — PASS

## Remaining Gates
- Independent exact-head review by Muse; merge & coordination by GPT.
- Hosted runtime UAT, F5, and official T1B-01/T1B-02 remain Not tested / OPEN. No live deploy or provider activation performed.
