# roster-absence-on-behalf: any teacher may report absence for colleague(s) (changelog)

- Status: proposed (owner changelog, 2 Nov 2026 ~15:30); not authorised to build
- Owner/model: unassigned (Codex when authorised)
- Reviewer/model: Claude
- Lane: R (serial; after the D1 cutover; must work on Google and D1)

## Owner request (verbatim)
"roster: allow all teachers to submit "on behalf" for another(s) for absence"

## Intent
Report Absence lets any signed-in teacher submit for one or more colleagues (e.g. a colleague who is ill and cannot reach a phone), not only for themselves.

## Design rules (Claude, proposed)
1. Record both identities on every report: `submittedBy` (signed-in teacher) and `staffId` (absent teacher). Show "Reported by X on behalf of Y" to SMC in Received reports and Manage school-wide absences.
2. Notify the absent teacher (existing WhatsApp/email channel) that a report was made for them, with a link to view or withdraw.
3. Multiple colleagues: one submission creates one report per colleague (each with its own receipt and withdrawal), sharing a request group ID.
4. Same validation as self-report: dates, periods, relief required, instructions optional (the submitter may not know lesson plans).
5. Audit trail and rate limit (e.g. at most 5 colleagues per submission, 20 per day per submitter) to limit misuse.
6. Absence intake queue, freeze and D1 paths unchanged; add on-behalf to the D1 smoke test.

## Open questions for the owner
1. Should SMC approve on-behalf reports before relief is allocated, or treat them like self-reports?
2. May the absent teacher's own later report override or withdraw an on-behalf report?
3. Which channels notify the absent teacher: WhatsApp, email, or both?
