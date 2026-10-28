# API contracts v0.7.00

Write protocol remains 500 and the existing relief export is schema 3. Workload calculation is `whole-week-v4`: version-owned non-teaching activities contribute to Wi once and are excluded from Ti and teaching SIUE. Calendar retains workbook schema `v2 RC1.9`.

## Roster operations

The new signed Deploy action is `rosterOperations`, exposed to school users through `/api/operations`. See [API_ROSTER_OPERATIONS_v0.7.00.md](API_ROSTER_OPERATIONS_v0.7.00.md) for commands, input shapes, authority and publication rules. The backend derives identity, roles, date context, timetable occupancy and published quota. Browser-selected periods and colleague IDs are requests, not assertions of eligibility.

Every mutation carries its request UUID and current revision. A retry retains the same body and UUID. Actor or payload reuse is rejected; stale revisions require a fresh read. Operational absence, assignment, audit and notification intent share one locked document commit. A provider timeout does not imply failure and must not trigger an unrelated new write.

Staff see their own absence details and published duties. SMC and Admin are distinct current Contacts capabilities. Past entries are view only except a confirmed Admin past-range prune. Pending mutual requests expose only their intended participants; approval rechecks live availability and confirms cover without SMC approval. SMC draft replacements leave the prior publication visible until publication commits. Unknown R stays null and is an advisory value rather than an assignment cap.

## Contacts boundary

`deploySnapshot` with `rosterDirectory:true` provides the trusted backend with fresh stable staff identity, separate SMC/Admin booleans and a narrow active/inactive directory. The browser projection excludes other staff's mobile numbers except the SMC external-relief workflow. Directory reads retain the pending-save fence and do not cache permission.

`rosterContactCreate` is a narrow authenticated SMC workflow. It creates an inactive contact with default SRE employment using the existing Contacts write journal and request receipts. It rejects exact normalized-mobile matches and requires explicit review of fuzzy-name matches. Existing contacts are reused deliberately, never auto-merged. A day employment override is stored in Roster; permanent changes remain a Contacts Admin decision.

The notification service uses a dedicated signed directory read rather than impersonating a school user. Its separate service credential cannot invoke ordinary Contacts edits or Roster school-user commands.

## Timetable reads and exports

Profile/read calls may supply at most eight `knownModelIds`. Immutable models already held in that session may be acknowledged with `modelUnchanged` and `modelId`. The server still verifies current Contacts authority and selects the model from the current register. A known ID does not grant archived access or override validity dates.

The initial preloaded profile may use `calendar:false` so Home and navigation do not wait for optional Calendar context. A timetable date read obtains current date context separately. Operational planning requires verified date/week context and never accepts browser-supplied `calendarByDate` as authority.

Teacher, Class and TG views share a field-aware PDF/Excel projection. The account-local last-period and field preferences change presentation only. Absence periods, clash detection and relief demand always use the complete model. Numbered language groups are scoped by level; other explicit groups retain their class-set scope. Generic whole-class labels do not create TG views. Stored source cells remain unchanged.

## Notification and private-link boundary

`rosterService` accepts only the dedicated signed notifier envelope and its narrow operation allowlist. Claims have durable leases. Uncertain sends are not blindly retried. Verified delivery events are deduplicated and cannot regress a read receipt to an earlier state. Approved-template sending is disabled until configured; runtime credentials remain server-side.

Recipient capabilities bind purpose, stable staff ID, date, expiry and an individual mutual request where applicable. Private links return only that recipient's published duties or their addressed request. School-user operations cannot be invoked by a private link. See [WHATSAPP_SETUP.md](WHATSAPP_SETUP.md) for configuration, template contracts and recovery.

Existing Calendar publication, API event-link ownership, conditional updates and receipt semantics from v0.6.09 are retained. Calendar's service date endpoint is read-only and requires the configured proxy secret plus the exact notifier service/action.
