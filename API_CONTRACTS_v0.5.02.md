# GSiS v0.5.02 API contracts

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

## Contacts save and recovery in v0.5.02

POST /api/save-receipt continues forwarding saveReceipt and accepts requestId with an optional reviewed digest. It returns saved, pending, writing and requestId. It bypasses ensureContactsReady_ and never exposes partial directory data. The original actor may read its own receipt; another caller must be a current Admin and supply the exact digest. The stored payload and journal status must be valid. Unsupported request keys are rejected.

POST /api/recover-save accepts only requestId and digest. It replays the original durable changes/additions and actor under the script writer lock. Current Admin permission is checked again. CONTACTS_BUSY is a structured 503 response after a short lock attempt. CONTACTS_RECOVERY_REQUIRED remains a structured 503 that does not trigger an automatic Contacts read retry. Validation/conflict/integrity responses are distinct from unconfirmed service failures.

POST /api/save-data and save-diy keep their original request IDs, immutable payloads and optimistic expected values. New IDs are reserved before field writes. The Applied marker is included after Contacts patches in the final bounded write batch and cleared from the pending index only after that write succeeds. Journal digests are checked for both recovery and ordinary same-request retries. No fallback or mutation retry occurs after an API error.

GET /api/data returns optional row groups and formalRole from the current role catalogue alongside values/computed. This lets late receipt confirmation update directory rank groups and profiles while keeping the Data grid editable. It retains current Admin/KP access, editable flags and computed-field protections.

prepareContactsPerformance502() and recoverContactsSave502() are editor functions, not unauthenticated API actions. The latter requires the executing school account's current Admin access and one intact pending Contacts save. Browser confirmation polling is bounded and discards results from a changed session.
