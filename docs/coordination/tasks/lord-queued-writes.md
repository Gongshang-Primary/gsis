# LORD queued writes — phase 1, D1-first

- Status: implemented locally; exact-tree remote full CI, Claude exact-head review and owner merge required; no deployment
- Owner/model: Codex; reviewer Claude at exact head; owner merges
- Last updated (Asia/Singapore): 1 November 2026
- Branch: codex/lord-queued-writes-phase1
- Base: bb8d72d5c08925fe56b0131eee674a66a630a2d5; tree a58e4e3210bcf52bb846abc1ec5249f1b00b28fd (exact remote main 4a93be7 tree)
- Scope: dedicated LORD job Worker/schema, LORD authenticated gateway, backend queue command and private Google backup, behavioural tests and this task's documentation.
- Authority: D1 is authoritative for NEW jobs, receipts, status and bounded audit history. Existing Google booking/resource/preference decisions remain Google. Copy direction is D1 → private Google backup, never blank replacement or Google → D1 authority inference.
- Phase 1: queue plus actor-private status API, no user UI changes. Phase 2 booking/collect/return/photo wiring is excluded. No Calendar/Roster/release assembly edits, deployment, live schema/settings changes, provider sends or live records.
- Current session authorisation supersedes the older Google-first queue wording retained below as history. Implementation/isolation and routine design choices are authorised; no additional design approval is required.

## Phase 1 decisions

Use a dedicated default-off service and D1 binding, reusing Calendar's signed short-lived gateway and SQL conditional admission patterns without importing its Google-first queue authority. Only the existing notificationPreferences operation executes in phase 1; unsupported operations are rejected before admission. No production diagnostic action and no permanently queued placeholders. This ruling follows the current implementation scope clarification. Existing browser write paths remain unchanged.

The gateway derives the actor from its signed school session, rejects relief identities and cross-origin writes, and replaces user-supplied identity. The service verifies a purpose-bound HMAC envelope and unique nonce. Operation identity includes its issuance timestamp plus UUID; canonical JSON binds actor, action and payload. Exact retry returns the same durable receipt. Changed identity/payload receives a conflict. Old, missing or uncertain enqueue responses never authorise direct resubmission: query/retry the SAME identity.

Admission is one SQL statement with bounded pending, actor-pending, overall row and payload limits. One unresolved preference command per actor serialises that actor's commands. Receipt acceptance means submitted, not a confirmed booking or delivery. A single dispatch claim precedes Google execution; expired claims and lost responses use read-only receipt checks only, never blind execute retries. Bounded unsuccessful checks retain an UNCERTAIN blocking job. Google acceptance is established by the existing preference decision event under the Google ScriptLock, with exact queue identity/payload/actor binding; this event is decision evidence, not a second authoritative queue. The existing preference GET returns its exact Google decisionRevision; queued payloads must bind that observed expectedRevision. Admission makes no Google call. Execution checks current Contacts and that exact revision under the writer lock; a successful direct save records a decision even when its value repeats, fencing older opposite queued choices. Client clock skew never determines preference ordering. No notification is sent at enqueue or by this preference executor.

Google backup consists of pretty-printed immutable per-job/version JSON files in an operator-selected private Drive folder. A version is checkpointed only after exact ID/version/content digest acknowledgement; lost backup responses retry the same filename and content. Backup failure cannot turn acceptance into application or erase a job. No Google backup input updates D1 automatically.

Retention: nonce history 3 minutes; only terminal APPLIED/REJECTED jobs older than 30 days whose current version has a verified Google copy may expire from D1. Pending, running, checking and uncertain jobs never expire. Bounded audit history is retained with each job. Google copies have a 365-day minimum retention; an operator archives/deletes completed old generations only after verifying the current D1 record or a reconciled restore export. Unresolved evidence is never age-deleted. Admission refuses at capacity instead of evicting unresolved work.

Switch-back: pause admission and dispatch, wait for active Google calls to settle, export D1 jobs including audit/hash/version and verify all current versions against Google copies. Reconcile RUNNING/CHECKING/UNCERTAIN against exact Google decision events under the writer lock; never assume absence proves failure while an earlier request could still arrive. Carry unresolved jobs and original IDs forward and block affected actor/action. Only after an owner-approved reconciliation manifest may a Google-hosted queue replace D1; import the complete verified records, never start blank, compare row counts/digests/outcomes, then change the route once. Retain paused D1 and restore routing to D1 if reconciliation or import fails. Disabling the optional service leaves existing direct UI paths intact; it never permits direct replay of a previously queued command.

## Checks and handoff

Build before tests after branch switch. Meaningful RED→GREEN SQLite service, real backend handler and signed gateway tests; full Node/LORD results and omitted browser/history checks will be recorded below. Local browser and historical comparison inputs are unavailable and are not passes. Root handles exact-tree remote full CI and release integration. Claude exact-head review and owner merge remain required.

## Local verification and handoff — 1 November 2026 (SGT)

