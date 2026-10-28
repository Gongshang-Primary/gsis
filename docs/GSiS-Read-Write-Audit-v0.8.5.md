# GSiS v0.8.5 read/write and concurrency audit

This release repairs the reproduced teaching group draft recovery failure, prevents stale Calendar display caches from authorising writes, and removes a remote Contacts lookup from the Roster Inbox writer lock. It also includes the requested baseline-first compressed timetable preload and absence recording without an available timetable.

The audit covers Contacts, Deploy, Layout, Roster, Calendar and the notification Worker. The component reports below trace reads, writes, locks, retry receipts, cache ownership, browser work and remaining performance limits. Verification uses the actual source with local service fixtures and native Chromium. Live Deploy records were read only for the separate Sim Lan investigation. Production load and latency were not measured.

## Release decisions

| Area | v0.8.5 action | Evidence or limit |
| --- | --- | --- |
| Deploy recovery | Validate duplicate group names before queuing; name backend conflicts; immediate Review with draft repair and retained teacher links | Same-batch duplicate reproduces the failure. Original browser payload is unavailable. See GSiS-Sim-Lan-Investigation-v0.8.5.md |
| Calendar writes | Refresh metadata inside existing writer lock; keep normal display caching | Delayed cache refill previously accepted a disabled lane/tag. Regression fails on baseline, passes with fix |
| Roster Inbox | Fetch Contacts before writer lock, then read fresh duty/state and commit claims under lock | Injected 100 ms remote wait removes 100 ms of lock occupancy. This is a fixture result |
| Timetable transport | Two complete compressed stages, baseline first, for Singapore today through day +30 | Endpoint decompression, bounded RAM use, role/source fencing and per-date fallback; no write authority from cache |
| Absence workflow | Record full-day or time coverage without requiring a timetable; resolve against current applicable lessons later | Preserve record identity, relief requirement, permissions, overlaps and current timing checks |
| Contacts / Deploy / Calendar saves | Preserve existing differential writes, version checks and receipts | Freshness validation stays server-side. Local editing/filtering/exporting does not need a round trip for every interaction |
| Roster storage | Retain one atomic operations-document replacement under its owner lock | Logical changes are narrow, but the physical Drive write remains whole-document. Safe partitioning needs a separate migration design |
| Deploy publication | Retain current lock through recoverable Contacts/Layout handoffs | A local interleaving proves competing writers wait. Moving handoffs out requires a durable commit-keyed queue, not simply releasing the lock |
| Further compression | Measure cold Deploy and Layout transfers before changing their transport | Offline gzip fixture reductions are substantial; existing deployed HTTP compression and mobile memory use were not measured |

The full-suite package retains four backend owners from v0.8.4. Existing split installations keep their URLs, workbook/file identities and sole Roster owner. No production deployment, configuration change, timetable publication or staff notification was performed.

## Detailed component evidence

## v0.8.5 Deploy and Layout read/write audit

Date: 21 October 2026. Scope: source at `c98d377` plus the working v0.8.5 changes. This is a source and local-fixture audit. No live workbook, deployment, user allocation, Contacts record, or message was changed.

### Result

No additional release-blocking data-loss defect was established in Deploy/ Layout storage during this audit. Fifteen focused test scripts passed. The Sim Lan teaching-group recovery fix is owned by the separate Deploy investigation; this report does not substitute for that regression test.

Deploy already performs local draft manipulation, differential saves, indexed dependency reads, journaled recovery, and actor-bound save confirmation. Layout already uses an independent workbook, immutable publication snapshots, conditional public reads, an edge cache, and request coalescing. Replacing these with unconditional whole-sheet reloads or more aggressive retry loops would reverse existing protections.

Two inherited contention boundaries were reproduced, rather than inferred from naming:

1. Deploy publication holds its script writer lock while publishing Contacts catalogues and transferring the Layout snapshot. A competing Deploy writer is therefore blocked during either handoff.
2. A projection reader rejects a response if the global Deploy index revision changes during its read, including a completed write to a different version. This conservatively produces an extra read attempt even when the target commit did not change.

Neither boundary was weakened in this patch. The first needs a durable handoff protocol; the second needs target-specific consistency proof. Removing the lock or revision check alone would risk stale-index overwrite or mixed snapshots.

