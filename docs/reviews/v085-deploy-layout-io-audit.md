# v0.8.5 Deploy and Layout read/write audit

Date: 21 October 2026. Scope: source at `c98d377` plus the working v0.8.5 changes. This is a source and local-fixture audit. No live workbook, deployment, user allocation, Contacts record, or message was changed.

## Result

No additional release-blocking data-loss defect was established in Deploy/ Layout storage during this audit. Fifteen focused test scripts passed. The Sim Lan teaching-group recovery fix is owned by the separate Deploy investigation; this report does not substitute for that regression test.

Deploy already performs local draft manipulation, differential saves, indexed dependency reads, journaled recovery, and actor-bound save confirmation. Layout already uses an independent workbook, immutable publication snapshots, conditional public reads, an edge cache, and request coalescing. Replacing these with unconditional whole-sheet reloads or more aggressive retry loops would reverse existing protections.

Two inherited contention boundaries were reproduced, rather than inferred from naming:

1. Deploy publication holds its script writer lock while publishing Contacts catalogues and transferring the Layout snapshot. A competing Deploy writer is therefore blocked during either handoff.
2. A projection reader rejects a response if the global Deploy index revision changes during its read, including a completed write to a different version. This conservatively produces an extra read attempt even when the target commit did not change.

Neither boundary was weakened in this patch. The first needs a durable handoff protocol; the second needs target-specific consistency proof. Removing the lock or revision check alone would risk stale-index overwrite or mixed snapshots.

Reproduction: `node verification/085-deploy-concurrency-probe.cjs`. This runs only against an in-memory Sheets fixture. It asserts a held writer lock and competing-writer 503 during both handoffs, then interleaves an actual fixture commit to another version and observes a 503 from the unchanged target's projection read. It measures neither real wait duration nor production incident frequency.

## Read/write matrix

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

## Measured work, rather than claimed latency

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

## Compression and endpoint opportunities

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

## Verification run

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
