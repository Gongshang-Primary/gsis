# GSiS v0.4.03 API and storage inventory

A full load establishes a fresh authorized resource baseline. A soft load uses an accepted cursor. Writes validate the current actor and expected values and commit dirty cells. The browser preserves pending edits and rejects reads begun before a newer edit/session. No staff draft is placed in browser persistent storage.

| Surface / route family | Call chain and contract |
| --- | --- |
| All `/api/config`, session/logout | Worker configuration or verified session cookie only; no business snapshot. |
| Deploy `bootstrap`, `sync` | Worker → Deploy → Contacts authority/catalogue → selected version. UI full loads send `full:true,freshContacts:true`; all authorized current-version data, plus version summaries. Legacy cache-key reads remain compatible but are not used for full reload. |
| Deploy `delta` | Fresh Contacts role check → Deploy index → at most 32 ordered transaction deltas. No-change reads only index metadata. Private receipt/author fields are removed; KP audit data is excluded. Invalid/old cursor or role change returns `resync`. Teacher views use the frozen published revision, return empty deltas while unchanged and establish a fresh authorized baseline after a new publication. |
| Deploy `receipt` | Fresh role check, selected version, matching request ID and actor. Returns committed/pending state, not a business snapshot. Pending journal is resumed first. |
| Deploy `change:saveDraft` | Stable scalar edits, or field patches for groups, Duty, Membership and HR Terms. Expected-value validation and existing conflict policy run before commit. Edit index excludes historical audit leaves and geometry. Writes only changed field values, appended fields/audit/receipts, affected index rows and revision/journal metadata. Returns compact acknowledgement; separate delta updates the display. |
| Deploy `change:metadata`, load/legacy cell operations | Current resource permission and revision/lease checks. Same field-store persistence. Metadata and explicit batch/cell compatibility acknowledgements are compact. The current UI uses saveDraft for ordinary cell edits. |
| Deploy create/duplicate | Explicit new version: creates its own stable fields, retains source isolation, records actor-bound creation receipt. Subsequent initial load establishes the new version baseline. |
| Deploy delete/purge | Explicit administrative removal of requested version/history; unrelated version fields are not rewritten. Delete chooses a new authorized baseline. Purge is a deliberate history operation. |
| Deploy publish/review/accept Contacts | Full authorized review of affected staff/version and directory uniqueness dependencies. Approved staff changes go to Contacts; publish creates an immutable public version, then reconciles catalogues. These structural authority changes establish a fresh client baseline. Retry completes cross-service synchronization under the original publication ID. |
| Deploy lease | Small current authority/resource/lease metadata check. Release updates lease metadata only. |
| Deploy `active` → Contacts `deployment` | Complete published assignment, workload, subject and group-membership projection on explicit Contacts load/retry. Planning versions are excluded. Contacts has no automatic full-directory polling. |
| Deploy publicCampus / Layout `/api/public/campus` | Full load returns public-only campus projection. A matching cursor returns an unchanged marker. The previous publication cursor receives field additions/changes/deletions from the publication journal. Older/legacy cursors explicitly resynchronize. Public payload contains no teacher/contact information. |
| Deploy `landmarkUnit`, `landmarkSearch` | Authorized selected-version/unit/search scope, under existing published/private visibility rules. Explicit requested reads, not background document polling. |
| Layout `profile` | Current Admin/KP role and any pending rename metadata. |
| Layout unit rename | Stable unit and expected registry/version checks; durable intent precedes register writes. Only Unit number/Block/Level and genuinely affected venue/allocation references change. Original request resumes interruption without repeating business effects. Publication creates a fresh public manifest. |
| Deploy live ticket, map and reference asset authorization | Worker → lightweight `access` action checks roles/version visibility without materializing a full version. Static assets contain no contact records. Live events request a delta; they do not contain staff data. |
| Contacts `bootstrap` | Fresh directory, access summaries and role-derived groups. Per-request cache only; published teaching information loads separately. |
| Contacts `data`, `diy`, read-only admin resources | Fresh permitted table/profile and validation choices. DIY exposes only its allowed record/fields. Retired catalogue editing routes return an error directing editing to Deploy. |
| Contacts `save-data`, `save-diy` | Staff ID + field + expected/value. Validates complete-directory uniqueness and affected derivations; patches only dirty physical cells. Durable original-ID journal. Compact changed-row projection includes derived values/groups. Duplicate/uncertain response is confirmed through save-receipt. |
| Contacts `save-receipt` | Request-ID key lookup and matching actor/status only, without reading stored request payloads. |
| Contacts `kp` | Admin-only expected access-record version; preserves Admin rights. Dirty access cells only; returns the changed access record. |
| Contacts `recalculate-data` | Explicit Admin maintenance operation over all contacts. Compares derived fields and writes dirty values; formula migration touches formula cells only after backup. Returns that requested data scope. |
| Signed Contacts `deploySnapshot` | Authority-only for small authenticated operations; complete fresh dependencies for full loads/reviews. Deployment role resolution uses version-owned Membership. |
| Signed Contacts `deployPublishReview`, `approveDeployTeachers` | Reviews selected teacher proposals against current Contacts. Dirty approved cells only. New rows reserve Staff ID before subsequent field writes; journal permits per-field expected/desired recovery. |
| Signed Contacts `applyDeployCatalogues` | Stable role and field/value keys preserve existing physical rows. Adds changed/new rows, clears removed rows, and batches only dirty cell runs. Durable journal precedes cross-table writes. Pending publication recovers before later reads. A newer revision rejects an older retry. |
| Editor-only helpers | preflightFieldStore, migrateFieldStore, recoverFieldCommit and prepareLegacyRollback; explicit administrative scope described in DEPLOYMENT.md. No frontend route exposes them. |

## Commit consistency and limits

Deploy journals dirty blocks before setting a pending marker. Field writes finish before the committed index replaces that marker. Readers check index revision before/after field reads and refuse a pending state. Frozen published snapshots are independent of later drafts. Contacts pending journals block unrelated reads; request epochs detect changes during composite reads.

Metadata keys and validated dependencies still need reading on writes: directory-wide uniqueness, current teacher eligibility, load interactions and stable field addresses cannot safely be inferred from a browser draft. Ordinary Deploy writes use a dedicated edit index, so historical audit leaf addresses/values are excluded. Full snapshots, explicit publication, migration and rollback intentionally process their complete requested scope. Audit and journal retention remains append-only unless an explicit administrative purge applies.

The newest 32 working-version revisions support incremental merge. Public campus supports the immediately previous publication cursor. A cursor outside these windows requires a declared full resync. These are explicit transport contracts, not hidden full-snapshot soft responses.

The current ordinary UI uses field patches. Compatibility-only batch/cell operations are retained for existing internal callers with compact acknowledgements; old frontend writes are blocked by protocol 402 at the signed Deploy entrypoint. Service-level timing and production quotas are not simulated by local tests.

## Independent version notes

Deploy change operation `saveVersionNote` accepts versionId, notes, expected, requestId, issuedAt and clientId under protocol 402. Admin or KP only. It saves only the addressed note, audit event and retry receipt; it does not load a client version, save planning drafts or publish to Contacts. Up to 4,000 characters, including empty. Stale expected values return 409; another editor’s metadata lease returns 423. Actor- and payload-bound receipts make uncertain retries idempotent. Response: saved, versionId, requestId, notes, revision. Published snapshots remain immutable until explicit publication.
