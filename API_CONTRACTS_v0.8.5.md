# GSiS v0.8.5 contracts

This document states the current cross-component guarantees. Detailed operation payloads and error shapes are in [API_ROSTER_OPERATIONS_v0.8.5.md](API_ROSTER_OPERATIONS_v0.8.5.md). Historical version notes are not an alternative contract for this release.

## Timetable preload and current/future confirmed browsing

After the Roster home icons paint, `timetableBatch` supplies two sequential read-only stages for Singapore today through today +30 days, inclusive. Baseline data installs first; saved suspended previews follow. Each entire client stage validates before installation. The stages share a manifest bound to verified identity/roles, date window, register revision and immutable baseline identities. A changed register returns 409 `TIMETABLE_BATCH_CHANGED`; the client can restart the pair once. This does not provide a transaction across all services.

SMC/Admin can receive active saved drafts; ordinary teachers receive only immutable confirmed projections. Private absence reasons and editing authority are excluded from the payload. The full Stapler date list still refreshes independently so dates beyond the 31-day preload window remain available. A cached confirmed preview does not grant editing permission.

Gzip/base64 is preferred, with explicit plain JSON fallback. Each decoded stage is limited to 64 MiB and the combined serialized payload to 128 MiB; JavaScript object and stream overhead is additional. Account, role, local-day and source changes fence late responses. Writes invalidate affected cached dates. An authoritative access denial clears protected cached and displayed timetable data. The source remains online-authoritative for permissions, availability, revisions and saving.

`timetableDay` can return `source:'confirmed'` for a current/future immutable confirmation newer than the publication. Verified SMC/Admin can browse this source even without a teaching identity. An eligible ordinary teacher retains the confirmed-preview access rules. Equal/newer publication keeps published relief deltas; unconfirmed drafts never become teacher-visible and historical unpublished confirmations remain hidden. Timetable and exports label the chosen source. WhatsApp and private duty views still use published data.

## Absence coverage without a baseline

`saveAbsence` accepts `fullDay:true`, stored as `coverage:{kind:'fullDay'}`, or `coverage:{kind:'timeRange',startMinutes,endMinutes}`. Minutes are integers in same-day Singapore time and must satisfy `0 <= startMinutes < endMinutes <= 1440`. Coverage is the durable absence intent; period IDs are a derived projection, not a substitute for that intent. Existing explicit-period requests remain supported.

When no applicable verified school timetable exists, `timetablePending:true` marks the record. For a new pending record, lesson snapshots and instructions are empty, `instructionsNA` remains false, and `reliefRequired` defaults to true unless explicitly set false through the existing validated request. Reporting does not invent lesson indices or silently switch off later relief. Reads and planning resolve the retained coverage against the current effective timetable while preserving original identity and history. Once lessons apply, Manage my absences can edit instructions on that record. Existing ownership, type/date, overlap, receipt and audit rules remain. Clock ranges select periods with positive overlap (`start < periodEnd` and `end > periodStart`); touching endpoints alone do not overlap. Historical projections keep their saved timing. A temporary loss of timetable data does not automatically clear existing instruction text. `saveInstructions` rejects a pending timetable with 409 and directs the user to return through Manage My Own Absence later. Focused domain, real-adapter recovery and mobile checks passed; see VALIDATION.md for integrated results.

## Retained report snapshots and instruction patches

Report/entry reads support the optional `timetableTransport:'gzip-base64-v1'` request. The profile report bootstrap supports the same transport. Only the authorised `timetable` and `baselineTimetable` pair is packed; current absence, instruction, candidate and authority data remains in the response. A content/identity/date/view-scoped SHA-256 key permits an unchanged response without retransmitting the timetable. Current server authority still applies on every read.

The RAM cache retains at most 24 decoded snapshots, 8 MiB of decoded UTF-8 JSON in total and 4 MiB per snapshot. Object overhead and caller copies are additional memory. Logout, account or SMC/Admin scope changes clear it; affected-date invalidation and least-recently-used eviction remove entries. Profile revision isolates baseline metadata. This is not an offline operational store. A corrupt/evicted response gets one plain read retry; unsupported native gzip stays plain. Mutations are never replayed by this mechanism.

`saveInstructions` can opt into changed-cell comparison using `instructionChanges`, `expectedInstructionScopes` and the dated source fields. Each original value is compared with the current saved value. Different lesson keys merge; a competing changed value on the same key or a changed absence/lesson scope returns 409. The complete patch validates before any values change. Existing full payloads retain exact global revision checks. Receipt identity and retry rules are unchanged. See the detailed payload in [Roster operations](API_ROSTER_OPERATIONS_v0.8.5.md).