Reproduction: `node verification/085-deploy-concurrency-probe.cjs`. This runs only against an in-memory Sheets fixture. It asserts a held writer lock and competing-writer 503 during both handoffs, then interleaves an actual fixture commit to another version and observes a 503 from the unchanged target's projection read. It measures neither real wait duration nor production incident frequency.

### Read/write matrix

| Workflow and source | Reads | Writes and serialization | Client behavior / consistency |
| --- | --- | --- | --- |
| Sign-in authority and catalogue: `backend/Code.gs`, `doPost`, `contacts_` | Fresh signed Contacts authority; bootstrap/sync can reuse a content-addressed catalogue only after fresh authority accepts its hash | Read path may populate the bounded catalogue cache; no planning write | Browser-supplied catalogue hashes cannot establish authority. Role changes invalidate privileged projections. Contacts lookup normally occurs before the Deploy writer lock. |
| Initial Deploy load: `snapshot_`, `projectionRead_` | Index plus role-appropriate version projection and only indexed conflict-notice events; ordinary load excludes full history and receipts | No writer lock except recovery of an already-pending journal | Cache key binds version revision, authority, identity, Contacts source, acknowledgement epoch, and model. Current catalogue can be omitted by hash. |
| Unchanged refresh / delta: `snapshot_`, `fieldDelta_` | Unchanged snapshot skips the document; unchanged delta reads the current index. Changed privileged delta follows at most 32 durable commits | No mutation; a missing/invalid delta chain requests a full authorized resync | Roles and publication changes fence reuse. Ordinary teachers do not receive an unpublished privileged delta. |
| Explicit Save: `public/app.js`, `saveDraft_`, `draftReadScope_` | Current dependency roots for the edit batch; all structural dependencies for unsupported or destructive operations | One script writer lock; changed fields, read projections, authors, audit and receipt are journaled together, then the commit marker advances | Local queued edits remain visible before Save. Failed/uncertain saves retain the draft and request identity. Confirmed save can return its committed delta. |
| Load Settings, Fortnight, Offload, HR terms | Indexed root ranges plus view row-address ranges in one batch; no unrelated assignments for the measured small operations | Only changed field runs and derived projection/audit/receipt rows | Calculations and validation remain tied to the committed version. A null load/destructive edit deliberately falls back to broader dependencies. |
| Level exclusions: `backend/ExclusionStore.gs` | TextFinder selects touched teacher/exclusion/author records and required container headers; batched exact values | Changed fields only; untouched sibling records and chunked containers are restored before persistence | Exclusion-only save can preserve a proven unchanged relief calculation. Mixed changes recalculate. Exclusion policy is advisory to existing assignments. |
| Legacy editing leases: `dispatch_`, `leases_` | Current edit projection, current script-property leases and resource hash | Script lock; bounded expiring lease map in properties | Leases protect applicable legacy resources. A lease on one cell does not itself claim all cells; the writer lock still serializes commit preparation. Expired or conflicting resource saves are rejected with the local draft retained. |
| Save confirmation: `storedReceipt_`, `fieldReceipt_`, `duplicateDraft_` | Exact request-ID lookup and receipt row/chunks, plus current index; legacy stores may require a one-time full fallback | Successful duplicate and receipt checks perform no save writes; duplicate `saveDraft` still takes the dispatch lock | Actor, version and original edit digest are checked. A lost acknowledgement does not justify replaying a new mutation ID. |
| Audit list/detail: `auditPage_` | Summary page reads only four columns, at most 40 rows; one selected detail reads only its indexed canonical range | No write; both index checks remain | Admin only. Cursor/epoch handles purged history. Pending writes are not exposed as committed audit records. |
| Publish review and publication: `publishReview_`, `dispatch_`, `syncPublishedCatalogues_` | Full dependencies and current Contacts review where teacher proposals require it | Published frozen projections and handoff intent committed durably; Contacts and Layout handoffs currently run under the same Deploy writer lock | Publication remains explicit. Repeating the original publication request retries the downstream handoffs rather than creating a new version publication. |
| Public Layout: `backend/LayoutRepository.gs`, `publicLayout_` | Layout workbook only. Verified unchanged cursor returns from the head; changed snapshot reads immutable chunks and validates checksum/shape, then rechecks head | No ordinary reader lock or Deploy workbook lookup | Previous verified snapshot remains usable while a newer handoff is pending. Selected year is checked. |
| Public Layout edge: `layout-update/public/_worker.js` | One canonical year/backend public request; same-isolate concurrent requests share the in-flight result | Public allowlisted cache, 45-second bound; identity/profile paths are not cached | Each caller's cursor and trace metadata are applied separately. Error, timeout, malformed and wrong-year responses cannot poison the cache. |
| Layout browser: `layout-update/public/app.js` | Snapshot and SVG start in parallel; unchanged snapshot skips rerender. SVG promise is reused | No server mutation from search, room selection, TG filtering, zoom or print | Search, TG filtering and 3D lookup operate on the loaded client snapshot. Polling is jittered to 60–75 seconds and pauses reads while hidden. Old model callbacks are rejected by revision. |
| Layout publication: `syncLayoutPublication_`, `layoutStore_`, `layoutMirror_` | Published Deploy snapshot and previous verified Layout snapshot; existing mirror rows for comparison | Reserved immutable chunk range, read-back checksum, changed mirror rows, then head pointer. Completed matching commit is idempotent | Partial transfer leaves the last verified public head active. Retry reuses its staged range. No claim of cross-workbook atomicity is made. |
| Layout source/admin maintenance and venue rename | Explicit owner/admin table reads; fixed row identities, source columns and year are validated | Manual maintenance uses the Deploy script lock and refuses a pending publication. Retired web rename route returns 410 | Venue changes belong in Deploy and are exposed through publication. A draft venue change does not leak into public Layout. |

