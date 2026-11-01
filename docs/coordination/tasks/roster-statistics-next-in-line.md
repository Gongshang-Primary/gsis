# roster-statistics-next-in-line: "Cumulative percentage of relief done R%" table (changelog)

- Status: proposed (owner changelog, 1 Nov 2026 ~20:00; not claimed, not authorised to build)
- Owner/model: unassigned (Codex when authorised)
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

## Open questions for the owner
1. Period: this term, this year, or the weekly R snapshot (3B)?
2. Ties: break by fewest reliefs, then name?

## Verification / Review / Deployment
Not started.