Own arrangements gives immediate pending-dialog feedback when it first needs to save a report. It exposes period and colleague choices only after confirmed save. Cancel prevents a late reopen. Explicit Submit requests remains the only request-creation action.

## Backend ownership in v0.8.5

Roster requests terminate at the dedicated Roster Apps Script project. Its fixed backend kind admits Roster actions and rejects Deploy/Layout writes and recovery. The Deploy artifact retains Deploy/Layout and rejects Roster actions. `ROSTER_WRITER_ENABLED=true` and `ROSTER_OWNER_SCRIPT_ID` matching the current script ID are required before the new owner serves operational work. Defaults fail closed with `ROSTER_OWNER_INACTIVE`. The read-only editor helper `showBackendOwnership()` reports fixed kind, actual script ID and gate state while paused.

Roster retains its original baseline/operations/Inbox/audit/lease identities. It reads the published Deploy source but does not own Deploy writes. Each backend has a separate ScriptLock; the Roster operations document is still one transactional store. Old historical unguarded deployments cannot be disabled by this new code. They must be disabled and drained before enabling the new owner. See `docs/ROSTER_BACKEND_CUTOVER_v0.8.5.md` for cutover and rollback ordering. Packaging performs no live migration.

Each Roster operation uses a verified published Deploy snapshot bound to its source version. Existing pending-commit and manifest checks remain in place. Separate project locks cannot guarantee that this snapshot is the latest Deploy publication at the instant Roster commits. A subsequent verified source read or allocation cycle detects newer Deploy data. Roster still commits its own operations state, receipt and audit together under its sole-owner lock.

## Identity, authority and durable state

Write protocol remains `500`; Staff ID remains the cross-application identity. Existing deployment URLs, secrets, document IDs and saved configuration are preserved when updating the same installations. No Contacts schema migration is required for this release.

School browser sessions authenticate at their application gateway. Signed server requests carry verified identity; current Contacts authority determines SMC/Admin privileges and permitted teacher access. Client role flags, cached models and browser-supplied Calendar data cannot authorise writes. Public private-timetable access uses a narrowly scoped signed capability instead of school sign-in.

Roster accepted mutations persist in one operations document, together with their receipt, structured audit and queued notification intent. Preparation may run outside the writer lock; the final commit validates current dependencies and preserves unrelated concurrent records. This is not independent storage per cell/date. Notification delivery, private media retrieval and readable audit-file generation happen outside that transaction.

Each ordinary mutation has an immutable request ID and payload. A lost response remains unconfirmed until its original receipt is resolved; blindly assigning a new request ID is unsafe. Replaying the same actor/ID/payload is idempotent. `receiptStatus` is a read and does not claim a missing receipt proves failure. Baseline timetable updates retain their separate register-receipt mechanism.

## Writer freshness and rejected-draft recovery

Calendar write validation uses request-local metadata loaded after acquiring its writer lock. Shared display-cache values cannot authorise a lane/tag change. Normal read caching remains separate from this locked validation snapshot.

Roster Inbox remote Contacts authority is fetched before its lock; current Inbox state and duty assignments are then read under the lock before claims and writes. Signed delivery receipts skip the unused directory fetch. This narrows lock occupancy without moving current duty validation outside the commit boundary.

Deploy duplicate TG names are compared after trimming and without case sensitivity, both before queuing and at the backend. A definitively rejected pending TG can be renamed in Review while keeping temporary IDs and dependent assignments. Corrected edits remain local until Save changes. Unconfirmed saves cannot be rewritten: Retry same save retains the exact original request and receipt identity. Failed Review reads keep the draft and expose a retry.

## Planning, publication and messaging are separate

| Action | Result |
| --- | --- |
| Edit Assign Relief or Stapler | Changes the local draft; no automatic online save. |
| **Save to online** | Uploads the local draft using original-vs-local-vs-online comparison. |
| Stapler **Confirm** | Captures the saved plan for allocation and a read-only confirmed preview available on today/future dates; does not save pending local changes. |
| **Let teachers see** | Publishes the selected online day. Unsaved local changes are excluded. |
| **Send WhatsApp** | Queues the selected published timetable for eligible affected teachers. Acceptance is not delivery or acknowledgement. |

