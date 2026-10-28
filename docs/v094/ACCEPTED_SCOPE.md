# Accepted v0.9.4 scope and original evidence

This is the historical request and investigation record retained for release traceability. Current behavior and validation are described in the release notes and validation record. Status text below records the state before implementation, not the current release status.

# Changes queued after v0.9.3b

## v0.9.4: changing an existing absence to require relief

Reported 25 October 2026: Edit absence → select **Relief required** → Save changes fails when changing an existing no-relief record to relief required. Preserve the original absence and selected periods; update the same record, without requiring a fresh absence submission.

Evidence: deployed backend `0.9.3a`, diagnostic build `0.9.3a-roster-diag4`, reference `894a6f5f-1379-493c-b8d2-68d6a7dcaf6e`, request failure at `2026-10-25T12:10:05.609Z`. The response was 503 after 33,226 ms. Canonical `Roster_Backend_v0.9.3a.gs` line 4411 is the second exhausted `PREPARED_RETRY`, before the edit is applied. The log does not identify which prepared input changed; successful Contacts and Drive reads do not prove the whole operation succeeded.

The deterministic source-proof correction in v0.9.3b addresses the known false retry caused by generated timetable-package timestamps. Do not mark this specific live report resolved from source inspection alone. In v0.9.3b the edit also enters durable intake, so validate the complete capture, processing and refresh path.

Acceptance checks for v0.9.4:

1. Change no relief required to relief required, and back, on the same absence ID; verify the saved value after reload.
2. Preserve periods, reason and existing instructions. Create or reconcile only the affected relief demands, with appropriate human-choice and peer-request audit.
3. Exercise durable capture and application while the allocator runs; distinguish received from applied, recover the same request after a timeout and avoid duplicate absences. Cover the legacy Apps Script route during migration testing, then prevent fallback to a second writable authority after cutover.
4. Preserve stale-edit protection through transport and reject an edit based on an older record. Review found that v0.9.3b `normalizeAbsenceTransportCommand` retains `id` and `reliefRequired` but drops `expectedAbsenceToken`; the backend guard is conditional on that token being present. A read-only fixture reproduced this omission. Include token preservation and a two-editor conflict regression in v0.9.4.
5. Confirm unchanged source inputs do not manufacture retries, while real source changes remain detected and reported with the operation, command ID and fixed reason code.

Status: queued for v0.9.4 implementation and exact-flow regression coverage. This changelog update does not change runtime code, create a v0.9.4 release or deploy to production. v0.9.3b remains the latest released patch.

## v0.9.4 accepted scope: Roster and Deploy operational authority in Workers and D1

Updated 25 October 2026: the user requests Roster and Deploy operational reads and writes to move to Workers and D1 together in v0.9.4, with no commit yet. This supersedes the earlier Roster-only migration scope. Prepare one coordinated release and cutover, with internal implementation and verification in bounded parts. Routing the existing Apps Script calls through a Worker does not satisfy this request.

1. Roster: cover absence capture and edits, peer proposals and approvals, manual relief assignments, baseline registration, STAPLER import/save/confirm, publication, acknowledgements, notification state, settings and audit. A record change, its revision, durable receipt, audit and notification intent must commit together. Preserve current permissions, absence edit tokens and human precedence over automatic allocation.
2. Deploy: cover version catalogues, draft allocations, classes and TGs, programme and HR settings, workload/relief rules, publication and in-force selection, imports/exports and audit. Preserve the distinction between unpublished future versions and the in-force deployment. Roster, LORD and Venues must receive compatible versioned reference contracts.
3. Serve timetable and reference data from IndexedDB, Worker/D1 and private R2 with trusted versions and targeted invalidation. Move operational validation and writes into Workers so normal Roster and Deploy operations do not require a synchronous Apps Script transaction. Contacts and Calendar retain their own data authority; maintain versioned reference copies and explicit permission freshness rules.
4. Include scheduled allocation, notification workers, public peer approval/acknowledgement routes, service bridges and Apps Script triggers in the writer inventory. Compute allocations outside the final transaction; recheck attendance, source revisions and human choices at commit. Save confirmation must distinguish received from applied or published.
5. Each migrated record has one authoritative store. Route or retire legacy writers at cutover; Google copies become projections or exports. Keep Google-specific integration adapters where needed. Verify imported counts, identities and audit continuity. A rollback must reconcile writes accepted after cutover, not simply reactivate a stale Google copy.
6. Measure account-wide requests, D1 rows scanned/written, Worker CPU and queue operations under morning contention. Use indexes, partial updates, shared version checks, pagination, bounded jobs and backoff for idle/hidden pages. Do not substitute one giant D1 JSON row for record-level storage. Keep the existing v0.9.4 relief-required edit repair and conflict regression in this release.

