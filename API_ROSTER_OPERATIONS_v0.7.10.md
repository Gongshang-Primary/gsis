# Roster v0.7.10 operations

## Domain surface

Retain the v0.7.00 operation names for existing clients. Add explicit operations for automatic accounting/optimisation, manual Undo, combinations, custom instructions, day export, publication acknowledgement/history and Recess Regression. Allowed operation sets and their payload validation are in `backend/RosterOperations.gs` and `shared/roster-operations.js`; tests provide executable payload examples. Do not invent parallel endpoints or bypass current Contacts authority.

Recess Regression uses `saveRecess` and `deleteRecess`, level selections, two inclusive dates and validated per-level numbered periods. Stable activation/class/date/period identifiers prevent duplicates. Calendar and authoritative class catalogues determine school days/classes. Ordinary assignment/publication/withdrawal rules apply; existing recess duty may be repurposed for zero additional R, additional supervision costs one R per period.

## Notification service

Signed service operations: `scheduledRoster`, `claimNotifications`, `prepareNotification`, `notificationResult`, `notificationDelivery`, `inboundMessage`, `inboundReplyResult`, `externalDuties`, `externalRespond`, `externalAcknowledge`.

A claim is a durable lease, not proof of sending. `prepareNotification` rechecks live recipient authority, publication version, current acknowledgement, quiet window, expiry and approved template routing immediately before dispatch. Unprepared expiry refunds the attempted claim; prepared expiry is uncertain and cannot be blindly resent.

`notificationResult` and delivery callbacks correlate business notification, claim and provider message IDs. Confirmed failures have three attempts maximum. Positive delivery cannot be downgraded by stale callbacks. Pending/disabled contracts stay blocked without consuming send attempts. Backend failure to confirm a result is ambiguous, not a safe reason to send again.

## Instruction semantics

All matching custom rules are retained separately by stable rule/version and assignment period. OR applies within selected levels, AND across different filter types. Teaching groups use IDs. Published instruction snapshots never mutate in place. Rules removed or changed after publication produce a new publication revision when SMC publishes. Acknowledgement suppresses reminders, not an otherwise-due supplemental instruction. Reassignment invalidates outgoing queued instructions.

## Storage and permissions

The existing single-document store remains transactional under the script lock and revision checks, with a 12 MB guard. Read projections are scoped and indexed; storage writes replace the document. Preserve append-only factual corrections and historical publications. Custom urgent messages are accessible only to their eligible recipient set; ordinary allocation alerts use the day's duty-SMC list.

## v0.7.02 read contracts

Authenticated `directory` returns `{date,people:[{id,name}]}` for active Contacts plus nondeleted external activations on the selected date. It reads activation records without timetable, Calendar, quota, reconciliation or writes. Historical record-only reads retain their role requirements and skip timetable-register reconciliation. Current duty and all mutation paths retain fresh authority and cancellation handling.

The signed service `connectionStatus` reads the Contacts service directory and returns only read-only connectivity metadata. It does not access operational state, claim the notification queue, allocate cover or send messages. Worker diagnostics are scheduled and disabled by default; there is no HTTP diagnostic endpoint.

## v0.7.03 mutual candidates

The read operation `candidates` accepts `{purpose:'mutual',byPeriod:true,date,demandIds}`. `demandIds` contains at most 100 unique current demand IDs, all for the selected date and permitted by current ownership or SMC authority. The response supplies `candidatesByPeriod`. Each candidate exposes only `{staffId,name,available,reasons,external}`. Activated external teachers remain eligible for display even without a baseline row.

The browser keeps the verified projection for at most 60 seconds, keyed to actor/session, absence, date, revision and timetable. Reopening preserves its original verification time. A failed refresh disables stale choices. Period selection, target selection and name filtering use existing local rows. Selection never submits a request. The existing Submit requests and acceptance operations recheck current authority, availability and quota before writing.

## v0.7.03 absence and recovery behavior

New clients omit Remarks from forms and save payloads. An omitted field preserves historical stored remarks. Explicit updates or clears from older clients retain their existing meaning. `reliefRequired:false` produces no relief demand.

Uncertain writes keep the exact request ID and payload for receipt confirmation. Read-only menus and filters remain available, while new mutations wait for confirmation. A confirmed receipt refreshes the current page/date. Definite revision conflicts retain editable drafts, refresh the revision and require explicit review before another submission. Failed resynchronisation blocks further writes. Old-session responses cannot replace or clear a later session. Same-account reauthentication retains an uncertain write, while unrelated unsaved forms clear at authentication teardown.

