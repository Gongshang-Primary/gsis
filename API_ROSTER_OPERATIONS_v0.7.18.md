# GSiS v0.7.18 Roster operations API

## v0.7.18 loading and save recovery

`POST /api/profile` with `view:"report"` and a selected `date` asks for the normal authenticated profile plus `reportData`, the compact own-report projection. The gateway supplies trusted Calendar context and the backend reuses the same fresh Contacts authority/directory. The browser accepts a compatible projection or falls back to its ordinary report read. A report-only failure keeps the verified profile and adds safe `reportError:{status:503,error,backendVersion,failureStage,diagnosticId?}`. Missing report data is not an empty absence list. Other profile callers retain their existing contract. Install Contacts backend, Deploy backend, then Roster frontend. The profile fallback supports an older backend response, but the new `receiptStatus` recovery path requires the updated backend.

`rosterOperations` adds `receiptStatus` with `command` containing the complete original mutation. The server checks the original request ID, current actor and stable payload digest. It returns only `accepted`, `requestId`, `savedIds`, `acceptedAt`, `acceptedRevision`, `currentRevision` and `confirmation` (`accepted` or `unconfirmed`). Receipt fields after `currentRevision` are present only when accepted; older retained receipts can return `acceptedRevision:null`. No prior role-sensitive result is returned. This read avoids Calendar, full timetable/quota context and the write lock; current authenticated authority is still required.

`accepted:false` means no matching retained receipt was found yet. The original request may still finish. Retain its original ID and payload. The absence UI uses an accepted receipt to stop retrying the write even if its subsequent view refresh fails. Stapler mutations replay the original command to finish lease cleanup after a lost acknowledgement. Baseline `rosterUpdate` has its own register receipts and is not covered by this operations receipt shortcut.

The Pages 2 MiB and signed 2,200,000-byte large Stapler transport allowance also covers `receiptStatus` when its original `command.operation` is `saveStapler`. Other operations retain the smaller bounds. Payload, signature and digest checks remain mandatory.

Contacts Roster reads use fresh named-table value batches and reuse verified directory groups. This removes metadata preparation and duplicate directory derivation, not current authority checks. The immutable baseline cache uses explicit gzip Blob metadata and retains validated source fallback. No request cache makes an old authority decision valid.

## v0.7.18 Stapler lifecycle

These authenticated commands are restricted to SMC/Admin and carry the original `requestId`, operation `revision`, source `staplerRevision`, `leaseSessionId` and `leaseFence`. Responses use the `staplerDates` view. Current source ownership and revision are checked before mutation.

| Operation | Additional input | Effect |
| --- | --- | --- |
| `renameStapler` | `date`, `name` | Changes only the display name; preserves date, final timetable and confirmation |
| `moveStapler` | `date`, `newDate`, `confirm:true` | Archives the original and moves preserved content to a vacant compatible date as Draft |
| `deleteStapler` | `date`, `confirm:true` | Archives the complete plan and removes its active dated record |
| `restoreStapler` | `date`, `archiveId`, `confirm:true` | Restores a retained archive to its vacant original nonpast date as Draft, with current validation |

Move checks trusted Calendar for both dates, the destination baseline, period/recess compatibility and class identity. It preserves final lessons, blank periods, Card Pit, mats and provenance while rebinding destination baseline accounting. It never overwrites an occupied destination. Move and Delete cannot rewrite published or past history. Source draft allocations, reservations and queued plan notices are retired as applicable; moving also cancels existing draft relief at the destination for review against its changed timetable. Baseline and online absences remain intact. Restore does not revive old publication or confirmation.

Rename and Delete need no Calendar service lookup for their metadata/history checks. Restore validates the original destination date. Move/Delete/Restore use dated leases and fence invalidation so an old editor cannot save into the changed lifecycle state. Successful exact retries remain idempotent. Archive visibility and Restore are recovery features, not authority to delete a plan that cannot be read.

## Retained v0.7.17 read and response changes

Stored compressed plans keep the `gzip-base64-v1` envelope and existing bytes. Unpacking passes `application/x-gzip` and `stapler.json.gz` to `Utilities.newBlob` before `Utilities.ungzip`. The validation digest, identity and revision bindings are unchanged. Decompression failure is an explicit saved-plan error, never an empty plan or baseline fallback.