### Measured work, rather than claimed latency

`verification/085-deploy-counts.json` records synthetic service-call/range counts using the actual current dispatcher and field-store implementation. The fixture has 159 teachers and compares zero with 1,500 IP assignments. It includes native and Sheets API value reads; metadata calls are counted separately and are not asserted to be separate network RPCs.

| Operation | Read cells, 0 assignments | Read cells, 1,500 assignments | Value cells written, 1,500 assignments |
| --- | ---: | ---: | ---: |
| Full bootstrap | 14,676 | 35,682 | 0 |
| Unchanged delta | 1 | 1 | 0 |
| Fortnight toggle | 822 | 822 | 84 |
| Load Settings, first normalizing save | 827 | 827 | 66 |
| Load Settings, steady one-cell save | 863 | 863 | 45 |
| Offload one rate | 508 | 508 | 93 |
| HR Terms one option | 457 | 457 | 144 |
| Membership label | 9,078 | 9,078 | 78 |
| Reporting officer | 9,743 | 9,743 | 75 |
| Class ability | 880 | 880 | 75 |
| Class name set | 325 | 325 | 189 |
| Class name edit | 7,390 | 49,402 | 84 |
| Teacher note | 5,319 | 5,319 | 75 |
| Teacher exclusion | 210 | 210 | 102 |
| Teacher field | 13,653 | 55,665 | 213 |
| Duplicate save | 7 | 7 | 0 |
| Receipt confirmation | 6 | 6 | 0 |

The small save cases use two Sheets API write requests: durable preparation and completion. Their extra written cells include journal/projection/audit/receipt work, not a whole-document rewrite. Structural sheet expansion may require flushes; the regression ceiling is four. Class-name changes and teacher-profile changes intentionally read assignment dependencies because renaming and inactive-teacher cleanup can affect those references.

The audit-list fixture with 141 large events independently confirms a full page reads 160 summary cells, no complete history, and two consistency checks. The smaller performance fixture has only 14 current summary rows and therefore reads 58 cells including both index checks.

These counts do not include real Google execution time, the live Contacts authority round trip, browser rendering, network transfer, quotas, or simultaneous production user latency. They are not a claim that 1,500 assignments match the school's current data.

### Compression and endpoint opportunities

An offline gzip experiment on the fixture's serialized response produced:

| Payload | JSON bytes | Gzip bytes | Interpretation |
| --- | ---: | ---: | --- |
| Full Deploy bootstrap, 159 teachers / 1,500 assignments | 454,425 | 27,938 | Cold snapshots are highly compressible. Measure the deployed response's existing `Content-Encoding` and each network leg before adding a second compression layer. |
| Public Layout seed projection | 91,903 | 19,197 | Compression can help a changed/cold public snapshot; existing 45-second caching and conditional reads already avoid repeated backend work. |
| Unchanged Deploy delta | 98 | 108 | Compressing every tiny response can increase size. Keep a threshold or normal HTTP negotiation. |

The gzip numbers are local `node:zlib` results, not deployed transfer measurements, and exclude compression/decompression CPU cost. Baseline/current/suspended Roster compression is reviewed separately under item097; this report neither reimplements nor verifies that feature.

