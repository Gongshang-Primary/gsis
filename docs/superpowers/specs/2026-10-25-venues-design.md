# Venues: timetable-aware venue booking

> Implementation decision for v0.9.2: Venues uses its own Apps Script, Sheets and Drive resources. The later authorised standalone design in `docs/contracts/venues-v1.md` supersedes the original shared-Roster backend preference below. Roster occupancy changes coordinate through a signed durable fence; no cross-project atomic transaction is claimed. The main README is the current deployment authority.

Design for venues.gsps.edu.sg, 25 October 2026, Singapore time. Revision 2 adds room search, preparation notes, the multi-room dashboard and room-owner policies.

Status: active requested product, clarified design for review. No venue frontend, reservation backend, DNS change or live booking has been deployed by this design. The v0.9.1b maintenance patch is independent.

## Product outcome

A staff member opens a LORD-style timetable, filters venues by partial text in the first column, chooses a date and period range, and books an available venue. Dates, filters and timetable navigation respond locally after the first verified compressed download. Saving changes only the affected reservation records, and the server decides the winner when requests compete.

The default is one booking for the selected date. Booking can extend through the configured school year, including weekends and school holidays during normal hours. A next-year date is selectable only when that year's calendar, venue mappings and timetable coverage are ready. Display coverage explicitly; missing source data is not free space.

## Rules confirmed by the user

| Rule | Decision |
| --- | --- |
| Ordinary venue repeats | Under the open-booking policy, the first available occurrence confirms immediately; later occurrences await room-owner/admin approval. |
| Special venue repeats | Entire repeating series, including its first occurrence, awaits room-owner/admin approval. |
| Room search | Search partial unit numbers and descriptors; results show both, but the selected field shows the unit number only, like Deploy IP Deploy. |
| Booking note | Optional purpose/preparation request accompanies each booking. |
| Room dashboard | Every signed-in staff user can select multiple rooms by checkbox and view their bookings, periods/timings, requester and note. Owners manage their assigned rooms; general users have a read-only dashboard. |
| Room owners | Venues admins assign room owners to specific rooms. Owners and admins choose whether a room permits immediate booking when free or requires approval for every request. |
| Pending dates | Reserve the requested slots until approved, rejected, cancelled or displaced by timetable priority. No automatic expiry. |
| Transfer | Request acceptance from the current ad hoc booking owner, or an assigned room owner / Venues admin for a timetable reservation. |
| New timetable conflict | Timetable takes priority; preserve and flag the displaced ad hoc booking and notify its owner. |
| Suspended plans | Confirmed plans reserve venues even before publication. Drafts do not. |
| Booking horizon | Through the configured school year. |
| Weekend/holiday access | All dates use normal operating hours. |
| Email delivery | Both CES and GSPS addresses belonging to each participant, when available, deduplicated. |
| Success notices | WhatsApp and email to requester, both with short management links. |
| Transfer notices | WhatsApp and email to requester and original ad hoc owner, or assigned room owners, falling back to Venues admins if none, for timetable reservations. |

## User screens

### Book a venue

Use LORD typography, navy booking blocks, green success/Now indicator, red issue actions, rounded panels and dense timetable geometry. A sticky first column contains the partial text filter and room unit numbers; the header contains period names and exact times. Search results show unit plus descriptor. Once selected, the room field or selection chip shows only the unit number. Capacity, location and useful features remain available in room details without exposing private staff contact data.

At 1920x1080 on a 13-inch display, and at a typical scaled 1366x768 viewport, preserve useful row density with a fixed header and resource column. Test mobile at 390x844 and 360x800. On mobile retain readable period widths, horizontal scrolling and at least 44px touch targets, with selected date/range visible in a compact sticky summary. Do not shrink the entire day into unreadable cells.

Show a live green Now line only for the displayed Singapore date and only within visible operating hours. Update it locally every minute and on return to the tab; it never triggers a timetable download. Available, timetable, ad hoc, pending approval and closed cells have distinct labels/icons as well as colour.

Choose Single or Repeating. Repeating adds start/end dates and selected weekdays; timings still come from the grid. Preview every dated occurrence, its timetable occupancy and approval state before submission. A conflict is never silently skipped. Offer an explicit available-dates-only selection, or let the user adjust the request. Use one venue per series initially, with occurrence-level identities and state. After the user chooses the final occurrence set, admission of that set is atomic; either every selected occurrence acquires the appropriate confirmed/pending state or none does. The preview may propose available dates, but submission never silently drops conflicts.