A permitted `stapler` read of a saved date uses that plan's canonical baseline snapshot and skips unrelated relief-quota reads and complete baseline-cell reconstruction. The date list remains a projection of saved records and access state. Its success does not prove that the selected compressed plan can be opened. Current source and Calendar checks remain required, and Save/Confirm retain their full operational checks. This read does not reconcile or mutate the stored plan.

Load failures retain the available safe diagnostic reference, `backendVersion` and `failureStage`. `showRosterDiagnostics()` remains a read-only editor function that reports cached request history. Match the reference and timestamp; an old failure is not evidence that the current request failed.

Inbox mutations retain their accepted receipt and now include the current authorised thread projection after commit. The browser can update the selected conversation from that response instead of issuing an immediate `inboxThread` request. A missing receipt remains explicitly unresolved. Current authority, privacy filtering, revision checks and exact retry rules remain mandatory. Queued replies are not labelled delivered on acceptance.

Inbox context loads operational duty state only when needed for the caller's pending duty-alert acknowledgement. Private-media authorisation still checks current SMC/Admin authority. The separate notification Worker retains its existing dispatch and duty checks.

The own-record `calculations` request removes one redundant index check, reducing Deploy index reads from three to two while keeping the existing source guard. It introduces no cross-request quota cache, selector or change to whole-week-v5. Published-source applicability, pending commits, matching record identity, revision and history verification remain checked.

## Retained v0.7.15 transport and loading changes

A signed `rosterOperations` request with `input.operation:"saveStapler"` can contain at most 2,200,000 UTF-8 bytes of signed payload, including transport metadata. The existing request-plan guard remains 1,900,000 UTF-8 bytes and the Pages request bound remains 2 MiB. Other non-upload actions keep the previous 600,000-character signed-envelope bound. Signature verification, identity, approvals, request receipts, lease fencing, revisions and domain validation remain mandatory. That v0.7.15 transport change did not alter stored schema or compression format; the additive v0.7.16 validation metadata is described below.

`staplerDates` projects all locks from one fresh Script Properties snapshot per request. The planner may render the returned timetable before `acquireStaplerLock` completes; it remains read only until current ownership is verified. Write paths reread current ownership under the script lock. Late responses are rejected by current instance, load ticket, date and mode checks. No timetable response cache is introduced.

## Retained v0.7.16 canonical suspended plans

The operational document and plan remain schema 1. The existing `gzip-base64-v1` stored envelope gains a server-issued `validation:{version,date,baselineId,revision,digest}` object. Validation version is 1; `digest` is SHA-256 of the exact uncompressed plan JSON. `revision` binds to the saved plan revision, or `publishedRevision` for a separately saved published plan. Only the server pack path issues this proof after structural model validation.

Unpacking checks the content digest, date, baseline ID and revision before accepting that saved plan as canonical. A binding mismatch is an explicit 503 corruption error, not a fallback to an empty or recurring timetable. A missing or unsupported validation version requires full model validation; the next successful Save/Confirm atomic commit stores fresh proof. Ordinary application version updates do not invalidate a matching validation version. Unchanged validated plans can be reused without inflating unrelated dates.

`stapler` responses add `structuralValidation:{version,date,baselineId,revision}`. The browser may accept this only from the authenticated API response. A client-provided marker never authorises an unvalidated save. For a local edit with unchanged date, baseline, fixed catalogues and mats, validate changed card content and affected teacher/class overlaps. Changing those structural inputs requires full validation.

The accepted saved baseline snapshot is the editing source. A changed active baseline ID, parity, periods or end-of-day boundary requires review/reset. A recurring parity-only change does not rewrite the confirmed final day used operationally. Changed period timings fail visibly until the saved plan is reviewed/reset; the editor remains available for that recovery. Current identity, permissions, Calendar date rules, lease, record revision, absences, published relief and employment constraints remain checked. Internal `stapler*` operations, fields and storage keys remain unchanged by the display-name update.

## Retained v0.7.16 direct absence reporting

`saveAbsence` adds optional `fullDay`. Only the exact boolean `true` asks the server to resolve the complete period list separately for every selected date from its trusted effective timetable. Otherwise, the existing explicit `periods` input remains required. `fullDay:true` requires the absence type's `allowSelectAll` permission and still checks allowed periods, minimum start time, current-date/time restrictions, reporting eligibility and overlaps.

