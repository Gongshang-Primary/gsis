# GSiS v0.7.14 contracts

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

Write protocol remains `500`. Staff ID remains the cross-application identity. Authenticated authority is checked at the service boundary; browser caches and client role flags do not authorise writes. Existing contracts remain in force except for the changes below.

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

## Absence reporting and concurrency

A new `saveAbsence` command without `id` can use a non-negative safe-integer `revision` no greater than the current revision. It is applied to the latest operational document while holding the script lock. Current ownership, dates, types, periods, category eligibility and overlapping absences are validated before commit. An unrelated report no longer causes rejection solely because it advanced the global revision. An edit with `id` and other shared operations still require the current revision, except for separately fenced Stapler writes.

The same `requestId`, actor and payload replay the stored receipt. Reusing that ID with a different actor or payload is rejected. Absence, assignment, audit and notification intent still share one durable document replacement; this is not one independent storage transaction per teacher.

Contacts supplies `mk`, `appointmentLevel`, `role` and `groups` for reporting eligibility. Roster returns `people[].absenceEligible`. New reports exclude SL, MK, Support, SAT, OSO and AE categories using those fields, including the implemented role aliases. This rule does not use `adhocEligible`, blanket exclusion of inactive staff or every non-teaching role. Existing records remain manageable under the normal ownership and date rules.

## Shared subject coverage

System Config adds `sharedSubjectCoverEnabled`, default `true`, and `sharedSubjectCoverSubjects`, default `["Form"]`. Admin can disable the rule or choose subjects from the baseline catalogue. Existing saved choices remain valid if temporarily absent from that catalogue.

A shared lesson requires matching date, period, normalised subject and one known physical venue, with at least two distinct timetabled teachers. Blank, placeholder and multi-venue cells do not qualify. Demand retains a canonical `sharedLessonKey`, `members`, `absenceIds`, `absentIds` and `sharedPresentIds`. Individual lesson and instruction identity remains in each member.

When a suitable timetabled teacher remains present, reconciliation creates a draft Combine with `origin:"shared-subject"`, `combination:true` and `rCost:0`. When none remains, the group supplies one vacancy to allocation. Existing explicit individual manual or accepted own-arrangement coverage is kept outside automatic grouping. Grouped demands cannot be used for own-arrangement requests. Publication and notification remain separate from reporting an absence.

## Named SMC duty lists

`smcDutyLists` stores named lists with `id`, `name`, inclusive `startDate` and `endDate`, `staffIds`, `source`, `version`, creation/update metadata and optional activation/deletion metadata. `smcDutyRoster` remains the dated membership projection used by existing notifications; each projected row has `dutyListId`.

The `dutyRoster` read returns `lists` with resolved member names and Current, Upcoming, Past or Deleted status. `setDutySMC` accepts `action:"save"|"activate"|"delete"`, `listId` and `listVersion`. Save uses name, dates and members; activate replaces the start date with today in Singapore and keeps the end date; delete requires `confirm:true`. Overlapping non-deleted current or future ranges are rejected. Past daily membership survives editing, activation and deletion. Legacy daily rows are projected as named lists and persisted into the new structure on a supported write. Pruning removes list metadata only when no retained dated row still refers to it.

## Stapler editor leases

Deploy Script Properties hold one `ROSTER_STAPLER_LEASE:YYYY-MM-DD` record per planning date. This metadata is separate from the operational document. Acquisition, renewal and Admin release use the script lock but do not rewrite `Roster operations.json` or advance its revision.

The three operations are `acquireStaplerLock`, `renewStaplerLock` and `releaseStaplerLock`. Each carries `date`, `leaseSessionId` and `leaseFence`; acquisition also carries `staplerRevision`. A lease lasts 180 seconds and the active planner renews every 45 seconds. Save, Confirm and reset require the matching live lease and saved-plan revision. Confirm releases the lease only after the operational save commits. A release raises the fence so an older session cannot write again.

Planning and date-list responses expose `lock` with `fence`, `active`, `mine`, `ownerName`, `expiresAt`, `renewAfterMs` and `canRelease`; plan responses also expose `planningAllowed`. Only Admin can explicitly release an abandoned lock. There is no automatic takeover of an active session.

Acquisition retains at most 256 current/future dated records, limits a record to 1,200 UTF-8 bytes and stops before the serialized Script Properties snapshot plus a 1,200-byte allowance exceeds 350,000 bytes. Past dated lease records are cleaned on acquisition. Future release tombstones remain necessary to reject delayed requests; they are not disposable cache entries.

## Read projections and browser storage

The immutable baseline model can be retained in IndexedDB and memory under an account/permission scope. Current profile and date metadata still select the valid model. Cache failure falls back to a server read; sign-out or changed authority clears the old scope. An allocation cell response may use `allocationPatch:true` with the affected assignments and updated revision instead of repeating the school model. Server source and permission checks remain authoritative.

Relief health periods now include `potentialStaffIds`. This identifies the original eligible pool for paired green/red markers; `green`, `remaining`, `potential` and quota arithmetic keep their existing meanings. A client must not infer an eligible pool when the new field is absent.

## WhatsApp Inbox and continuity

Authenticated Roster exposes `inboxList`, `inboxThread`, `inboxAssign`, `inboxSetHandled`, `inboxReply` and `inboxTemplates` to SMC/Admin. Inbox metadata uses a separate private Drive document pointed to by `ROSTER_INBOX_FILE`; private voice-note bytes use the Roster Pages binding `WHATSAPP_INBOX_MEDIA`. The browser receives neither provider tokens nor private storage keys.

Incoming customer timestamps control the 24-hour normal-reply window. Replies queue durably for the scheduled Worker, with the authenticated replying staff recorded. Approved templates are required outside that window. Current duty SMC alone receive new-message alerts; no duty team means no broad fallback. Activation requires the existing school sender credentials, template-account configuration, the updated scheduled Worker and private audio binding. Optional WhatsApp duty alerts additionally require the approved `gsis_inbox_new_message_v1` template and `WHATSAPP_INBOX_ALERTS_ENABLED=true`.

`WHATSAPP_CURRENT_RELIEF_URL` is a Roster Pages setting for the contact menu's Report Absence link, initially `https://roster.diveanalytics.com/`. It opens that service without copying or submitting an absence. The scheduled Worker does not need this inbound-menu setting. Packaging these changes does not activate messaging or verify live delivery.
