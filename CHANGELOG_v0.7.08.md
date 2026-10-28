# GSiS v0.7.08

Prepared from v0.7.07 for the 17 October 2026 authorised build.

## Baseline timetable imports

Read merged teacher names and sparse continuation rows in MSHTML exports without treating a valid continuation as a missing teacher. Preserve weekday, week, period and lesson field positions. Recognise overlapping activities before accepting a baseline.

For a lesson clash, show the competing lessons and let the user explicitly select which to keep. Resolve choices locally. Do not save an unresolved baseline, modify the original export or silently discard an activity. Advise the user to correct the clash in EduPage before future exports.

## Relief quota caps

Use the lower of normal weekly R and the remaining configured employment period allowance. The allowance counts actual FTT plus teaching, under the existing rule. The result is rounded down and cannot be negative. PD, duties and other factors still affect normal R.

Apply the cap to the effective relevant week and again after published timetable changes. Preserve existing relief deductions without counting them twice. Expose the cap and its effect in permitted quota details. Missing required data remains unavailable. Ordinary R overrides cannot exceed the configured period cap.

## Visible controls and branding

Use the supplied GSiS logo for browser favicons across the suite. On Roster Home, Assign Relief has a neutral background until mouse hover, with a separate keyboard focus indicator.

Deploy Versions and publication review use document scrolling. Keep the review heading, comparison labels, selections and final controls reachable without a clipped inner panel. Retain specialised timetable and matrix scrolling where useful.

## Concurrent reliability

Coalesce concurrent Google signing-key reads and handle signing-key rotation consistently across the affected gateways. Bound repeated unknown-key refreshes and discard failed requests so a later request can recover.

Recheck Calendar mutation authority from current user data within its existing write boundary. Display caches cannot restore a revoked permission or authorise a write.

Calendar metadata forms bind their edits to the original displayed record. Stale edits are rejected under the existing write lock while the form retains its draft. Independent-record edits remain independent. Existing inactive role, tag and lane entries retain an explicit Admin edit path.

## Delivery boundary

No workbook schema migration, new backend URL, baseline activation, in-force Deploy publication or data cleanup is part of this package. Keep WhatsApp and scheduled activation disabled. See VALIDATION.md for the checks actually run and any limits.
