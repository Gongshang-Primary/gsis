# GSiS v0.7.05 changes

Finalised on 16 October 2026, Singapore time, from v0.7.04 after explicit instruction to build. This release produces deployment files. It does not create a Git commit or deploy a live service.

## Assign Relief uses reported absences

The selected date's reported absences supply the absent-teacher tiles. SMC no longer enters the same absence again in Assign Relief. The copied manual absence form is removed from that view. Existing entry details, editing, removal and ad hoc relief remain available through their existing controls.

The crossed-out WhatsApp notice and readiness panel, unpublished count, publication/export buttons and duplicate toolbar refresh are removed from Assign Relief. Publication and daily Excel remain available from Absences by Date > Relief Assignments. The existing top status area carries unmatched timetable-name warnings. Recess supervision has a separate group below the reported absences, with its existing period and candidate controls. It does not create an absent-teacher record.

Relief Health and Auto-allocate sit above the absent-teacher tiles. The button fills unassigned periods through the existing allocation rules. It preserves valid existing assignments, including automatic drafts, manual assignments, agreed arrangements and No Relief Needed decisions. It does not publish the result. Normal authoritative reconciliation can still withdraw future cover that a changed timetable or absence has invalidated.

The manual button can fill future periods on a confirmed school day, including after the scheduled 06:29 cutoff. It cannot fill started periods or past dates. SMC authority, verified annual accounting, quota, current availability, revision checks and the existing atomic save remain required. Scheduled optimisation keeps its existing time window and remains paused. Capacity warnings can still enter the existing duty-SMC queue, but the disabled dispatcher prevents WhatsApp delivery.

## Suggestions rank by remaining R

The suggested relief list keeps its existing suitability tiers. Within each tier, higher remaining weekly R appears first. Annual fairness, alternative opportunities and deterministic rotation remain tie-breakers after remaining R.

Remaining R means Deploy's weekly R less the relief already charged for that week. This interpretation avoids putting a teacher first merely because their original quota was high after their available quota has been used. The UI still checks the active timetable, reported absences and current relief assignments.

## Deploy supplies the current quota

Roster uses the authenticated Deploy backend's shared relief API calculation. It does not add an HTTP request back to the same backend. The compact quota projection includes stable staff IDs, source version, revision, effective dates, calculation version and check time.

The cache is scoped to the Singapore calendar day and the published Deploy source. A fresh source check prevents a changed published version from reusing its old cache. Apps Script retains an item for at most six hours and can evict it earlier. A miss recalculates from the confirmed source. No cached quota survives the Singapore date boundary.

Historical weekly entitlements remain the source for annual accounting. Current and future planning use the matching current Deploy quota. An unavailable or mismatched source is not replaced by an old observed quota. Explicit exclusions and special-holiday accounting remain in force.

## Verification and retained limits

Pstack reviews cover correctness and affected callers. Ponytail reviews cover unnecessary work and complexity. Final test and archive results are recorded in VALIDATION.md and RELEASE_SUMMARY.json.

The bounded timetable cache, public privacy page, existing publication rules and exact-retry save protocol remain. WhatsApp stays paused. Evening v1 remains selected and v2 remains on Meta. The conditional template submission remains prepared only. This release does not recheck provider approvals.

Update the matching Deploy backend before the Roster frontend. Live latency, the earlier startup incident and historical absence cleanup remain separate operational checks.
