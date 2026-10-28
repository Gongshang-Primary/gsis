# Venues interaction contract

Business authority: `../docs/superpowers/specs/2026-10-25-venues-design.md` and `../docs/contracts/venues-v1.md`. Domain and backend decide permissions, admission, recurrence approvals, source fences and conflict outcomes. This file specifies their visible consequences.

| Capability | Canonical owner | Source of truth | Allowed variants | Verification |
| --- | --- | --- | --- | --- |
| Select/Listbox | `app.js::makeVenuePicker` | Deploy partial-word pattern and Venues design | Descriptor-rich choices; unit-only selected value | Keyboard, open/close and browser test |
| Table Selection | Grid range and dashboard checkbox controls | Venues design | One room/range; explicit multiple dashboard rooms | Browser tests |
| Date | Native date input | Venues v1 ISO date contract | Platform popup; domain uses Singapore | Coverage and date tests |
| Form | Shared field markup and `showDialog` | Venues command contract | No native validation bubbles; values kept on error | Browser failure/retry tests |
| Scrollbar | `styles.css` root baseline | DESIGN.md | Bounded grid/dialog; natural document forms | Narrow browser geometry |
| Toast | `setStatus` | Server-confirmed response | Persistent success, warning and error | Browser tests |
| Dialog | `showDialog` native dialog | Shared LORD interaction language | Safe initial focus, Escape when idle, retain on failure | Browser tests |
| CRUD | `runCommand` and `applyResult` | Venues backend | Same request ID for same uncertain action; server result patches rows | Retry and backend tests |
| Timetable cache | `cache.js::VenuesCache` | Authenticated server manifest and compressed bytes | IndexedDB when available; memory fallback | Integrity/reuse/account tests |

## Navigation and data

Book a venue, My bookings and Room dashboard are available to signed-in staff. Room management is shown only to scoped owners/admins. Room-owner decisions are restricted to their rooms, including mixed dashboard selections. Backend permissions are authoritative; hiding controls grants no security. Booking and transfer short links perform a scoped direct record read independently of list dates or My bookings filters. Managers can review a timetable transfer directly; the requester receives a read-only view when they cannot decide.

Only public room IDs/date filters/view state appear in bookmark URLs. Preparation requests remain in current-page memory. Private identity/contact data is not part of the timetable cache. Changing account or signing out clears that cache and in-memory booking content. Session expiry shows sign-in and does not expose the prior account's data.

Date changes and room filtering use cached immutable timetable data. Reservation reads are independent and do not invalidate timetable pieces. The Now line is local. A checksum/size/schema failure leaves the last verified source active and marks refresh as unavailable. Unknown date coverage is never free space.

## Booking and recovery

The first and last selected periods define one room range. Review first loads current reservations for the full requested date range, then shows every dated occurrence and expected approval status. A read failure blocks preview; changing selected dates recalculates which occurrence may be immediately confirmed. Conflicts stay visible; choosing only available dates is explicit. Submission never silently discards a date.

A pending network operation is not a booking success. An uncertain write keeps the command and request ID for a safe retry. The dialog remains open on failure. Input and date/period choices stay in memory during background refresh. Conflicts require a fresh revision; old content is never force-overwritten silently.

Requesters can amend/cancel an occurrence or an explicitly listed set of loaded future occurrences they still own. Bulk note changes do not change times. Transferred occurrences are excluded from the previous owner's batch. Cancellation keeps history. Room-owner responses are separate attributed text; they do not overwrite the original preparation request or approve a pending booking.

The dashboard is read-only for general staff, even for their own bookings. Their edit path is My bookings. Agenda grouping requires identical occurrence, venue, date, status and note and touching real period times. Gaps split a row; separate bookings never merge by matching name or note.

## Administration

Admin-only grant changes identify staff and effective dates. Room owners cannot grant access or change timetable aliases. Pending source setup does not block policy/alias/grant management. Aliases are one per line and do not change permanent venue identity.

Approval, rejection, transfer and cancellation use explicit actions and current revisions. Self-approval is a separate visibly attributed decision. Closure effects and uncertain-notification retry consequences are explained before commit. Future and inactive closures load with room management rather than depending on the current booking date. Historical audit entries remain read-only.

## Locale and accessibility

English Singapore copy; ISO date-only storage; visible times use Asia/Singapore. Use real buttons/labels, visible focus, native modal focus containment and a polite persistent status region. Search clears immediately and supports Escape/arrow/Enter without committing during IME composition. Critical feedback is not colour-only. Reduced-motion and forced-colour modes remain usable.
