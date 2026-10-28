# GSiS v0.7.14 Roster operations API

## v0.7.14 changes

### Allocation preferences and proof status

`allocationPreferences` includes the existing `annualUtilisation`, `alternatives`, `weeklyRemaining` and `rotation` rules plus `subjectMatch` and `levelMatch`. A saved four-rule order is retained and extended with subject then level. New teaching matches use the verified baseline teaching profile. Unknown or unavailable matching evidence does not create eligibility.

Hard constraints are mandatory. Coverage is the fixed first optimisation objective; ordered business rule deviation is compared only among equally covered feasible arrangements. The score is an ordered vector, so a lower priority rule cannot compensate for a worse higher priority rule. Protected assignments remain fixed.

The allocation proposal returns `coverageProven`; its `solver` object returns `status` (`optimal` or `bounded`), `preferencesProven` and `searchComplete`. Recorded runs also expose `preferencesProven`, `preferenceSearchNote` and `policyScore`. Only a completed proof supports a minimum deviation claim. At proved maximum coverage, a bounded preference search is described as the best rule match found. An unproved maximum coverage result does not replace the last valid scheduled draft.

`systemConfig` remains saved in the operational document. Ordinary frontend/backend updates preserve its existing values when the same project, properties and data are retained. New preference identifiers extend the previous order; code deployment does not restore default settings over saved choices.

### Full teacher export

`exportDaily` retains the existing relief arrangements output. With `fullTeachers:true`, it additionally returns `teacherSummary` containing `plan`, `absences`, `assignments`, `demands`, `addedTeachers` and `staplerStatus`. This projection supports the selected day's full teacher workbook; it is not a publication operation.

Assign relief labels the full teacher action **Export Excel** and the existing relief workbook action **Export relief excel**. The full workbook uses the offline Stapler Module 3 structure with Subject, Class, Venue and Group rows and includes teachers with no relief assignment.

### Name Bridge control

One searchable selector replaces the separate search and selection controls. Server validation remains exact against the current baseline catalogue and Contacts Staff ID. Free text or a similar spelling cannot silently create an identity link.

### Offline import

The Stapler action is **Import Offline JSON**. Both `stateType:"plan"` and `stateType:"relief"` are valid save intents for the shared offline payload. The importer selects `selectedSheet`, `selectedDay` and `selectedDate`; a whole-fortnight payload must not overwrite other dated plans.

Current teacher assignment and original source teacher are separate concepts. Match names against current people and saved Name Bridge aliases; unresolved or ambiguous names require explicit resolution. Offline tile identifiers are not GSiS staff identities. Original lesson anchors must be preserved or recovered from `workbookBase64` where old payloads omit source fields.

Placed `teacher` and `class` tiles retain their saved content and owners. `pit` is unplaced. Custom classes, duties, suspensions and assigned recess cards must survive import without becoming default unstaffed recess blocks. Import remains a draft operation with existing save, lease and authority checks; it does not overwrite allocation policy, publish the day or create notification intent merely by parsing a file.


Unresolved names leave the draft unchanged. Admin can explicitly map an imported name to an eligible verified Contacts entry for this import. This is a per-import resolution and does not silently write a permanent Name Bridge. Active staff missing from the baseline require a corrected Name Bridge and a reload. Other planners ask Admin to resolve the mismatch.

Imported custom class labels become dated ad hoc classes; imported venue text remains editable and is listed for review. If an assigned imported recess duty conflicts with a generated default recess marker, the generated marker moves to Card Pit and the planning notes identify the affected class. New offline cards retain their original owner in provenance while the current owner performs the scheduled duty; creating such a card is not itself a relief transfer. Reimporting the same card retains its saved source and supports moving or reassigning it through the existing validation. Swap assignments and incomplete or No relief absence markings stop with an explanation because absence reporting remains a separate Roster operation.

## Retained operational contracts

These changes extend the authenticated Roster `/api/operations` route and Deploy backend. Write protocol remains `500`. Dates use `YYYY-MM-DD`; current-day rules use Singapore time. Existing operations retain their established payloads.

## v0.7.13 additions

These retained v0.7.13 contracts remain in force except where the v0.7.14 changes above extend them. See VALIDATION.md for current release evidence.

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

All are restricted to SMC/Admin. Templates carry `name`, `language`, `parameters`. Private audio is streamed through the authenticated media route after a fresh permission check. Provider and storage identifiers used only for dispatch are stripped from browser responses.

Replies and alerts are durable queue items serviced by the updated minute Worker. Normal replies require the sender's current 24-hour customer window at acceptance and dispatch. A never-attempted reply expires after five minutes; uncertain sends are held for review. WhatsApp duty alerts expire after two minutes and require current duty membership plus the dedicated approved template and flag. Existing inbox assignment does not hide a conversation from other authorised staff.

The inbound menu uses Roster Pages `WHATSAPP_CURRENT_RELIEF_URL` for Report Absence. It validates the HTTPS URL and only returns a link; it performs no absence migration or submission. Private audio requires the Roster Pages `WHATSAPP_INBOX_MEDIA` R2 binding. Live configuration, template approval and delivery are separate installation checks.