The existing `from`/`to` range remains one atomic command with one request-ID receipt. Dates with different timetable lengths resolve independently; an invalid date rejects the whole range. No new absence storage schema is introduced.

`#reportAbsence` preserves the intended route through authentication. In v0.7.18 the form prefills the signed-in teacher and shows Start/End dates and individual period buttons with times. Periods begin unselected; Select All and Clear remain available. The former Today/Tomorrow/Both and Full day/Partial day controls are removed. The retained API accepts `fullDay:true` for compatible callers, but the current form sends explicit selected periods. Eligible SMC/Admin can still select another teacher. The direct Submit absence action saves `instructionsNA:true`; it does not disable relief demand. The optional instructions and own-arrangements workflow remains available. Whole-baseline and post-save candidate reads are deferred until needed, while save authority and validation remain on the server.

## Retained v0.7.16 personal calculations

The read-only `rosterOperations` operation `calculations` accepts no teacher, version, date or year selector. The backend resolves exactly one current Staff ID from the authenticated Contacts identity; supplying `staffId`, `teacherId`, `versionId`, `year` or `date` is rejected. It returns the caller's own projection only, including for SMC/Admin. It does not return the school-wide Deploy document, other teachers' figures or R history rows.

| Response field | Meaning |
| --- | --- |
| `name`, `asOf`, `units` | Verified teacher display name, current Singapore date and `periods/week` |
| `source` | Published Deploy source metadata: name, revision, commit, valid dates and calculation model; null if absent |
| `calculation` | Own `active`, `eligible`, `R`, `available`, `reason`, `OF`, `Ti`, `breakdown` and aggregate `reference`; null when the published source cannot supply current figures |
| `calculationReason` | Explanation of missing, expired, mismatched or unavailable calculation data |
| `completion` | Own cumulative completed-relief totals, recorded entitlement and calculation status for the current calendar year through today |

`calculation.R` is the canonical weekly quota from the current published Deploy calculation. `calculation.breakdown.Wi` is weekly Wᵢ. The breakdown retains the Deploy model's `FTT`, `PD`, `duties`, `otherNonTeaching`, `nonTeachingActivities`, `employment`, `weeklyBudget`, `timetableFactor`, `rawR`, `normalR`, cap fields, `siuePeriods`, `offloadAllowance` and `offloadComponents`. The aggregate reference contains `T_avg`, `siuePercent`, `fullTimeTeacherCount` and `teachingPeriodTotal`. This is a personal view of the existing calculation, not a separate frontend formula or a conversion from a fortnight quota.

The published Deploy version must cover today and use the current calculation model, with exactly one matching teacher row. Pending Deploy save confirmation or conflicting source reads fail visibly. Missing, inactive or otherwise unavailable figures are not changed to zero.

`completion` includes `from`, `to`, `throughWeek`, `completed`, `entitlement`, `percentage`, `reason`, `historyVerified` and recorded-week metadata. The numerator sums the shared accounting model's completed relief cost through today, after its replacement, duplicate, correction and zero-cost handling; assigned or future work is excluded. The denominator sums the teacher's recorded weekly entitlements through the current week's Monday; excluded weeks contribute zero. The percentage is `100 * completed / entitlement` only when history is verified, the current week's quota exists, weekly rows are valid/unique and the denominator is positive. Otherwise it is null with an explanation. A history read failure makes completion unavailable without inventing totals. A zero-start history includes its start marker so incomplete recorded history is not presented as a full-year record.

## Current allocation preferences and retained exports

### Retained v0.7.16 allocation rules and proof status

`allocationPreferences` contains the six ranked rules `annualUtilisation`, `alternatives`, `weeklyRemaining`, `rotation`, `levelMatch` and `subjectMatch`. On first normalisation of an older configuration, `allocationRulesVersion:1` moves `subjectMatch` to the lowest priority and preserves the relative order of the other rules. After this one-time migration, saved priority edits are retained across reads and deployments. Same teaching subject and same teaching level use the verified baseline teaching profile; unknown evidence does not create eligibility.

`systemConfig` is readable by SMC and Admin and returns `canEdit`. SMC receives `canEdit:false` and `nameBridges:null`; only Admin may call `saveSystemConfig`. These permission checks are on the server.