Room selection follows the existing Deploy IP Deploy interaction: search the full cached unit/descriptor label using case-insensitive partial words, with all typed words required to match. Include permitted type, block/floor and aliases in the search index. Suggestions display unit and descriptor; the collapsed selected value displays only the unit number. Keep the full descriptive accessible label and keyboard operation. Reopening the selector restores descriptive choices. The underlying value is a stable venue ID, never the displayed unit text. An example is a search for “science” returning a science-lab unit and its descriptor, then displaying only that unit after selection; no unit-to-room mapping is invented by this example.

Provide one optional multiline field labelled **Purpose / preparation request (optional)**. Example placeholder: “Science investigation; please prepare apparatus before the first period.” Keep the exact submitted spaces and line breaks, render it as text, and label it “Visible to staff viewing this room’s bookings.” Proposed input limit: 2,000 characters. A blank note must not block booking. Do not imply that apparatus is available or prepared merely because a room is booked.

For repeating bookings the initial note applies to every occurrence. The requester can amend one occurrence or future occurrences explicitly; retain per-occurrence overrides. Note-only edits use the booking revision and audit trail and do not re-download timetable source data. An owner/admin operational response, if supplied, is separately attributed and never silently overwrites the requester's original preparation request. Viewing or responding to a note does not approve a pending booking.

An occupied cell opens useful details. For an ad hoc booking, show the owner and a Request transfer action. For a timetable slot, show the permitted lesson/source label and responsible room owners or fallback Venues admins. Contact buttons are secondary to the tracked in-app transfer request. Private contact data is resolved only for authorised users.

### Manage my bookings

Tabs: Upcoming, Awaiting decisions, Past and Cancelled/displaced. Display venue, date, period range, purpose, current state and whether it belongs to a series. Allow requester amendments, cancellation of one occurrence or future occurrences, and viewing transfer requests. Changes recheck current availability and expected record revision. A change into an approval-required state cannot bypass approval by editing an existing confirmed booking.

Displaced bookings remain visible with the timetable version responsible and a Find another slot action. Repeated pending requests show the admin group responsible and when the request was made. Booking requesters can cancel their pending holds.

### Room dashboard

Provide a **Room dashboard** available to every authenticated staff user, including permitted support staff. It is an operational staff view, not an unauthenticated public page. Use a searchable checkbox list to choose several rooms. Results include the descriptors; selected room chips show unit numbers only. “Select all filtered” acts only on the visible matches, and “Clear selection” is explicit. Retain the selected stable room IDs and chosen view locally for convenient reopening.

Default to today with an explicit date/range picker. Render a vertical agenda grouped by date and room, sorted by start time. Show: room unit, booking period(s), the exact start/end time of every period, requester name, purpose/preparation request, and status. Include confirmed bookings and pending requests, clearly distinguished; cancelled, rejected and displaced history is an optional filter. Published timetable occupancy remains visible with its permitted labels. Confirmed-but-unpublished timetable holds use the existing fixed privacy-safe label and have no leaked staff allocation or plan note.

Use Roster Report Absence → Relief Instructions as the visual reference. One continuous block of the same booking occurrence is one visible row/block. List each constituent period and its start/end time within the time cell, while showing the requester and shared note once. Merge only when booking-occurrence identity, room, date, status and note match and the actual time intervals touch. Split at a time gap, including a break, or changed note/status. Separate bookings remain separate even when the requester and note happen to be identical. Repeated bookings on different dates never collapse into one row.

On a small screen, use a compact booking card with the same grouped period/time list and shared note. Keep the room/date heading visible. Text wraps; long preparation notes can expand without obscuring actions. The dashboard must remain useful on the existing 13-inch desktop and phone targets.

The same dashboard URL can be bookmarked with selected room IDs and date/range filters, without embedding notes, contact details, credentials or permissions. Each load authenticates the viewer and derives permissions afresh. General staff get a read-only dashboard. A room owner gets management controls only on their assigned rooms, including when the selection mixes owned and unowned rooms. Whole-product admins can manage all rooms. Booking requesters continue to edit their own bookings through Manage my bookings; that does not make them room owners.

Owners/admins can approve or reject applicable requests, manage bookings/closures for their rooms and handle timetable-slot transfers. Changes use explicit actions and confirmations appropriate to their impact, current revision checks, audit and existing participant-notification rules. General staff cannot gain these controls by changing a URL, cached role or client request. A room-owner response to a preparation request keeps its own actor/time and preserves the original request.

