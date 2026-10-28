# v0.7.13 requirement reconciliation

Baseline: v0.7.12 at `5f2d636e8c92dd1affd325f56a45493dc54831f9`. Requirements come from the post-release chat and GSiS_Queued_Changes_After_v0.7.12.md. Source changes and focused evidence are complete; production installation remains separate.

| Item | Release interpretation | Status |
| --- | --- | --- |
| Q713-01 | Bottom-up red markers move with their paired teacher rows; preserve baseline capacity meaning. | Implemented and verified |
| Q713-02 | Tier 1 contains all eligible internal manual suggestions, led by remaining weekly R descending; timetable fit and fairness break ties. Preserve special candidate categories and configured automatic preference order. | Implemented and verified |
| Q713-03 | Name Bridge selects exact values from all baseline teacher names, with server validation and review flags for retained stale bridges. | Implemented and verified |
| Q713-04 | Relief Health display-period checkboxes; hide P0/P13/P14/P15/P16 by default without changing allocation. | Implemented and verified |
| Q713-05 | Employment-period restrictions default for SRE/FAJT; apply to automatic candidates and health, allow only explicit reasoned SMC manual override. | Implemented and verified |
| Q713-06 | The marked narrow green strip becomes adjacent floor; larger grass patch remains. | Implemented and verified |
| Q713-07 | Extend exposed and sheltered L2 Block A surfaces east to straight railing at Block K west wall; same shift for L1 flag area and external stairs; preserve all other specified structures. | Implemented and verified |
| Q713-08 | Keep No relief instructions needed in the relief-instructions header after the first absence step; complete the same report without clearing relief demand. | Implemented and verified |
| Q713-09 | Earlier missing-message report superseded by user-confirmed successful 05:45 delivery. No provider defect established and no live retry requested. | User observation recorded; no code fix claimed |
| Q713-10 | Configured target-date duty summaries, fresh 05:30 report, successful-summary change tracking, scoped quiet-hour exception and no extra routine 06:30 summary. | Implemented and verified |

The final Block A colour key is authoritative: blue is the exposed surface, red is the sheltered walkway and cover, and orange identifies L1 changes. Block K stays fixed. The straight railing touches its west wall without introducing a new connection or doorway.

The first evening summary and 05:30 summary are sent even with no absences. Later suppression compares effective absences, including cancellations and changed periods, with the last successful summary for that target date. Assignment-only changes do not create absence updates. The independent auto-allocation timing and final cutoff remain unchanged.

The 05:45 delivery was reported by the user after the release request on 19 October 2026, Singapore time. This build did not inspect a new provider callback or send a message. Existing v0.7.12 operational follow-up, including installed latency evidence and any unresolved historical service incident, is not silently marked complete by this source release.

The first configured slot in each summary phase is the fresh report. With defaults, 05:30 always starts a new morning summary even if nothing changed overnight. Moving or removing that first slot changes the start of the fresh morning cycle; an empty phase disables its summaries.