- Initial implementation commit: 54f0cad11987606d64c2a0d18e8ed3d780f20a99. A follow-up commit records review fixes and final evidence; root receives its exact head/tree separately (the commit cannot embed its own SHA).
- Build passes with Asia/Singapore timezone, including Apps Script syntax gate and generated LORD backend. LORD setup templates match canonical source. No global package/version/build scripts were edited.
- Four focused queue/gateway/end-to-end/backend programs pass. Real SQLite tests include atomic admission/concurrent replay, total/pending/nonce capacity, actor/payload binding, single dispatch, read-only uncertainty recovery, exact receipt/backup checkpoints and retention. Integration loses both an accepted D1 enqueue response and a committed Google response, then reuses the same identity without duplicate decisions.
- Full current LORD program inventory independently executed: **36/39 pass**. Failures are exactly `gsis098h-background-ui.cjs`, `gsis-reference-ui-browser.cjs`, `booking-remarks-return-browser.cjs`, each because Chromium is unavailable. None is counted passed. The normal LORD runner stops on the first unavailable browser. Legacy exact-helper inventory was explicitly extended for the six new helpers; every historical behavior assertion remains, and `run_frontend_141_checks.cjs` passes 20/20.
- Existing signed LORD source bridges, component packaging/parity and shared-secret boundary programs pass. The initial broad `npm test` attempt is retained; it has unavailable Chromium/history/ancestry failures and was started at the base while implementation proceeded. It is **not** exact-final-tree verification. Root must run full Node/LORD remote CI; no green broad-suite claim is made.
- Fresh read-only internal review of 54f0cad found three preference safety issues. Each was reproduced RED and fixed GREEN: refresh Contacts inside the writer lock; use an exact observed Google decision revision rather than client clock ordering; record successful repeated direct decisions so an older opposite queue choice cannot overwrite them. No findings are deferred. The owner-visible rule remains Claude review of the final exact head, then owner merge.
- Coordinating clarification: remove Apps Script authorization before enqueue. Existing profile/preference GET supplies `decisionRevision`; payload `expectedRevision` binds it. Admission is signed-session → D1 only. Execute checks live contact and revision under the Google writer lock. This is the chosen latency/authorization split; durable acceptance never means application.
- Evidence: `docs/coordination/review/lord-queued-writes-phase1-tests.json` includes exact source hashes, command outcomes, full LORD program results and limitations. New optional service deployment/configuration/schema application and live verification remain separate owner actions. Nothing deployed, no authority/configuration flag changed and no live records or notifications touched.

---

## Historical approved request (superseded authority wording)

# lord-queued-writes: LORD suite actions feel instant via a Worker queue; Google stays the record

- Status: approved (owner go 30 Oct 2026: all logged items may proceed while the owner teaches); Codex builds phase 1 then phase 2 in the priority order below
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

## Owner priority (30 Oct 2026), slowest first
1. Book cart
2. Submit open / collect
3. Submit photos for collect
4. Return
5. Submit photos for return

Photos: upload to a private R2 object first (receipt in under a second, thumbnail shown with "Submitted, please wait for confirmation"), then Apps Script copies to Drive in the background. Never send photo bytes through the Apps Script call on the user's click.

## Actions in scope (from lord/assets/app.js)
bookingCreateBatch, bookingUpdate, bookingCancel, bookingRespond, notificationPreferences; OVERLORD and STARLORD write actions to be listed during design.

## Design points to settle
1. Conflicts are the main risk. A queued booking is not a confirmed booking: two teachers can queue the same cart or slot. **Owner wording (29 Oct 2026): "Submitted, please wait for confirmation"**, with the submit time, until Google accepts; then "Confirmed" or "Not available: <reason>". Teachers may leave the page while it waits; the outcome appears on their bookings list and in the existing notification. Never show a queued booking as confirmed.
2. Low-risk actions (preferences, cancel own booking) can show final state optimistically; contended actions (create, update, respond) show pending until accepted.
3. Receipt first, idempotent: one operation id per click, retries reuse it, the backend dedupes (the Calendar receipt model).
4. Reads: serve the last known list from the Worker cache with an "as of <time>" stamp, then refresh from Google in the background.
5. Fallback: if enqueue fails before a receipt, call Google directly (today's path) and say so; if a receipt exists, never also call Google directly (avoids double booking).
6. Notifications (WhatsApp/email) are sent only after Google accepts, not at queue time.
7. Jobs panel: each user can see queued, saved, rejected items with timestamps.

## Acceptance (draft)
- Booking action shows "Submitted, please wait for confirmation" with its time within 1 s on a normal connection.
- Two concurrent requests for one cart: one confirmed, one shown "Not available" with no double booking.
- Queue down: direct Google path still works, with a visible note.
- A retried click never creates two bookings.

---

## Status check, 3 Nov 2026 (Claude)
Owner: "LORD users have been reporting slow uploads/downloads too … is the temporary worker queue in place?"
Answer: **no, not for any slow action.**
- Phase 1 (#44, in v0.9.9g) carries only `notificationPreferences`, default off, no UI wiring. The `lord-job-worker` is not deployed (Cloudflare Workers list, 3 Nov: no LORD worker) and no D1 binding exists.
- Phase 2 (book, collect, collect photos, return, return photos) was never built. Those are the slow paths.
- Photos: `lord/assets/app.js` holds photos as data URLs (`photoData`, `stylusPhotoData`, `headphonePhotoData`) and sends them inside the Apps Script call on the user's click, then Drive writes them. That is the upload delay. Downloads/views read back through Apps Script/Drive.

## Phase 2 brief (owner priority 30 Oct, unchanged)
1. **Photos first (biggest win, lowest conflict risk):** browser compression already exists (`compressImage`: 1280 px, JPEG 0.72), so size is not the main cause; the cost is base64 inside a synchronous Apps Script call plus Drive writes, several photos per submit. Keep compression; upload to private R2 via the LORD gateway (signed, actor-bound, size cap); receipt under 1 s with thumbnail and "Submitted, please wait for confirmation"; Worker job copies R2 → Drive in the background and records the Drive file ID on the booking. Serve thumbnails/views from R2 via the gateway while the Drive copy is pending or as a cache.
2. Book cart, collect, return through the queue, as designed above: pending until Google accepts; never show queued as confirmed; no direct replay after a receipt.
3. Deploy plan for the owner: create D1 binding and R2 bucket, deploy `lord-job-worker`, set secrets, flip the gateway flag. Default off; fallback = today's direct path.
