# GSiS v0.7.12 contracts

Write protocol remains `500`. Staff ID remains the cross-application identity. Authenticated authority is checked at the service boundary; browser caches and client role flags do not authorise writes. Existing contracts remain in force except for the changes below.

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
