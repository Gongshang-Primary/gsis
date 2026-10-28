# GSiS v0.7.03 report disposition

Recorded: 15 October 2026, Singapore time. Baseline: final v0.7.02 deployment package.

Status: finalised for the user-authorised v0.7.03 deployment-ready ZIP. No Git commit, push, live deployment or messaging activation is included. The existing v0.7.02 Ready ZIP is retained unchanged. In this workflow, commit means finalise and issue the named deployment ZIP. See CHANGELOG_v0.7.03.md and VALIDATION.md.

## Q703-01. Arrange relief with colleagues opens and responds quickly

Reported at about 20:49 SGT: the function loads too slowly and must be nearly instant. Follow-up at 20:54 SGT shows the matrix already visible but waiting at Checking available colleagues after selecting the teacher's own period. Reference: image(20261015-125416).png.

Confirmed interaction: click the absent teacher's period, then click the target colleague's cell. Retain final Submit requests so merely viewing or selecting cells cannot send a request.

Release change:

1. Prepare all affected periods in one background candidates request after saved instructions render, rather than repeating the Calendar, Contacts, timetable, quota and operations cycle for every period click.
2. Keep this verified projection in the current browser session, keyed to absence, date, record revision and timetable. Expire after 60 seconds and clear on mutation, reload or session change. Preserve the original verification timestamp when reopening.
3. Opening the matrix paints its timetable immediately while any first check completes. Once prepared, period and target selection are local operations with no extra server request.
4. Retain activated external teachers without a baseline timetable row. Send only staff ID, name, availability, reasons and external status in the batch projection. A 150-teacher, 13-period synthetic payload fell from 559,624 to 199,342 bytes, about 64 percent smaller.
5. Failed refreshes disable stale choices. Late results cannot update another account or closed dialog. Background reads preserve unsaved instruction text.
6. Submitting and accepting a request still check current server authority, lessons, availability and quota. The server rejects stale availability without writing an invalid request. Entry display no longer fetches quota that its view does not use.

This improves the client display and repeated interactions. A first uncached authoritative check still depends on school backend response time; it is not claimed to be instantaneous.

## Q703-02. Filter existing colleague rows locally

Reported at 20:54 SGT: filtering is slow despite the required timetable data already being loaded and visible.

Release change: create the table rows once, normalize each searchable name once and hide or show those same rows as the user types. Keep the absent teacher's row visible. Preserve input focus, selection, cells and scroll position. A period click updates only the previous and current columns. A target click updates the existing selection, rather than rebuilding the matrix. No filter or warmed selection request reaches the server.

Focused Chromium proof uses 150 synthetic staff and 17 periods with the production UI and domain modules. The latest root run measured 22 ms synchronous cold opening, about 62 ms through the next frame, and 19 ms warm opening. Filtering took at most 0.2 ms in the handler; restoring all rows took about 38 ms including layout. Period and target handlers stayed below 1 ms. These are local synthetic results, not production latency claims.

Evidence: tests/roster702-mutual-candidates.cjs, tests/roster702-mutual-ui.js, verification/702-mutual-browser.json and verification/702-mutual-browser-root.log. Pstack and Ponytail review checked cache freshness, account isolation, unchanged authority and the two-click flow. Focused domain and Chromium checks pass. The final versioned regression result is recorded in VALIDATION.md.

## Q703-03. Intermittent Roster startup reliability

Status: logged and unresolved. No root cause is asserted.

Reported at about 21:01 SGT on 15 October. The user describes reliability as very intermittent. Screenshot image(20261015-130151).png shows roster.gsps.edu.sg, frontend v0.7.02, a Roster could not load card, the message Roster is temporarily unavailable. Use Retry or Refresh to try again, and a Retry button.

Diagnostic reference: 892c96ed-62c2-486d-bd8c-1f5d5989285c.

The screenshot does not establish the HTTP status, failing service or cause. Correlate this reference with gateway and Apps Script diagnostics before changing retry, authentication or backend behavior. Check the full profile request chain, including Contacts, Drive, upstream response format and request deadlines. Preserve existing data, drafts and write receipts while diagnosing. Do not assume that an older, resolved Contacts 404 incident is the cause of this failure.