Priorities supported by this audit:

1. **Retain local interaction and surgical commit design.** Ordinary Deploy filtering/calculation/draft projection and Layout search/filter/3D interaction already execute on the client. Preserve explicit Save, version identity and fresh authorization. Higher RAM allowance is useful for bounded indexed snapshots, not a reason to retain obsolete identity-scoped state after sign-out.
2. **Measure publication lock hold time in production diagnostics.** Existing Deploy tracing records lock wait/hold and request phases. If publication materially blocks morning edits, use a durable commit-keyed handoff queue with one owner, obsolete-job rejection, idempotent target apply, and short finalization. Do not call the existing helpers after releasing the lock with a stale `idx`: they write that index and could overwrite a concurrent save.
3. **Consider a target-specific read fence separately.** A future immutable published read can compare its selected store/commit and a safe pending-write marker rather than invalidating on every unrelated global revision. It needs tests for target rewrite, published-pointer change, deletion, journal recovery and pending transactions before replacing the conservative current check.
4. **Optimize large dependency reads using explicit reverse indexes.** Class rename and teacher-profile changes are the measured outliers. An assignment-by-teacher/class index could select affected rows while preserving cascade cleanup and validation. Simply dropping assignments from `draftReadScope_` would break those guarantees. Small operations already remain constant when unrelated assignments grow.
5. **Use transport compression where measurements show a missing compressed leg.** Preserve identity/version checks before accepting decompressed data; impose size limits and reject malformed or wrong-revision payloads. Avoid resending unchanged catalogues and avoid compressing tiny receipts/deltas. Client decode work must not block initial navigation.

### Verification run

All following commands exited successfully against the local working source:

- `node tests/release505-performance.cjs`
- `node tests/release506-performance.cjs`
- `node tests/release509-exclusions.cjs`
- `node tests/audit-read-path.cjs`
- `node tests/release505-layout-poll.cjs`
- `node tests/release505-layout-cache.mjs`
- `node tests/layout-sync.cjs`
- `node tests/release501-layout.cjs`
- `node tests/release504-storage.cjs`
- `node tests/release505-transport.cjs`
- `node tests/cache-backend.cjs`
- `node tests/cache-frontend.cjs`
- `node tests/read-transport.cjs`
- `node tests/public-layout.cjs`
- `node tests/landmark-api.cjs`
- `node verification/085-deploy-concurrency-probe.cjs`

Notable exercised guarantees: independent cell updates retained; receipts after lost acknowledgement; rejected revoked access; unchanged unrelated exclusion siblings; pending journal recovery; public-year/cache isolation; 30 concurrent public Layout reads collapsed to one same-isolate backend request; staged publication retry without duplicate chunks; old verified Layout retained after transfer interruption; local search without backend calls; old response/session rejection; and no replay of uncertain saves or upstream timeouts.

The final release runner should rerun its normal gates after all parallel agents' source edits and generated bundle synchronization. No live performance or production incident resolution is claimed by this audit alone.

## v0.8.5 Contacts and Calendar read/write audit

Date: 21 October 2026. Source baseline: `c98d377` (v0.8.4a).

This review inspected the local Contacts and Calendar sources and exercised their synthetic Sheets/Apps Script harnesses. It did not inspect production logs, change production data, or perform a live concurrent load test. Sim Lan's Deploy issue and Roster timetable transport are covered by the other component reviews.

### Confirmed defect and repair

Calendar shared display caches could be repopulated with old configuration after a writer had invalidated them. The reproduced sequence is:

1. Reader A reads active lane/tag metadata and pauses immediately before caching it.
2. Writer B disables that lane/tag, commits its metadata and audit atomically, then invalidates the shared cache.
3. Reader A writes its old display snapshot into the shared cache.
4. Writer C saves an event. v0.8.4a accepts the now-disabled lane/tag because validation trusts the shared cache while holding its lock.

`tests/calendar085-write-cache.cjs` reproduces this with independent reader and writer execution contexts sharing the synthetic workbook/cache. It verifies the metadata deactivation really committed. Against v0.8.4a, the test fails because the invalid event is accepted. The patched backend rejects both lane and tag cases, retains the event, and writes only a rejection receipt.