| Config field | Meaning |
| --- | --- |
| `allocationRuleEnabled` | Boolean map for the six ranked rule IDs plus `dailyTotal` and `consecutive`; missing keys default to `true`, and saved `false` values remain false |
| `maxDailyPeriods` | Integer from 1 through 40; defaults to 9 only when absent |
| `maxConsecutivePeriods` | Integer from 1 through 40; defaults to 6 only when absent |
| `allocationRulesVersion` | Server-owned one-time migration marker, currently 1 |

Turning a rule off keeps its stored value and priority. A disabled ranked rule is omitted from the allocation score. The two enabled workload limits are strict feasibility constraints for both user-initiated and scheduled automatic allocation: 9 is allowed under a daily limit of 9, and 6 is allowed under a consecutive limit of 6. Turning off one workload rule removes only that limit. Hard availability, existing weekly R and employment restrictions, protected work and the coverage objective remain mandatory.

Count distinct occupied period indices from the effective dated timetable's teaching and FTT contact lessons, invigilation, and existing/proposed relief. Confirmed suspended replacements are not counted a second time against the recurring baseline. PD and other duties still block availability but do not enter these two workload counters. Evaluate the complete proposed period set, including a new relief period that joins two existing runs. Existing timetable work is not deleted to satisfy a new limit, and manual override policy is unchanged.

Allocation proposals and recorded optimisation runs include `ruleEnabled` and `workloadLimits:{dailyTotal,consecutive}`. A null workload limit means that rule is off, not that its saved numeric setting was removed.

Hard constraints are mandatory. Coverage is the fixed first optimisation objective; ordered business rule deviation is compared only among equally covered feasible arrangements. The score is an ordered vector, so a lower priority rule cannot compensate for a worse higher priority rule. Protected assignments remain fixed.

The allocation proposal returns `coverageProven`; its `solver` object returns `status` (`optimal` or `bounded`), `preferencesProven` and `searchComplete`. Recorded runs also expose `preferencesProven`, `preferenceSearchNote` and `policyScore`. Only a completed proof supports a minimum deviation claim. At proved maximum coverage, a bounded preference search is described as the best rule match found. An unproved maximum coverage result does not replace the last valid scheduled draft.

`systemConfig` remains saved in the operational document. Ordinary frontend/backend updates preserve its existing values when the same project, properties and data are retained. The one-time subject-priority migration above is explicit; later code deployment does not restore default settings over saved choices.

### Full teacher export

`exportDaily` retains the existing relief arrangements output. With `fullTeachers:true`, it additionally returns `teacherSummary` containing `plan`, `absences`, `assignments`, `demands`, `addedTeachers` and `staplerStatus`. This projection supports the selected day's full teacher workbook; it is not a publication operation.

Assign relief labels the full teacher action **Export Excel** and the existing relief workbook action **Export relief excel**. The full workbook uses the offline Stapler Module 3 structure with Subject, Class, Venue and Group rows and includes teachers with no relief assignment.

### Name Bridge control

One searchable selector replaces the separate search and selection controls. Server validation remains exact against the current baseline catalogue and Contacts Staff ID. Free text or a similar spelling cannot silently create an identity link.

### Final offline timetable import

The Stapler action is **Import Offline JSON**. Both Plan and Relief save intents use the shared offline payload. Import only the selected date, weekday and week sheet. Take the final placed cards, not their original source lessons. Source differences with the recurring online timetable do not block import.

Match current teacher names against validated TTB names and saved Name Bridges. Uncertain matches require explicit resolution. A represented teacher receives the complete replacement day, including blank periods; a teacher in the imported roster with no placed cards receives a blank day. A teacher entirely absent from that roster retains the baseline timetable and defaults present, subject to separately saved online absences.

Preserve current teacher, period, Subject, Class, Venue and Group, including staffed RECESS. Card Pit is unplaced. Do not apply suspension ranges again to final tiles. Keep recurring baseline, other dates, online absence records and allocator configuration intact. Import is a local draft operation. Save retains the dated draft without Confirm; Confirm makes the saved day available to summaries, Excel and allocation. Daily publication is separate.

Nonempty offline `reliefAbsences`, including saved assignments and swaps, remain explicitly rejected before draft mutation. The five supplied examples contain no offline absence decisions. They demonstrate timetable compatibility only.

## Retained operational contracts

These changes extend the authenticated Roster `/api/operations` route and Deploy backend. Write protocol remains `500`. Dates use `YYYY-MM-DD`; current-day rules use Singapore time. Existing operations retain their established payloads.

## v0.7.13 additions

