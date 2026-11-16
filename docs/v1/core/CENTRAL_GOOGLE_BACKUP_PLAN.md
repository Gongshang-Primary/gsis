# Central Google backup file service

Model: Codex. Design only, 16 November 2026. Claude reviews the exact documentation head. [Claim](../../coordination/tasks/v1-quiet-mode-central-google-backup.md); source baseline `404fe6d043e7c22eba2a3070cbfdbedb544112cd`, accepted design claim `2f9095e9ac0ada32c548ea9f922c7a6a3859c3fa`. No implementation, Apps Script deployment, Drive access, credentials, backup activation or storage deletion is performed by this plan.

## Decision and boundaries

Use one Core-managed backup pipeline and one Apps Script file reader/writer for all GSiS Google backups. Each application still owns its D1/R2 records, consistent export and import rules. Core coordinates export jobs, destination mappings, file identities, retries and System Health. Apps Script only reads/writes bounded files beneath [the owner's GSiS v1 folder](https://drive.google.com/drive/folders/1HJDMM-_88cuKwL7-HyQO08pgeAdEtb3k).

The owner's 16 November instruction changes the backup transport prescribed by E07 and section 11 of the [accelerated implementation specification](../accelerated-delivery/GSIS_V1_ACCELERATED_IMPLEMENTATION_SPEC_2026-11-13.md). This is a narrow exception for asynchronous backup/file recovery. Normal application reads, saves, allocation and publication remain native Workers/D1/R2 operations. Google login, Google Calendar synchronization, provider delivery and the v0.9 system are outside this transport change. An Apps Script outage must never stop an ordinary operational save.

Keep one Apps Script source file, proposed `v1/integrations/google-backup/Code.gs`. Do not create a script per application or let browser forms call the script directly. This is an authenticated service for registered datasets, not arbitrary Drive access or an alternate application database.

## Existing contracts to retain

All references below were inspected at the source baseline; no hosted data or Google folder contents were inspected.

| Existing source | Consequence for this design |
| --- | --- |
| [`drive-backup.mjs`](../../../v1/runtime/drive-backup.mjs) | Already uses the approved root, Singapore dates, stable file IDs, byte verification, conditional same-day replacement and an 8 MiB file bound. Preserve these guarantees when moving Google I/O into Apps Script. |
| [`drive-backup-jobs.mjs`](../../../v1/runtime/drive-backup-jobs.mjs) | Each owner currently schedules its own two-dataset batch, retains pending file identity and detects the 23:50 check. Replace transport/orchestration deliberately; do not let both schedulers write the same dataset. |
| [`drive-backup-data.mjs`](../../../v1/runtime/drive-backup-data.mjs) | Existing owner projections distinguish importable workbooks from recovery-only files. Preserve explicit schemas, source bounds and privacy exclusions. Core currently has no readable dataset; declaring a central service does not fill that gap. |
| [`backup.mjs`](../../../v1/runtime/backup.mjs) | Full owner backups and isolated restore are different from readable exports. They retain schema, object hashes, receipts and recovery uncertainty; suite snapshots are not cross-database atomic. |
| [`reign.mjs`](../../../v1/services/lord/reign.mjs) and [Storage Toolbox](../accelerated-delivery/STORAGE_TOOLBOX.md) | Verified archives and exact cleanup controls remain required. A daily spreadsheet is not permission to delete authoritative D1/R2 records. |

Reuse the existing owner export builders and importer schemas. Introduce a Core job catalogue and a transport interface, not a second spreadsheet serializer or a new operational store. Existing per-owner pending rows remain recoverable during transition.

This routes every registered **Google-bound** backup through the central adapter. It does not automatically upload every full R2 database snapshot to Drive: those snapshots can contain security/recovery records excluded from readable exports and have larger size contracts. A new Google dataset for such material needs an explicit owner-approved export/privacy contract and bounded recovery format. Existing Google-bound REIGN archives retain their current approved content and verification rules.

## Folder and file organization

Persist folder IDs after verified setup; names are display labels, never authority. Apps Script must verify the registered folder's ancestry under the approved root before each operation. Ambiguous duplicate folders require repair instead of choosing the first name match. Do not recreate or traverse arbitrary caller-supplied paths.

| Logical application | Planned directory below the approved root | Contents |
| --- | --- | --- |
| Core / Global Admin Toolbox | `Core/<dataset>/<year>/` | Safe account/access configuration reports and backup manifests. No session tokens, credentials, bearer links or raw authentication evidence. A Core report is not an account/grant import endpoint. |
| Contacts | `Contacts/<dataset>/<year>/` | Staff workbook using the current Contacts grid/import contract; separately labelled recovery records. |
| Deploy | `Deploy/<year>/<version-label-and-stable-id>/<dataset>/` | Current canonical planning workbooks and a separate version recovery file. Preserve per-sheet import limitations. |
| Roster | `Roster/<year>/<dataset>/` | Baselines, saved/confirmed timetable exports, absence/duty/history reports and recovery artifacts. Reuse existing exports; unsupported imports stay explicitly unavailable. |
| Calendar | `Calendar/<year>/<dataset>/` | Events/setup exports, supported metadata imports and separate recovery records. |
| LORD, OVERLORD, STARLORD | `LORD/<year>/<dataset>/` | One LORD owner's inventory, reference lists, bookings and event history. The two additional viewports do not create duplicate authorities. REIGN archives and Wrapped outputs use a distinct archive dataset keyed by the REIGN operation. |
| Layout | `Layout and Venues/Layout/<year>/<dataset>/` | Existing year workbook and recovery artifacts. |
| Venues | `Layout and Venues/Venues/<year>/<dataset>/` | Venue catalogue, bookings and recovery artifacts, with importability stated accurately. |

Use the six existing top-level viewport folders shown by the owner; add `Core` for its own safe reports/manifests. Further subdirectories are deterministic registered mappings. No current child-folder IDs are guessed or claimed verified.

Default name: `2026 11Nov 16 — Contacts — Staff.xlsx`. Keep the Singapore date first. Add `hhmmss` only where an event-specific archive needs it; fix that timestamp when the operation is created so retries cannot create a different name. Display labels are sanitized and stable IDs disambiguate duplicate labels.

The logical file key is `(school, owner, dataset, format/part, Singapore day)`. There is at most one current file for that key; same-day changes replace its bytes at the same Drive file ID. XLSX and a necessary JSON manifest are different named files, not duplicate backups. Larger datasets may use explicit, stable partitions only when their export/import contract supports that partition; never silently truncate a workbook or invent an incompatible split.

Use XLSX for human-readable data wherever an existing useful schema exists. Retain JSON/binary artifacts needed for complete recovery and distinguish them in the manifest and UI. Every manifest records owner, schema/exporter version, source content identity, source observation time, creation/verification times, stable file IDs, MIME types, sizes and SHA-256 values. An unchanged read does not create a new source revision or backup.

Completed REIGN archives are immutable recovery evidence. A later daily export cannot overwrite an archive referenced by a cleanup receipt. Its event-specific dataset ID preserves the one-file-per-key/day rule while keeping that archive separate from the changing daily report.

## Ownership and service contract

| Boundary | Responsibilities |
| --- | --- |
| Application Worker | Produce a bounded consistent owner snapshot/projection; validate its schema; create and retain an immutable R2 export artifact and manifest; expose it only to authorized Core requests. Never write another owner's database. |
| Core Worker | Register datasets/folder mappings; schedule fair work; persist operation intent, current file ID and expected prior hash before an external write; authorize downloads; reconcile outcomes; aggregate System Health. |
| Apps Script | Authenticate the signed request; enforce root/school/dataset/file/MIME/size restrictions; serialize mutations; create/replace/read/inspect the specified file; return signed evidence of the actual result. No role acceptance, notification sends, SQL, allocation or arbitrary URL fetching. |
| Existing frontend import | Preview and validate the downloaded file through its owning application's current capability, revision and operation-ID checks. Reading a backup cannot grant acceptance or silently restore accounts. |

Use a versioned JSON envelope: `schemaVersion`, `schoolId`, `operationId`, `action`, `datasetId`, `fileId`, registered destination key, expected previous hash/generation, target hash/size/MIME/name, `issuedAt`, `expiresAt`, key identifier and signature. Uploads carry bounded base64 bytes; reads return bounded bytes plus metadata. Sign a canonical request hash and bind every semantic field, including the content digest. Responses bind the request hash, operation ID and actual result. Do not rely on custom HTTP headers reaching Apps Script; authenticate the POST body.

Actions are limited to `inspect`, `read`, `reserveFileId` and `put`. Folder creation belongs to a separately approved initial setup operation; there is no ordinary `delete`, `move`, sharing, script execution or arbitrary query action. ID reservation may return a different unused ID after a lost response, but **Core must persist exactly one chosen ID before any upload**. Retrying an upload never reserves another ID.

Use the existing separate v1 `GSIS_SECRET` to derive a purpose-specific backup signing key; only the derived key is held in private Script Properties. Do not give Apps Script the backend master secret or provider tokens. Core keeps the master in its existing protected secret binding. Key IDs support a controlled future transition without requiring token rotation now. The endpoint URL is nonsecret configuration; no keys, tokens or request signatures appear in URLs, browser code, reports or logs.

The proposed browser-only installation is one Apps Script project, owned by an owner-selected Google identity with access to the approved folder, plus the protected GitHub deployment configuration. Execute file operations under that identity. Availability of an appropriate Workspace web-app access setting must be verified before implementation/deployment is scoped; signing does not bypass Google's organization policy. No new credential or identity is requested in this planning task.

## Durable writes, concurrency and restart

Core uses explicit job states: `queued → exporting → prepared → writing → verifying → verified`; failures distinguish `retryable`, `unknown`, `conflict`, `missing` and `blocked`. A write acknowledgement is not a verified backup. The per-file active job is fenced in Core D1, with immutable operation intent and no concurrent replacement while a prior outcome is unknown. Source changes coalesce into a later target without changing the active operation's intent.

Before `put`, retain the exported bytes in owner R2, exact target digest, file ID, prior verified digest and destination. Apps Script acquires a short-lived script lock for its check/write/verify section. It rejects an older generation after a newer generation is present and rejects changed intent for an existing operation identity. Use Drive conditional replacement with the actual previous file version/ETag where supported; prove this in the provider acceptance test. If that precondition cannot be enforced, fail with a conflict instead of silently overwriting a manual or concurrent change. The script lock is service-local serialization, not a cross-D1 transaction or protection against manual Drive edits.

Persist file identity, operation ID, generation and digest as remote metadata together with the content where the Drive API supports it. Exact retries inspect that fixed file ID. Matching bytes/metadata recover the outcome; wrong content, parent, MIME or generation becomes a conflict. A timeout after upload is `unknown`: reconcile first, without creating another file or replaying application writes. If the script continues after the Worker times out, the same identity and conditional write still apply. Test termination after content is stored but before the response, and before Core stores its verified receipt.

Core records success only after the remote identity, location, size and content checksum are verified and the job's current local fence still matches. If remote metadata is insufficient to prove content identity, read and hash the bounded bytes. A delayed result cannot overwrite a newer Core status. Multi-file backups are complete only when all parts and the manifest are verified; partial sets are visible and never qualify for pruning/restore readiness. Neither multiple Drive files nor different D1 databases commit atomically.

On restart, read durable Core intent and existing owner artifact, reconcile the same Drive ID, then resume. Preserve the old per-owner pending job IDs/file IDs when adopting existing jobs. Never silently retarget a pending job to a new folder or turn a missing historical file into a new upload. Deleted historical backups remain deleted unless the owner explicitly requests regeneration. A missing latest backup is reported; the operator may explicitly create a current-day replacement after inspecting status.

## Freshness, bounds and visibility

At **23:50 Asia/Singapore**, Core schedules one persisted check cycle. A missed trigger is caught up from the last completed cycle; it does not enqueue repeated identical checks. This is the due time for bounded work, not a promise that every file finishes uploading at that instant.

For each dataset, compare the owner's current content identity with the last remotely verified content identity, and verify that the remote artifact still exists with the expected integrity. Record `sourceObservedAt`, `remoteVerifiedAt`, `lastCheckedAt` and `lastChangedAt` separately. A months-old file is **current** when source and remote evidence still agree. Age alone never forces a rewrite. An unchanged source with a deleted/corrupt remote file is **missing/failed**, not current. If the owner cannot be read, report **unknown**, not unchanged. A source change after the check belongs to a later observation and cannot be hidden by a falsely advanced check time.

Reuse the present 8 MiB file limit and 4 MiB/2,000-row source projection bounds until a measured, explicit dataset contract justifies a change. Stream the authenticated owner artifact to Core with a dedicated bounded interface; the existing generic 1 MiB service JSON limit must not be silently raised. At most one upload is materialized at a time; allow at most 12 MiB for its base64 envelope, reject oversize payloads before provider I/O, and recheck decoded size/hash in Apps Script. No unbounded in-memory whole-suite export.

Start with two dataset actions per scheduler invocation, a persisted fair cursor across owners, a five-minute Core lease and a 15-second timeout per provider RPC. Timeout is uncertainty, not cancellation of a remote write. Bound lock acquisition to five seconds and return busy/retryable if unavailable. Use capped retries (1, 5, 15, then 60 minutes; at most eight attempts per operation before manual recovery), with reconciliation before each write retry. Keep expired signed requests non-executable; a new signed attempt may inspect/reconcile the same durable operation. Provider quotas and the largest supported XLSX round trip are acceptance gates, not assumed production capacity.

Only Global Admin Toolbox → **System Health and backups** reports current, pending, stale, unknown, missing, failed or disabled; it shows source/check times and remaining work. No WhatsApp, Telegram, email or Admin notification is added. Permission checks still control export/download access; a shared Drive folder does not expand application permissions.

## Cutover and retention

1. Test the generic adapter with synthetic files in an independently authorized test folder; prove signing, bounds, conditional replacement and restart recovery.
2. Inventory registered datasets, pending jobs and exact file/folder IDs using authorized metadata access only. Preserve existing formats and mark unsupported imports honestly.
3. Introduce the Core coordinator while old jobs remain readable. Transfer each dataset's writer ownership with an explicit epoch: stop only its backup scheduler, reconcile any unknown write, then adopt its IDs. Operational application writes continue.
4. Route new backup jobs through Core/Apps Script. Prove that no old owner job can still write the dataset. Rollback drains/reconciles the current writer before returning the same file IDs to the old transport; never run two writers as a fallback.
5. Enable the daily check only after independent review and owner setup/activation authorization. Keep pending manifests/artifacts and outcomes through rollback.

Sharing remains owner-managed. Drive retention remains an open owner choice: manual deletion only, no automatic pruning. Do not add a retention question as a prerequisite to this plan. D1/R2 cleanup keeps [its existing restricted contracts](../accelerated-delivery/STORAGE_TOOLBOX.md); readable exports do not authorize a general history purge. REIGN still requires its specific durable archive/recovery evidence before cleanup. F5 remains **OPEN** until the separate durable decision-evidence recovery requirement is demonstrated.

## Implementation packages and acceptance evidence

This plan is not a product file claim. The implementation coordinator must refresh actual PR overlaps and issue small exact-path claims before code. Split work into (1) the single script and Core transport with synthetic provider tests, (2) Core orchestration and one-owner pilot using the existing export contract, then (3) remaining registered owners and migration/recovery. Keep each owner's schema changes explicit. Do not add speculative generic restore/import endpoints or modify operational save paths.

| Test group | Required proof before activation |
| --- | --- |
| Ordinary saves | Google/script unavailable, timed out or over quota while native saves still commit and return their real receipts; no script request on the save path. |
| Scope/authentication | Wrong school/root/file, traversed path, arbitrary URL, invalid/expired/tampered signature, changed bytes and wrong MIME rejected without file effects; secret canaries absent from generated assets, reports and logs. |
| Daily identity | Same-day changed content updates one file ID; exact retry and two competing requests create one intended result; next-day changed content creates a new day's file; unchanged content creates none. |
| Concurrency/recovery | Lost response before/after file write, crash before Core receipt, lease expiry, old response after newer generation, remote/manual change, script restart and Core/owner restart; reconcile existing IDs without duplicate files or false success. |
| Freshness | Months-old unchanged valid file is current; changed source is stale/pending; missing/corrupt file is not current; unreadable source is unknown; 23:50 Singapore boundary, missed scheduler and unfinished cycle remain accurate. |
| Import/export | Open real XLSX output and exercise each supported frontend's preview/import against synthetic Worker/D1 records. Unsupported schemas remain report/recovery-only. Check stable source IDs, timestamps, formulas/text, duplicate labels and size limits. |
| Cutover/rollback | Old/new writers cannot both mutate a dataset; pending jobs retain identities; no move of unknown writes; multi-part failure preserves previous valid evidence; rollback is recoverable without deleting history. |
| Destructive consumers | Changing daily exports cannot satisfy an immutable REIGN archive reference; incomplete/tampered/missing archive blocks cleanup; no automatic Drive deletion; unchanged D1/R2 prune limits. |

Tests above are proposed, **not run**. A Node simulation cannot prove real Apps Script authorization, Google concurrency/quotas or hosted recovery. Those require separately authorized provider/runtime evidence. No hosted/runtime UAT or official T1B-01/T1B-02 result changes here.

## Related quiet-mode changelog

The inherited [`roster-operations-ui.js`](../../../roster-update/public/roster-operations-ui.js) renders a quiet-mode button and calls `/quiet-mode`; the v1 [probe allowlist](../../../tests/v1-product/operation-probe-allowlist.json) already records the absent route as F08. The owner's decision is to remove that obsolete control/request from v1, not implement its Google-era background-job pause. A separate bounded UI change must prove native saves/allocations keep working and remove the matching probe exception only when the actual built caller is gone. Preserve notification quiet hours, authorization, revisions, idempotency, lease fencing and uncertain-outcome recovery. This document changes no code or v0.9 behavior.

Next decisions are implementation scope after Claude's exact-head design review, then the Google execution identity and browser-only setup/activation authority. No new owner decision on retention, field names or routine folder labels is needed to finish this plan.
