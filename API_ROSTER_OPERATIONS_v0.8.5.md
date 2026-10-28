# GSiS v0.8.5 Roster operations API

This is the current contract for the v0.8.5 source, replacing the accumulated historical notes in earlier editions. Write protocol remains `500`. Staff ID is the cross-application identity; fresh Contacts authority and backend validation determine access.

## Backend ownership in v0.8.5

Roster requests terminate at the dedicated Roster Apps Script project. Its fixed backend kind admits Roster actions and rejects Deploy/Layout writes and recovery. The Deploy artifact retains Deploy/Layout and rejects Roster actions. `ROSTER_WRITER_ENABLED=true` and `ROSTER_OWNER_SCRIPT_ID` matching the current script ID are required before the new owner serves operational work. Defaults fail closed with 503 `ROSTER_OWNER_INACTIVE`. The read-only editor helper `showBackendOwnership()` reports kind, actual script ID and gate state while paused.

Roster retains its original baseline/operations/Inbox/audit/lease identities. It reads the published Deploy source but does not own Deploy writes. Each backend has a separate ScriptLock; the Roster operations document is still one transactional store. Old historical unguarded deployments cannot be disabled by this new code. They must be disabled and drained before enabling the new owner. See `docs/ROSTER_BACKEND_CUTOVER_v0.8.5.md` for cutover and rollback ordering. Packaging performs no live migration.

Each Roster operation uses a verified published Deploy snapshot bound to its source version. Existing pending-commit and manifest checks remain in place. Separate project locks cannot guarantee that this snapshot is the latest Deploy publication at the instant Roster commits. A subsequent verified source read or allocation cycle detects newer Deploy data. Roster still commits its own operations state, receipt and audit together under its sole-owner lock.

## Transport, identity and responses

The browser sends same-origin `POST /api/operations`. Roster Pages authenticates the school session and signs the `rosterOperations` request to the standalone Roster Apps Script endpoint. Client role flags, Calendar fields and cached data do not grant authority. Service operations use the separate signed notification-service boundary; they are not browser operation aliases.

Success is `{ok:true,data:{...}}`. Failures retain HTTP status and `{ok:false,error,...}`. Where applicable, the error includes `code`, `conflicts`, `currentPlan`, `staplerRevision` or safe diagnostic fields (`diagnosticId`, `backendVersion`, `failureStage`). A timeout, broken response or 503 does not prove a mutation failed.

| Browser request | Maximum |
| --- | --- |
| `saveStapler`, or `receiptStatus` with `command.operation:'saveStapler'` | 4,100,000 UTF-8 bytes of raw JSON |
| Each supplied `plan` and `basePlan` in those requests | 1,900,000 UTF-8 bytes of its JSON representation, independently |
| Other Roster operations | 262,144 UTF-8 bytes |

The backend independently limits the decoded signed Stapler request, including transport metadata, to 4,100,000 UTF-8 bytes. Leave room for that metadata; the browser ceiling is not a guaranteed usable plan budget. Other non-upload signed requests retain the 600,000-character envelope bound. Upload is a separate route. Signature verification, payload identity and domain validation remain required.

## Two-stage 31-date timetable batch

`{operation:'timetableBatch', stage:'baseline', encoding:'gzip-base64-v1'|'json-v1'}` returns every distinct active baseline needed from Singapore today through +30 days. The caller cannot extend the date window. The subsequent `{operation:'timetableBatch', stage:'suspended', encoding, baselineKey}` must carry the first stage's manifest key.

The envelope is `{schema:1,stage,from,to,baselineKey,key,encoding,bytes,data}`. `bytes` is decoded UTF-8 JSON length. The baseline payload includes `registerRevision`, public `entries`, `models:[{id,model}]` and exactly 31 ordered `{date,baselineId}` rows; absent baselines use null. The suspended payload includes `operationsRevision`, safe plan rows and `datesView:{revision,confirmedAccess,dates}` bounded to the same window. A plan row identifies its date, baseline, revision and `viewMode`, with sanitised `plan`, optional `confirmedPlan`/`confirmedRevision` and a composed `timetableDay` when source identities agree. A changed baseline is flagged and is not composed into an active day.