These retained v0.7.13 contracts remain in force except where the v0.7.18 changes above extend them. See VALIDATION.md for current release evidence.

### Relief Health display and automatic eligibility

`config.reliefHealthPeriods` is an array of period numbers, defaulting to 1 through 12. `systemConfig.periods` exposes the available period catalogue. `health.visiblePeriods` selects chart columns only; the complete `health.periods` and full-day totals remain available. Hiding a period does not remove a lesson, assignment, R usage or eligibility check.

`config.employmentPeriodRestrictions` contains `{employment,periods}` entries. Defaults are SRE and FAJT, each with `[0,13,14,15,16]`. `systemConfig.employmentTypes` provides the configured employment catalogue. The policy restricts new automatic relief and the health opportunity pool, not existing timetabled work. It applies to both manual-triggered Auto-allocate and scheduled allocation.

A restricted manual candidate is marked `employmentPeriodRestricted:true`. The assign command must explicitly carry `employmentPeriodOverride:true` and a nonblank reason to override this restriction. The saved assignment and audit retain that flag and the existing `overrideReason` and `overrideWarnings`. SMC authority remains mandatory. The override does not bypass absence, occupied-period or other hard availability rules.

Tier 1 includes all eligible internal manual candidates and orders them by remaining weekly R descending before timetable fit and fairness. Explicit override, external and repurposed recess groups retain their separate treatment and eligibility constraints. This change does not reorder the Admin-configured automatic allocation preferences.

### Validated timetable name bridges

The `nameBridges` read returns `timetableNames`, containing all distinct exact teacher names from the baseline, plus baseline metadata. Each retained link has a `stale` flag when its timetable name is no longer in the current baseline. Old links are not automatically deleted.

`saveNameBridge` validates the selected timetable name against a fresh authoritative baseline, including changes since the editor opened. Partial local search is an input convenience, not permission to save custom text. Existing Contacts Staff ID validation, uniqueness and identity-conflict rules remain.

### Absence completion

`instructionsNA:true` applies to the currently selected absence and leaves relief demand intact. The No relief instructions needed action stays available after the absence-period confirmation step. Completing an already-saved first step updates that record rather than creating another absence. It is not a global preference shared between teachers.

### Configured duty summaries

`config.smcSummaryTimes` stores `{evening:["HH:MM",...],morning:["HH:MM",...]}`. Admin edits these Singapore-time slots through System Config. Entries must be unique valid times and are sorted; each phase accepts at most 96 entries. Evening accepts 16:00 through 23:59 and targets the following school date. Morning accepts 00:00 through 06:29 and targets the current date. An empty phase disables its summaries. Recipients are the eligible SMC duty members for the target date. Defaults are 16:00 through 21:30 every 30 minutes, then 05:30, 05:45, 06:00, 06:15 and 06:29.

The first configured slot of each phase sends a fresh summary, including zero absences. With the default schedule, 05:30 always starts a fresh morning cycle even if nothing changed overnight. If Admin changes the first morning slot, that slot starts the fresh cycle instead. Later slots compare effective absent teachers and periods with each recipient's last successful summary in the same phase. Cancellations count; allocation-only changes do not. Failed or uncertain sends do not advance the successful checkpoint.

The `smc_report` outbox data includes `scheduledSummary:{date,phase,time,first,at,key,fingerprint}`. The fingerprint uses stable teacher IDs and each teacher's sorted union of absent periods. Successful sent/provider statuses count; a failed delivery does not. Dispatch rechecks the configured slot, current absences and target-date duty membership. A matching sending or uncertain job blocks overlapping attempts, and later provider success cancels redundant queued updates. This preserves the existing queue API and template routes.

Configured duty summaries alone receive the quiet-hour exception needed for 21:30 and 05:30. Other notification routes retain their quiet-hour rules. Auto-allocation scheduling and the operational handover remain unchanged; there is no extra routine 06:30 summary outside the configured list.

## Operational writes

Ordinary mutations require a 36-character `requestId` and a non-negative safe-integer `revision`. The backend takes the shared script lock, loads the latest operational document, checks an exact retry receipt, validates the command and commits once. Changed payload or actor with the same request ID is rejected. The lock wait remains bounded at eight seconds; timeout asks for the same request to be retried.