Navigation, refresh, publication and Excel export do not upload local drafts implicitly. Owner/date/draft-scoped recovery retains the original base, queued changes and exact uncertain request; tab ownership prevents one tab from deleting another tab's recovery. A storage failure is visible. Device recovery is not server authority and cannot restore editing rights that the account no longer has.

Stapler Class view provides separate Subject, Venue and Group apply arrows. Each local action changes only the selected field on current lesson tiles linked to the class, including Card Pit; a shared multi-class tile changes once. Baseline comparison tiles and recess are untouched. Blank input makes no mutation; invalid text leaves the entire plan unchanged. Unapplied field inputs remain available and a successful apply is one Undo step. The controls are absent from ordinary teacher confirmed views. This uses the existing local plan and Save to online contract, without a new API or immediate server write.

Relief saves use `reliefBatch` with complete `baseCells` and dated source bindings. Different cells merge; a competing change to the same cell returns 409 `CELL_CONFLICT` with base/local/current values. Stapler saves use `basePlan` and a field-level three-way merge; 409 `STAPLER_CONFLICT` includes the current plan and conflicting fields. Baseline/date changes are separate source conflicts. All rejected batches are atomic; conflict selections stay local until explicitly saved.

SMC manual assignments, Combine, No Relief and intentionally cleared cells are protected from the auto-allocator. SMC can replace its own choices directly or explicitly return a lesson to automatic allocation. The UI does not require an audit-reason or replacement-approval dialog. Saved choices and warnings are still recorded in the audit. Source identity, actual concurrent conflicts, schema and domain checks remain enforced.

SMC/Admin can change and confirm past Stapler plans and publish past corrections without WhatsApp. Sponsored ordinary teachers retain current/future planning permission rules. Past rename/move/delete/restore restrictions and history protection remain. Current Save/Confirm/reset calls omit exclusive-lease fields; optional old lease protocols and lifecycle fencing remain for compatibility. Historical `lock` metadata does not grant or revoke otherwise verified editing permission, and the current planner does not renew an editor lease while idle.

`allowAdvancePublishing` defaults to false. With it enabled, an eligible future school day can be published using an explicit notification mode. Publication makes the current/future day eligible for explicit Send WhatsApp immediately; it is not restricted to Publish Only. Turning the setting off does not retract an existing publication. Past publication uses `notifyMode:'none'`.

## Read projections and privacy

| Projection | Contract |
| --- | --- |
| Roster `profile` with `view:'report',date` | Authenticated profile plus compact own-report data when available. A report-only failure retains the verified profile and supplies safe `reportError`; missing report data is not an empty absence list. |
| `staplerDates` | Verified date/access metadata without inflating every saved plan. `canListConfirmed` is separate from `canViewConfirmed`; explicit legacy confirmations can list metadata with `previewUnavailable:true`. `confirmedAccess` distinguishes available, unmapped and ineligible accounts. The trusted Contacts callback may use `rosterProjection:'staplerDates'` with only caller and eligible sponsors; an older full directory remains compatible. A reduced context cannot authorise another operation. |
| `allocationVersion` | SMC/Admin-only `{date,revision,dayRevision,dayToken}` for cheap change detection. No full timetable, quota or Calendar projection is returned. |
| `timetableDay` | Current/future latest-confirmed or published schedule-only cells, with explicit source and source revisions; baseline is distinguished separately. Later drafts and historical unpublished confirmations are excluded. Absence reasons, instructions, private Contacts data and quotas are excluded. |
| `teacherDailyUpdate` | Active mapped eligible teachers and SMC/Admin can read published relief grouped by absent or relief teacher. Schedule facts and teacher names only; current unpublished absences/allocations are not used. Older snapshots flag `limitedHistoricalData` rather than inventing missing rows. |
| Confirmed Stapler | Today/future preview for active mapped eligible teaching staff; membership of the selected plan and sponsorship are not required. Read-only frozen confirmed snapshot/revision; later unconfirmed changes remain private. Private warnings and imported absence reasons are omitted or neutralised in current, baseline and source/offlineSource provenance copies. Stored SMC evidence is unchanged. This does not replace the daily publication or extend ordinary preview access to past/unconfirmed plans. |
| `calculations` | Exactly the caller's verified Staff ID, even for SMC/Admin. Teacher/date/version/year selectors are rejected. No other teacher figures or school-wide Deploy document is returned. |

