# Roster v0.7.05 operations

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

## v0.7.05 Assign Relief and autoAllocate

Assign Relief no longer renders the manual absence form or notification readiness panel. The selected date's reported absences supply its teacher tiles. Publication and daily export remain in Absences by Date > Relief Assignments. Recess supervision remains a separate group below the reported absences. The shared notification status contract is unchanged.

SMC invokes autoAllocate for a date with the existing revision and request ID. The operation reuses the allocation solver in fillOnly mode. Every valid current effective assignment stays fixed, including automatic drafts and explicit No Relief Needed decisions. Only unassigned periods that have not started can receive new draft assignments. The operation does not publish. Existing reconciliation still invalidates future cover when its timetable or absence has changed. Health updates can queue duty-SMC capacity warnings; the disabled dispatcher prevents delivery.

Past dates reject the action. Today's future periods remain eligible after 06:29 because this is a deliberate SMC action. Scheduled optimisation retains its own cutoff. The current authority, verified school-day, annual-accounting, weekly quota, active timetable, absence, occupancy and consecutive-period checks remain. If accounting is unverified or the solver cannot certify coverage within its bound, the result is paused and savedIds is empty.

After confirmation, the client uses the returned view to update health, uncovered periods and tiles. Uncertain writes retain their exact request identity; repeated clicks cannot authorise a second independent allocation while confirmation is pending.

## v0.7.05 suggested-teacher ordering and quota

The manual suggestion matrix retains its existing category and suitability tiers. Within each tier, remaining weekly R sorts descending. Annual fairness, alternative opportunities, deterministic rotation and stable ID break ties. Remaining R subtracts charged weekly relief from Deploy's R. This change does not replace the solver's existing maximum-coverage and fairness policy.

Current and future planning use the current matched Deploy quota. Historical observed entitlement values remain the annual accounting denominator. Explicit exclusion and special-holiday records remain authoritative. Missing current quota does not silently use an older observed value.

The shared Deploy quota cache is scoped to the Singapore day and published source, with a maximum six-hour lifetime and possible earlier eviction. Each hit still checks the published source. Filters and period selection reuse loaded rows; assignment saves still check current state. API_CONTRACTS_v0.7.05.md defines the source metadata and cache scope.
