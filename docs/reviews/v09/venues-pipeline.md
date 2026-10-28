# GSiS v0.9 venue storage decision and future booking pipeline

Recorded 24 October 2026, Singapore time.

Status: reviewed and queued. The v0.9 release does not create a venue booking app, register the hostname, change production sheets or migrate venue data.

## Decision for v0.9

No additional venue sheet is required for the current LORD integration. Physical venue metadata already has its own `Venues` tab, configured by `LANDMARK_SHEET_ID`. Deploy reads that register explicitly and keeps a frozen copy in each deployment version. Layout has a separate `layout_venues` tab in its owned yearly repository, alongside classes, teaching groups and allocations. These are different responsibilities rather than duplicate editable masters.

Keep this separation for v0.9. Creating another editable venue master now would introduce a third owner without solving a current requirement. LORD's new local references contain people, classes, subjects and teaching groups; they do not require venue booking storage.

When the booking project starts, create a separate booking workbook or equivalent transaction store. Booking activity must not be written into Deploy's version documents or Layout's publication snapshots. Reuse the existing venue register as the initial catalogue source, then make any change of ownership an explicit migration.

| Current data | Owner and behaviour | Evidence in source |
| --- | --- | --- |
| Physical room metadata | `Venues` tab via `LANDMARK_SHEET_ID`; values, unique unit numbers, room names, block, level and optional capacity are validated | `backend/Code.gs`: `readLandmarkRegistry_` |
| Planned class and TG assignments | Deploy version document; draft changes do not replace the published snapshot | `backend/Code.gs`: `landmarkRegistry_`, `landmarkAllocations_`, `publicCampus_` |
| Published Layout copy | Independent repository by year; immutable checked snapshots, one verified head, separate `layout_venues` and `layout_allocations` tables | `backend/LayoutRepository.gs`: `layoutRead_`, `layoutStore_`, `syncLayoutPublication_` |
| Day and period timetable changes | Roster's verified baseline and effective published changes, including suspended timetables | `backend/RosterTimetableBatch.gs`; `shared/roster-timetable-view.js` |

## Physical venue identity and class renames

The supplied *Classroom Layout caa 21 Sep 2026.pdf* was read and visually inspected. Its single page shows physical units separately from their occupants, for example `F1-16` with `1P` and `1CL1`, and `E4-10` with `5T` and `5ML2`. It also includes shared teaching rooms, sports halls and support spaces. This supports keeping the physical room separate from a class or TG label. It does not establish which rooms are bookable, their safe capacity or their opening hours.

The 2027 class naming changes must update labels and allocation links without creating a new physical room or moving historical bookings. A booking must never identify its venue by class name, room display name, TG name or row position.

Current unit numbers are validated identifiers, but they can be renamed. Layout's generated venue IDs are scoped to the yearly repository, so they are not a durable cross-year booking key. Before booking writes are enabled, introduce or map an immutable `venueId` that persists through unit renumbering and year changes. Preserve `unitNumber`, `geometryUnit`, display names and effective-dated aliases separately. Keep the original label and source revision on historical bookings.

Reject ambiguous mappings instead of guessing. The existing source already handles the historical `D1-06B` Pump Room versus EAS Store ambiguity and requires review when old allocations cannot be resolved safely. Shared or divisible spaces also need explicit conflict groups so booking a whole hall can block its bookable subdivisions.

## Queued product: venues.gsps.edu.sg

Build a timetable-aware venue booking system using Roster's timetable interaction patterns. The required experience is a venue timetable with range selection and a vertical **Now** indicator. These booking controls are a future requirement, not a claim that the new app or all reusable controls already exist in v0.9.

The first view should show venues as rows and time as columns, with sticky labels, clear occupied and available slots, compact booking details and a retained scroll position after refresh. Allow contiguous range selection by pointer, touch and keyboard, with a clear start/end summary before submission. Render the Now line from `Asia/Singapore` time, only on the displayed current day and within its visible time axis. Updating that indicator must not trigger timetable downloads.

Show lessons, approved bookings and closures as distinct occupancy sources. Include the timetable's published version and last verified time in a concise status area. A user should be able to understand why a slot is unavailable and who can resolve a booking clash without seeing private absence reasons or staff contact data.

## Planned data and update contract