The fix is in `calendar-backend/Code.gs`. Acquiring the existing Calendar writer lock now starts a fresh request-local metadata cache and clears tables/lookups obtained before waiting for the lock. Cached validation reads within the lock use that private snapshot; ordinary readers continue to use the existing shared display cache. Successful or uncertain transaction invalidation clears local cached values too. Release and authority-error paths end the private cache scope. No new lock, cache service, schema migration, client protocol or deployment property was introduced.

### I/O and concurrency matrix

| Component / path | Read scope and client work | Write and concurrency protection | Audit result |
| --- | --- | --- | --- |
| Contacts bootstrap/data/catalogue | Display catalogue cache keyed by data epoch; bounded chunks; live caller authority. View reads bracket the whole snapshot with before/after markers and retry changed reads. | Read routes do not acquire writer locks, flush or recover pending writes. During unresolved publication, a verified saved snapshot can be shown read-only. | Existing consistency and access boundaries retained; no source change required. |
| Contacts Roster directory / notification directory | One Sheets batch reads the required three tables; one contact derivation. Each identity gets fresh authority. | Zero writer locks and writes on this read path. Pending publication does not become an authoritative directory. | Existing test exercises 30 independent signed identities: 30 batches, zero locks, zero writes. These are sequential harness invocations, not a live 30-user timing claim. |
| Contacts personal/administrative save | Frontend keeps changed cells and expected values locally. Confirmed responses update local data without requiring a full refresh. | Live authority under lock; cell-level compare; stable request digest; durable before-image/journal and receipts. Dirty cells and required derived fields only. | Existing mixed-save, conflict, recovery, fresh-row-mapping and exact-retry tests pass. |
| Contacts commit and recovery | Prepared write values and metadata are immutable before submission. Snapshot gzip has an explicit MIME type. | One bounded atomic Sheets API request where available; no alternate-transport retry after an uncertain API response. Documented native compatibility path has ordered journal recovery. | 150 ranges commit in one API request; corrupt/partial reads fail safely; no duplicate save on lost acknowledgement. Shared SheetsIO was reviewed, not changed. |
| Calendar bootstrap | Selected-year event bodies; batched metadata misses and current Years/Users; frontend deduplicates same-year requests, keeps a per-year RAM cache, and rejects late responses from earlier navigation. | No writer lock. Cached client views remain read-only until fresh authorization/response succeeds. | Cold, warm and cache-unavailable bootstrap stay at three API read batches; cold/cache-unavailable fixture reads 279 cells. |
| Calendar event save/move/copy/delete | Stable event identity, expected revision and narrow live row lookup. New fix uses fresh metadata inside the writer lock. | Existing short script lock; authority rechecked after waiting; per-operation durable identity; unresolved outcomes fenced. Intent is written first; event patch, audit and committed receipt share one final atomic batch. | Disjoint events remain independently retryable; stale same-event edits conflict. No automatic replay after ambiguous commit. |
| Calendar metadata save | Record-specific expected metadata revision; lane schedule reads together with lane metadata. | Metadata and audit transaction is atomic; stale/missing revision rejected; separate records do not share a global revision conflict. | Existing 12-action metadata concurrency suite passes. Delayed cache refill no longer supplies event-write validation. |
| Calendar maintenance/sync | Eligibility scans project relevant columns; sync loads only target event rows and patches sync fields. | The same writer-lock wrapper covers all six direct maintenance callers; local cache scope ends on release/error. | Existing sync, maintenance-role-revocation and atomicity tests pass. |

### Speed and payload findings

The repair preserves read-only bootstrap speed. On the warm synthetic event-edit fixture, fresh validation adds one batched metadata read: five to six read batches, 66 to 218 cells. It still uses two write batches and 26 written cells, of which only six cells belong to the changed event. This is the measured freshness cost, not a production latency estimate. The four configuration tables are fetched together and reused within the writer request.

Contacts already defers teaching/deployment enrichment until the directory is usable and performs filtering, grouping, contact export and edit tracking on the client. Calendar already performs filtering/rendering against its selected-year cache and patches affected event dates following a confirmed edit. Neither component needs per-cell network verification while a user types.

Contacts' gzip is currently for stored coherent snapshots, not an explicit compressed browser bootstrap contract. Calendar and Contacts API gateways return JSON with `no-store`; this audit does not claim application-level endpoint decompression exists there. Compression candidates are whole read-only directory/selected-year snapshots with an explicit schema version and identity boundary, after measuring real payload sizes. Fresh authority, revision comparisons and operation receipts must remain server-side. Sending all years or all editable Contacts tables on every load would increase unrelated I/O and is not recommended without evidence. Roster's requested staged current-day-to-30-day timetable preloading is a separate release change.

