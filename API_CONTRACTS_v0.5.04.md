# GSiS v0.5.04 API contracts

Write protocol remains 500. Existing private authentication, ownership, writer locks, optimistic conflicts, immutable retry payloads, receipt authorization, publication review and Layout ownership contracts remain. This document records changes from `API_CONTRACTS_v0.5.03.md`.

## Deploy and teaching rules

Narrow `change` operations carry the same request identity and expected values. Supported non-destructive Load Settings, Offload, HR Terms, Membership, Fortnight and RO paths load the union of their actual document dependencies. Destructive Load Settings changes and operations needing assignment-wide validation retain the full edit projection. Journal application and final index publication remain durable boundaries. Per-root read/view ranges are internal index metadata, updated with the transaction. Older indexes conservatively read enough source to build complete metadata; a note-only read cannot install an incomplete root index.

An exact duplicate request is accepted only after matching request ID, actor and payload digest under current authorization. Its confirmation can precede draft loading. Receipts remain read-only. Notice acknowledgements and version-note changes use indexed projections while retaining notice/version checks.

Offload schema remains 2; `roleOverrideSchema: 1` records completion of the one-time default migration. A matching explicit `Role` percentage replaces the general appointment percentage, including its acting rate. `0` is a configured override; an empty percentage is not. Employment factors, independent rules and caps retain their treatment. The HOD SM 50% default is installed only when the migration marker is absent and no matching role rule already exists. Deletion is durable because subsequent migration sees the marker. Existing duplicate-role validation and editing permissions apply to future catalogue roles.

Committee groups use `leadershipSchema: 1`. Their first four slots are HOD i/c, SH i/c, OIC and 2IC, each independently optional. Migration retains old members after those slots and stores ambiguous prior Head/Deputy occupants in `legacyLeadership`. Membership validation and Contacts publication include these retained occupants. A fresh version copy clears inherited people as before.

## Contacts viewing, saves and diagnostics

A pending/degraded viewing result includes `authoritative: false` and its existing `viewState`. Current access checks remain live. Deploy rejects such data when it requires an authoritative staff snapshot; display-only and authority-only requests retain their respective contracts. Unknown partial data is not promoted into the authoritative directory.

Initial journal payload persistence completes before the pending pointer is installed. A failed write cannot deliberately publish a pointer to an unacknowledged payload. A retry that finds an intact original pending journal reinstates its pointer before the contact commit. With Sheets API enabled, the complete contact changes, reserved IDs and Applied marker remain one final values request, including commits larger than the shared helper's normal range batch. No automatic native fallback or write replay follows an API error. Native fallback retains its explicit durable stages.

Error references report a sanitized category (`protected-range`, `permission`, `quota`, `timeout`, `service`, `validation` or `unknown`), operation, service mode, phase and request reference. Raw Google error text and cell values are not returned as diagnostics. Shared service counters and named opening/marker phases are diagnostic metadata, not new success semantics.

`inspectContactsWriteAccess504(requestId?)` is an editor-only, read-only diagnostic. It uses the same write planner as saves, checks planned ranges with `Range.canEdit()`, and reports the actual Apps Script execution account separately from the original app actor and current app Admin status. It identifies capacity needs without expanding sheets. It does not change protections, grant Admin access, impersonate the actor or recover a save. No public route is added. Existing recovery still requires current app Admin authorization and the original durable payload/digest.

Recalculate limits formula removal to Subject Modifier, Mobile No and defined derived Contacts fields. Backups, history and unrelated worksheets retain their formulas. Direct contact saves and publication approvals use the same alias-domain validator.

## Gateway and browser deadlines

Contacts read requests have a 45-second gateway deadline; the browser cold-read attempt is 50 seconds within a 52-second total budget. Save-receipt gateway attempts have 8 seconds; browser receipt attempts have 12 seconds within a 27-second confirmation window. Existing save budgets remain. A read retry starts only when a full attempt fits. Both headers and response-body consumption must complete within the attempt deadline. Earlier diagnostic references remain available after retries. Mutation requests are not automatically replayed by this transport change.

Authentication responses apply only to the session/credential that initiated them. Successful account changes clear personal caches and profile state. Pending immutable requests and dirty DIY edits are retained until explicitly resolved or discarded. FT-dependent filtering/export is unavailable when its teaching source cannot be loaded.

## Layout reads and maintenance

A verified v0.5.04 head descriptor (`verified504`) with a matching public cursor can return unchanged using the pointer and live handoff status. Older/unverified heads and changed reads still verify snapshot chunks, checksum, shape and marker consistency. A snapshot is marked verified only after successful storage validation; the shortcut never validates an arbitrary caller-supplied snapshot.

A confirmed identical store retry verifies immutable content but does not rewrite the editable mirror. Completed matching handoffs likewise avoid repeating mirror/publication writes. Explicit `repairLayoutTables501(year)` remains available when mirror reconciliation is requested. Mirror updates read existing tables and write only changed contiguous rows plus required metadata; deletions clear excess rows. Owned Admin validation reads are reused under the writer lock.

Layout's public allowlist, year-separated ownership, frozen publication handoff, prior-head fallback and restricted editor maintenance remain. No personal Contacts fields are added to Layout. The retired venue-rename route remains retired.
