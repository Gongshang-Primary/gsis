# GSiS v0.7.16

Baseline: v0.7.15 at 3b5bc82b56b4db57f2443851c6226dee661642a0. Full release authorised on 19 October 2026, Singapore time.

## Suspended timetable

The displayed planner name is **Suspended Timeable Advance PLannER**. Stable internal route, API and stored identifiers remain unchanged.

Validated saved plans retain server-owned validation metadata. Fresh reads reuse this validated state instead of rebuilding the entire baseline. Small edits validate affected cards and occupancy. Current permissions, locks, revisions, absences and operational conflicts remain checked. Legacy plans receive full validation until their next successful Save or Confirm stores the marker.

Save and Confirm remain separate. The interface distinguishes an unsaved draft, pending Save and pending Confirm, retains exact retry identity and displays safe diagnostic details. A response that has not acknowledged persistence must not become a saved or confirmed success message.

## Automatic relief allocation

System Config has independent switches for all six ranked preferences and two workload limits. New defaults are 9 total periods per teacher per day and 6 consecutive periods. Counts combine lessons, relief and invigilation without double counting a period. Other occupied duties still prevent conflicting assignments. Enabled workload limits are strict; an uncovered lesson remains visible instead of exceeding them silently.

Same teaching subject starts at lowest priority, with a one-time migration that preserves the relative order of the other preferences. Later saved ordering and switches persist. Disabled preferences do not affect scoring. Maximum feasible coverage is the fixed first objective; least deviation from enabled ordered preferences follows. Solver proof status remains explicit.

Admin can edit and save System Config. SMC can inspect it read only. Existing weekly R, employment restrictions, shared-cover policy and manual warning/override rules remain in force.

## Teacher tasks

Report Absence opens the own-absence form directly after sign-in. Full day is selected initially; Today, Tomorrow and Both use current Singapore dates. Partial day exposes periods. A single submit retains existing absence validation, conflict detection and retry protection; full-day periods are derived for each selected date.

Calculations appears at the top right. It shows only the signed-in teacher's weekly W_i and R from the published Deploy calculation, with a plain explanation and optional exact formula. Cumulative relief done means confirmed completed relief in the current calendar year divided by recorded quota accrued through the current week. Pending and future assignments are excluded. Missing or unverified history is labelled unavailable and the recorded coverage is shown.

The Home menu follows the requested order, with eight functions above the divider ending in WhatsApp Inbox. Roles filter both groups. Calculations stays in the header.

## WhatsApp Inbox

The existing Inbox now shows authorised configuration readiness and missing setting names without exposing secrets. Empty and error states explain the actual setup status. The included activation guide covers matching code, existing flags, private media, Meta webhook and the scheduled Worker. Configuration readiness does not prove live delivery. Building this release changes no live flags and sends no staff messages.

## Release decisions and verification

The optional clarification prompts returned no choices. The implementation therefore uses the recorded defaults: strict enabled workload limits, Full day selected initially, and completed calendar-year relief divided by recorded accrued quota. These are release decisions, not additional user confirmations.

See VALIDATION.md, PERFORMANCE_v0.7.16.md and RELEASE_SUMMARY.json for checks actually completed and their limits. Live deployment and school-store readback remain separate. Existing offline final-day import, full teacher export, relief export and Name Bridge behaviour are retained. Nonempty offline reliefAbsences remain explicitly unsupported by the supplied examples.
