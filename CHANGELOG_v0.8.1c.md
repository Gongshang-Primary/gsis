# GSiS v0.8.1c component patch

Required installed baseline: v0.8.1b. Authorised on 21 October 2026, Singapore time, by “commit patch, with wider changelog for future merge into whole suite”.

## Implemented scope

058. Explicit manual timetable Notify actions bypass quiet hours while retaining publication, affected-recipient, current-version, duplicate and uncertain-send checks. Automatic notification timing is unchanged. Show actual request counts and per-teacher delivery state, quiet-hour holds and failure information. Keep acknowledgement separate. Reuse durable pending requests, reject unnecessary or superseded jobs before dispatch, and require deliberate retry for a definitive failure.

059. Compare baseline and published timetable content consistently, ignoring presentation-only class comma spacing and using the existing supported normalization. Recompute old publication eligibility rather than trusting stored changed/updated flags. Exclude never-notified restorations; retain corrections owed after an earlier notification or acknowledgement. Preserve genuine subject, class, group, venue, timing, duty and instruction changes. Unchanged imported Stapler cards and exports appear unchanged without rewriting stored plan identities or source records.

Daily Notify uses inline progress during refresh, publish and notify requests. Search, tabs, date controls and other functions remain usable. Duplicate action controls are disabled while a request is in progress.

## Deployment and merge

Only Deploy backend and Roster frontend change. The v0.8.1b notification Worker remains required and unchanged. The patch ZIP contains complete replacements for the two changed components, installation instructions, this changelog, suite merge notes, a source-commit manifest and checksums.

The wider changelog preserves items 053–057 from v0.8.1b and records the implementation of 058–059. An automatic morning teacher batch remains a future decision; 05:45 is not an approved new schedule. New item 060 records reusable private teacher links until their normal expiry; it remains queued. See SUITE_MERGE_v0.8.1c.md and the historical queue for detail.

## Verification

The full run passed 446/455 scripts; all nine follow-ups passed in the final 29/29 scoped run. All 455 scripts are verified across those runs. Both independent reviews closed without unresolved material findings. Detailed verification results are recorded in VALIDATION.md and RELEASE_SUMMARY.json in the patch (versioned counterparts in source). Local checks cannot prove live Meta delivery. No live deployment, production data alteration, template edit or staff notification was performed.