Active mapped eligible teachers see confirmed suspension dates from today onward, ordered soonest first, without sponsorship or membership of the plan. A legacy confirmation can make a date visible even when no safe frozen preview survives. Such a row has no preview button and does not reveal the current private draft or its metadata. Frozen confirmed and published previews retain their existing privacy rules. The helper says: "To view the confirmed suspended timetable, select Timetable from the main screen." Account-access problems, read failures and a verified empty list have distinct messages.

The teacher-facing **Confirmed suspensions** list presents Date and Plan columns before the planning-access section. The Plan cell contains the name, Confirmed revision and action, including on narrow screens. Ordinary viewers use **View confirmed timetable**; an authorised delegate keeps **Open planner**. Planning-access requests are collapsed unless existing planning dates or a pending request make them relevant. The helper points to **Timetable** on the main screen for confirmed suspended timetables. Browsing performs no write.

Immutable baseline models may be cached in memory/IndexedDB under an account/permission scope. Current profile, date and source metadata select the valid model; sign-out/authority changes clear personal scopes. A failed cache read falls back safely. Late responses are guarded by owner/session/date/source. A failed refresh may retain the last verified view with visible status; it does not certify fresh permissions or silently replace a publication with a draft.

Saved Stapler plans retain `gzip-base64-v1` plus server-issued structural-validation metadata. Invalid decompression, digest, baseline or revision is an explicit error; it is not an empty-plan or baseline fallback.

## Notification content, timing and acknowledgement

Daily Notify and recipient eligibility use the published timetable, comparing canonical cells and published duties with baseline. A baseline-equivalent teacher is excluded unless an earlier different sent/uncertain/acknowledged notice requires correction. Publication revisions and delivery history are separate. `expectedPublicationRevision` guards explicit sends; a changed publication returns 409 `PUBLICATION_CONFLICT`.

Teachers absent for all school-day periods are excluded. Partial absences qualify only for changes or owed corrections in present periods; absent-only differences do not qualify. Queued-send preflight rechecks current saved absences and rebuilds eligible summaries without absent-period rows. The acknowledgement dashboard counts the same unique eligible teachers and current notice statuses, regardless of search or grouping.

“All” means all eligible changed timetables for the selected day. Publication-time “affected” further restricts to changes since the previous publication. Existing sending/uncertain work blocks blind duplicate sends; equivalent accepted deliveries are skipped. Changed-timetable notices always require acknowledgement. UI acknowledgement state is distinct from provider sent/delivered/read status.

Explicit Notify and publish-with-notify mark the trusted job `manualSend:true`, bypassing the automatic quiet-hour hold. Automatic notification routes retain their schedule and relevant exceptions; the normal quiet window is 21:30–05:45 Singapore time. Current/future published days can be notified; past days cannot. The server still checks recipient, publication, baseline, duplicate/uncertain state and exact approved template at dispatch.

Configured SMC duty summaries retain `smcSummaryTimes:{evening:[...],morning:[...]}` in Singapore time, at most 96 unique slots per phase. Evening slots (16:00–23:59) target the following school date; morning slots (00:00–06:29) target today. Empty phases disable their summaries. The first configured slot sends a fresh cycle; later slots compare effective absent teachers/periods with each recipient's successful checkpoint. Failed/uncertain delivery does not advance that checkpoint. Calendar `rosterDates` supports the signed scheduler's read-only batch of up to 62 dates. Pure Notify does not require Calendar; publication eligibility does.

Template parameter values are normalised for Meta's single-line parameter constraints; the approved template body controls paragraph layout. A button template requires exact approved name/language/body/button contracts and explicit activation. Preparing or packaging it is not approval, activation or proof of live delivery.

## Reusable private timetable access

Timetable `duties` capabilities are HMAC-signed, origin/audience-bound and recipient/date/purpose-scoped. A valid capability opens `/external.html` without school sign-in. `POST /api/external` is same-origin and uses `Authorization: Bearer <capability>`; the server derives scope from the token, not caller-supplied identity. No directory or unrelated timetable is exposed.

New duties links expire exactly 168 hours after retained issuance. Reopening and acknowledging neither consume nor extend them. Valid retries reuse the original interval. `EXTERNAL_LINK_PREVIOUS_SECRET` can verify a previous signing key during rotation. Only correctly signed legacy duties links with valid original issuance/audience/span can receive bounded recovery to that original issuance plus 168 hours; invalid links receive no recovery. Mutual approval links retain their earlier deadline and are never extended by this compatibility path.

Opening a button URL or link preview does not acknowledge. The Acknowledge URL focuses the top-page action; an explicit POST records the current reviewed version. A stale changed timetable must be re-read before acknowledgement.