The colleague matrix speed fix does not claim to resolve this startup reliability issue. Live acceptance must establish reliable repeated startup and refresh, including cold and warm requests, rather than a single successful retry.

## Q703-04. Remove Remarks

Remove Remarks from absence reporting, editing, details, tables and new save payloads. Historical remarks stay in durable records when an edit omits the field. The existing explicit backend field remains compatible with older clients. New reports honour Relief required = No and create no relief demand for those entries.

Proof: tests/roster702-absence-remarks.cjs and production UI tests cover omitted legacy remarks, saved and edit fields, and the no-relief payload.

## Q703-05. One visible progress overlay

Replace header, inline and repeated Saving messages with one centred native progress dialog, a spinner and blurred backdrop. Saving cannot be dismissed with Escape. Results and recoverable errors appear within the viewport or active editor, with diagnostic references. Cold reads use the same progress presentation. A cached read view stays interactive during background refresh.

Proof: real Chromium tests/roster702-feedback-ui.js confirms one Saving text, modal focus, centring, blur, pending confirmation, exact request replay and visible result placement.

## Q703-06. Roster recovery and controls

Pending save confirmation no longer disables all record controls. Search, sort, the three-dot menu and read-only details remain usable. Mutations are gated until confirmation, including private-link and external-contact writes.

Retry keeps the exact original request ID and payload. If a user navigates before confirming, the receipt result refreshes the current page and date instead of installing the earlier report projection. Definite conflicts reload the revision while retaining Report instructions, saved instructions and the live edit modal. Resubmission requires explicit review. A failed resync blocks subsequent writes. Rejected colleague requests automatically refresh availability without creating a new request.

An active 401 shows sign-in recovery. A response from a former session cannot clear a later session. An uncertain write survives reauthentication for the same account. Unsaved forms are cleared at authentication teardown; automatic recovery of every unsaved form across sign-in is not included.

Check Availability clears an old green result as soon as selection changes and keeps its picker usable. Read errors use load wording, including directory, accounting and export reads. Google key rotation can refresh an unknown signing key once; invalid signatures and claims still fail.

Proof: tests/roster702-recovery-ui.js, tests/roster702-shell-recovery.cjs, tests/roster702-transport-reliability.mjs and real mutual-arrangement UI tests. Injected failures include an authoritative commit followed by a lost response, 409 conflicts, stale sessions and failed resyncs.

## Q703-07. Full timetable in browser memory

Keep the complete immutable staff timetable and its shared teacher, class and teaching-group indexes in the authenticated browser session. Preload the current baseline in the background. Switching dates can retain up to eight timetable models, matching the backend known-model-ID limit. Selecting names and displaying a warm timetable use the cached model locally.

The reproduced B/A/B/A sequence previously downloaded four full models. It now downloads two, then receives metadata-only date responses. Concurrent reads for a date stay coalesced even when another timetable finishes. Date and Calendar context are rechecked after 60 seconds. The cache clears on owner change or logout, and late results from the prior account cannot restore it. Staff timetable content is not written to browser persistent storage.

Operational records, availability and writes retain server checks. An immutable cached baseline does not establish that a colleague is still free. The live active baseline file is 361,899 bytes on Drive; this is the JSON file size, not a measurement of browser heap use.

Proof: tests/suite703-roster-memory.cjs, tests/roster702-memory-ui.cjs and the existing speed and authentication recovery checks.

## Q703-08. Contacts, Deploy, Calendar and Layout

Contacts filters preserve the focused header input and column chooser. Delayed teaching data refreshes only the directory and signature preview. Unsaved Admin/DIY data and signature settings remain intact. Explicit Refresh keeps signature selections and the original expected revision; a conflict requires review before rebasing. Results from an old account/session are ignored.

Deploy assignment sorting builds one local class/group index. The 1,500-assignment fixture reduces class-list scans from 38,801 to one, with the same stable order and original objects.

