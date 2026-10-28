# GSiS v0.9.1c changes

25 October 2026, Singapore time. Roster component patch over v0.9.1b. LORD, OVERLORD and STARLORD retain v0.9.1b; the other installed components retain their existing versions.

## Full-school-year Report Absence

Report Absence accepts up to 366 inclusive dates, covering a full leap year. Existing shorter ranges crossing December and January remain supported. The frontend and authoritative save path use the same absence-specific range contract. Other operations retain their own limits.

Long multi-teacher submissions remain atomic. Calendar is checked in bounded batches, and oversized operations fail before a partial absence save. Long-range success feedback uses a compact date summary instead of listing hundreds of dates.

## Venues design refinement

The reviewed design records descriptor-aware partial room search with unit-only selected values, optional preparation requests, a multi-room dashboard with grouped booking periods and exact timings, admin-assigned room owners, and room-level booking approval policies. Earlier repeat rules remain explicit. The proposed self-approval rule is visible for review.

These are committed product-design requirements, not a delivered Venues frontend or backend. The separate product backlog is not committed or included in the deployment archive.

No live deployment, setting change, timetable publication or provider message is performed by this patch.