## Audit trail and exports

Accepted automatic runs capture the decision inputs, eligible/excluded candidates, manual ownership, selected/uncovered lessons and coverage/preference proof status. Saved SMC changes capture actor, time, accepted revision and before/after values. These structured facts are part of the operations transaction.

The signed `allocationAuditExport` service maintains `Allocation Audit/YYYY/MM/YYYY-MM-DD.txt` under `ROSTER_ROOT`, with private structured `Evidence/YYYY-MM-DD.json` beneath the monthly folder. One readable file per school date is updated by retained ID/name. The service exports a bounded snapshot, then advances its exported watermark; changes accepted during export remain pending. Export failure cannot undo an accepted save. Empty verified school days with an active baseline receive an audit intent. Captured old events are prunable from active state only after the retained evidence and readable export cover their version.

The minute Worker runs this bounded export lane independently of notifications and planning. Allocation views report pending/exported revisions. The readable text explains evidence actually captured; historical gaps and bounded search are labelled, not reconstructed as certainty. SMC/Admin `audit` reads can combine current and archived history and fail visibly if an archive is unavailable.

The three Assign Relief Excel views freeze the current local data before asynchronous workbook work. They neither save nor perform export-time network verification. The full-teacher view requires its baseline to have been loaded already. Exports identify local unsaved/unconfirmed state. The online `exportDaily` API remains available, including `fullTeachers:true`; it is not publication or a prerequisite for clicking local export.

## Retained domain contracts

| Area | Retained behavior |
| --- | --- |
| Absence reporting | Explicit dates/periods, no-write review and explicit save actions. `fullDay:true` or clock-time coverage can be retained without a timetable; current applicable periods are resolved when available and permitted by the absence type. A range is atomic. Current ownership, overlaps, type/date/category checks remain. `instructionsNA:true` leaves relief demand intact. Own arrangements require a confirmed saved absence for selection: the adjacent action opens pending feedback while saving a new absence or changed instructions, preserving text and `instructionsNA`; clean saved records open the chooser directly. No colleague request is submitted until explicit Submit requests. |
| Reporting eligibility | Contacts category fields determine `people[].absenceEligible`. SL/MK/Support/SAT/OSO/AE exclusions remain; this is separate from automatic relief and ad hoc eligibility. Existing records remain subject to their normal management rules. |
| Weekly calculations | Published Deploy weekly R is canonical. Current source validity/model/identity/history are verified. Completion counts completed relief with replacement/correction/zero-cost handling, not assigned future work. Missing or invalid values remain unavailable with a reason, never invented zeros. |
| Automatic allocation | Coverage is the first objective, then ordered enabled preferences: annual utilisation, alternative opportunities, weekly balance, rotation, teaching level and subject match. Protected manual work remains fixed. `coverageProven`, `preferencesProven` and solver completion distinguish proof from a bounded best-found plan. |
| Workload configuration | `allocationRuleEnabled` preserves saved toggles. Enabled `maxDailyPeriods`/`maxConsecutivePeriods` are integer 1–40, defaults 9/6. Disabling a rule retains its saved numeric value. Automatic eligibility still checks current availability, R/employment limits and no-relief policies. |
| Subject policy | `subjectFamilies` and `teachingGroupOverrides` resolve subject-match preference and TG-specific relief requirements from exact Deploy groups; unknown evidence does not create eligibility. Defaults keep Chinese, Malay and Tamil separate, with Tamil relief disabled. Shared-subject cover additionally requires one known physical venue, matching period/subject and multiple timetabled teachers. A present co-teacher can supply zero-cost Combine; manual/accepted own arrangements remain protected. |
| Consecutive subject blocks | `consecutiveSubjectRules` defaults to `[{subject:'PAL',periods:3}]` when missing; an explicit empty array disables the rules. Up to 50 unique normalised subjects, 2–40 periods each. Automatic complete-block coverage uses one eligible teacher; no periods are invented and protected choices remain fixed. |
| System Config | SMC/Admin read; only Admin writes. Saved settings survive deployment. No-relief subjects, rule priorities, health display periods, employment restrictions, families/TG overrides, advance publication, scheduler and duty-summary settings retain server validation. Health display columns do not change eligibility or quota arithmetic. |
| Named duty lists | Versioned named inclusive ranges with `save`, `activate`, `delete`; current/future overlap is rejected. Historical daily membership survives edits/activation/deletion. Only verified eligible duty members can be selected. |
| Name Bridges | Exact timetable-name and Contacts Staff-ID validation against fresh catalogues. Search does not authorise free-text identity mapping. Stale saved links remain visible rather than being silently deleted. |
| Offline JSON import | Selected date/weekday/sheet only; final placed cards replace each represented teacher's whole day, including blanks. Missing teachers keep baseline, subject to online absence. Card Pit remains unplaced. Exact identity resolution and eligible-contact rules apply; import remains local and does not rewrite baseline, other dates, online attendance/accounting or send notifications. |