Source review requirements: include baseline activation/prune/restore and receipts (`backend/Roster.gs`), STAPLER leases (`backend/StaplerLeases.gs`), all notification claim/result/retry and webhook paths, public link creation and decisions, audit exports and Roster-to-Venues invalidation. An operation labelled as a read can still write link state; a delivery change may not increment the broad operations revision. Preserve pending absence intake as a fence on allocator/publication commits.

Deploy publication spans services: Contacts teacher approval is a prerequisite; catalogue synchronization and Layout handoff are separate effects (`backend/Code.gs`, `backend/Planning.gs`, `backend/LayoutRepository.gs`). Model this as a durable publication workflow with explicit state and idempotent retries. One D1 transaction cannot atomically update Contacts or Layout. Migrate LORD/Venues/Roster reference callers or retain authenticated read-only compatibility bridges that read the same Worker-owned publication, never a second editable deployment copy.

Deploy acceptance checks: unpublished Term 1 2027 changes leave the in-force catalogue intact; repeated publication requests do not repeat Contacts changes; a Layout outage leaves a confirmed publication with visible handoff pending; two editors retain conflict authorship; every downstream reader observes the same publication identity. Preserve version notes, editing leases, conflict acknowledgements, recovery records and stable export identities. Keep aSc XML generation local. Publish live invalidations after durable writes; a failed broadcast must not turn a completed save into a reported save failure.

Capacity assessment on 25 October 2026: Workers Free allows 100,000 dynamic requests/day and 10 ms CPU/invocation; D1 Free allows 5 million rows read/day, 100,000 rows written/day and 5 GB total storage, with 500 MB per database. Queues Free allows 10,000 operations/day; a typical small message consumes three operations before retries. These are published limits, not measurements of this account. D1 rejects queries after daily allowance exhaustion and resets at 00:00 UTC (08:00 Singapore), after the morning reporting window. Profile heavy allocation before selecting its execution plan. Workers Paid starts at USD 5/month with additional usage charges; no subscription change has been made or authorized here.

Contacts and Calendar write-authority migrations are outside this accepted scope. Deploy is now included explicitly. No paid subscription has been authorized.

Official references checked: https://developers.cloudflare.com/workers/platform/pricing/ ; https://developers.cloudflare.com/d1/platform/pricing/ ; https://developers.cloudflare.com/d1/platform/limits/ ; https://developers.cloudflare.com/queues/platform/pricing/ .

Status: queued v0.9.4 scope only. This update is intentionally uncommitted at the user's request. Runtime and deployed services remain unchanged; v0.9.3b is still the released package.

## v0.9.4: compressed timetable packages on Cloudflare, refreshed after saves

The user asks whether compressed baseline and suspended timetables can stay on Cloudflare and update when a user updates a timetable. Include this in the combined migration.

Current source evidence: `roster-update/public/_worker.js:timetableSnapshot` already supports optional `ROSTER_TIMETABLE_SNAPSHOTS` R2 storage when `ROSTER_SNAPSHOT_CACHE` is `true`. It obtains an authorised manifest from Apps Script on every request and builds missing packages on demand through Apps Script. `backend/RosterTimetableBatch.gs` supports compressed parts and unchanged model/plan keys. Source inspection does not establish whether the production R2 binding or flag is enabled.

Target behavior:

1. Private R2 stores durable compressed immutable packages. D1 holds committed source revisions, package status and the current eligible package references. The Worker authorises every request before serving cached data; edge cache is optional acceleration, never the only durable copy.
2. Keep baseline models separately addressable by content identity and suspended plans separately addressable by date, revision and access scope. A compact manifest covers today and the next 30 days. A changed suspended day must not force downloading unchanged baseline models or all other suspended days.
3. A successful baseline upload/edit or STAPLER save/confirm/publication records the affected revisions and durable package work. No-op saves and changes outside a package's dependencies do not rebuild it. Draft, confirmed and published views retain distinct visibility. A draft save never silently publishes to teachers.
4. Generate the changed compressed parts once per revision outside mission-critical absence capture. Write and verify complete R2 objects before promoting their D1 package references with an expected-revision guard. D1 and R2 are not a shared transaction: use durable job state, retries and revision checks. A slow older build must never replace the current reference.
5. The authoritative data save can succeed while its derived package is preparing. Expose source revision versus ready package revision. Never report stale content as current; serve a correct current projection or show a clear updating state if the requested package is not ready. Publication must not advertise a missing package.
6. Return the committed revision and affected package keys to the saving client. Other active clients use lightweight version checks or existing live update signals, with bounded backoff. The browser reuses IndexedDB when revisions match and fetches only missing/changed parts. Versions/content hashes decide identity; server timestamps provide update information, not the sole freshness test.
7. Normal warm reads must not call Apps Script merely to verify timetable freshness. Check D1 version/permission state using an appropriate consistent read. Keep live absences, relief changes, peer status and personal messages separate from reusable baseline data, and merge only authorised current data in the viewport.
8. Avoid overwriting one cached URL for every revision. Use immutable object keys and an authoritative current-version record. Purge or retain old objects according to access and retention rules; do not rely on CDN expiry to reveal a new timetable. Private bucket access and permission-scoped cache keys must prevent drafts or staff data leaking across roles.