Ordinary teachers receive only immutable confirmed plans. SMC/Admin may receive saved drafts. Archived/deleted records and unsaved browser edits are outside this transport. Preview payloads never supply edit authority or a writer lease. Current authority is verified for both requests. Each stage brackets immutable source reads with a register check; the suspended stage reads one operations snapshot. The dedicated operation does not acquire the writer lock or require Calendar/Deploy quota requests.

A mismatched baseline manifest returns 409 `TIMETABLE_BATCH_CHANGED`. Oversize decoded data returns 413 `TIMETABLE_BATCH_TOO_LARGE`. Both codes survive the real backend/gateway error boundary. The client restarts both read stages once after a manifest conflict, and retries malformed compressed transport once as plain JSON. It never retries a mutation through this mechanism. Each decoded stage is capped at 64 MiB, with 128 MiB combined serialized-payload accounting and additional JS object/stream overhead.

The baseline stage is usable before the suspended stage completes. The browser caches models in RAM, validates a whole stage before installing it and yields between model validations. Cached `timetableDay` results are fresh for 60 seconds; subsequent authoritative reads can replace them. Logout, account/role/day changes, access denial and affected writes prevent stale data from reappearing.

## Absence coverage without a baseline

`saveAbsence` accepts `fullDay:true`, stored as `coverage:{kind:'fullDay'}`, or `coverage:{kind:'timeRange',startMinutes,endMinutes}`. Minutes are integers in same-day Singapore time and must satisfy `0 <= startMinutes < endMinutes <= 1440`. Coverage is the durable absence intent; period IDs are a derived projection, not a substitute for that intent. Existing explicit-period requests remain supported.

When no applicable verified school timetable exists, `timetablePending:true` marks the record. For a new pending record, lesson snapshots and instructions are empty, `instructionsNA` remains false, and `reliefRequired` defaults to true unless explicitly set false through the existing validated request. Reporting does not invent lesson indices or silently switch off later relief. Reads and planning resolve the retained coverage against the current effective timetable while preserving original identity and history. Once lessons apply, Manage my absences can edit instructions on that record. Existing ownership, type/date, overlap, receipt and audit rules remain. Clock ranges select periods with positive overlap (`start < periodEnd` and `end > periodStart`); touching endpoints alone do not overlap. Historical projections keep their saved timing. A temporary loss of timetable data does not automatically clear existing instruction text. `saveInstructions` rejects a pending timetable with 409 and directs the user to return through Manage My Own Absence later. Focused domain, real-adapter recovery and mobile checks passed; see VALIDATION.md for integrated results.

For a legacy explicit-period request spanning dates with and without timing, the server can retain internal `coverage:{kind:'timeRanges',ranges:[{startMinutes,endMinutes}]}` on unresolved dates, derived from a current available timetable. This internal form can be resubmitted only unchanged against the same saved record ID. New arbitrary multi-range requests are rejected. Explicitly editing a saved record back to period mode removes its coverage field. These rules do not permit invented unavailable periods or bypass timing checks.

## Prepared Report Absence reads

The opt-in request is:

```text
{operation:'read', compact:true, view:'report'|'entry', date,
 timetableTransport:'gzip-base64-v1', timetableSnapshotKey?:<known key>}
```

The `profile` report bootstrap accepts the same transport selector. The result retains fresh operational fields and sets `timetable:null, baselineTimetable:null` while supplying:

```text
timetableSnapshot:{schema:1, key:<64-character lowercase SHA-256>,
 encoding:'gzip-base64-v1', bytes:<decoded UTF-8 JSON byte count>,
 data:<base64 gzip>}
```

