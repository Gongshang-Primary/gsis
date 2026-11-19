# Task: v1-venues-slot-capacity-and-conflicts

- **Lane:** GSiS v1 (`v1/services/venues`, `tests/v1-product`)
- **Implementer:** Antigravity
- **Reviewer:** Muse (exact head commit)
- **Coordinator / Merger:** GPT
- **Branch:** `antigravity/v1-venues-slot-capacity-and-conflicts`
- **Status:** Claimed (in progress)

## Scope
Implement the Venues slot-capacity and retained-conflict adoption contract from `docs/v1/venues/VENUE_ALLOCATION_LIFECYCLE_DESIGN.md`:
1. Separate `classSlotCapacity` (`null` = explicitly unknown, integer `1..20`, default `1` when omitted) from pupil seating `capacity` across `v1/services/venues/register.mjs`, `v1/services/venues/domain.mjs`, and `v1/services/venues/service.mjs`. Unknown `classSlotCapacity: null` is never treated as free.
2. Add one-slot (`slotMode: "slot"`) vs whole-venue (`slotMode: "whole"`, default) booking admission with sweep-line per-segment concurrent demand checking across multi-period intervals, matching SQL concurrency guards, and venue epoch fencing.
3. On timetable source activation (`domain.mjs` `activate` and `service.mjs` timed-source baseline adoption), retain conflicting held bookings with explicit unresolved `sourceConflict` status instead of calling `displace`; keep unresolved held bookings counting toward occupancy until authorized resolution (`resolveConflict` / `amend` / `cancel`) rechecks current occupancy.
4. Add comprehensive regression test `tests/v1-product-venues-slot-capacity.mjs` covering ISH-1 2-slot admission, whole-venue default, unknown capacity, multi-period per-segment checks, concurrent booking serialization, and retained-conflict timetable adoption + authorized resolution.

## Guardrails
- Preserve all existing v1 Venues regressions (`v1-product-venues`, `v1-product-venues-register`, `v1-product-venues-staged`, `v1-product-venues-source-fence-budget`).
- Zero v0.9 source or generated files modified (`npm run build` zero drift).