Verification before release: unchanged warm load; one changed suspended day; concurrent saves and reordered builds; save succeeds while package storage fails; interrupted build/retry; date rollover; baseline replacement; draft versus confirmed access; permission revocation; publication consistency; no duplicate job side effects; no Apps Script call on a normal warm timetable read.

Cloudflare references checked: https://developers.cloudflare.com/r2/reference/consistency/ ; https://developers.cloudflare.com/r2/examples/cache-api/ . R2 durability and optional edge caching are different layers; overwriting a cached object URL can continue to return old bytes.

Status: queued with the uncommitted v0.9.4 scope. No cache behavior, binding, subscription or production deployment changed in this update.

## v0.9.4: click the GSiS Roster title to return to the main page

Make the top-left **GSiS Roster** title and its surrounding rectangular hit area a home navigation control. Mouse click, touch and keyboard activation return to the Roster main page. Use in-app navigation so loaded timetables and IndexedDB data remain reusable. Provide a visible keyboard focus state and an accessible home label; the target must include comfortable padding around the title without overlapping adjacent controls. Honor the existing unsaved-change protection, and do not cancel an accepted save or running server operation merely because the user navigates home.

Status: changelog only, queued for v0.9.4 and intentionally uncommitted. No runtime navigation change yet.

## v0.9.4: peer relief request WhatsApp v2 with a URL button

Requested 25 October 2026: replace the long private approval URL in the Peer Relief Arrangement message with a button. The screenshot matches the approved `gsis_relief_request_v1` template; this request applies to peer relief requests, not every WhatsApp template.

Submitted through WhatsApp Business MCP to Gongshang Primary: `gsis_relief_request_v2`, template ID `1860613241950793`, language `en_GB`, category `UTILITY`. Submission and subsequent component readback both report `PENDING`. The existing v1 remains unchanged. This external submission is explicitly authorised; it does not commit or deploy application code and does not send a staff message.

Exact submitted body:

```text
*Peer Relief Arrangement*

Hi {{1}}, {{2}} has requested on https://roster.gsps.edu.sg that you cover his/her lesson(s) on {{3}}: {{4}}.

Please use the button below to review and accept or reject this request.

Thank you.
```

Button: **Review request**. Dynamic URL: `https://roster.gsps.edu.sg/external.html#{{1}}`. The example submitted for review is deliberately invalid and contains no real staff token.

Activation requirements for v0.9.4:

1. After live approval and component verification, select v2 for `mutual_request`; keep four body parameters in the existing order: recipient, requester, duty date, lessons. Move the signed private token to URL button index `0`, with only the fragment suffix supplied as the parameter.
2. Update `notification-worker/template-contracts.json`, its body hash, the generated Worker contract and the activation configuration together. Keep `privateLinkPurpose: "mutual"`. The current generic sender supports URL buttons, but current automatic template migration is limited to the timetable update template and will not activate this peer template by itself.
3. The button opens the existing review page. Opening a URL must not accept or reject the arrangement. Preserve recipient/request scope, expiry, withdrawal checks, explicit decisions, audit and idempotency. Avoid duplicate sends during activation.
4. Test the rendered four-field body and button, valid/expired/withdrawn requests, mobile opening and decision recording. Keep the currently approved v1 available while v2 is pending or if review fails.

Review link: https://business.facebook.com/wa/manage/message-templates/?waba_id=971916692625997&business_id=1367896852088548

Status: v2 submitted, pending Meta review at verification. Sender activation and application changes are queued for v0.9.4 and remain uncommitted.

## v0.9.4: fast peer arrangement reads, writes and indicators through Workers and D1

