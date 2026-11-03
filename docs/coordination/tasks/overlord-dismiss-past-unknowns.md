# overlord-dismiss-past-unknowns: select and review past-booking "Outcome unknown" items (Muse pilot 1)

- Status: implementing
- Last updated (Asia/Singapore): 2026-11-03
- Base SHA: df93cff99b2cf93a2ccb7292eaa2050f1460598c
- Current head SHA: to be filled after commits (see PR)
- PR: to be opened only after full CI is green
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

## Decisions and changes
- Bulk review path exists, so work did not stop. It is `retire` through the existing `backgroundpreview` / `backgroundapply` path. Backend `backgroundActions_` gives `retire` for `unknown` and `expired` rows only.
- Backend `backgroundPublicItem_` carries no booking date. It carries `bookingId` and `createdAt`. The frontend therefore uses the existing read-only `bookingGet` action (admin) to get `booking.date`. Past means that date is before today in Asia/Singapore. Today bookings are not auto-selected, because `bookingPublic_` carries no end time.
- Rows with no bookingId, or a failed booking lookup, are treated as undated and are never auto-selected.
- `Select past bookings` ticks only past, retire-eligible rows, up to the existing 20-recipient limit. It sets the operation to `retire` and shows the confirmation summary before any backend preview or apply call.
- Confirmed failure rows are not auto-retired, because the backend blocks `retire` for `failed` rows. Past confirmed failure rows are counted separately in the summary and are not selected by this control. They remain manually selectable through their own existing action.
- No backend change, no resend, no delete. No HTML or CSS file change was needed. The button is in the existing background toolbar.
- Claim note: the workflow claim-only commit to main was not used, because the owner instruction for this pilot says never push to main. The claim is recorded here on the branch instead. The owner merges.

## Verification
- Local: `node --check` passes for `lord-suite/Source/overlord/assets/app.js` and for `lord-suite/tests/gsis098h-background-ui.cjs`.
- Local browser test could not run here: Playwright is not installed in this workspace. The new browser scenario runs in CI, where Playwright is available.
- Full CI on the branch is pending at the time of this task-record update. The draft PR will be opened only after full CI is green.
- Checks not run locally: `npm run build`, `npm test`, and `python3 lord-suite/tests/run_all_checks.py`. Those are covered by CI on the branch, and their results will be recorded in the PR before review.

## Handoff
- Next action: push the branch files, wait for full CI, then open a draft PR labelled `Model: Muse` with Claude as reviewer and the exact head SHA.
- Task 2 starts only after task 1 draft PR is open.