`deleteAbsences` remains an authenticated owner/SMC operation with `confirm:true` and explicit IDs. It uses the existing lock, revision, receipt, audit and reconciliation protocol. It marks records deleted rather than erasing history. This release does not itself clear any live record.

## v0.7.04 save preparation and local reads

`saveAbsence` can request `includeMutualCandidates:true`. The response can include `mutualCandidates` with `absenceId`, revision, date, timetable ID, parity and `candidatesByPeriod`. The backend verifies that the selected date belongs to the saved result and that the actor can access the absence.

The save retains current authority, revision and idempotency checks. The shared lock protects the durable state update and receipt. Response projection and optional candidate preparation run after unlocking. Optional quota is read once. If candidate preparation fails, the response retains the successful save result and marks `mutualCandidatesUnavailable:true`.

Clients can open View or Edit synchronously when they hold a complete same-date entry snapshot. Editor data is paired with its authoritative revision. Incomplete snapshots use the existing read operation. A failed read offers Retry with a diagnostic reference. A later date or account change invalidates an older read response.

Manage reported absences uses saved lesson snapshots for read-only details. A confirmed save or confirmed receipt closes the original editor, including when the user has changed dates. Conflicts retain drafts and require review after an authoritative refresh. Failed or denied refreshes do not leave stale controls authorised to write.

Report Absence intent loading and its 60-second reuse are client read optimisations. Neither bypasses current server checks on a save. Colleague filtering and selection remain local until the user submits requests.

## v0.7.07 Assign Relief and autoAllocate

Assign Relief no longer renders the manual absence form or notification readiness panel. The selected date's reported absences supply its teacher tiles. Publication and daily export remain in Absences by Date > Relief Assignments. Recess supervision remains a separate group below the reported absences. The shared notification status contract is unchanged.

SMC invokes autoAllocate for a date with the existing revision and request ID. The operation reuses the allocation solver in fillOnly mode. Every valid current effective assignment stays fixed, including automatic drafts and explicit No Relief Needed decisions. Only unassigned periods that have not started can receive new draft assignments. The operation does not publish. Existing reconciliation still invalidates future cover when its timetable or absence has changed. Health updates can queue duty-SMC capacity warnings; the disabled dispatcher prevents delivery.

Past dates reject the action. Today's future periods remain eligible after 06:29 because this is a deliberate SMC action. Scheduled optimisation retains its own cutoff. The current authority, verified school-day, annual-accounting, weekly quota, active timetable, absence, occupancy and consecutive-period checks remain. If accounting is unverified or the solver cannot certify coverage within its bound, the result is paused and savedIds is empty.

After confirmation, the client uses the returned view to update health, uncovered periods and tiles. Uncertain writes retain their exact request identity; repeated clicks cannot authorise a second independent allocation while confirmation is pending.

## v0.7.07 suggested-teacher ordering and quota

The manual suggestion matrix retains its existing category and suitability tiers. Within each tier, remaining weekly R sorts descending. Annual fairness, alternative opportunities, deterministic rotation and stable ID break ties. Remaining R subtracts charged weekly relief from Deploy's R. This change does not replace the solver's existing maximum-coverage and fairness policy.

Current and future planning use the current matched Deploy quota. Historical observed entitlement values remain the annual accounting denominator. Explicit exclusion and special-holiday records remain authoritative. Missing current quota does not silently use an older observed value.

The shared Deploy quota cache is scoped to the Singapore day and published source, with a maximum six-hour lifetime and possible earlier eviction. Each hit still checks the published source. Filters and period selection reuse loaded rows; assignment saves still check current state. API_CONTRACTS_v0.7.07.md defines the source metadata and cache scope.

## v0.7.07 projections and browser reuse

The current client uses compact report and allocation reads. `view:'mine'` is a record-only read that cannot trigger schoolwide reconciliation. `view:'notificationReadiness'` is also record-only and requires SMC membership. `availability` accepts `complete:true` for a date-wide projection whose selected subsets are derived locally. API_CONTRACTS_v0.7.07.md defines the response fields and compatibility rules.

Immutable timetable models, Calendar context, identity mappings and operational projections have separate freshness. A complete availability overlay can be reused for up to 60 seconds. A baseline gap never becomes confirmed availability solely because the model is cached. Pending requests do not reserve capacity before acceptance.