The decoded value is `{timetable,baselineTimetable}`. With an exact current known key, the envelope has `unchanged:true` and omits `data`. The key binds verified email, Staff ID, SMC/Admin authority, view, date and projected timetable content. It is a cache identity, not a permission token. An ordinary teacher receives only the already-authorised report projection. Current operational rows are never restored from this timetable cache.

The server keeps reusable compressed values in ScriptCache for up to six hours, with a 90 KB cache-entry ceiling. Cache failure or unavailable/invalid compression returns the existing plain response. The server still rebuilds current authority/context, projects the timetable and hashes it. Mutation responses and legacy clients stay plain. `candidatesByPeriod` also reports `staplerRevision` for dated candidate validation.

The browser uses native `DecompressionStream('gzip')`, validates the envelope/decoded size, and caps each snapshot at 4 MiB. Its RAM cache holds at most 24 snapshots and 8 MiB of decoded UTF-8 JSON. JavaScript object overhead and copies are additional. A missing key or invalid gzip triggers one plain read retry; that fallback never replays a write. Unsupported browsers use plain reads. Authentication and network errors are not treated as verified cached operational data.

## Saved instruction cell patches

A report read includes `record.instructionScope` for an absence with a current timetable context. The opt-in save carries only changed lesson keys:

```text
{operation:'saveInstructions', revision, requestId, date, absenceIds:[...],
 expectedTimetableId, expectedStaplerRevision, expectedParity,
 expectedInstructionScopes:{<absenceId>:<instructionScope>},
 instructionChanges:[{absenceId,
   base:{<lessonKey>:<original text>},
   values:{<same lessonKey>:<new text>},
   baseInstructionsNA:<boolean>, instructionsNA:<boolean>}]}
```

The scope binds absence ownership, date, type, periods, no-relief policy and the current lesson identities, timing and source. Current ownership and source validation remain required. This opt-in operation can accept an older global revision when the scope is unchanged and each current touched value equals its supplied base or desired value. Untouched lesson keys survive. An unchanged `instructionsNA` choice does not overwrite a concurrent change to that flag.

A changed scope, missing/invalid key, or competing same-cell value rejects the whole patch before applying any changes. The browser retains local edits for review. Legacy `saveInstructions` payloads keep their existing strict global revision rule. The immutable request ID, receipt replay and uncertain-save recovery are unchanged. This comparison narrows conflicts; the backend still commits the complete operations document under its final writer lock.

## Confirmed suspension date metadata

`staplerDates` now returns `confirmedAccess:'available'|'unmapped'|'ineligible'` and row-level `canListConfirmed`. A valid explicit legacy confirmation can make today's/future date visible even without a readable frozen plan. For an ordinary viewer, such a row has `canViewConfirmed:false`, `previewUnavailable:true`, no private plan name/baseline metadata and no editing permission. Listing it never grants access to its later draft. Frozen previews continue to use `confirmedStaplerSnapshot` and existing privacy redaction.

The teacher list sorts earliest first. It offers no preview action for metadata-only dates. Missing or malformed date-list responses fail visibly instead of becoming a verified empty list; a previous checked list can remain visible. Own planning permissions remain separate.

## Consecutive subject rules

`systemConfig` includes `consecutiveSubjectRules:[{subject,periods}]`. Missing configuration defaults to `[{subject:'PAL',periods:3}]`; explicit `[]` disables the rules. Subject values are nonblank, normalised, unique and at most 100 characters; there can be at most 50 rules. `periods` is an integer from 2 to 40. SMC/Admin can read; Admin alone can save through the existing `saveSystemConfig` operation.

Rules match actual consecutive demand rows with the same normalised subject, class, teaching group and absent identity. A run of six PAL periods makes two three-period blocks. Gaps and shorter remainders are not filled by invented periods; they remain for review. Each complete block needs one teacher who fits every remaining period, including availability, R, employment cap and enabled daily/consecutive workload limits.