User correction on 25 October 2026: the indicators already appear in **Assign Relief**, but arrive too slowly. The supplied screenshot shows **Peer arranged · awaiting reply** with the proposed colleague under the affected periods. Treat this as a state delivery/latency defect, not a missing-indicator feature. Preserve the existing indicators and their period-level precision; do not introduce a duplicate UI.

Explicitly include all peer relief arrangement read/write operations in the Worker/D1 migration: request creation and status reads, approval/rejection through the private link, withdrawal, expiry, manual override, resulting assignments, audit and notification intent. Moving only the browser proxy is insufficient; normal peer reads and writes must not wait for an Apps Script operation. Public/private-link routes and background workers must use the same authoritative records.

1. Capture the absence independently so a failed or slow peer follow-up does not lose the illness report. Use durable request identities and idempotent retries to recover any pending peer proposals without asking the teacher to submit another absence.
2. Commit each peer transition with its authoritative request revision, affected assignment changes, receipt, audit and notification intent in D1. Validate current recipient, request expiry, lesson identity, colleague availability and current human assignments at commit. Late approval after withdrawal or SMC replacement must not overwrite a newer human decision.
3. Return the changed request/assignment rows and affected periods in the successful write response. Update the saving browser directly. Other active Assign Relief windows receive targeted invalidation through the existing live mechanism or a small version check, then fetch only changed state. Keep unrelated grid cells and cached timetables usable; do not reload the full timetable or wait for package compression.
4. Show a saving/received state honestly until the request is durably applied. Then show the existing pending or approved state immediately from the confirmed response. A request awaiting a colleague's reply is not confirmed cover. Display declined, expired, withdrawn or manually replaced arrangements accurately; preserve colleague identity and relief versus class-combination details.
5. Approved peer arrangements retain human-allocation protection. SMC may replace them manually with an audit identifying whose choice was replaced. Preserve the accepted allocator policy and reconcile only the affected lessons.
6. Send WhatsApp and email from durable background jobs. Notification delivery must not hold the absence or peer decision transaction open. Retain delivery status, retry controls and duplicate/uncertain-send handling.

Acceptance checks: indicators appear from a confirmed save without a full refresh; peer approval updates an already-open Assign Relief view; withdrawal/expiry and SMC override clear obsolete state; an old response cannot replace a newer revision; duplicate requests are safe; simultaneous allocator and human edits retain human precedence; slow notification providers do not delay capture. Measure save-to-indicator latency and active-view propagation under representative morning concurrency. No claim of a specific production latency until measured.

Status: scope corrected and expanded, queued for v0.9.4, intentionally uncommitted. No runtime migration or latency fix yet.

## v0.9.4: Venues timetable fails to load for the selected booking date

User report and screenshot dated 25 October 2026: `venues.gsps.edu.sg/?view=book&date=2026-10-26` displays room rows and period headers but no verified timetable occupancy. The page shows **Loading your venues and timetable.**, **Timetable stale. Booking requires a verified refresh. · Saved on this device**, grey **Not checked** cells, and **Timetable coverage is not available for this date. Booking is disabled.**

Record this as a timetable source/refresh defect to investigate. The screenshot does not establish the underlying cause and does not show a school sign-in/configuration error. Do not mark it fixed from the screenshot or assume that the visible room list proves timetable synchronization succeeded.

Investigation and acceptance requirements:

1. Trace the selected date from the viewport through the Worker and Venues source assembly to in-force Deploy, baseline/suspended Roster and Calendar data. Distinguish missing date coverage, failed authorization, stale manifests, mapping failures and upstream timeouts with specific diagnostic codes.
2. Check Singapore date/parity selection, effective baseline/deployment dates, confirmed suspended-plan overrides and room/unit mapping. Preserve coverage for tomorrow and the preload window.
3. Show cached content promptly with its freshness state; complete a bounded verified refresh. End the loading banner on success or failure and provide a clear retry and useful error/reference instead of leaving every cell permanently Not checked.
4. Keep booking writes blocked until the relevant occupancy is verified, and recheck conflicts at the authoritative booking commit. Never convert unknown occupancy into free availability merely to enable booking.
5. Integrate the v0.9.4 Worker/D1/R2 source contracts so Venues consumes the same published timetable identities. Verify empty verified days versus missing coverage, unchanged warm loads, one updated suspended day, failed refresh/retry and concurrent booking conflicts.

Status: reported and queued for v0.9.4 study and repair. No diagnosis, runtime fix, commit or live deployment claimed.


Earlier queue records remain in Git history. No separate active product backlog is carried by this patch.
