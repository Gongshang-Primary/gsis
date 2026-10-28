# GSiS suite performance and reliability audit

Date: 24 October 2026 (Singapore). Scope: Calendar, Contacts, Deploy, Layout and their gateway/shared I/O paths. Read-only source investigation; no source changes, live writes, deployments or production load tests in this audit. Roster timetable caching and STAPLER are covered by the parallel task reports.

## Findings and disposition

1. **Calendar remains a full selected-year refresh path.** `calendar-update/public/app.js:loadBootstrapSnapshot` always calls `/api/bootstrap`; `calendar-backend/Code.gs:apiBootstrap_` returns every visible event, year structure row and note for that year. `rc18YearData_` first scans year columns then fetches only matching row bodies. It avoids unrelated-year bodies but still reconstructs the chosen year on every refresh. Warm and cache-unavailable fixture calls both need three Sheets batches. This is a verified optimization opportunity, not an observed corruption defect.
2. **Queue an authoritative Calendar version protocol only with an explicit writer boundary.** All event/metadata/birthday/import/publication/sync/recovery writers must advance the relevant version atomically with their changes. The caller's current authority, released-year visibility, and content version must be checked before returning unchanged. An epoch stored separately after a Sheets write creates an invalidation gap. No `function onEdit`, `function onChange` or installed `newTrigger(...)` invalidator was found in backend/calendar-backend source. Therefore raw spreadsheet edits or external scripts cannot be assumed to advance a proposed marker. Either limit trusted reuse to app-owned writes with an explicit supported refresh/reconciliation route, or retain a fresh content digest/read boundary for externally editable data. Browser time and cached fetch timestamps are not content versions. This candidate is queued, not implemented here.
3. **Deploy already implements the requested surgical pattern.** `FieldStore.gs:projectionRead_`, `fieldPersist_`, `fieldDelta_`, `committedDelta_`, `fieldReceipt_` and the dispatcher in `backend/Code.gs` use immutable publication identity, field projections, journalled batched writes, compact receipts and revision deltas. Unchanged sync skips the document read entirely; locks remain fresh and role changes do not reuse privileged snapshots. Do not replace this with a whole-document cache or weaken the before/after revision fences.
4. **Contacts already separates cached data from live authority and recovery state.** `Contacts_Code.gs` / generated `backend/Contacts_Code_with_Deploy_API.gs:contactCachedRead_` uses data epochs plus bounded 30-second shared data caching. `access_` remains live. `Contacts_View.gs:contactViewRead_` checks source/recovery markers around reads and can serve verified older views during writes without taking a writer lock. `Contacts_Commit.gs:contactPrepareValues_` prepares exact ranges before the durable save and never retries a possibly committed API write through a native fallback. Raw sheet edits bypass the epoch, so the 30-second cache expiry remains a freshness boundary; it must not become an indefinite unchanged response without a write ownership policy.
5. **Layout already has bounded publication caching and version checks.** `LayoutRepository.gs:publicLayout_` reads the validated immutable head and returns unchanged before loading snapshot bodies when the revision matches. `layout-update/public/_worker.js` coalesces concurrent public snapshot requests and caches only an allowlisted public schema for 45 seconds. It still polls the backend after expiry; that is necessary for fresh publication discovery. The frontend pauses hidden-tab polling and uses 60–75-second jitter. No further cache was justified.
6. **Authenticated gateway coalescing is deliberately identity scoped.** `shared/worker-read-coalescing.js` is used by Deploy and Contacts; only overlapping identical reads share work. Keys contain backend, email, subject, action and input. Mutations clear flights before and after execution. Do not coalesce authenticated responses across users merely to reduce the 30-user count. Layout's cross-user coalescing is safe because its response is an explicitly public projection.

No small, proven critical non-Roster defect emerged that justified a source mutation during this audit. Larger changes should be measured against these existing safeguards instead of layering another cache on top.

## Executed checks

All eight scripts below completed with exit code 0 on the checked workspace.

