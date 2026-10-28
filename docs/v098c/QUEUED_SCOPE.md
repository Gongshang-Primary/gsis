# GSiS 0.9.8c queued scope

Status: implemented for the 0.9.8c component patch. This document retains the investigated requirements; PLAN.md and the release changelog record the final implementation choices.
Baseline: 0.9.8b, commit 3f92305d99cd27289d16cbd9a21325979f08690c.
Recorded: 27 October 2026, Singapore time.

## Requested outcome

Stapler must keep an open planner in place. Background checks must not close it, reopen the date list, replace its working plan or erase its selection, scroll, undo history or local edits. Store compressed baseline and suspended timetables individually on Cloudflare, covering the next 30 days. After Stapler saves or baseline changes, replace affected cache entries and prune obsolete copies. Perform editing and display work locally. Route authenticated reads and saves through the existing Workers gateway with concurrency checks and retry protection.

## Findings from 098b

1. roster.js checkFreshness runs each minute. A changed profile revision, selected baseline or date can call load, which unmounts all viewports before rendering again.
2. RosterStaplerUI.isDirty protects unsaved edits, pending saves and busy state. It does not protect an open saved planner. Render without initialDate opens the date list. Executing the actual checkFreshness function with a changed register revision reproduced a shell reload for an open clean planner and no reload for an unsaved planner. This proves a code path, not which production event caused the reported incident.
3. Stapler's scheduleLease currently stops its timer. The reproduced route is the shell freshness timer, not a Stapler lease renewal timer.
4. Timetable batches already support compressed parts, source hashes, individual baseline model keys, suspended date keys and client deltas. Reuse these contracts.
5. The legacy timetableSnapshot path can cache complete authorised batch responses in R2. Its request key includes client delta keys, so it is not a canonical independent object store for each timetable.
6. The newer TimetablePackageStore and R2 cleanup are tied to D1 operational ownership. Recovery forces legacy ownership. Do not enable D1 ownership to gain caching or cleanup.

## Design decisions for implementation

Google remains the authoritative operational store. Cloudflare R2 holds disposable derived data. The existing D1 binding may hold cache indexes, bounded repair work and deletion metadata only. No migration of Roster or Deploy ownership, new Worker, new queue service or public bucket is in this scope. Existing bindings must be checked during installation; their presence in source does not prove they are configured in production.

Interpret the window as today plus the following 30 calendar days in Singapore, matching the existing 31 date batch contract. This is a stated implementation assumption. Dates beyond the window continue to load on demand and remain editable; they are not deleted from Google.

### Planner continuity

Add an explicit active planner guard to the shell. Apply it before a freshness request and again after its asynchronous response. Protect the planner even when its dirty flag is false. A background change may update a small status notice, but cannot call load, unmount, renderWorkspace or loadDates for that planner. Opening another date, leaving the planner and explicit Refresh remain deliberate actions. Preserve current local recovery persistence and save receipt identities.

Keep access checks. An expired session or revoked permission must prevent protected reads and saves. Retain recoverable local edits where permitted, show the access problem and offer sign in or recovery export. Never treat cached roles as fresh authority. Routine connection failures must not reset the planner. Delayed responses from a prior date, session or view must be discarded.

### Individual compressed cache objects

Use immutable objects identified by verified content hashes in a new, versioned cache prefix. Each unique baseline model is compressed once. A small per date manifest maps each date to its applicable baseline object. Do not store 31 identical baseline copies. Each suspended date has separate saved draft and confirmed object references and revisions. An unchanged confirmed plan remains unchanged when its draft is saved.

The authorised manifest contains only the parts permitted for the requesting identity. Teachers get permitted confirmed data; SMC and explicitly authorised planners may get draft data. A cache key or object hash never grants access. Keep R2 private and serve through authenticated Worker routes. Draft plans, medical details, absence reasons and private staff fields must never leak through teacher or Venues projections. Venues gets a distinct permitted occupancy projection, including staff names where authorised.