### Verification evidence

The regression was run against both the baseline backend and patched backend. Baseline fails on disabled-lane acceptance; patched lane and tag cases pass. A separate read-only agent reviewed the diff and found no blocking correctness or structural findings; it independently reran the new regression and both Calendar concurrency suites.

Passed focused commands:

- `node tests/calendar085-write-cache.cjs`
- `node tests/calendar708-concurrency.cjs`
- `node tests/calendar708-metadata-concurrency.cjs`
- `node tests/suite703-calendar-reliability.cjs`
- `TZ=Asia/Singapore node tests/calendar/sheets_api_tests.cjs` — 63/63
- `TZ=Asia/Singapore node tests/calendar/backend_tests.cjs` — 38/38
- `node tests/contacts718-roster-performance.cjs`
- `node tests/contacts503-save.cjs`
- `node tests/contacts503-view.cjs`
- `node tests/contacts503-commit.cjs`
- `node tests/contacts710-fasttrack.cjs`
- `node tests/sheets414.cjs`

Calendar's inherited date diagnostics fail under the host's UTC timezone and pass under the application timezone, `Asia/Singapore`; the explicit timezone was used for the complete backend suites. No production performance or end-to-end deployment claims follow from these harness results.

Review methods: systematic debugging, Pstack root-cause analysis, Ponytail simplification, Vercel code review, verification-before-completion, and the local Thermonuclear correctness/quality rubrics. No UI behavior was changed in this component patch. No unresolved blocking finding remains within this diff; full-suite packaging, version synchronization and live deployment checks remain the release owner's work.

## v0.8.5 Roster read/write and concurrency audit

Reviewed 21 October 2026 against `c98d377` plus the v0.8.5 working changes. This is a source review and local regression audit, not a live production load test. No teacher messages were sent and no production data was changed by these checks.

### Finding fixed

`rosterInboxServiceDispatch_` fetched the remote Contacts directory while holding the Roster script writer lock. Inbox ingest, dispatch polling and send preparation therefore blocked otherwise independent Roster saves for the entire external service wait.

`backend/RosterInbox.gs` now fetches Contacts before acquiring that lock, matching the existing notification-service convention. The latest inbox document and current duty roster are still read under the lock, the eligibility clock is sampled after those reads, and claims and commits remain locked. Signed reply/delivery receipts still avoid an unused Contacts request. A failed Contacts lookup performs no lock acquisition or write.

The new `tests/roster085-inbox-lock-scope.cjs` exercises the real Inbox domain with controlled Apps Script boundaries. It changes the duty roster during the Contacts lookup and verifies that the later locked read selects the new duty officer. It also checks duplicate-ingest idempotency, pre-lock failure and the receipt-only path. The assertion failed on the old lock placement and passes on the revised implementation.

With an injected 100 ms Contacts lookup, 5 ms inbox read, 5 ms duty read and 10 ms commit, the protected section falls from 120 ms to 20 ms. This measures removed lock occupancy in the fixture; it is not an observed production latency improvement.

### Route matrix

All school-user routes use the signed gateway identity and verified Contacts authority. Service routes use the existing signed service envelope. Browser caches and compression are transport/display optimisations, never write authority.