Load only the selected rooms and date coverage needed for the agenda. Use booking deltas and a small current revision check; room filtering, grouping and date navigation over cached coverage happen locally. Booking/note/status changes and room-owner/policy changes have separate revisions from the immutable timetable package. Recheck permissions for every mutation and discard account-scoped private cache on sign-out or account change.

### Facilities administration

Prioritise approvals, transfers, displaced bookings and failed/uncertain notifications. Support single-occurrence or explicit series decisions, with requester, date/time, conflicting source and an audit reason. Revalidate all selected occurrences during approval.

Maintain a Venues-specific administrator directory and room-owner grants with stable Staff IDs, stable venue IDs, active status and effective dates. Only whole-product Venues admins may add, change or remove room-owner assignments. Permit more than one owner per room, including eligible support staff such as lab technicians. Room owners cannot grant themselves or others access. Owners may manage policy and requests for their assigned rooms; product admins may manage every room. Revocation takes effect at the next server operation, including on an already-open dashboard. Unowned rooms route approval work to the product admins.

Both administrator and room-owner grants record active status and effective dates. These permissions do not grant Contacts, Roster or LORD admin access. Protect against removing the last whole-product admin. Initial administrator is configured during setup, never inferred from a client-supplied role.

Venue settings include bookable flag, special-venue flag, normal opening hours, closures, capacity, features, setup/cleanup buffer, physical overlap groups, responsible admin group, assigned room owners and booking approval mode. The physical room register remains the shared source of names/location. Closures override ad hoc bookings and create a reviewed displacement record rather than silently deleting them.

### Approval policy precedence

Every room has two user-facing choices: **Book immediately when available** or **Approval required for every booking**. Room owners may change the policy of their assigned rooms; product admins may change any room. Availability always excludes timetable occupancy, pending holds, closures, overlap groups and existing ad hoc reservations. Approval cannot itself bypass an occupancy conflict; a timetable exception uses the separate approved transfer flow.

The following precedence preserves the earlier confirmed repeating-booking rules. It is the stated interpretation of the new room-policy request, not a claim that the user withdrew those rules:

| Room mode | Single booking | Ordinary room repeating booking | Special venue repeating booking |
| --- | --- | --- | --- |
| Book immediately when available | Confirm immediately if available | First occurrence confirms; later occurrences await approval | Every occurrence awaits approval |
| Approval required for every booking | Await approval | Every occurrence awaits approval, including the first | Every occurrence awaits approval |

Approved occurrences hold the room as confirmed. Pending occurrences hold it until decision under the existing rule. A free-looking cell never overrides the room's approval policy. Show the resulting per-occurrence states before submission.

Use the current server policy and current room-owner grants at every create, amend, approval and transfer. Capture the policy/grant revision in the audit. A policy change does not silently cancel confirmed bookings or approve existing pending holds; explicit decisions remain required. An approval-required booking enters pending state even when its requester is a room owner or admin. Proposed self-approval rule, pending user review: an authorised owner/admin may explicitly approve their own request in a separate action, with self-approval visible in the audit. A second approver is not silently required. Any one currently authorised room owner or product admin can decide a pending request; the first committed revision-checked decision wins. Policy-setting access is not permission to bypass collision checks.

The admin dashboard includes overdue pending requests, upcoming conflicts, utilisation by venue and outstanding delivery failures. Avoid implementing speculative billing, public booking or access-control hardware in the first product.

## Data and source ownership

Reuse the existing shared venue register and introduce durable cross-year venue IDs with effective aliases. Do not use mutable unit numbers or year-scoped Layout identifiers as permanent reservation identity. Ambiguous room names must be resolved before automatic booking is enabled. The supplied classroom PDF is a reference for validating the register, not a live authority.

Contacts supplies stable Staff ID, display/TTb names, active status, GSPS/CES emails and mobile. Facilities permissions live separately. Roster supplies effective baseline and confirmed suspended occupancy. Calendar supplies school-year dates, week parity and dated overrides. Teacher absence alone does not free a room: use the resulting lesson occupancy, including combines, moved classes and applicable confirmed STAPLER plans.

