# GSiS queued changes after v0.7.04

Logged: 16 October 2026, Asia/Singapore.
Status: implementation and v0.7.05 deployment package authorised by the user on 16 October 2026. See CHANGELOG_v0.7.05.md and QUEUED_v0.7.05.md for the completed disposition. Live deployment is separate.
Baseline: finalised v0.7.04. This file preserves the original request and its implementation notes.
Reference: image(20261015-173403).png, inspected alongside the user's instructions.

## Assign Relief: use reported absences

Remove the crossed-out manual absence entry area copied from Stapler. Stapler needed an operator to identify and add absent teachers; GSiS already receives reported absences.

- Remove Identify absent teacher, Reason, the teacher search, Absent Periods picker, Relief needed, Select All, Clear All and Add absence from this workspace.
- Populate the absent-teacher tiles from reported absences for the selected date. Do not require the SMC to add the same teacher again.
- Keep the existing ad hoc relief capability accessible without retaining the manual absence-entry form. Its control was not crossed out.

Other crossed-out elements in the screenshot are also to be removed from this Assign Relief view:

- The WhatsApp readiness notice and expandable notification readiness panel.
- The unpublished-entry count.
- Publish relief, Daily relief Excel and the duplicate toolbar Refresh records button.

This is a view change. Removing these controls does not itself delete absence records, change notification activation or remove the underlying publication/export functions elsewhere.

The screenshot's arrow indicates that the unmatched timetable-name warning should occupy the existing top status area instead of a separate full-width block. Keep its safety information visible.

## Assign Relief: health and auto-allocation above the tiles

Place the relief health indicator and a clearly visible Auto-allocate button immediately above the absent-teacher tiles, rather than leaving health and allocation below the workspace in a disclosure.

Reuse the existing health calculation and built-in allocation business rules. Auto-allocate is a deliberate user action that fills only currently unassigned periods. Preserve existing assignments, including manual and agreed arrangements; do not invoke a broad reallocation merely to fill gaps. Respect current eligibility, workload, permissions and authoritative save checks. Refresh the health indicator, uncovered count and affected tiles after a confirmed result.

Implementation must distinguish this manual button from the existing scheduled optimisation path. Existing scheduled activation flags stay paused unless separately authorised. Any existing time-window or accounting prerequisite that affects the manual action must be resolved against the established business rules, not silently bypassed.

## Suggested relief teachers: rank by R within each tier

Keep the existing suitability tiers. Within each tier, rank suggested teachers by R.

Obtain R through an API call to Deploy and cache the response for the Singapore calendar day. Reuse the loaded result when selecting periods, changing filters and ranking candidates instead of calling Deploy repeatedly.

Compare the Deploy result with the active timetable in Roster for the selected duty date, along with the existing absence and relief-allocation checks. Daily caching must not treat a teacher as free when the active timetable or current allocations make the teacher unavailable. Match stable staff identities, retain source version/effective-date context and avoid silently reusing a mismatched source.

Source observations for the later implementation:

- Deploy already exposes authenticated GET /api/relief. R is a weekly planning quota in periods per week; that response does not contain timetable availability.
- The existing Deploy relief cache is 300 seconds, rather than a Singapore-day cache.
- The current Roster ranking uses annual fairness and alternative availability before higher remaining R. The requested R-first ordering within each tier therefore needs an actual ranking change.
- The original wording did not specify raw R versus remaining R, or ascending versus descending order. The authorised build interprets this as remaining weekly R descending within each existing tier. That interpretation reflects usable capacity after already charged relief; it is not presented as the earlier wording.

Relevant code: shared/roster-allocation.js, backend/Relief.gs, backend/RosterOperations.gs, public/_worker.js and roster-update/public/roster-operations-ui.js.

## Release handling

Ponytail and Pstack reviews apply to the authorised v0.7.05 implementation. Edits reuse existing calculations and preserve atomic writes. No code or operational action was performed while the request was only logged. The existing v0.7.04 package is preserved. Final local test and archive evidence is in VALIDATION.md and RELEASE_SUMMARY.json.