Existing manual, accepted mutual/own-arrangement, protected, published and fill-only assignments remain unchanged. One existing teacher anchors the remaining periods. Conflicting anchors, a protected clear or No Relief choice prevent automatic completion and produce a review warning. The allocator uses its existing coverage-first, ordered-preference bounded search; the default search bound is 256 nodes. A bounded result does not claim preference optimality. `consecutiveBlockWarnings` and captured decision evidence explain unfilled blocks; these are informational and do not require an SMC approval dialog.

## Durable saves and retries

Ordinary mutations carry a 36-character UUID-shaped `requestId` and a non-negative safe-integer `revision`. The same actor, request ID and payload replay the accepted receipt; reusing the ID with another actor or payload returns conflict. One operations-document commit persists the accepted changes, receipt, structured audit and notification intent together. External delivery and audit-file generation are separate work.

A new `saveAbsence` without `id` can append against an older valid global revision, after current overlap and authority checks. An edit with `id` retains its existing ownership/date and revision checks. Selected-day operations and Stapler saves have the narrower comparisons described below; unrelated writes are not a licence to overwrite a conflicting cell.

`receiptStatus` accepts `{command:<complete original mutation>}`. It checks the original actor and payload digest and returns `accepted`, `requestId`, `currentRevision`, and, when accepted, `savedIds`, `acceptedAt`, `acceptedRevision`, `confirmation:'accepted'`. An unaccepted response uses `confirmation:'unconfirmed'`. Older receipts can have `acceptedRevision:null`. `accepted:false` means no retained matching receipt was found yet; the original request may still finish. Preserve the original command for retry. Baseline `rosterUpdate` has its own register receipts.

Preparation for `publish`, `notifyDaily`, `reliefBatch`, `autoAllocate` and `optimise` runs outside the final shared commit lock. The locked commit rechecks current state, source manifests, dependencies and request receipts. It merges concurrent unrelated records into the single document; it does not create independent per-date stores. A preparation race is retried internally, then returns a retryable 503 if it cannot be resolved.

## Local editing and explicit actions

| User action | Contract |
| --- | --- |
| **Save to online** | Upload the retained local relief commands or Stapler plan; return the accepted online result and comparisons. |
| **Let teachers see** | Publish the selected online day through `publish`. Local unsaved edits are not uploaded implicitly. |
| **Send WhatsApp** | Queue notices from the selected published timetable through `notifyDaily`, optionally for one `staffId`. Queue acceptance is not delivery. |
| Stapler **Confirm** | Confirm an already-saved plan for allocation and the separate read-only confirmed preview on today/future dates. It does not implicitly save local edits or publish the daily timetable. |

Assign Relief and Stapler edits remain local until Save to online. Refresh, page/date navigation, publication and export do not flush edits to the server. Browser recovery retains the base, local choices and any immutable in-flight request under owner/date/draft ownership. Separate tabs cannot overwrite or remove each other's recovery copies; incompatible baseline copies remain available for recovery. Storage failure is visible and does not mean the draft is durable.

Assign Relief retains up to 1,000 ordered local commands; one explicit batch sends at most 100. Later edits remain local if an earlier request is still in flight. An uncertain response retains its request ID and payload, including across session reauthentication. Conflict choices stay local until another explicit save.

## Relief cell comparison and manual ownership

An updated allocation read returns `revision`, `dayToken`, `cellStates`, the dated source identity, and `exportContext`. The compact version read is:

```text
{operation:'allocationVersion', date}
→ {date, revision, dayRevision, dayToken}
```

`allocationVersion` is SMC/Admin-only. It checks fresh authority and register identity without loading the full timetable/quota/Calendar projection. The token indicates whether a full refresh is needed; it does not contain cells or authorise a write.

Use:

```text
{operation:'reliefBatch', date, view:'allocation', compact:true,
 revision, requestId, expectedDayToken,
 expectedTimetableId, expectedStaplerRevision, expectedParity,
 expectedDemandSources:{[demandId]:cellSourceKey},
 baseCells:{[demandId]:{staffId:null|string,noRelief:boolean,
                       combination:boolean,manual:boolean,cleared:boolean}},
 commands:[{operation:'assign'|'combine'|'unassign'|'setNoRelief'|'returnAutomatic',
            demandIds:[...], ...commandFields}]}
```

