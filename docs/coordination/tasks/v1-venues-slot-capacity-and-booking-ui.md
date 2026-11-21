# v1 Venues `classSlotCapacity`, `slotMode`, and retained conflict resolution UI (`V01`–`V04`, `V10`–`V18`, `V21`)

- Task ID: `v1-venues-slot-capacity-and-booking-ui`
- Model: `Antigravity`
- Branch: `antigravity/v1-venues-slot-capacity-and-booking-ui`
- Status: **Claimed for implementation**
- Coordinator / Merger: `GPT` (ChatGPT)
- Reviewer: `Muse` at the exact head
- Base: `6461f4e2a78eb11ff9b6b254f775d68e12e48d52` (`v1.09` + follow-up changelogs)

## Files Claimed
- `docs/coordination/tasks/v1-venues-slot-capacity-and-booking-ui.md`
- `v1/web/shared/venues-register.js`
- `scripts/v1/build-web.mjs`
- `tests/v1-product-venues-slot-capacity-browser.mjs`

## Scope
1. **Physical Room Register (`v1/web/shared/venues-register.js`)**:
   - Add `Class-slot capacity` (`classSlotCapacity`: blank means unknown, or whole number `1..20`, separate from pupil seating `capacity`) to the Add/Edit room dialog, preview table, and physical room register table.
2. **Venues Booking & Conflict Resolution UI (`scripts/v1/build-web.mjs`)**:
   - Compute slot-aware occupancy in the Venues booking grid:
     - When `classSlotCapacity == null`, mark the room closed (`Class-slot capacity not configured`).
     - Sum concurrent timetable lessons (`1` slot each) and active ad hoc bookings (`slotMode === "whole"` consumes `classSlotCapacity` slots; `slotMode === "slot"` consumes `1` slot).
     - When `usedSlots < classSlotCapacity`, keep the period selectable for a `1`-slot booking (showing `Available (remaining/capacity slots)` when partially occupied).
   - In the Review booking dialog (`previewBooking`), expose a `Booking scope` selector (`slotMode: "slot"` One class slot vs `slotMode: "whole"` Whole venue) for multi-slot venues (`classSlotCapacity > 1`) and pass `slotMode` in the `book` command.
   - Surface retained `sourceConflict` badges (`Timetable conflict — review required`) on affected bookings in `My bookings`, `Room dashboard`, and `Administration`, and provide `Keep booking` / `Cancel booking` (`operation: "resolveConflict", decision: "keep" | "cancel"`) controls in `Manage booking`.