| Route or work | Current I/O shape | Lock and correctness boundary | Cache / freshness behaviour |
| --- | --- | --- | --- |
| Baseline profile/read | Fresh timetable register; immutable model files only when needed; names can use a small projection | No writer lock for reads; current account/role authority | Immutable model cache is keyed by registered model identity/file. `knownModelIds` avoids repeat model payloads; current register still determines activation |
| `timetableBatch` baseline stage | Current Singapore date through day +30 inclusive; each distinct model file read once in this request; one compressed response | Read-only, no Calendar/quota lookup or writer lock; source manifest rechecked after construction | Identity/role/source-bound key, register revision and exact 31-date window. Client installs the entire valid baseline stage before requesting suspended plans |
| `timetableBatch` suspended stage | One operations snapshot; relevant saved plans and any required immutable model projections; one compressed response | The baseline key must still match. Teachers receive eligible confirmed contents; SMC/Admin can receive active saved drafts | Account/role/date changes cancel old responses. A source change causes one two-stage restart. 64 MiB decoded limit per stage; gzip has bounded decode and plain JSON fallback |
| `timetableDay` and Stapler dates | Selected confirmed/published timetable or date metadata, rather than an allocation context | No quota lookup or writer lock. Current/future confirmation is viewable only to authorised users; old draft changes do not replace a teacher's confirmed view | Preload gives an immediate view; authoritative refresh remains. Latest confirmed timetable browsing is distinct from the published notification snapshot |
| Compact report/entry read | Selected teacher cells plus fresh absence/receipt records; compressed immutable baseline/effective timetable pair | Current authority and dependencies on server; no write on a normal record-only read | Snapshot key binds account, role, view, date and content. An unchanged key omits repeat timetable bytes. Dynamic absence data is not frozen into the timetable cache |
| Allocation/candidate reads | Whole operations snapshot plus required day/model/quota context; selected-teacher joins | Usually no lock. If dependency reconciliation changes records, reacquire lock, reread state and reject a changed global revision before committing | Current source dependencies remain authoritative. The narrowed join avoids rebuilding all candidate rows for every assignment |
| `allocationVersion`, `receiptStatus`, Daily Notify | Whole operations snapshot but bounded day token, receipt result or published-state projection | Read-only; receipt lookup does not wait for a writer lock or build timetable/quota context. Receipt actor and command digest must match | Daily Notify uses durable publication/acknowledgement state. Receipt recovery confirms a saved request without repeating it |
| `reliefBatch`, publish, Notify, auto-allocate, optimise | Prepare models/context and result before lock; reread latest operations under lock; merge changed records; one operations-document replacement | Current day/cell tokens, source manifest, dependent state and minute clock checked at commit. Same request ID replays its receipt. Conflicting preparation can retry once before any commit | Browser performs local edits; save acceptance remains server-side. Source change rejects/reprepares instead of silently accepting stale output |
| Absence, instructions, Stapler and settings saves | Latest operations snapshot; needed context; domain change, receipt and audit intent; one document replacement | Shared Roster writer lock. Independent new absence reports tolerate older global revisions; instruction/Stapler changes compare their own cells/source. Other existing-record edits may still require the current revision | New absence-without-baseline support is handled by item 096. Client timetable cache cannot make an invalid allocation authoritative |
| Simple draft cell clear/no-relief | One selected model/register read, one operations read and one commit; compact patch response | Lock retained; expected baseline, Stapler, parity and demand source verified. Published/complex cases fall back to the full safety path | No quota read, whole allocation reconcile or full health projection in the eligible fast path |
| Private timetable GET and acknowledgement | Published teacher snapshot supplies the fast read path; legacy fallback can need Contacts/model context. Acknowledgement changes operations state | Link capability checked for staff/date/purpose/expiry; reads do not mutate or consume the link. Acknowledgement/response writes remain locked | Published timetable and acknowledgment are server truth. The seven-day capability remains reusable; this audit did not alter its duration |
| Notification claim / prepare / result / delivery | Contacts before lock for eligibility; latest operations read and claim commit inside; provider HTTP outside; exact result settled later | Claim identity, expiry and current publication/recipient eligibility checked immediately before send. Delivery events are deduplicated and monotonic. An ambiguous prepared send is not blindly resent | Fresh authority/clock on claim and prepare. One recipient is claimed at a time, up to five per drain; queued work may span several drains |
| Inbox list/thread/media | Separate inbox document; bounded list/thread response, revision/cursor refresh; duty document only when needed | SMC/Admin gate; reads take no writer lock. Media authorisation avoids unused duty reads | Accepted reply includes its thread snapshot, avoiding a follow-up read. Client polling pauses when hidden/editing and backs off; images remain private through the existing media route |
| Inbox user/service writes | Separate inbox document read/replace; current duty snapshot only if needed; Contacts now before service writer lock | Fresh locked state, claims, idempotency and clock retained. Same script lock also protects other Roster writes | Duplicate webhook/reply/result handling preserves accepted state. No public media caching added |
| Scheduled planning / email / audit export | Planning prepared outside commit lock; email/Drive transfers outside writer lock; receipt/watermark settled on latest state | Scheduler slot receipts, source/dependency checks and cutoffs; audit exporter has its own exporter lock plus a short operations commit section | Idle scheduler avoids unnecessary work. Audit settlement retains newer changes for the next export and compacts only after durable exports succeed |

### Storage and concurrency limits