Every changed demand needs its complete original `baseCells` value and source key. The server compares original, proposed and current decisions. Separate cell edits merge; an identical online decision is `already-current`; a local value unchanged from its base is `kept-online`; a changed local value whose base still matches online is `updated`. A competing edit returns HTTP 409, `code:'CELL_CONFLICT'`, and `conflicts:[{demandId,base,current,local}]`. The entire batch is rejected on conflict or any invalid command; no prefix is committed.

Timetable, parity, Stapler revision or demand-source changes return `DAY_CONFLICT`. Without `baseCells`, compatible clients retain the selected-day token/global-revision checks. The current cell-comparison path validates source identity instead of rejecting unrelated changes solely because the day token moved.

Success returns the authorised allocation view, `savedIds`, `requestId`, `acceptedRevision`, and `changes:[{demandId,before,after,outcome,actor,at}]`. Exact replay adds `replayed:true`; `acceptedRevision` remains the original receipt revision even if the returned current `revision` is newer.

SMC choices are durable ownership records, including assignments, Combine, No Relief and deliberately empty cells. Automatic allocation preserves them until SMC changes the choice or sends `returnAutomatic`. That command releases manual ownership; it is not permission to leave two effective replacements. Manual warnings are recorded in the audit rather than requiring an approval/reason dialog. Identity, source, schema and applicable domain validation still run. Online edits can replace published arrangements; the existing public snapshot remains until Let teachers see. Actual-completion accounting is distinct from changing a plan.

## Stapler class-field editing

Class view exposes independent Subject, Venue and Group apply arrows. An apply changes one field across current lesson tiles linked to that class, including Card Pit tiles, through the existing local plan operation. Shared multi-class tiles are updated once; baseline comparisons and recess are unaffected. Blank input does nothing, invalid input preserves the entire plan, and each successful apply is one Undo step. Other unapplied field inputs survive redraw. Ordinary teacher confirmed views expose no such controls. No new API or backend/model payload is introduced: the edits reach the server only through the existing explicit `saveStapler` flow below.

## Stapler concurrent save and confirmation

`stapler` takes `date` and returns the authorised plan, `staplerRevision`, `planningAllowed`, `canEdit`, `canConfirm`, baseline status and safe structural-validation metadata. `staplerDates` is a metadata projection; success listing a date does not prove that its compressed plan can be opened. Provisional cached date lists do not authorise new writes.

```text
{operation:'saveStapler', view:'stapler', date, revision, requestId,
 staplerRevision:<revision originally loaded>, basePlan:<original>, plan:<local>}
```

The three-way merge compares original/local/current `tiles`, `mats`, `teachers`, `classes` and plan fields. Independent field changes merge. Different changes to the same field, add/remove conflicts and incompatible structures are not silently overwritten. A conflict returns HTTP 409, `code:'STAPLER_CONFLICT'`, `conflicts:[{collection,id,field?,base,current,local}]`, `currentPlan` and the current `staplerRevision`. Date or baseline changes return `STAPLER_BASELINE_CONFLICT`. The merged plan must pass current domain validation. A client omitting `basePlan` must use the current saved-plan revision.

`confirmStapler` carries the current saved `staplerRevision`, `revision`, `date` and `requestId`. It requires an existing saved draft. Save and Confirm do not send timetable-change notifications. Saving an already-confirmed plan updates its planning/allocation version; the separately captured confirmed teacher preview remains unchanged until Confirm or daily publication captures the new version. Daily publication remains separate.

SMC/Admin can save and confirm a past dated plan. Sponsored active teachers require approved access and a current/future date. This does not permit past lifecycle deletion/move, notify past days, or bypass structural/double-booking validation. Compressed storage remains `gzip-base64-v1` with server validation metadata; a corrupt saved plan fails explicitly rather than falling back to an empty plan.

