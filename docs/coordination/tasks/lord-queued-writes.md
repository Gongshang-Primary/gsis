# lord-queued-writes: LORD suite actions feel instant via a Worker queue; Google stays the record

- Status: proposed (changelog entry; design to confirm, not Friday)
- Owner/model: Codex (builder), Claude (architect and reviewer)
- Reviewer/model: Claude
- Last updated (Asia/Singapore): 29 Oct 2026 19:30
- Branch: codex/lord-queued-writes
- Base SHA: 699749f
- PR: none
- User-authorised scope: Song Wee, 29 Oct 2026: "LORD suite's user interaction to be queued via workers first with time stamp indicator, so that it seems fast on UIUX, then let read/write to Google happen on backend, will fallback to direct Google read/write i.e. not full D1 authoritative."
- Files/domains owned: lord-suite/Source/{lord,overlord,starlord}/_worker.js and assets/app.js, a LORD job queue (new D1 tables, or reuse calendar-job-worker), lord-suite/Source/backend/Code.gs receipt/status operations, lord-suite tests.
- Out of scope: making D1 authoritative for LORD; Roster; Calendar.

## Intent
Same pattern as Calendar's job queue (calendar-job-worker): the browser gets a durable receipt from Cloudflare in under a second, the screen updates at once with a "Saved at 10:42, syncing" indicator, and Apps Script applies the change to Google in the background. If the queue or D1 is unavailable, the page falls back to today's direct Google call. Google remains authoritative.

## Actions in scope (from lord/assets/app.js)
bookingCreateBatch, bookingUpdate, bookingCancel, bookingRespond, notificationPreferences; OVERLORD and STARLORD write actions to be listed during design.

## Design points to settle
1. Conflicts are the main risk. A queued booking is not a confirmed booking: two teachers can queue the same cart or slot. The UI must show "Requested 10:42, confirming" until Google accepts, then "Confirmed" or "Not available: <reason>". Never show a queued booking as confirmed.
2. Low-risk actions (preferences, cancel own booking) can show final state optimistically; contended actions (create, update, respond) show pending until accepted.
3. Receipt first, idempotent: one operation id per click, retries reuse it, the backend dedupes (the Calendar receipt model).
4. Reads: serve the last known list from the Worker cache with an "as of <time>" stamp, then refresh from Google in the background.
5. Fallback: if enqueue fails before a receipt, call Google directly (today's path) and say so; if a receipt exists, never also call Google directly (avoids double booking).
6. Notifications (WhatsApp/email) are sent only after Google accepts, not at queue time.
7. Jobs panel: each user can see queued, saved, rejected items with timestamps.

## Acceptance (draft)
- Booking action shows a receipt and pending state within 1 s on a normal connection.
- Two concurrent requests for one cart: one confirmed, one shown "Not available" with no double booking.
- Queue down: direct Google path still works, with a visible note.
- A retried click never creates two bookings.