The browser keeps verified parts in memory and IndexedDB. It decompresses only new parts, builds views locally and sends known hashes when checking for changes. Fetch only missing or changed objects. First open, explicit refresh, successful relevant saves, another tab's local invalidation and subsequent use of an affected date are useful check points. An unchanged source must produce no timetable body download. No timer may force an active planner redraw.

### Saves and cache replacement

Keep Save to online and Confirm separate. Save changes the saved draft; Confirm changes the approved timetable used by downstream consumers. A baseline upload or edit invalidates only dates whose selected baseline or content actually changes. Move, delete, restore, reset and reconfirm operations must also update affected date references and remove obsolete manifest entries.

For Stapler, send changed records or fields, their expected base values or revision, and a stable request ID. The backend still validates permissions, structure and conflicts. Disjoint edits can use the existing merge rules; competing edits must return a comparison. Never silently overwrite another planner. Retry a lost response with the same request identity.

Commit the authoritative command first. Then prepare the new compressed affected objects, verify their hashes and sizes, and publish a complete cache manifest only if it still matches the authoritative source revision. An older build must never replace a newer manifest. Mark the superseded cache generation unusable as current immediately; remove its physical objects later when safe. Never delete the last usable object before preparing its replacement.

Cache publication failure must not turn a confirmed business save into a false save failure or duplicate the save. Return separate save and cache states. Persist bounded cache repair intent where practical, and repair a missing object on an authorised read. Reads must validate the authoritative source revision before calling cached data current; source validation failure means unavailable or explicitly previously verified data, never an unqualified current result.

An R2 cache and a Google save cannot be one cross service transaction. Atomic means the existing authoritative command, the conditional publication of a complete cache generation, and safe retry semantics at each boundary. Surgical means changed command payloads, changed date metadata and changed compressed objects. The current Google adapter may still rewrite its operational document internally. This patch must not claim physical row updates to Google storage; that would be a separate storage redesign.

### Refresh and pruning

Trigger bounded cache preparation after relevant confirmed writes. Reuse the same source hashes across repeated users and retries. Baseline replacement may affect several dates. The final recovery implementation uses bounded post-save preparation and repair on the next authorized read, without a new durable repair queue or minute cron lane. An interrupted cache preparation never changes the authoritative save result. Rolling-window source checks prune obsolete references and reuse unchanged part identities.

Use the existing scheduled infrastructure for bounded daily cleanup; retry missing cache preparation on demand. Keep cache housekeeping independent of the auto allocator and WhatsApp lanes. Scope cleanup strictly to the new generated cache prefix. Do not delete uploads, archives, inbox media, operational records or objects belonging to another cache format.

Recommended retention: retain live references and objects used by in progress publication; apply at least 24 hours of grace to unreferenced superseded objects. Before deletion, prove the object is still unreferenced and exclude a concurrent publisher through a deletion fence or equivalent publication rule. A corrupt manifest, failed reference check or uncertain ownership must cause cleanup to skip the object. Cleanup uses bounded pages and compact metadata, with dry run counts and recorded outcomes.

## Acceptance checks

### Added changelog: recess moves across time, fixed to class

User clarification: recess stays attached to its original class row. It must move freely across valid time periods, either as an individual class tile or as one tall cohort block. Moving recess between class owners or swapping class ownership is not required. This resolves and supersedes the earlier cross class question.

Allow a purple recess tile in Card Pit to be placed on its own class row at a chosen period. Allow a placed class recess tile to move horizontally to another period. Allow a tall cohort block to move horizontally with all member classes together. Class identity and recess duration remain unchanged. A grouped display must still provide a clear way to move one class independently; moving one class must not silently move the cohort. Regroup compatible aligned tiles when appropriate without forcing independently placed classes back together.

The existing model rejects recessMove for a Pit tile with "Choose a placed recess card." This restriction must be corrected. The restriction preserving a recess tile's original class is consistent with the clarified requirement and should remain. The implementation must support individual movement even when aligned class tiles are displayed as one tall block.

