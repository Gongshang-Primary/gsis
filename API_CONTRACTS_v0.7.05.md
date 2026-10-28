# GSiS v0.7.05 service contracts

Existing authenticated Contacts, Deploy, Layout and Calendar interfaces and write protocol 500 remain. Roster keeps `/api/operations`. Mutations authenticate current school identity and validate authority against current state under the existing script lock. Request IDs retain exact-retry idempotence. A rejected or stale operation cannot partially consume quota.

`shared/roster-operations.js` owns domain transitions. `shared/roster-allocation.js` owns quota, eligibility, solver, health and deterministic fairness state. `backend/RosterOperations.gs` supplies authenticated projections and atomic persistence. Browser-provided eligibility is never authoritative.

## Calendar date batch

The authenticated Calendar action `rosterDates` accepts `{dates:["YYYY-MM-DD",...]}` with 1 to 62 unique valid dates. It returns `{dates:[...]}` in request order. A released date uses the existing `rosterDate` projection. An unavailable, archived or ambiguously configured year returns `{date,code:"YEAR_UNAVAILABLE"}` for that date. The backend reads the fresh release list once and each released year once.

The Roster Worker verifies response membership, cardinality and field types before forwarding authoritative Calendar context. Multi-date reads use one 12-second Calendar deadline followed by the existing 25-second Deploy deadline. Malformed results fail closed. There is no fallback to separate per-date requests. Single-date and private notification service contracts remain compatible. The notification service cannot use the staff-only batch action.

The matching Calendar backend must be installed before the new Roster Worker. No schema migration or new backend URL is required.

## Roster read projections

`candidates` accepts the existing mutual-arrangement purpose plus `byPeriod:true` and the affected demand IDs. It returns `candidatesByPeriod`, scoped to the current actor, absence date and valid demands. Each candidate includes only staff ID, name, availability, reasons and external status. See API_ROSTER_OPERATIONS_v0.7.05.md.

Immutable timetable bytes may be omitted when the browser advertises an already held model ID. The browser retains up to eight models, clears them on session-owner changes and refreshes dated Calendar context after 60 seconds. Availability and write decisions still use current server state.

## Retained publication and private access

Publication checks the daily allocation revision atomically. Stale publication refreshes the assignment comparison. Drafts never enter teacher projections. Published cancellations remove the overlay while retaining acknowledgement history.

Private external capabilities remain recipient, purpose and date scoped, HMAC signed and expiring. Values travel in URL fragments and authorised POST headers, not query strings. Responses contain only the recipient's timetable and permitted arrangements. Explicit request response and acknowledgement remain the only private mutations.

Signed notification operations, durable leases and exact approved-template checks retain the v0.7.02 contracts. Sending and scheduled automation remain disabled. The public privacy page does not grant API access or establish recipient permission.

## v0.7.04 absence save projection

`saveAbsence` accepts the optional boolean `includeMutualCandidates:true`. A successful save can return `mutualCandidates`, including the saved `absenceId` and the existing `candidatesByPeriod` projection. The candidate date must belong to an absence saved by the request. The backend reuses the save context and reads optional quota after releasing the save lock.

Candidate preparation failure returns `mutualCandidates:null` and `mutualCandidatesUnavailable:true` with the completed save result. It does not report the durable save as failed. Clients retain the saved absence and can request candidates again. Request identity and payload remain unchanged on uncertain-save retry.

## v0.7.04 Subject Type

Each Deploy version can contain a `subjectTypes` object keyed by its exact Subject Load subject names. Editable values are `class`, `tg` and `both`. An absent key uses the shared policy default. RRP, SDR, CCE and LSM default to `tg`. Fixed subject rules still take precedence.

The existing `saveDraft` edit is `{operation:'setSubjectType',subject,expected,value}`. `expected` is the raw saved value, or `null` if no value was saved. It is not the effective default. The edit key is `subject-type:<subject>`. Admin authority is required before receipt replay and at save time.

The narrow read includes `loads` and `subjectTypes`, plus common metadata. Policy edits apply before other edits in the same batch. Request fingerprints retain the original wire order. Invalid values, unknown subjects, stale expected values and incompatible new allocations reject the batch without a partial write.

The shared predicate governs offered class cells, TG choices and planned demand. Existing assignments and defined TGs remain visible and counted. Removals remain available. Automatic PAL additions and legacy conversion obey the same policy. Subject Type is independent of the workload category that classifies teaching and non-teaching periods.

## v0.7.04 template selection

The evening contract selects `gsis_relief_evening_v1` with its exact approved body, language and positional parameters. The v2 template remains on Meta and is not a fallback. Template readiness is reported per notification type. An approved template is insufficient by itself to enable dispatch.

The conditional relief instruction submission remains a prepared artifact. No provider submission or activation is part of the release. See `WHATSAPP_SETUP.md` for the current configuration and readiness contract.

Roster Pages `notificationStatus` returns `routes` keyed by contract type. Each route has `name`, `enabled`, `status`, `approval` and `ready`. The summary adds `checkedAt`, `approvalCheckRequired`, `templatesEnabled` and `templatesReady`. Cached approval metadata belongs to the serving Worker instance and expires after five minutes. Cold or expired metadata is unverified. Normal page loads do not fetch Meta to fill it.

The aggregate `ready` requires the global flag, at least one enabled route and approval for every enabled route. Per-route dispatch remains independent. One pending route does not make a different approved route eligible or ineligible. Both its global and route switches still have to permit sending. The SMC/Admin table presents sending state separately from approval; neither confirms delivery.

## v0.7.05 current R projection

Roster uses reliefRosterQuota_ inside the authenticated Deploy backend. The existing GET /api/relief route remains available. Roster does not make a redundant HTTP call to that same backend.

The projection includes rows of {id,R}, versionId, from, to, formClasses, teachingGroups and source. Source contains service, versionId, revision, from, to, commit, calculationVersion, cacheDay and checkedAt. A non-finite quota is null, not zero. The active published Deploy entry and source guard determine validity.

Cache scope includes workbook, published version ID, store, commit, revision, calculation model and Singapore day. Source guards still run on hits. Entries expire by Singapore midnight, subject to a six-hour platform maximum and early eviction. A miss or unusable cache recalculates from the confirmed source. Authority and mutable Roster cover are outside this quota cache.

Roster matches stable staff IDs after uniquely matching Contacts names to the active timetable for each duty date. The quota's effective dates must cover that date. Ambiguous timetable names and unavailable quota do not become automatically eligible. Current and future planning use this current projection; historical annual entitlements retain their recorded values and explicit exclusions.

## v0.7.05 manual fill-only allocation

The authenticated operations endpoint accepts autoAllocate with the existing date, revision and requestId fields. Only SMC may invoke it. The matching v0.7.05 Deploy backend must be installed before this client operation is used. It uses the existing atomic mutation, audit and exact-retry receipt protocol.

The operation keeps every valid effective existing assignment fixed and selects only uncovered periods that have not started. It does not change No Relief Needed decisions, publish, enable scheduling or change provider activation. Normal pre-operation reconciliation can invalidate future cover whose timetable or absence has changed. Capacity warning logic can queue a duty-SMC notice; dispatch still depends on the existing disabled sending flags. It requires a verified school day and verified annual accounting. Missing prerequisites or an uncertified solver result produce a paused result with no new assignment IDs.

The manual operation can run after the scheduled 06:29 cutoff for periods that have not started. The existing optimise and scheduledRoster operations retain their established scheduling and reallocation rules. See API_ROSTER_OPERATIONS_v0.7.05.md.
