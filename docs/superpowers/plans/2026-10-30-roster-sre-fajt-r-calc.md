# SRE timetable relief calculation plan

Spec: docs/coordination/tasks/roster-sre-fajt-r-calc.md.

1. Test the existing shared calculation with timetabled SRE, FAJT, daily SRE, incomplete workload and configurable FAJT budget. Preserve the school T_avg denominator and all non-SRE calculations.
2. For verified SRE teaching greater than zero, select the configured FAJT budget and factor. Keep SRE as a modifier of the existing employment type. Return no quota for verified zero teaching and expose the calculation basis.
3. For long-term SRE ranking, compare weekly used quota percentage, 100 * (R - remaining) / R, with ordinary annual usage percentage. This expresses weekly R remaining on the same scale, avoids unconditional priority, and leaves annual display/accounting intact. Use the same basis for marginal whole-allocation cost and manual replacement previews.
4. Test both ordering directions, historic annual changes, weekly exhaustion, the real solver and My Calculations. Regenerate copies and run the full suite.
5. Claude reviews the exact head. Owner merges. No deployment or authority changes.
