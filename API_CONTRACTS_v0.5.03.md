# GSiS v0.5.03 API contracts

Write protocol remains 500. The v0.5.0 private Deploy/Contacts authorization, conflict, receipt, recovery and review contracts remain. Personal Contacts fields are not imported into Layout.

## Owned Layout read

Layout's existing GET /api/public/campus now forwards the signed publicLayout action to the Deploy Apps Script project. Hosting that adapter in the existing project does not make Deploy the display store: this read opens only the configured Layout workbook and its verified snapshot. It does not read Deploy drafts, the Deploy index, or source documents.

Optional year selects a configured year; otherwise Cloudflare LAYOUT_YEAR, the Deploy Script Property LAYOUT_YEAR, or 2026 applies. Optional since is the Layout revision. Unchanged responses include unchanged=true, cursor and current handoff status. Changed reads return a complete snapshot; no cross-revision partial delta is exposed.

Public schema remains 2 and modelVersion remains 1.1.0. New fields are repository=layout-current, layoutYear, layoutRevision, layoutState, publication, sources, reviews, otherTGStatus and handoff. deploymentVersionId is genuinely null for the initial source import. deploymentRevision is 0 until a matching Deploy publication is copied. registryRevision and cursor identify the owned Layout revision.

Venues, classes and groups contain only active display records. Venue allocations refer to stable Layout target IDs. Classes include source code separately from their ID. TGs include code, subject, level, teacherLabels, programmes, pupilCount/pupilCountText, breakdown, countRows, sourceVenueText, sourceLocator, publication and owned units. A count discrepancy is evidence to review, not an automatically corrected value. Source programme counts can overlap.

The public allowlist excludes private staff profiles, phone/email fields, planner notes, draft documents, audit records and load calculations. Existing publicCampus remains the frozen Deploy projection for older clients and Deploy's own behavior.

## Durable ownership and publication

LAYOUT_REPOSITORIES is an optional JSON map from year to owned workbook ID. The default 2026 ID is 1SzoUIR57eAAtXWcjCiVfiv08dpk72xhPkjd60CKhYAU. A later year's first explicit publication creates a separate owned workbook under the script owner's account. A workbook already assigned another year is rejected.

layout_snapshots is append-only chunk storage. layout_index contains one year and a verified head descriptor: year, revision, chunk row/part count, SHA-256, publication and prior revision. Public reads validate chunks and marker consistency. A head changes only after all chunks, readback and editable projections are complete. layout_staging reserves one chunk range per revision, so interrupted transfers resume the same range. Old snapshots and inactive records remain.

Deploy's existing transaction journal records layoutHandoff intent as part of explicit publication. The handoff uses the frozen published entry, never a later draft. Its source year must be unambiguous in the version name/year/dates. Ambiguous or missing years produce needs-year and preserve the existing Layout copy. Transfer failures produce pending, retain the last verified head and return a review/retry message. A retry of the original publication or retryLayoutPublication501() resumes without duplicate records or snapshots. A Contacts callback failure leaves the same journaled Layout intent available for the publication retry.

Initial 2026 preparation verifies the existing native owned tables against the authorized source seed. A 2026 publication cannot bypass that preparation and overwrite MTL with an empty baseline. MTL groups not present in the matching published Deploy document retain their source definitions and allocations. Exact matched MTL code/level/subject identities receive explicitly published venue updates while retaining MTL pupil and teacher evidence. Other TGs take their definitions, teacher labels and allocations from the published document. Names are not guessed into Contacts Staff IDs.

## Admin and venue edits

prepareLayoutRepository501(), saveLayoutAdmin501(year), repairLayoutTables501(year) and retryLayoutPublication501() are editor-only maintenance functions. No unauthenticated write action is exposed. Finish a pending publication before committing further owned Admin edits. Native Admin edits to Active and TG teacher/pupil/programme/review fields require saveLayoutAdmin501() to commit a new owned snapshot. IDs and source/published venue columns must remain intact. Physical row deletion is rejected; mark Active N.

GET/POST /api/unit/rename returns 410. The private renameCampusUnit action also rejects new changes. Edit venue allocations in Deploy and explicitly publish. An older interrupted rename may be completed only through the restricted editor recovery helper; completion saves a draft and does not automatically republish.

## Model identity

