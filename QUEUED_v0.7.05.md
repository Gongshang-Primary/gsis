# v0.7.05 change disposition

Status: implementation and deployment package authorised on 16 October 2026, Singapore time. Final evidence is in VALIDATION.md and RELEASE_SUMMARY.json.

| Request | Release change | Limit |
| --- | --- | --- |
| Remove the copied manual absence form | Assign Relief uses reported absences for the selected date. | Report Absence and existing SMC entry actions remain; Recess supervision stays in its separate group. |
| Remove the other crossed-out controls | Assign Relief omits WhatsApp readiness, unpublished count, publication/export buttons and the duplicate toolbar refresh. | Publication and Excel remain in Absences by Date > Relief Assignments. Notification activation is unchanged. |
| Put the unmatched-name warning in the existing status area | Assign Relief reuses the top status area. | Unmatched teachers remain unavailable for automatic selection. |
| Put health and Auto-allocate above absent-teacher tiles | Relief Health and the manual action precede the tiles. | Health measures eligible opportunities, not an independent pool of R for each period. |
| Auto-allocate unassigned periods using existing rules | A separate fill-only operation preserves valid existing assignments and decisions. | It requires SMC authority, verified accounting and current eligible capacity; publication remains manual. |
| Rank suggested teachers by R within each tier | Higher remaining weekly R comes first within each existing suitability tier. | Remaining R, rather than the initial quota, is the implementation interpretation. Ties retain the existing fairness rules. |
| Obtain R from Deploy and cache for the day | Roster reuses Deploy's authenticated shared calculation and a day/source-scoped quota cache. | Apps Script's maximum item lifetime is six hours, with possible earlier eviction. A miss recalculates. |
| Compare R with the active Roster timetable | Stable staff IDs link quota to uniquely matched current timetable teachers. | Current absence, assignment and authority checks still run; missing or out-of-range quota is unavailable. |
| Keep historical R reliable | Annual accounting retains historical observations; current and future planning use the current source. | Existing explicit exclusions and special-holiday rules remain. No historical quota is invented. |

The original request record is GSiS_Queued_Changes_After_v0.7.04.md. Its uncertainty about R ordering is resolved for this build as remaining R descending. This is an implementation choice, not a claim that the earlier wording specified a direction.

WhatsApp, menu, diagnostics and scheduled allocation stay disabled. No live deployment, provider submission, message, production data cleanup or Git commit is part of finalisation.