Own Arrangements retains the optional combined-save contract for older clients. The new flow confirms the absence save before optional candidate work and uses local timetable cells for the first matrix display. Candidate verification and server validation still govern submission. No new write can bypass a pending uncertain-save receipt.

The backend reuses immutable teacher-source data within a request. Mutable eligibility and accounting state are rebuilt after operations that can change them. Domain edits, receipts, audit and notification intent remain one atomic document replacement. This is not a partial Drive write or a new storage system.

## v0.7.07 recess supervision

`saveRecessSettings` is an SMC-only, revision-checked, exactly retryable mutation of `recessSettings.baseName`. It accepts 1 to 80 trimmed characters. The default is Haze Recess. Renaming the display label does not create demand or change staff identity.

`saveRecess` creates or updates selected-date/level activations from actual timetable classes. Group labels use matching class suffixes across existing levels. The recess projection exposes `settings` and `virtualTeachers`. These rows do not create Contacts people, absence records or staff workload denominators.

Activation leaves vacancies unassigned. Manual `autoAllocate` applies existing verified-accounting, quota and suitability rules. Publication stays explicit. One virtual row can contain multiple independent classes at the same period; class selection must preserve each demand separately. Overlap and retries do not create duplicate class/date/period demand.

Current implementation and final verification details are recorded in VALIDATION.md and RELEASE_SUMMARY.json. No live timings or provider delivery are claimed.

## v0.7.07 dated planning and duty contracts

All operations use the existing authenticated `/api/operations` gateway. Writes retain `date`, global `revision` and one stable UUID `requestId`; reusing an ID with changed content is rejected.

| Operation | Important payload/result | Authority |
| --- | --- | --- |
| `dutyRoster` | Returns verified `people`, `duty:{staffIds,start,end}`, source and availability for one date. | SMC |
| `setDutySMC` | `staffIds`, explicit `start`/`end` HH:mm. End must follow start. | SMC; current active SMC IDs from Contacts |
| `stapler` | Returns plan, published metadata, `staplerRevision`, capabilities, requests, sponsors and permitted people/venues. | School user; plan only to permitted editor |
| `saveStapler` | `plan`, `staplerRevision`; immutable baseline and all tile constraints revalidated. | SMC or approved date-specific planner |
| `resetStapler` | `date`, `staplerRevision`; explicitly archives the stale draft and starts from the current baseline. Does not publish. | SMC or approved date-specific planner |
| `publishStapler` | `staplerRevision`; requires current saved draft and valid class coverage. | Same date-specific authority |
| `requestStapler` | `sponsorId`, date. | Active school teacher |
| `decideStapler` | request `id`, `decision`, optional `comment`. | SMC |
| `dailyTimetable` | Periods, aligned `baseline.cells` and `modified.cells`, suspension markers. | Own timetable; SMC may specify staffId |
| `unassign` | Selected `demandIds`; releases only selected future/unstarted cover. | SMC |

SMC duty intervals are start-inclusive/end-exclusive in Singapore time. No untimed legacy row becomes routable implicitly. Current authority and source are rechecked before sending. Duty operations use a record-only path and never reconcile unrelated future cover.

`publish` now accepts one `auditReason` when the first mass-publication review contains relevant manual changes. Audit remains factual and durable. Failures do not set the successful publication marker.

Baseline timing adds optional `endOfDayMinutes`. New imports default to 420/30/810 for start/minutes/day-end; `normalLastPeriod` is the uploaded maximum. Existing saved definitions remain compatible and later periods are retained. Recess defaults come from the chosen uploaded baseline, not a second settings store.

See docs/707-stapler-domain-contract.md for normalized plan fields and atomic commands. The four revised template submissions are recorded in the v0.7.10 contract set. Their last observed state is Pending, not Approved; activation remains disabled.

## v0.7.08 employment cap enforcement

Internal quota rows carry `capConfigured`, `periodCap`, `capWorkload` and `capVerified`; private allocation balances expose `capRemaining` with source verification. Public timetable rows omit all cap inputs. Effective-week calculations use each dated active baseline, respect configured subject categories, and reapply the cap after published Stapler changes. Existing relief deductions count once.

New assignments, cap-increasing Stapler changes and publication of saved drafts cannot exceed verified contractual headroom. A later workload change does not silently delete published cover; the record remains for review. A structured cap-only violation flag distinguishes this policy from unrelated invalid assignments. Unverified capped workload blocks new publication.

## v0.7.10 current workday publication