Calendar shares concurrent same-year bootstrap reads and ignores focus refresh during a year switch. Missing metadata uses the existing batch reader. Cold bootstrap falls from six to three data requests and an unavailable-cache case from seven to three, with unchanged cells and zero writes. Warm reads remain three requests. Lane, schedule and audit changes now commit in one existing atomic batch. Tag and audit changes commit together. Optional sorting happens after commit and cannot falsely report a confirmed save as failed. Independent review caught metadata caches being invalidated before queued writes committed. Cache invalidation is now deferred through the existing atomic adapter until after the write attempt, including a lost commit acknowledgement. This also covers existing atomic colour, user and URL settings paths.

Layout already coalesces public reads, reuses filtered rows and uses a verified immutable publication protocol. These paths remain intact. Existing Contacts and Deploy surgical patches, journal recovery, commit markers and receipts remain intact. No speculative rewrite was applied.

Roster diagnostics now retain each phase in memory and persist final/failure metadata. Repeated phase CacheService writes and logs no longer sit on the normal read path. Failure references and the failing phase remain available.

Proof: tests/suite703-local-interactions.cjs, tests/suite703-calendar-reliability.cjs, tests/suite703-roster-diagnostics.cjs and the inherited storage, loading, gateway and publication checks. Local service counts are not production latency measurements.

## Q703-09. Batched Calendar dates

Review found that up to 62 separately fetched dates could exceed the Roster browser deadline before reaching the backend. Multiple dates now use one staff-authenticated rosterDates endpoint with a 12 second Worker deadline, followed by the existing 25 second Deploy deadline. Calendar reads its fresh release list once and each released year once. Malformed results fail closed. Unreleased years stay unavailable per date. There is no fallback to 62 separate calls and no timeout extension. The single-date and private service contracts remain compatible. Deploy the matching Calendar backend before the batched Roster Worker. Proof: tests/roster702-calendar-batch.mjs compares 62 batch results with individual date results and covers New Year, release and actor checks, signed HTTP round-trip, response validation and timeout without fallback.

## Q703-10. Authorised live absence cleanup

The user authorised clearing logged absence entries through the backend. Read-only inventory found two durable entries at revision 5, one already deleted on 14 October and one active on 15 October. There are no assignments, colleague requests, outbox jobs or publication snapshots. The timetable register and baseline must remain intact.

Live deletion has not been confirmed. The earlier browser handoff did not leave a surviving authenticated tab for verification. The connected Drive reader can inspect the record but cannot execute the application's lock, revision and receipt protocol. Do not replace the operational document directly through Drive to bypass that protocol. Complete the authorised deletion through the authenticated Roster action, then verify that no active absence remains. Preserve tombstones and audit history.

## Integrated verification

On 15 October 2026 the complete current offline Node gate passed 277 of 277 selected scripts after synchronising the combined backend and runtime modules. Seven explicitly retired historical tests remain excluded by the existing verifier. The source run excludes package comparison until the matching new release archives are built. The final v0.7.03 package gate and checksum result are recorded in RELEASE_SUMMARY.json. The earlier v0.7.02 ZIP remains preserved.

Five real Chromium checks passed: desktop/mobile navigation and name selection, operations performance and pending-save replay, one progress overlay, recovery across views/dates/conflicts, and the colleague period-then-target matrix. Their APIs and staff records are local synthetic fixtures. No live latency or production reliability result is inferred from these checks.

Independent Pstack review found and verified the Calendar cache race fix. Ponytail review found no justified additional abstractions or dependencies. There are no remaining confirmed local review findings. The intermittent production startup report remains uncorrelated with production logs.

The release uses v0.7.03 build labels. It contains no school sign-in session or live operational data export. Live absence cleanup remains unconfirmed. The final versioned source rerun passed 277 Node scripts and five Chromium checks; 114 Apps Script files parsed.

## Activation and packaging

No real message was sent, no WhatsApp reply window was requested and all messaging/automation settings remain as previously paused. The user authorised finalisation of the named v0.7.03 deployment package. Keep the preserved v0.7.02 Ready ZIP unchanged for rollback.