| Data | Proposed source and owner |
| --- | --- |
| Stable venues, aliases and conflict groups | Venue catalogue derived from the existing physical register; one declared editor and migration path |
| Class and TG labels, published allocation context | Published Deploy catalogue, keyed by source version, revision and commit; no unpublished 2027 labels before publication |
| Actual daily lesson occupancy | Purpose-built authenticated Roster projection using the correct baseline, odd/even week, actual date and effective published STAPLER or relief changes |
| Bookings, closures, approval decisions and cancellation history | Separate booking store owned by Venues |
| Staff identity and permissions | Stable Contacts Staff ID and verified current authority; names are display values |

Do not infer room availability from a teacher's absence alone. The lesson can remain in the room with relief, move, combine or be cancelled. Roster must project the resulting lesson occupancy. Consolidate co-teaching duplicates by a verified lesson identity; keep genuinely overlapping independent lessons as a conflict. Unknown venues, unresolved aliases and missing timetable periods are unavailable for automatic confirmation until reviewed.

Maintain a local copy and IndexedDB cache for today through 30 days ahead, keyed by independent venue catalogue, published Deploy, Roster date or window, and booking revisions. Compare trusted source markers first and fetch only changed projections. An edit outside the window should not invalidate all dates. Cached views may remain visible during an outage with their age shown, but a stale cache must not authorise a new booking.

Publish narrow occupancy data rather than teacher timetable dumps. Validate complete manifests, source bounds and checksums before advancing the local pointer. Retain the last verified snapshot after a failed refresh. Unpublished STAPLER plans and uncommitted manual relief edits must not silently change ordinary users' availability.

## Booking conflicts and atomicity

Each create, amend or cancel command needs an actor, stable venue ID, explicit Singapore date and time range, source revision, expected booking revision and idempotent request ID. Use half-open intervals so one booking ending at 10:00 can be followed by another starting at 10:00; apply any configured setup or cleanup buffer explicitly. Check capacity, closures, required approval and physical conflict groups before accepting.

Under one short booking writer transaction, compare the current reservation revision, validate all affected venue/time intervals and append the booking with its receipt and audit choice. Exact retries recover the prior outcome. Stale editors receive the named conflicting booking and safe choices; no last-write-wins overwrite of another reservation. Amendments and cancellations retain their original booking identity and history.

An Apps Script lock in the booking project does not lock Roster's separate publisher. Re-reading Roster before a local commit alone cannot prove atomicity across both services. Before launch, choose and implement a coordinated publication contract: either a shared reservation/publication fence checked by all relevant writers, or an explicitly provisional booking state with revision-aware reconciliation and subsequent confirmation. Test the interval between the final source read and booking commit. Do not label a provisional result as a guaranteed reservation.

If a later timetable publication introduces a clash, preserve both records, flag the affected booking, show the new lesson and its publication, and require an authorised resolution with an audit trail. Notification delivery uses a durable queue and is independent of the reservation transaction; a send failure must not duplicate or erase the booking.

## Delivery sequence and acceptance checks

1. Map existing venue units to stable cross-year IDs, review aliases and bookable spaces, and validate the supplied layout against the current register without using the PDF as a live data source.
2. Define the Roster occupancy projection, revision markers and cross-service publication/booking conflict contract.
3. Create the isolated booking store and authenticated API with receipts, concurrency checks and audit history.
4. Build the timetable, accessible range selection, Now line and compact clash resolution flow using shared Roster display primitives where suitable.
5. Exercise simultaneous booking attempts, a timetable publish during booking, partial source failure, exact retries, stale browser tabs, unit/class renames, year rollover and overlapping whole/partial spaces before deployment.

Acceptance includes no unnecessary full timetable reload when source revisions are unchanged, correct published STAPLER occupancy, no exposure of draft timetable or private staff data, and preserved history after class renaming.

## Verification of the existing foundation

Read-only source inspection and PDF rendering completed. The following existing local tests passed on 24 October 2026:

- `node tests/landmark-api.cjs`: published lookup, planning privacy, publication race rejection and ambiguous venue handling.
- `node tests/release501-layout.cjs`: independent Layout reads, publication freeze, recovery, idempotence, year isolation and checksum rejection.
- `node tests/layout-sync.cjs`: revision refresh, stale lookup rejection and retained state after failure.

No live spreadsheet, DNS, app deployment or booking data was changed by this review.