Only Roster `publish` and `publishStapler` gain the current-workday restriction. They require the current Singapore date and verified Calendar school-day context, with authoritative checks within the existing write boundary. UI eligibility is explanatory, not authority. Past or future dates, an unavailable Calendar decision, and a confirmed non-school day cannot publish new Roster state.

Future `saveStapler`, ordinary draft allocation, `requestStapler` and `decideStapler` remain available under their existing date and permission rules. Deploy version publication is unchanged. No timer promotes a draft. Exact retry receipts, expected revisions, atomic state changes and preserved publication history retain their existing semantics.

Teacher timetable dispatch must still match the current Singapore workday at immediate preparation. A queue item prepared for another date cannot use today's wording. Existing future publication records are retained; explicit publication again on the actual school workday is required before releasing the day’s notices, and these records do not bypass the date guard. Sponsorship request and decision messages may concern future dates.

## v0.7.10 exact WhatsApp contracts

The canonical `notification-worker/template-contracts.json` contains 21 routes. Seventeen existing routes were verified Approved on 17 October 2026. Four revised routes were submitted and verified Pending as Utility, en_GB, positional body-only contracts. Runtime requires current matching approval and enabled global/route flags; recorded submission state alone does not authorise sending.

| Integration key | Template | Ordered fields |
| --- | --- | --- |
| conditional_relief_instruction | gsis_relief_instruction_v1 | recipient_name, class, duty_date, period_and_time, conditional_instruction, absent_teacher_name, absent_teacher_contact |
| stapler_timetable | gsis_timetable_updated_v1 | recipient_name, duty_date, change_details, private_timetable_url |
| stapler_request | gsis_timetable_sponsor_v1 | recipient_name, requesting_teacher_name, duty_date, roster_plan_url |
| stapler_decision | gsis_timetable_access_v1 | requesting_teacher_name, duty_date, change_details, roster_plan_url |

Instruction contact fields come from the absent teacher's authoritative Contacts identity: use the mobile WhatsApp link, with school email fallback when mobile is unavailable. The instruction's absent teacher and the message's recipient are separate identities. Required fields must be complete before dispatch.

Decision field 1 always identifies the requesting teacher, for the teacher outcome and the existing approval copy to the SMC sponsor. The recipient's own name must not replace it. Template bodies and field order are exact; the gateway does not rewrite fixed wording or silently truncate parameters.

The evening route retains `gsis_relief_evening_v1`. Its v2 remains on Meta but is not a fallback. Sending, menu handling, automation and diagnostic activation remain disabled in packaged defaults. Approval, live configuration and delivery are distinct from build verification.

## v0.7.10 additions

`systemConfig` and `saveSystemConfig` require current Admin authority. The saved object contains validated `noReliefSubjects`, an ordered array of four shared `allocationPreferences` IDs and a strict `scheduledAllocationEnabled` boolean. Exact and wildcard matching share one implementation. Saves use the global revision, stable request ID and audit record; saving does not run or publish allocation. Report projections expose the effective subject rules without exposing the Admin configuration. Each saved absence retains its own policy.

`dailyEmployment`, `saveDailyEmploymentSettings` and `sendDailyEmploymentReport` use the current Contacts directory and operational store. Ordinary school users may view the report. Admin or SMC may choose recipients, their known email addresses, subject, time and manual date send. The first queued report captures an immutable date snapshot; later reads and resends use it. A historical date without a captured report is unavailable rather than reconstructed. The publication/date and one-automatic-report rules are authoritative in the backend.

The signed `dailyEmploymentMailDispatch` service claims each queued email under the existing lock, sends outside the lock, and settles the matching claim. Expired sending claims and ambiguous send outcomes become uncertain. It does not promise exactly-once delivery across the external email boundary or blindly retry uncertain sends. Apps Script MailApp scope and quota are required.

`staplerDates`, `requestStapler` and `decideStapler` use record context. The Worker skips Calendar for these, duty, configuration and saved-report reads. First-snapshot report sending retains current school-day context. The browser cannot forge scheduler availability or Calendar decisions.

SMC duty selection is sourced from current Contacts active SMC members, independent of Deploy quota availability. New external teacher creation requires basic name, a valid Singapore mobile and the provisional modifier; existing names/mobile identities are resolved rather than duplicated. Dated relief activation remains a separate retryable operation after contact creation.

Allocation compares coverage and recess-duty reuse first, then the Admin's ordered preferences, then stable identity tie-breaks. Coverage certification and preference optimality are distinct metadata. Bounded search does not claim unproven global preference optimality.