Confirmed-but-unpublished plans contribute an occupied venue/time projection only. They do not reveal draft teacher allocation details to ordinary staff. The occupancy package contains venue IDs, dated intervals, safe display/source labels and revisions, not raw teacher timetable or contact dumps. Apply a strict response whitelist and fixed labels for confirmed-but-unpublished occupancy; never expose free-text plan titles, notes or tooltips that could identify personnel. Authenticate every package download. An explicitly covered empty weekend is available, while an uncovered date remains unavailable.

Store VenuePolicy, AdminGrant, RoomOwnerGrant, BookingSeries, BookingOccurrence, TransferRequest, ApprovalDecision, Closure, NotificationOutbox and AuditEvent separately. Booking series/occurrences retain the optional requester note and its amendment history; separately attributed owner responses never replace that source text. Record stable identities and historical display labels, not secrets. New durable queues and idempotency receipts belong in dedicated transaction tables rather than accumulating Script Properties.

## Cache and compressed timetable contract

First load downloads a compressed, complete baseline/confirmed-suspension occupancy package and the minimal venue catalogue. Use compact week patterns plus dated exceptions to cover the school year. Each immutable piece is keyed by content hash. The manifest records schema, bounds, source generation/version, trusted update time, Calendar revision, venue mapping revision, expected pieces and checksums.

Read a small manifest on opening/revisiting the screen and at a modest visible-tab freshness interval. Matching generation and timestamps mean no timetable payload download. Fetch only changed pieces when the generation changes. Validate completeness/checksums before atomically switching the IndexedDB active generation. Retain the last verified cache after a failed refresh and label its age. A client clock never establishes freshness.

Ad hoc reservations have an independent revision and date/venue deltas. Saving or cancelling patches the affected local rows from the server response without reloading baseline. Filters, date changes within cached coverage and Now-line updates require no source reload. A stale display can be read, but a server-authoritative availability check is mandatory at every write.

## Transaction and publication design proposed for implementation

Prefer a Venues module in the existing Roster Apps Script project, using its writer lock while keeping Venues tables, access rules and settings separate. This places Roster publication and venue reservation admission in the same lock domain. Merely putting a new standalone Apps Script project beside Roster would not make their independent locks atomic.

Within the short shared writer transaction: validate verified actor, current room-owner/admin grants and current venue policy; compare source/booking generations; check every half-open interval against timetable occupancy, pending holds, closures and competing reservations; apply only affected records; persist idempotent result, audit and notification intents. Keep remote reads, compression, photos and provider sends outside the lock. An ambiguous Sheets commit must fail closed until its receipt/state can be reconciled.

Every occupancy-changing writer must participate: baseline creation/metadata/activation/restoration, confirmed suspended-plan creation/confirmation/reset/move/deletion/restoration, timetable publication and effective relief overrides. Under the common lock, persist a durable pending source fence before changing the source, then promote a complete verified generation to ready. Drive source files and a separate Venues spreadsheet do not become one atomic transaction merely because they share a lock. A crash leaves the fence pending; venue admission is temporarily unavailable until recovery verifies the actual source and finishes or rolls back the intent. Do not substitute the old ready generation while a source mutation is unresolved.

Prepare compressed occupancy pieces outside the lock against a pinned source generation, then activate only if the source revision still matches. Activation makes timetable priority effective. Existing ad hoc occurrences whose source fence is old cannot be presented as confirmed availability until checked; bounded idempotent reconciliation marks clashes displaced, preserves audit and enqueues notices. Keep every existing pending/confirmed reservation as a competing hold while reconciliation is outstanding. A stale source fence does not make its interval free. For a target interval, derive effective priority against the current timetable and reconcile any affected reservation under the same lock before admitting a new one. Apply occurrence state, audit, outbox event and reconciliation cursor in one revision-checked Sheets batch; recheck receipt/state after ambiguous acknowledgement. Batches must be bounded, restartable and unable to demote a newer-generation result.

Calendar and venue-registry publishers remain separate projects. Their changes become effective for this product only through verified local source activation in Roster, using the same pending/ready fence and displacement rules. Check their authoritative manifests at most 60 seconds before reservation admission; if the last successful check is older or a known source change is not yet activated, reject new reservations with a refresh message. The 60-second observation bound is a proposed product freshness policy, not global cross-project atomicity. Display last checked/activated versions. A source change discovered after the last observation can subsequently displace an ad hoc booking under the user-approved timetable priority rule. No design claim assumes that a local ScriptLock controls another project.

