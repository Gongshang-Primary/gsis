# v1: Venue allocation, aSc import and booking overlay design, Claude

Project: **v1**. Model: Claude (session `session_01L5sZ14xpe864PwuPQKyrDF`). Reviewed 16 Nov 2026 (Asia/Singapore). Advisory. A design document; no code was run.

| Item | Exact reference | Verdict |
|---|---|---|
| `docs/v1/venues/VENUE_ALLOCATION_LIFECYCLE_DESIGN.md` | main `25b6687` | **Accept as the owner's design record.** One question for the owner (Q-1) and four risks to carry into implementation |

## What it decides

1. Deploy and Venues are not tightly linked. Deploy informs aSc. aSc exports the timetable. Roster, Venues and Layout take dated occupancy from that export. No Deploy publication is needed for an import to take effect.
2. A Deploy publication replaces the planning allocation copy held by Venues and Layout, at once, even for a future-labelled version. It does not touch the imported timetable, bookings or map geometry.
3. A split label such as ISH-1A and ISH-1B is one physical venue with two class slots. Booking offers one slot or the whole venue, default whole venue.
4. A new timetable that clashes with an existing booking is accepted. The booking is kept and flagged. Nothing is cancelled or moved automatically.

## What is sound

1. Two separate streams (planning, timed) with separate ordering. A late planning delivery cannot replace a timetable.
2. Class-slot capacity is kept apart from seating capacity.
3. It names a real defect in merged code: Roster occupancy rows are keyed by room, start and end, so two different classes in one room at one time collapse into one. PR #181's multi-room mapping did not address that.
4. It replaces the current "displace" behaviour (a clashing booking is silently marked displaced) with a retained, visible conflict. That matches the owner's accept, store and flag rule.
5. No reader lock on Deploy (scenario V21), consistent with the owner's 16 Nov Roster and Deploy decision.

## Question for the owner

**Q-1: may staff book a room on a date the imported timetable does not cover?** The design says availability outside verified coverage is "unknown, never falsely free". It does not say whether a booking is then allowed. The baseline in Run B covered 5 to 20 November only. If unknown means blocked, nobody can book a room for next term until that term's timetable is imported. If unknown means allowed with a notice, the booking is saved and the retained-conflict rule deals with any clash when the timetable arrives. The second fits the rest of the design. Owner to choose.

## Risks to carry into implementation

1. **R-1 (medium): the Deploy to aSc half is unproven.** The aSc export is still marked "Draft format, applicationTested: false". The import half works (the teacher summary parsed in Run B). The design's first arrow, Deploy informs aSc, has never been opened in aSc. Test it before relying on the loop.
2. **R-2 (medium): the export may not identify lessons.** Scenario V02 needs to tell one co-taught lesson from two different lessons in the same room and period. A teacher-view export may not carry enough to decide. The design says to keep the ambiguity visible. Measure on a real export how many cells are ambiguous before building the correction screen; if it is most of them, the mapping burden returns.
3. **R-3 (medium): a flagged conflict that nobody sees is a double booking.** No notification is added. A booking owner learns of a clash only by opening Venues. Decide who checks the conflict list after each import, or add a count to a screen that is opened daily.
4. **R-4 (effort): three new designs are now ahead of one unproven deployment.** Contacts lifecycle (28 scenarios), this design (22 scenarios) and the Drive backup plan are all unbuilt. Nothing reviewed since 15 Nov is deployed; the hosted site was last verified at `26bbccd`. Each design changes code that merged in the last two days. Deploy and verify the merged fixes on the hosted site before starting these, or the next round of defects cannot be attributed.

## Smaller notes

1. Publication of a future-labelled version replaces the planning copies at once. This matches the owner's Contacts answer ("on publish. no future accomodation"). Layout's planning view will show next year's rooms from the day of publication.
2. Preserve raw labels and the mapping revision per import, as the design says. Mapping edits must create a new edition, not rewrite an old import.
3. The design changes no allocation policy and no automatic-publication rule. Keep it that way in the implementation claims.

## Evidence limits

Document only. No build, test or hosted check. F5 remains open. Runtime UAT remains not tested.