Current Save/Confirm/reset requests do not acquire or renew exclusive editor leases and omit lease fields. `lock` metadata remains for lifecycle/legacy compatibility and does not disable otherwise permitted local editing. Existing callers explicitly supplying lease fields still undergo legacy fencing validation.

SMC/Admin lifecycle commands retain `requestId`, `revision`, `staplerRevision` and their lifecycle/fencing checks: `renameStapler` adds `name`; `moveStapler` adds `newDate,confirm:true`; `deleteStapler` adds `confirm:true`; `restoreStapler` adds `archiveId,confirm:true`. Move/Delete preserve archives and cannot rewrite protected/past history; restore requires a vacant, compatible nonpast destination. Legacy `acquireStaplerLock`, `renewStaplerLock`, `releaseStaplerLock` remain available with `date`, `leaseSessionId`, `leaseFence` (acquire also needs `staplerRevision`). They modify separate lease metadata; Admin abandonment release and stale-fence rejection remain. The current planner does not run a lease heartbeat for ordinary editing.

## Publication, daily notices and acknowledgement

`publish` accepts `date`, `revision`, `requestId`, `expectedDayToken` and `notifyMode:'none'|'all'|'affected'`. It requires a verified school day and compatible source. `allowAdvancePublishing` defaults to false; when enabled, future publication accepts an explicit notification mode. A published current/future day is immediately eligible for explicit notification. Past corrections use `notifyMode:'none'` only. The frontend does not impose started-period or audit-reason approval blocks; ordinary audit capture remains enabled.

`dailyNotify` is SMC/Admin-only and returns published metadata, `pendingDraft`, affected teacher summaries, delivery state and `acknowledgement:{id,status:'pending'|'acknowledged',acknowledgedAt}`. An unchanged baseline-equivalent timetable is excluded unless an earlier different notice may have reached the teacher and needs correction. “All” means eligible changed timetables for that day; “affected” additionally limits publication-time notices to teachers changed since the prior publication.

Attendance is checked over the published school-day period identifiers. Fully absent teachers are excluded; partial absences restrict baseline/duty comparison and owed corrections to present periods. The immutable publication retains its timetable cells; current saved absences can suppress queued notices at preflight. Partial-absence message summaries include relevant present periods only. The dashboard counts unique teachers from this already-filtered response and uses each teacher's current `acknowledgement` status, independent of search/grouping and delivery.

`notifyDaily` accepts `date`, `revision`, `requestId`, `expectedPublicationRevision`, optional `staffId`, and the relevant view. A mismatched publication revision returns `PUBLICATION_CONFLICT`. It never substitutes an unpublished draft. Sending/uncertain jobs block blind duplicates; an already sent equivalent timetable is skipped. The result reports queued/reused/skipped/blocked/retried counts. Explicit notices are marked `manualSend:true` and bypass automatic quiet-hour holding, while retaining normal eligibility, approval, idempotency and provider checks. They are dispatched through the durable queue, not guaranteed delivered within the HTTP response.

Acknowledgement is required for changed-timetable notices. `acknowledge` accepts the reviewed `timetableNoticeId` and/or `snapshotIds` and only the authenticated teacher's current notices. A stale changed version returns 409. Acknowledgement and provider delivery/read receipts are distinct.

## Teacher-readable projections and private links