| Check | Actual evidence |
| --- | --- |
| `node tests/cache-backend.cjs` | Unchanged Deploy sync: zero document reads; current leases retained; compact saves; role downgrade, rename/delete and publication visibility checks pass. |
| `node tests/deploy418-projection.cjs` | 0, 100 and 500 large audit entries all produce the same 4,891 view rows and 318,546 serialized fixture bytes. Selective conflict history, immutable published content, interleaved revision change, interrupted preparation and recovery pass. |
| `node tests/contacts503-view.cjs` | Cold reads during busy writers cause zero writes, locks or flushes; coherent compressed/plain before-images, current permissions, corrupt-marker recovery and hidden unconfirmed additions pass. |
| `node tests/contacts718-roster-performance.cjs` | Existing direct directory path uses one Sheets batch, one derivation and four metadata methods rather than sixteen in the comparison fixture. Thirty independent signed handler requests use thirty batches, zero locks and zero writes. These are sequential simulated handlers, not a production concurrent benchmark. |
| `node tests/calendar085-write-cache.cjs` | A delayed reader can refill stale display metadata, but locked writes still reject newly disabled lanes/tags; only rejection receipts can be written. |
| `node tests/suite703-calendar-reliability.cjs` | Same-year request coalescing, late response isolation, retained read-only view after failure and explicit retry pass. Cold/cache-unavailable bootstrap: three Sheets batches, 279 fixture cells; warm bootstrap retains fresh authority. Metadata writes stay atomic; invalidation race and lost-acknowledgement checks pass. |
| `node tests/release505-layout-cache.mjs` | Thirty concurrent same-isolate public requests use one backend request. Each client retains its own cursor/trace; wrong-year/errors/incomplete responses cannot poison cache; authenticated profile stays uncached. |
| `node tests/release505-layout-poll.cjs` | 60–75-second jitter, hidden-tab pause and one resumed timer pass. |

These checks demonstrate behavior and service-call counts under fixtures. Their elapsed local execution time is not a Google Apps Script or Cloudflare latency estimate.

## Source inventory and coverage limits

Inventory counts include `.gs`, `.js`, `.mjs` and `.cjs`, exclude vendor directories, and were collected from the working tree during this task. They are physical file counts, not claims that every line was reviewed.

| Directory | Files | Lines |
| --- | ---: | ---: |
| `backend` | 31 | 12,768 |
| `calendar-backend` | 3 | 9,848 |
| `public` | 19 | 3,417 |
| `calendar-update/public` | 3 | 7,042 |
| `contacts-update/public` | 15 | 1,176 |
| `layout-update/public` | 13 | 738 |
| `shared` | 28 | 4,371 |
| `tests` | 673 | 26,012 |

The backend count includes Roster source owned by other reviewers. `backend/Code.gs`, `backend/Contacts_Code_with_Deploy_API.gs`, frontend bundles and copied shared files contain generated/embedded sections; they must not be counted as independent implementations. `scripts/build-release.py` identifies canonical shared modules and source sections and regenerates them. The Contacts authoring entry is root `Contacts_Code.gs`; the backend copy is generated. Calendar `Code.gs` has canonical application code plus marked generated RosterDate/Birthdays sections. Vendor libraries, geometry assets, test fixtures and historical release documents were inventoried or consulted only when relevant; they were not independently audited line by line.

Traced symbols/files: Calendar bootstrap/front-end year cache, request sequence/flight, event patch refresh, `apiBootstrap_`, `calendarMetadataTokens_`, `calendarMetadataCurrent_`, `rolesFor_`, cached settings/config/users, `calendarWriteLock_`, `withRC17WriteLock_`, `rc18YearData_`; Contacts dispatcher, directory/bootstrap/data routes, authority, epochs/chunk manifests, saved before-images, prepared commit and catalogue publication; Deploy field-store projections/deltas/receipts/journal boundaries and save-response consumption; Layout head/snapshot/staging/publication and public worker cache/polling; shared Sheets I/O, transport timeout and worker read coalescing.

Not verified here: live production configuration, backend telemetry, actual simultaneous Apps Script execution/lock wait, direct spreadsheet edits by other tools, every business-rule calculation, all geometry/rendering code, complete PDF/Excel export correctness, every authentication branch, and end-to-end browser behavior on managed school devices. A claim that all GSiS code is exhaustively reviewed or that production latency is solved would exceed this evidence.