| Command | Revision and permission rule |
| --- | --- |
| `saveAbsence` without `id` | Accepts an older revision, but never a future, missing or invalid revision. Validates the new report against current state inside the lock. Ordinary staff report themselves; SMC/Admin may report others. |
| `saveAbsence` with `id` | Requires current global revision, existing-record ownership and editable date. Cannot change the absent teacher. |
| Shared relief/settings writes | Keep current global revision checks. A stale revision is not permission to overwrite a newer decision. |
| `saveStapler`, `confirmStapler`, legacy `publishStapler`, `resetStapler` | May tolerate unrelated global revision advances only with the matching live dated lease and the current saved-plan revision. |

Overlapping absence periods are rejected using Staff ID and the existing same-person mobile check. Types, detailed reasons, date restrictions, allowed periods and current Contacts category are still validated. `people[].absenceEligible` is a reporting flag, not a relief-allocation flag. New reports exclude the requested SL, MK, Support, SAT, OSO and AE categories. Existing records can still be edited under their normal authority/date rules.

The category test rejects a nonempty `mk` value, `appointmentLevel` equal to `SL`, or group membership in `SL`, `MK`, `Support` or `SAT`. After removing an `Acting` or `Ag` prefix, role aliases include SL/SLs, School Leader(s), P, VP variants, Principal, Vice Principal, MK variants, MKE, Support/Support Staff, SAT, OSO/OSOs and AE. Role matching is case-insensitive. It does not blanket-reject inactive people or reuse ad hoc relief eligibility.

`instructionsNA:true` means no lesson instructions are supplied for that report; it does not set `reliefRequired:false`. A confirmed save clears the previous report's editor state before another teacher is reported. Exact retries preserve the original payload.

## Shared subject rule

`systemConfig` returns `config.sharedSubjectCoverEnabled` and `config.sharedSubjectCoverSubjects`, plus the baseline subject catalogue. `saveSystemConfig` is Admin-only and accepts those fields alongside existing exclusion, allocation-preference and scheduler fields. Omitted new fields preserve the current values. Defaults are `true` and `["Form"]`; selected labels are bounded to 200 entries, each at most 100 characters, and must be known or already saved.

Matching uses date, period, normalised subject and one known venue, with at least two distinct timetabled teachers. Unknown or multiple venues remain individual demand. A canonical grouped demand contains:

| Field | Meaning |
| --- | --- |
| `id` | `shared:` plus the canonical shared lesson key |
| `sharedLessonKey` | JSON identity of date, period, normalised subject and venue |
| `members` | Original individual demand records, including their lesson and instruction identities |
| `absenceIds`, `absentIds` | Source absence records and teachers |
| `sharedPresentIds` | Eligible present timetabled teachers for this shared period |

Reporting an absence can immediately create a draft zero-cost Combine for a present co-teacher. If no co-teacher remains available, allocation sees one group vacancy. Explicit individual manual decisions and accepted own arrangements are preserved outside grouping. Own-arrangement requests accept individual lessons only. Reporting, Confirm and daily publication are separate actions.

## Named duty lists

`dutyRoster` returns `revision`, `date`, `today`, verified eligible `people`, `lists`, the selected day's `duty`, `source`, `available` and `warning`. Each list includes `id`, `name`, `startDate`, `endDate`, `staffIds`, `version`, member names, status and audit metadata. Only active verified SMC members who pass duty eligibility are selectable; SL, AM, OM and Support exclusions remain enforced.

Use `setDutySMC` with the ordinary `revision` and `requestId`:

| Action | Additional fields and effect |
| --- | --- |
| `save` new list | `name`, `startDate`, `endDate`, nonempty `staffIds` |
| `save` existing list | Same fields plus `listId`, `listVersion`; replaces current/future daily membership owned by that list |
| `activate` | `listId`, `listVersion`; changes start to today and retains the saved end and members |
| `delete` | `listId`, `listVersion`, `confirm:true`; marks the list deleted and removes its current/future projection |

Ranges are inclusive. Another non-deleted current/future list cannot overlap. Past lists are view-only, and historical daily membership survives later changes. Legacy calls without `action` remain compatible. Existing daily rows become named legacy lists on read without writing; a supported list mutation persists their ownership mapping. Prune respects retained daily references before removing list metadata.

## Stapler lease operations

These three operations use separate Script Properties metadata and do not require an operational `requestId` or advance the operational revision. They still require authenticated authority and a short script lock.

