# GSiS 0.9.8k changelog

Baseline: J `a2b436296ceb81ae3463b26b7dd8abd182939c99`.

Confirmed suspended timetables previously set effective daily/consecutive limits to null, bypassed ordinary R/cap gates and removed annual/weekly/alternative preferences. This patch restores the saved enabled rules while keeping ordinary Deploy workload formula recalculation separate. Actual dated Stapler occupancy still drives availability, and cumulative relief remains counted.

The focused scope is Roster frontend/backend, plus notification and private operations Worker helper parity for already-deployed instances. Other component versions remain J. There is no storage migration or new infrastructure requirement.

Manual/peer/published choices stay protected from silent reassignment; that protection does not certify an over-cap choice as valid. Non-UT contractual employment caps remain non-overridable, and permitted UT manual overrides retain warnings and audit evidence. Existing fill-only and 06:29 Singapore optimisation cutoff remain. This is prevention of further automatic bypass, not an automatic rewrite of already published current-day covers. SMC can review affected choices individually.

Configured settings and disabled toggles are preserved. The package does not run allocation, publish, clear history or send real messages during preparation. Final measured validation and committed source provenance are recorded by the controller.
