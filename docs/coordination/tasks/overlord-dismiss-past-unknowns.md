# overlord-dismiss-past-unknowns: select and review past-booking "Outcome unknown" items (Muse pilot 1)

- Status: assigned (owner 3 Nov 2026: "both for muse"); not claimed
- Owner/model: Muse
- Reviewer/model: Claude
- Branch: muse/overlord-dismiss-past-unknowns
- Lane: L (LORD suite UI), pilot. Frontend only unless Muse proves a backend change is required (then stop and report).
- Files (expected): `lord-suite/Source/overlord/assets/app.js` (and its HTML/CSS if needed), the matching copy under `lord-suite/First_Time_Setup/templates/overlord/` (must stay byte-identical; check the LORD template tests), LORD tests under `lord-suite/tests/`.

## Problem (owner screenshot, 3 Nov 07:45)
OVERLORD's background delivery review lists 32 recipients, most "Outcome unknown", for booking emails and WhatsApp notices from 28 Oct to 2 Nov. They are mostly past bookings. The list already has per-row checkboxes and per-row "Inspect evidence and actions"; there is an existing reviewed state (`backgroundLabels.reviewed`, `reviewedAt`, `reviewAction`, client keys `backgroundReviewed` / `previewBackground`).

## Requirement
1. Add a one-click **"Select past bookings"** control that ticks every row whose booking date/time is already over (use the booking's own date, not the notification time). Rows without a known booking date are never auto-selected.
2. Use the **existing** bulk review path to mark the selected rows reviewed (no new backend operation, no resend). If no bulk review action exists, stop and report what exists.
3. Show a confirmation summary first ("Mark N past-booking items as reviewed? This sends nothing.").
4. Never resend, never delete; reviewed items keep their evidence (owner rule: keep records).
5. "Confirmed failure" rows are selectable only if the booking is past; show them separately in the summary.

## Acceptance
- Test: a fixture with past, future and undated items; the control selects only past ones; review sends zero notifications; evidence retained.
- LORD checks pass (`python3 lord-suite/tests/run_all_checks.py`), template copy identical, full CI green on the branch.