| Read | Visibility and contents |
| --- | --- |
| `timetableDay`, `date` | Schedule-only dated projection for verified Roster users, with source/publication/confirmation revisions. Today/future dates use an immutable confirmation when newer than publication, otherwise the published result; the baseline remains distinct. Later unconfirmed drafts and historical unpublished confirmations are excluded. WhatsApp and private duty views retain publication. |
| `teacherDailyUpdate`, `date` (or `read`, `view:'teacherDailyUpdate'`) | Read-only published relief grouping for an active eligible mapped teacher or SMC/Admin: `{date,publishedAt,publicationRevision,limitedHistoricalData,byAbsent,byRelief}`. Lesson rows contain period/time/subject/class/venue/status and counterpart teacher names, excluding absence reasons, instructions and contact details. No-publication returns empty groups. Legacy snapshots flag limited history instead of inventing missing unassigned lessons. |
| `stapler`, `date`, confirmed view | Active mapped eligible teaching staff may view a captured confirmed timetable for today or a future date without membership of that plan or sponsorship. Returns `viewMode:'confirmed'`, `canViewConfirmed:true`, read-only controls and the frozen confirmed revision; later unconfirmed edits are excluded. Private warnings and imported absence reasons are omitted or neutralised in current, baseline and source/offlineSource provenance copies, leaving stored SMC evidence intact. Past and unconfirmed plans do not qualify for this ordinary preview. Existing authorised planner access is separate. The authenticated Timetable may show this immutable confirmation when newer than publication. This does not change the published data used by WhatsApp, private duty views or Daily Updates. |

`externalLink` issues a recipient/date/purpose-bound capability. The unauthenticated same-origin `POST /api/external` takes `Authorization: Bearer <capability>` and a body of at most 6,000 characters for `view`, `acknowledge` or mutual-only `respond`; it does not accept arbitrary teacher identity or serve the school directory. New timetable `duties` links have a fixed 168-hour lifetime from issuance, are reusable, and do not expire when opened or acknowledged. Mutual approval capabilities retain their earlier request deadline. Retrying issuance reuses the original valid interval rather than sliding the expiry. Expired/invalid links remain rejected. Optional previous-key verification and bounded legacy recovery are compatibility measures, not permanent public access.

The Acknowledge WhatsApp URL only opens/focuses the top acknowledgement action; it does not record acknowledgement through a GET or link preview. Button templates remain subject to exact Meta approval and explicit activation; the inline approved template configuration remains usable.

## Allocation audit export service

The signed `rosterService` operation `allocationAuditExport` exports pending captured evidence separately from saving allocations. It requires the separate `ROSTER_SERVICE_SECRET` and service identity `gsis-roster-notifier-v1`; optional `limit` is clamped to 1–3 dates, default 1. The result is `{exported:[{date,revision}],pending,failures:[{date,error}],busy?}`. The minute Worker invokes a bounded export lane independently of notification dispatch. The source of truth is the accepted structured audit/run evidence and export watermark in the operations state; a file-export error cannot turn an accepted save into failure.

The exporter maintains `Allocation Audit/YYYY/MM/YYYY-MM-DD.txt` under `ROSTER_ROOT`, with structured `Evidence/YYYY-MM-DD.json` beneath that monthly folder, for complete retained history. It describes accepted allocator inputs, eligibility/exclusions, coverage/preference proof status, selections/uncovered lessons and each saved SMC change. Historical gaps are labelled, not reconstructed. Retried exports reuse the date's file and advance only the exported snapshot's watermark; later writes remain pending. Allocation reads expose `auditExport:{pendingRevision,exportedRevision}`. Authenticated SMC/Admin `audit` reads with `date` merge retained and archived evidence; an unavailable archive fails visibly.

## Email report recipient save

Editable `dailyEmployment` responses include `settingsToken`. `saveDailyEmploymentSettings` sends `date`, `revision`, `requestId`, `expectedSettingsToken`, `subject`, `time` and verified Contacts `recipients`. Under the commit lock, a matching settings token permits an older valid global revision caused by unrelated roster activity. A changed settings token returns HTTP 409 `SETTINGS_CONFLICT`; a malformed token returns 400. Legacy clients without a token retain the strict global revision check. Accepted exact requests replay their receipt before comparing the stale token. Saving settings never sends a report.