Keep one recess marker per applicable class. Respect timetable boundaries and preserve duration. Do not silently delete overlapping lessons or staff duties. Make conflicts and any displaced lessons visible. Preserve undo/redo, retain edits locally until Save to online, and keep the separate Confirm step and cache invalidation rules.

Additional regressions: place the screenshot's Pit marker on its own class row; move a single class tile across periods; move one class independently from a grouped block; move a whole cohort block; reject a change of class ownership; handle period boundaries, differing durations and overlapping lessons; undo/redo; save, reopen and confirm; verify downstream timetable and cache projections.

### Added changelog: System Health header link and email failure clarity

Style the Roster System Health link to match its adjacent header buttons: height, padding, border, radius, font, hover and keyboard focus. Preserve link navigation semantics. Show the header link only when the verified current user is Admin. SMC without Admin must not see it. The user requested link visibility; do not silently change the separate System Health endpoint authorisation policy as part of this cosmetic/navigation change.

The supplied status screenshot shows three saved absence receipts awaiting processing/review, zero colleague proposals awaiting receipt review, and repeated colleague email JOB_FAILED history entries. These are different measures. Zero proposal review receipts does not prove an empty peer email queue. Each minute can record the same blocked or uncertain email as another failed cycle. An uncertain email is deliberately not automatically resent.

Current 098b System Health is read only. Its recent failures are not cancellable queue items. The WhatsApp delivery review cancellation operation does not manage peer email. There is no existing peer email pause switch or user facing per email cancellation action in the inspected recovery paths. Pending proposals that become obsolete are reconciled by peer mail sync, but changing an absence or relief assignment just to suppress an email is not an appropriate cancellation workaround.

Operational follow up: inspect the latest roster-peer-mail-drain log and its sent, blocked, uncertain and pending counts before deciding whether the problem is an unsent invitation, an unresolved provider outcome or a service failure. A future email management action must distinguish cancelling provably unsubmitted mail, resolving an uncertain outcome after checking with the recipient, and dismissing failure history. Never resend or erase uncertain receipts to clear a status panel. This investigation does not cancel any live mail or modify a proposal.

### Full patch checks

1. A saved or edited Stapler planner survives repeated timer ticks, register changes, midnight rollover and delayed profile responses without unmounting.
2. Local choices, selection, scroll and undo survive background changes; explicit review remains available.
3. Unchanged source checks fetch zero timetable object bytes; editing, searching and moving tiles make no timetable requests.
4. One changed suspended date replaces only that draft object and its manifest references. Confirm updates the confirmed version separately.
5. Baseline upload changes only affected baseline and date references; suspended plans needing reconfirmation are not served as current confirmed plans.
6. Concurrent saves merge safe disjoint changes and surface conflicts; a response lost after commit retries once without duplicate writes.
7. A stale build, interrupted upload, missing object or failed manifest publication cannot expose a partial or incorrectly current generation.
8. Role changes and planner grant changes cannot reuse broader cached authority. Teachers and Venues never receive draft or private fields.
9. Cleanup cannot remove current or in flight objects; deletion races and corrupt metadata fail conservatively.
10. Warm cache reads, cold reads and saves are measured separately. Report actual transferred bytes, source calls and timings without promising an unmeasured speed increase.
11. Auto allocation, absence intake, relief assignment and WhatsApp regressions pass unchanged.

## Delivery sequence

First fix and test planner continuity. Then implement independent parts and source validation. Then add changed date save payloads, bounded cache replacement and pruning. Run failure and concurrency tests before preparing a versioned deployment package. Do not enable the former 097 migration as a shortcut.

## Technical references

Cloudflare R2 consistency: https://developers.cloudflare.com/r2/reference/consistency/
Cloudflare R2 Worker API: https://developers.cloudflare.com/r2/api/workers/workers-api-reference/
Cloudflare D1 transactional batches: https://developers.cloudflare.com/d1/worker-api/d1-database/

R2 is strongly consistent for object operations. Concurrent unconditional writes to one key are last writer wins. D1 batch transactions apply to their D1 statements, not to Google or R2 writes. Use this distinction when implementing the publication and deletion protocol.
