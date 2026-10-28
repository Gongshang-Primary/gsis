# GSiS v0.7.12 Roster operations API

These changes extend the authenticated Roster `/api/operations` route and Deploy backend. Write protocol remains `500`. Dates use `YYYY-MM-DD`; current-day rules use Singapore time. Existing operations retain their established payloads.

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