The frontend retains an unconfirmed settings request in per-account tab storage and offers **Check saved settings** for explicit exact retry. It preserves uncertainty across reloads and later authentication failures, clears definite validation rejections, and validates the saved-response shape before confirming success. Browser storage failure keeps the in-memory retry and displays a warning. An explicit `sendDailyEmploymentReport` remains a separate operation.

## Retained reporting, settings, exports and Inbox

- `saveAbsence` supports an atomic `from`/`to` range and explicit periods; optional exact `fullDay:true` retains full-day coverage and requires the type's Select All permission. Clock-time coverage is also supported; unavailable timing leaves lesson resolution pending rather than rejecting an otherwise valid report. Reporting eligibility, overlaps, ownership and type/date checks remain. `instructionsNA:true` does not remove relief demand. The Own arrangements action beside No relief instructions uses the existing `saveAbsence`/instruction-save path for new or dirty records before opening its chooser; clean saved records open directly. Blank text does not change `instructionsNA`. The chooser waits for confirmed save success, including exact uncertain-request recovery on the same active report/date, and does not submit a colleague request or change relief demand merely by opening. Cancel keeps the saved record; explicit Submit requests remains the request boundary.
- `systemConfig` is readable by SMC/Admin; only Admin writes. It retains rule priorities/toggles, workload limits, subject families, precise teaching-group overrides, no-relief policy, shared-subject cover, advance-publication and scheduler settings. Defaults separate Chinese (`CL/HCL/FCL`), Malay (`ML/HML/FML`) and Tamil (`TL/HTL/FTL`) families; Tamil defaults to no relief, with exact TG overrides available. Automatic allocation maximises feasible coverage before comparing ordered business preferences, and preserves SMC ownership. Proof flags distinguish proven from bounded results.
- Shared-subject cover groups one known physical venue/period/subject with at least two timetabled teachers. A present co-teacher can supply zero-cost Combine; otherwise the group presents one vacancy. Explicit manual/accepted own arrangements remain protected.
- `dutyRoster` and `setDutySMC` retain named, versioned inclusive duty ranges and `save`/`activate`/`delete` actions. Past dated membership survives later edits; overlapping current/future lists are rejected.
- `calculations` is an own-record read with no teacher/date/version/year selector; it returns published weekly R and verified completion history or an explicit unavailable reason. Missing data is not zero.
- `exportDaily` remains an online API projection; `fullTeachers:true` adds `teacherSummary`. The three Assign Relief Excel buttons instead freeze the user's local projection (and already-loaded baseline where needed) before asynchronous workbook generation, with no export-time save or network verification. The workbook labels unsaved/unconfirmed local state.
- Offline JSON import remains local, selected-date only, and uses final placements including deliberate blanks. Unresolved names require exact Contacts/Name Bridge resolution. It does not alter baseline, online absence records or other dates; Save, Confirm and publication remain separate.

Inbox operations remain SMC/Admin-only: `inboxList {search?,filter?,cursor?,limit?}`, `inboxThread {waId,before?,limit?,knownRevision?,knownReadAt?}`, `inboxAssign`, `inboxSetHandled`, `inboxReply` and `inboxTemplates`. Mutations use `expectedRevision` and `requestId`. Conditional thread reads can return `unchanged:true`; the client must retain its existing messages. Successful authorised list reads include local `configuration` readiness for capture/replies/voice/images/templates with setting names only and `liveVerified:false`.

Signed incoming webhooks persist image metadata/caption. JPEG/PNG bytes (up to 5 MiB) are retrieved using a fresh provider media URL only after current authorised inbox access, checked and cached in private R2, then served through `/api/whatsapp/media/<messageId>`. The browser receives neither provider tokens nor private storage keys. Existing private audio support remains. Lazy image loading, retry state, hidden-tab polling pause, coalesced reads and bounded backoff do not relax authorisation. Normal replies still require a current 24-hour customer window at acceptance and dispatch; otherwise use an approved template. Queue acceptance is not delivery. See `docs/INBOX_v0.8.5.md` for activation and live-verification requirements.
