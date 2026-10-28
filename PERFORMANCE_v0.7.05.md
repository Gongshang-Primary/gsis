# GSiS v0.7.05 performance checks

The quota cache removes repeated relief calculations when the published Deploy source and Singapore day are unchanged. This release does not claim a measured production response time.

| Scenario | v0.7.05 behavior | Limit |
| --- | --- | --- |
| Open Assign Relief | Use the selected date's reported absences. | Fresh authority and mutable operational state remain required. |
| Select a period or filter loaded suggestions | Reuse the loaded candidate rows and rank within existing tiers. | A save still checks current server state. |
| Read Roster's quota | Use the shared Deploy calculation and compact quota projection. | No second HTTP request to the same backend. |
| Repeat quota read on the same Singapore day and source | Reuse a cached projection after the current source check. | Maximum six-hour cache lifetime; early eviction is possible. |
| Change published Deploy source | Use a different version/revision/commit cache key. | A changed or pending source cannot return the old projection. |
| Cross Singapore midnight | Use a new cache day. | Quota is recalculated on the next cache miss. |
| Click Auto-allocate | Fill uncovered future periods while keeping valid existing assignments fixed. | Solver limits, accounting and eligibility checks still apply. |

Quota caches contain staff IDs, R and necessary class/TG source data. Mutable availability and authority are not cached in this projection. The cache includes provenance and effective dates. Oversized projections or cache failures fall back to the confirmed calculation, not stale data.

The full staff timetable remains in bounded browser memory, up to eight immutable models. Calendar/date context expires separately after 60 seconds. Logout and account changes clear staff data. The timetable is not persisted in browser storage.

Report Absence intent loading, fresh report reuse, combined Own Arrangements preparation and projection outside the save lock remain from v0.7.04. Calendar multi-date batching and existing request deadlines remain.

VALIDATION.md and RELEASE_SUMMARY.json record the final local checks. Live Apps Script timings and matching diagnostic logs remain necessary to assess production delay and intermittent failures.