A transfer of a timetable slot is a venue-only exception approved by a currently assigned room owner or whole-product Venues admin, scoped to the exact venue/date/interval and timetable generation. It does not edit teacher/class timetables. A later confirmed/published timetable generation re-evaluates that exception. An ad hoc transfer preserves the original booking history and changes ownership only after an accepted revision-checked request. A transfer request itself never releases the existing reservation. Accepting a timetable transfer creates its scoped waiver and beneficiary reservation together; the waiver cannot become a generally free slot that another requester takes. A single-occurrence transfer changes that occurrence owner without rewriting other occurrences; series-owner cancellation cannot cancel an occurrence already transferred to another person.

Alternative considered: a separate Apps Script backend with a shared external publication fence. It provides stronger service isolation but adds deployment and failure modes. Use it only if the shared Roster project cannot maintain short lock times after measurement. Two uncoordinated locks or optimistic client checks are not acceptable alternatives.

## Notifications and short management links

Use own-domain short routes such as https://venues.gsps.edu.sg/b/<opaque-id> and /r/<opaque-id>. Opening a booking-management link requires GSPS sign-in and a live requester/recipient/room-owner/admin check appropriate to that booking. Room-dashboard links use the staff view permissions above; the selected rooms do not grant management access. The opaque ID selects a record and grants no authority by itself. Never approve, transfer, cancel or return anything on a GET request or link preview.

Persist notification intent with the booking or accepted transfer. Delivery runs afterward and cannot undo a successful booking. Email resolves both current recipient addresses server-side. WhatsApp uses current consent and approved venue-compatible templates; existing LORD equipment wording and URL approvals cannot be assumed reusable. Template names, locale, URL components and recipient rules belong in the setup ledger, with secrets in backend properties/Pages settings.

Show queued/sent/failed/uncertain delivery honestly. Uncertain accepted sends require reconciliation before resend. Provider failure never means a reservation is free. Admin approval requests, rejections and timetable displacement also need useful messages and management links.

## Acceptance before deployment

Test descriptor/partial-word searches, unit-only selected values, keyboard dismissal/reopen, blank and multiline notes, note preservation/retry, per-occurrence overrides, malicious markup, mixed owned/unowned dashboard rooms, grant revocation in an open tab, policy-change races, and staff-only dashboard links. Check grouping across contiguous periods, breaks, separate bookings with identical notes, separate dates, and differing status. Verify exact period timings and requester attribution remain visible. Test all six approval-matrix cells, including a room with no assigned owner.

Test two simultaneous bookings for one interval, adjacent intervals, pending holds, series partial conflict, concurrent owner transfer/cancel, admin permission removal, first-instance versus repeat approval, confirmed unpublished occupancy privacy, late timetable priority, publish during booking, source-generation failure, checksum failure, cache reuse, year rollover, renamed classrooms, browser-local timezone differences and expired management sessions.

Measure cold-open and warm-open requests/bytes, unchanged manifest navigation, booking commit reads/writes and lock duration. Verify desktop/mobile geometry and keyboard/screen-reader booking controls. Confirm template approval and setup bindings before enabling live messages. No deployment claim is made until those checks and the required setup are complete.

## Implementation choices for review

The proposed implementation uses one venue per recurring series, selected weekdays, a narrow occupancy projection, existing Roster writer coordination, independent facilities permissions, authenticated own-domain short links, and an explicit available-occurrences choice when a series contains conflicts. These are design recommendations, not additional answers attributed to the user. Room-owner management includes approving timetable-slot transfers for assigned rooms. Proposed self-approval is explicit and audited; this point remains a visible implementation assumption after the optional clarification received no answer.

The descriptor-search interaction is grounded in Deploy `public/app.js::enhanceSelects` and `data-selected-unit="true"`; vertical grouping is grounded in Roster `lessonGroups`/`drawInstructions`, with booking occurrence identity added to prevent unrelated reservations merging. Proposed defaults left to the builder include the 2,000-character optional note limit and today as the dashboard date. The approval precedence above retains previous repeat rules.

Builder review completed against the current source. The design includes its three required corrections: durable pending/ready source recovery, explicit external-source freshness/activation, and preserved holds with atomic displacement/audit/outbox reconciliation. These are implementation requirements, not completed runtime features.

Revision 2 builder review: room-owner transfer authority is consistent across the screens and transaction rules. Self-approval is stated as a proposed rule for user review. The reviewer found no other important questions blocking an implementation plan. This remains a design, not completed Venues runtime.