| Operation | Input |
| --- | --- |
| `acquireStaplerLock` | `date`, UUID-shaped `leaseSessionId`, current `leaseFence`, current `staplerRevision` |
| `renewStaplerLock` | `date`, matching `leaseSessionId`, matching `leaseFence` |
| `releaseStaplerLock` | `date`, caller `leaseSessionId`, current `leaseFence`; Admin-only abandonment recovery |

The response contains `lock:{fence,active,mine,ownerName,expiresAt,renewAfterMs,canRelease}`. Acquisition replay may also return `staplerRevision`. The lease expires after 180,000 ms; the planner schedules renewal after 45,000 ms. Acquiring an active lock owned by another session returns conflict. A stale fence cannot regain ownership.

`stapler` and `staplerDates` attach current lock status; reads carry `leaseSessionId` to identify the current browser session. Plan responses preserve the underlying permission as `planningAllowed` and gate `canEdit`, `canConfirm` and `canReset` on ownership. Plan writes carry the lease fields and saved `staplerRevision`. Save retains the lease. Confirm releases it after commit, including a successful exact retry. Navigation stops renewal; expiry or Admin release permits another acquisition. Failed renewal retains local changes but pauses editing.

Each `ROSTER_STAPLER_LEASE:date` record is limited to 1,200 UTF-8 bytes. Acquisition allows at most 256 current/future records and rejects a serialized Script Properties snapshot plus the record allowance over 350,000 bytes. It cleans only past dated lease records. Future tombstones must be retained to reject delayed stale acquisitions.

## Compact reads and health

Allocation reads can reuse the locally cached immutable baseline while returning current dated authority and assignments. Eligible cell mutations can return `allocationPatch:true`, `effectiveAssignments` and updated revisions without the full timetable. A changed source forces current validation or a full response; the cache does not authorise a save.

Each health period includes `potentialStaffIds` for the original eligible pool. Current free counts remain in `green`. Red assignments are paired with that teacher's retained baseline marker; an outside-pool assignment is not evidence of green capacity. Older responses without pool IDs remain explicitly unknown.

## Inbox API and worker boundary

| Operation | Main input |
| --- | --- |
| `inboxList` | Optional `search`, `filter`, `cursor`, `limit` |
| `inboxThread` | `waId`, optional `before`, `limit` |
| `inboxAssign` | `waId`, `assignedTo`, `expectedRevision`, `requestId` |
| `inboxSetHandled` | `waId`, `handled`, `expectedRevision`, `requestId` |
| `inboxReply` | `waId`, `expectedRevision`, `requestId`, `kind`, and text or template fields |
| `inboxTemplates` | No client authority override; returns currently supported approved templates |

Successful authorised `inboxList` responses additionally return `configuration:{enabled,liveVerified:false,capture,replies,voice,templates}`. Each of the four capability objects has `configured:boolean` and `missing:string[]`. Missing entries are setting names, never values. The metadata is appended by the Roster worker only after the backend accepts the SMC/Admin read. It is absent from denied responses and makes no provider request or send.

This checks local configuration presence/format only. It does not verify actual credentials, service-secret agreement, Meta subscriptions, storage writes, approved templates or the separate notification Worker. The UI must not label it live or infer disabled capture from an empty conversation list. An older worker without this field has unknown readiness. Existing `WHATSAPP_ENABLED`, menu and automation flags retain their separate purposes; no new switch or activation is introduced. See [Inbox activation](docs/INBOX_v0.7.18.md).

All are restricted to SMC/Admin. Templates carry `name`, `language`, `parameters`. Private audio is streamed through the authenticated media route after a fresh permission check. Provider and storage identifiers used only for dispatch are stripped from browser responses.

Replies and alerts are durable queue items serviced by the updated minute Worker. Normal replies require the sender's current 24-hour customer window at acceptance and dispatch. A never-attempted reply expires after five minutes; uncertain sends are held for review. WhatsApp duty alerts expire after two minutes and require current duty membership plus the dedicated approved template and flag. Existing inbox assignment does not hide a conversation from other authorised staff.

The inbound menu uses Roster Pages `WHATSAPP_CURRENT_RELIEF_URL` for Report Absence. It validates the HTTPS URL and only returns a link; it performs no absence migration or submission. Private audio requires the Roster Pages `WHATSAPP_INBOX_MEDIA` R2 binding. Live configuration, template approval and delivery are separate installation checks.
