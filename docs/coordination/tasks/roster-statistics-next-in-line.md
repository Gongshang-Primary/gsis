# roster-statistics-next-in-line: "Cumulative percentage of relief done R%" table (changelog)

- Status: authorised to build (owner 1 Nov ~20:45: "let codex work on the last 2 PRs"); merge held per lane R rule
- Owner/model: Codex
- Branch: codex/roster-statistics-r-percent
- Depends on: roster-relief-count-investigation (same count definition; build after or together)
- Reviewer/model: Claude
- Lane: R (serial; held until after the D1 cutover and Monday's first busy period)
- Files/domains (expected): `roster-update/public/roster-statistics-ui.js` (third table after "Total Absences and Relief — by Date"), statistics data source, `shared/roster-allocation.js` (read only, for the ordering key), tests.

## Owner request (verbatim)
"under roster > statistics > add as third diagram (first being "Total Absences and Relief — cumulative", 2nd being "Total Absences and Relief — by Date") rank table of teachers by cumulative R% done (i.e. the higher the name, the more like system will assign the teacher next available)"

## Intent
A table of teachers by cumulative R% done, ascending by default: least done at the top, most at the bottom.

## Design rules (Claude)
1. Use the allocator's own fairness key from `shared/roster-allocation.js`; never a second formula. Otherwise the table misleads.
2. Title (owner ruling 1 Nov ~20:15): **"Cumulative percentage of relief done R%"**. No "next in line" wording. Default sort: R% ascending (lowest first); columns stay sortable.
3. Exclude inactive staff (Contacts inactive, owner option 1B) and staff with no R entitlement.
4. Columns (proposed): Rank, Teacher, Relief done, R entitlement, R% done, Last relief date.
5. Must read from D1 when D1 is the record; add a D1-path test.

## Defaults until the owner rules otherwise (Claude, 1 Nov)
1. Period: the accounting year to date, the same window as My Calculations ("1 Jan to today").
2. Ties: fewest relief periods done, then name.

## Verification / Review / Deployment
Not started.

## Related display fix (owner screenshot, 1 Nov ~20:30, v0.9.9g)
"Learn about Auto Allocation → My Calculations" reads "your relief quota R = 0 and your cumulative relief done is **Unavailable**". Cause: `roster-update/public/roster-calculations.js` shows `h.percentage`, which is done ÷ accumulated quota; with quota 0 it is not finite, so the text falls back to "Unavailable". The data is correct (completed 0 periods, quota 0); the wording is wrong.
Fix: when the accumulated quota is 0, show "0 periods done; no relief quota recorded, so no percentage" (or the done count) instead of "Unavailable". Use the same rule in the R% table (staff with no quota excluded or shown as "no quota"). Display only; no data change. Lane R, after the cutover.