The existing GSIS_LANDMARK.connect({lookupUnit,versionId}) contract remains for Deploy. Layout uses connect({lookupUnit,layoutRevision,publicationVersionId}). getStatus() reports its Layout revision separately from the real nullable deploymentVersionId. Lookup results must match both the Layout revision and actual publication identity; stale responses are discarded.

## Contacts viewing during a pending save in v0.5.03

GET /api/bootstrap succeeds for an authorised school account even when a Contacts save awaits recovery. Directory reads do not acquire a writer lock, perform a recovery write or require a warm browser cache. The signed bootstrap, data, DIY, membership, sysFields and relevant Deploy snapshot read paths use the selected viewing source. Current identity and role checks still apply to each action; a saved display source never grants access.

A response with a pending save includes viewState with pending=true, source, asOf and hiddenRecords. source is saved for the verified prior source copy, legacy when only unaffected current identities can be shown, backup when a suitable existing backup supplies the fallback, or unavailable when a damaged legacy journal has neither an intact viewing source nor a usable backup. The unavailable state keeps sign-in available and returns an empty contact view with a repair notice; it does not expose unknown partial values. asOf is the source timestamp when available; it can be empty for a legacy source. hiddenRecords reports affected identities temporarily excluded from the legacy display. Responses without pending state omit viewState. Authoritative data/DIY reads without this property clear the frontend's previous pending display state.

A new journal's viewing copy contains the prior Contacts, roles and optional sys_fields source. Its metadata binds schema, request ID, part count, encoding and digest. Chunks support gzip when available, with JSON fallback. Stored access or role privileges are not trusted: admin_users and authenticated identity remain current. Malformed viewing metadata is not treated as a valid snapshot.

During pending state, data objects with an editable property return editable=false. Ordinary staff can browse, filter, copy and export the directory; the frontend does not request their private recovery payload. Current Admins get a collapsed recovery panel inside the workspace. Refresh preserves local drafts and the original pending request. An unfinished new record is not exposed as a completed contact.

Legacy pending requests do not acquire a fabricated snapshot. Identifiable affected Staff IDs are temporarily hidden, leaving other contacts available. A valid existing backup may supply a fallback for a damaged legacy journal. This is a declared degraded viewing source, not a claim of the latest complete directory.

## Contacts save, receipt and recovery

POST /api/save-data and /api/save-diy preserve request IDs, immutable payloads and optimistic expected values. All sheet metadata, capacity and fallback ranges are prepared before the first durable API write. With Sheets API enabled, a new ordinary save writes the original journal with its before-image, then writes all contact ranges, new Staff IDs and Applied together in one final API request. This final request bypasses shared 100-range batch splitting. Pending recovery combines audit fields with the same complete final commit. Native fallback instead retains its durable identity reservation stage before contact fields and Applied.

The pending index is cleared only after completion succeeds. A lost reply does not imply that a request failed to commit. No automatic native fallback or mutation replay follows an API error. The journal and receipt remain authoritative for the next retry.

POST /api/save-receipt forwards saveReceipt and accepts requestId with an optional reviewed digest. It returns saved, pending, writing and requestId. The original actor may confirm its own request; another caller must be a current Admin and supply the matching digest. Payload, identity, digest and journal status are verified. Receipts do not expose partial directory values.

POST /api/recover-save accepts only requestId and digest. It replays the original durable changes/additions and actor under the same writer lock, with current Admin permission and conflict checks. CONTACTS_BUSY remains a structured 503 after a short lock attempt. CONTACTS_RECOVERY_REQUIRED remains relevant to blocked mutations; it is no longer a normal bootstrap or directory viewing response solely because a save is Pending. Validation, conflict and integrity errors remain distinct from an unconfirmed service failure.

GET /api/data retains optional groups and formalRole per row, alongside values/computed, existing validation choices and current Admin/KP access. These fields keep confirmed grid and directory profiles aligned. A fresh data read restores editability when recovery is complete and the current user is permitted to edit.

prepareContactsPerformance503() and recoverContactsSave503() remain editor helpers, not unauthenticated API actions. The preparation helper reports the installed release and API readiness without requiring a clear journal. Recovery requires the executing school account's current Admin access and one intact pending request. Browser confirmation polling remains bounded and rejects results from a changed session.