## Contact-file export and WhatsApp Inbox

The Contacts-view **add** column precedes **TTb Name**. Its plain **+** exports one local vCard 3.0 file from the selected authorised loaded row on demand; it makes no extra directory or personal-address-book request. Prefix is exactly `GSPS`, First Name is the complete TTb Name and Last Name is the complete Statutory Name. Basic Name is not substituted and surnames are not inferred. Available mobile/work emails are included; internal extensions stay labelled notes. CRLF, escaped fields and UTF-8-safe line folding preserve valid contact-file syntax.

School sign-in and directory permissions still govern the loaded data. No People API, extra Contacts scope, personal-address-book token or duplicate scan is required. The button uses horizontal touch padding without raising normal text rows. The browser supplies file/fallback handling; the user completes any native import. A missing status region is created safely, and a missing vCard module produces visible Reload Contacts guidance without issuing a substitute network/contact request. Generated files are copies, not synchronised contacts, and repeated imports can duplicate entries. GSiS cannot verify the contact app saved a record. Signing out, authentication expiry or leaving the page clears temporary file URLs and the visible fallback. Earlier contact grants and saved contacts are untouched.

Inbox reads/mutations remain SMC/Admin-only. Metadata is in the private `ROSTER_INBOX_FILE`; private media uses `WHATSAPP_INBOX_MEDIA`. Signed webhooks capture incoming image ID/MIME/hash/caption. A current authorised media read obtains a fresh Meta URL, validates JPEG/PNG bytes up to 5 MiB and caches privately; temporary provider URLs/tokens/storage keys are not exposed. Existing voice support remains. The UI lazily loads images and reports retryable attachment failure.

List/thread requests are coalesced, unchanged thread polls avoid resending message bodies, hidden tabs pause polling and failures back off. These optimisations do not cache authority or hide a conversation from another authorised SMC. Inbox mutations return the authorised updated thread where available.

Normal replies require the current 24-hour customer window at both acceptance and dispatch; approved templates are required outside it. Never-attempted replies expire after five minutes; uncertain sends remain held for review. New-message duty alerts target current duty SMC, with no broad fallback; they require their dedicated approved template/flag and expire after two minutes. Local readiness metadata exposes setting names, `configured` flags and `liveVerified:false`, not credential values or proof of actual delivery.

The Report Absence menu uses the configured HTTPS `WHATSAPP_CURRENT_RELIEF_URL` and only returns a link. Packaging does not activate WhatsApp, submit absences, approve templates or test live delivery. See [Inbox setup](docs/INBOX_v0.8.5.md) and [Contact-file export](docs/GOOGLE_CONTACTS_SETUP.md).

## Transport limits and deployment compatibility

`saveStapler` and its `receiptStatus` command allow a 4,100,000-byte UTF-8 browser JSON request; `plan` and `basePlan` are each limited to 1,900,000 UTF-8 JSON bytes. The decoded signed backend request, including metadata, is separately limited to 4,100,000 bytes, so callers must leave metadata headroom. Other Roster operations retain the 262,144-byte gateway limit and normal non-upload signed-envelope bound. Source validation, signatures, receipts and current permission checks apply at every size.

Install the matching component deployables while preserving existing endpoints/stores/secrets. The separate minute notification Worker is required for notification dispatch and audit export. Approved templates, private R2, existing school sign-in configuration and actual transport verification are operational prerequisites, not features proven by a version label or local test result.

## Report settings concurrency and recovery

Editable daily email report settings expose `settingsToken`; saves send it as `expectedSettingsToken`. Matching settings permit unrelated global roster revisions, while concurrent changes to these settings return 409 `SETTINGS_CONFLICT`. The same accepted request ID/body replays the receipt. Legacy clients without a settings token retain strict revision checks. The browser persists an unconfirmed settings request for its signed-in account and tab and validates the saved response before showing success. **Check saved settings** retries the original request explicitly; it never sends the email report. The earlier installed save incident's exact cause was not established by the local reproduction.