- Operational changes are logically surgical, but `rosterOperationsCommit_` still writes one complete `Roster operations.json` document (12,000,000-character guard). The private Inbox document is separate (8,000,000-character guard) and is also replaced whole. Neither path is a physical cell-level Drive patch.
- Packed Stapler plans and audit archives reduce stored and transferred data. Untouched packed plans can be reused without eagerly expanding all plans. This does not remove the full-document read/parse/write cost.
- The Apps Script project split isolates the Roster script lock from the other deployed projects. Within Roster, its shared writer lock remains necessary while multiple operations replace the same document. Removing the lock or adding independent locks without changing storage ownership would permit lost updates.
- Ordinary user write context preparation can still occur under that lock. Moving more preparation out is a future optimisation only if the same dependency/source/clock checks and merge rules are retained. The prepared allocation routes already demonstrate that boundary.
- Notification draining is intentionally bounded and serial per invocation. “Send WhatsApp” queues eligible recipients and starts dispatch; it is not proof that every recipient has received a message. A larger drain or bounded parallel sending requires measured provider/backend cost and preservation of individual claim/prepare/result semantics.
- No current production p50/p95 latency, Drive document size, Apps Script lock-wait distribution or real 30-user load result was available to this audit. The tests below prove specific interleavings and I/O reductions, not a production capacity guarantee.

### Verification run

All listed checks passed on the reviewed working tree. Apps Script boundaries and provider/network responses were simulated; the real domain/dispatch functions were exercised where stated.

| Checks | Evidence |
| --- | --- |
| New Inbox lock-scope regression | Remote wait excluded; current duty changed during lookup still used; exact ingest retry has no extra write; failed lookup has no lock/write; delivery receipt does not fetch Contacts |
| `roster718-concurrency.cjs` | Deterministic 1/10/30-user interleavings with background delivery events. All reports retained; receipt queries take zero context reads/lock waits; exact retries add no changes; stale existing-record edits rejected. At 30 users: 30 accepted reports, 30 background events and 30 receipt queries. Detailed synthetic accounting is in `verification/718-concurrency.json` |
| `roster712-absence-concurrency.cjs` | Thirty independent reports from revision zero: 30 writes, zero stale-global-revision conflicts, zero replay writes; same vacancy grouping remains stable |
| `roster-draft-cell-save-speed.cjs` | Six checks. For 150 teachers and 120 demands: one register/model/state read, one commit/lock, zero quota/reconcile/history/health work, 2,373-byte response. Published cases still use full validation |
| `roster711-reconcile-speed.cjs` | One immutable date join and 40 selected teacher rows rather than 4,000 rows in the reference fixture; invalidation still updates balances correctly |
| `roster701-backend-speed.cjs`, `roster706-backend-speed.cjs`, `roster-speed-authority.cjs` | Immutable model cache, reduced names payload, record-only context paths and one batched Contacts authority read preserve role revocation and write authority |
| Inbox backend/domain and worker checks | `roster-draft-inbox-backend.cjs`, `roster-draft-inbox-domain.cjs`, `roster711-inbox-worker.mjs`, `roster082-inbox-images-worker.mjs`: role/duty checks, lost-response replay, reply boundary, claim/delivery recovery, private image retrieval and cache reuse |
| Notification and audit checks | `roster082-notify-service.cjs`, `roster082-backend-audit.cjs` (eight checks), `roster082-audit-worker-lane.cjs`: stale publication cancellation, durable audit intent, transfer outside writer lock, newer-save preservation, safe failure and independent exporter lane |
| Timetable preload and confirmed view | `roster097-batch-backend.cjs` (20 checks), `roster097-batch-client.cjs` (21), gateway/errors/Stapler-preload checks and `roster097-confirmed-view.cjs` (12): atomic stages, stale sources, role/account/day cancellation, no draft leak, gzip fallback and current confirmed browsing |

### Next measured improvements

1. Record request phase duration and document sizes in existing diagnostics, then prioritise the longest remaining locked context preparation. Never log teacher data or private link tokens in timing diagnostics.
2. If the operations document approaches its guard or write latency remains dominant, design owned day/record partitions with explicit cross-record invariants and migration/recovery tests. The current document lock must remain until that change is complete.
3. Measure morning queue age and actual drain duration before raising notification parallelism. Keep fresh prepare and durable results for every recipient.

These are follow-up opportunities, not additional v0.8.5 changes or measured production faults.
