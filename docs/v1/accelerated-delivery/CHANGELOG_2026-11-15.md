# Owner change log — 15 November 2026

Documentation only. Model: Codex; coordinator: ChatGPT (v1); independent reviewer: Claude. [Task and scope](../../coordination/tasks/v1-changelog-20261115.md). Entries record reported problems and future acceptance criteria; they do not authorise implementation or live operations.

Owner subsequently authorised working through the reported bug fixes one by one, including the data-clone UAT findings. Implementation uses separate bounded claims/PRs; [PR159](https://github.com/helper-gsps/gsis/pull/159) remains documentation only. The project conversation was initially inaccessible. The owner has now supplied `GSIS_FRONTEND_UAT_LEDGER.md`; this revision incorporates all 28 UAT IDs and four environment IDs from that document.

Ledger received/read on 15 November 2026, Singapore time; SHA-256 `c4c0cb8786eced24b5ef3143c7d113369ddaf81dcba8728e27fb0a2a34c5a0f8`. The raw ledger, staff data, school database/spreadsheet identifiers and real operation references are not reproduced. Its historical permissions and claims about live cloning describe that earlier session; they do not authorise new D1 writes, imports, receipt retries, notification activation or migration. No live state was inspected for this queue update.

## V1-20261115-01 — Deploy publication blocked by venue metadata

**Status: Implemented in PR160; exact-head suites green; Claude review pending; not merged or deployed.** Owner request: “deploy is unable to publish, changelog for bug fix”. The authorised fix is separately claimed in `docs/coordination/tasks/v1-deploy-venue-publication.md`, main claim `bef1ac8c1d5e310a3468b92b72da38d59e49aeb1`, branch `codex/v1-deploy-venue-publication`. The original live outcome remains unverified.

Implementation: [PR160](https://github.com/helper-gsps/gsis/pull/160), branch `codex/v1-deploy-venue-publication`, exact head [`ab24739203f3bcc03c5b7e6c96f8fa2144a84654`](https://github.com/helper-gsps/gsis/commit/ab24739203f3bcc03c5b7e6c96f8fa2144a84654). Coordinator-reported exact-head verification is green: 75 product programs, 1,174 full Node programs and 40 LORD checks. Focused evidence includes eight actual local Worker/D1 groups and six built mobile-browser groups; canonical build has no tracked drift. Commands, retained failures and CI links belong to the implementation PR and its [pinned fix handoff](https://github.com/helper-gsps/gsis/blob/ab24739203f3bcc03c5b7e6c96f8fa2144a84654/docs/v1/accelerated-delivery/DEPLOY_VENUE_PUBLICATION_FIX_2026-11-15.md). That handoff predates this ledger import; its statements that the ledger was unavailable and full checks were pending describe its writing time.

The fix validates missing venue evidence before review/new preparation, preserves Deploy form mappings during exact-ID venue refresh, and adds explicit refresh/review with the confirmed saved revision. Original publication, refresh and preparation-lease identities survive uncertain responses within the current page; terminal receipts permit new intent. This is locally and CI verified engineering work, not a successful retry of the owner's original publication or proof of the clone's cause. Claude must review this exact head before the separate merge/release gates are considered.

### Observed and expected behaviour

The owner's mobile screenshot shows the Publish dialog for “2026 T4 post-PSLE” reporting: “Refresh current venue metadata before publication.” It then displays the original operation reference and says to check its receipt before retrying. “Retry same publication” appears disabled; “Check original receipt” and “Close” remain available. The screenshot and real operation identifier are not committed here.

Expected: an authorised user can publish a valid saved version with current venue references. If venue evidence is incomplete, the interface must explain how to refresh it, preserve the saved draft and provide a clear recovery path. It must distinguish a confirmed rejected/aborted operation from a pending or unknown outcome and a committed publication. A disabled button alone does not establish any of those outcomes.

### Source evidence and open diagnosis

Source inspected at main `26bbccd229962700409bb6e9c80b1e9bec170d20`; no live data or receipt was read for this report.

- [Deploy venue-reference validation](https://github.com/helper-gsps/gsis/blob/26bbccd229962700409bb6e9c80b1e9bec170d20/v1/services/deploy/service.mjs#L964) emits this exact message as `VENUE_REFERENCE_STALE`, HTTP 409, when a venue referenced by a class, teaching group or room form mapping is absent from the publication document or has an undefined/null revision. This check does not compare against the current Venues revision.
- [The publication dialog](https://github.com/helper-gsps/gsis/blob/26bbccd229962700409bb6e9c80b1e9bec170d20/v1/web/shared/deploy-publication.js#L506) disables retry for a non-408 HTTP error below 500. It does not determine the durable receipt state when setting that button.
- [The existing draft refresh operation](https://github.com/helper-gsps/gsis/blob/26bbccd229962700409bb6e9c80b1e9bec170d20/v1/services/deploy/service.mjs#L1842) reads the canonical Venues catalogue and saves per-venue revisions. Investigate whether version creation, import, duplication, refresh and publication preparation retain the required evidence.
- [Venues source fencing](https://github.com/helper-gsps/gsis/blob/26bbccd229962700409bb6e9c80b1e9bec170d20/v1/services/venues/service.mjs#L946) reads the prepared Deploy publication status, which constructs venue references from its frozen document. Missing references can block that path before the normal publication commit. A separate current-revision comparison uses `VENUE_REFERENCE_CHANGED`.
- [Worker recovery](https://github.com/helper-gsps/gsis/blob/26bbccd229962700409bb6e9c80b1e9bec170d20/v1/runtime/worker.mjs#L235) attempts to fence/abort a matching prepared operation after a known 4xx rejection, returns the receipt if already committed, and reports `RECOVERY_PENDING` if recovery fails. The original receipt must establish what actually happened.

Leading hypothesis: missing venue revision evidence in the saved/prepared document. Its origin, the affected venue, the screenshot's exact running build and the actual publication outcome remain unverified. Do not infer that venue data recently changed, that nothing committed, or that every 409 can safely retry.

### Acceptance contract and remaining runtime evidence

1. Reproduce with synthetic versions containing referenced rooms with missing/null revisions or missing catalogue entries; include class, teaching-group and form-mapping references. Identify the path that lost/omitted metadata before choosing the fix.
2. Verify a valid current venue projection publishes successfully. Exercise create/import/duplicate/refresh paths and retain Venues ownership, school isolation, current permission checks and saved-version revision checks. A source outage or concurrently changed/deleted room must fail truthfully without fabricated revisions or a stale publication.
3. Make the recovery action understandable and usable on mobile. Retain unsaved edits and the original request identity while checking its receipt. Do not silently replace an uncertain operation with a new one or alter an already frozen publication payload under the same operation ID.
4. Test confirmed rejection/abort, pending/unknown outcome, committed receipt, duplicate retry and response loss after commit. Refresh/recovery must not leave a known rejected operation blocking edits, create duplicate publications, or mistake recipient delivery for publication. A corrected intent may start a new operation only after the original outcome is resolved safely.
5. Before a future fix is accepted, provide focused service and built-browser regressions, applicable existing regressions/build/CI and Claude's exact-head review. Live publication/recovery UAT requires separate authorisation and evidence.

No application changes or runtime tests were performed by this documentation update. PR160 supplies the separately recorded implementation/test evidence above; no live publication retry, merge or deployment has been performed for this entry. The earlier deployment's successful CI does not close this bug. F5 remains OPEN; official T1B-01/T1B-02 and unperformed runtime UAT remain **Not tested**.


## Imported ledger chronology

The tables preserve the order of the source reports. “Reported” means evidence in the supplied ledger, not independently repeated here. “Source confirmed” means the cited code supports the failure mechanism; it does not establish the original live receipt or certify the affected production data. “Historical correction” records a reported earlier write/read-back without authorising another write or closing frontend UAT.

### Initial frontend attempt

| ID | Reported observation | Current classification and closure evidence |
| --- | --- | --- |
| UAT001 | Contacts initially loaded zero records; teaching information was unavailable. | The zero-record observation is superseded by the later reported migration of 161 active staff. Teaching information still needs a verified Deploy published pointer; copied draft rows alone cannot supply it. Retest the directory after independently verified Contacts refresh and publication; do not fabricate teaching data. |
| UAT002 | Directory Import Excel was disabled; Edit Info offered import. | Navigation/capability friction, with an alternative found. Review alongside UAT024 and the separately scoped Contacts workflow; prove the permitted entry route and a real preview/save/receipt flow. |
| ENV001 | Computer control lacked coordinate geometry. | Reported recovered by window activation and recapture. Tooling event, not a product fix or frontend acceptance pass. |
| ENV002 | Usage lookup failed; no usage reset was consumed. | Tooling unresolved. No new reset permission is inferred; keep outside the application implementation queue. |
| UAT003 | Populated row with an appointment was rejected because its catalogue value was unavailable. | Related to the direct-editing proposal in [PR158](https://github.com/helper-gsps/gsis/pull/158), not permission to remove validation. The later reported 59 role definitions may change reproduction. Verify current labels, authorised editing and save semantics after that independently scoped work. |
| UAT004 | Retrying the original Contacts row save left the draft locked and outcome unconfirmed. | Source-confirmed recovery defect: `v1/services/contacts/grid.mjs` dereferences `receipt.result.mapping` although an aborted receipt has no result. The original live operation remains unverified. Preserve its identity; test aborted, prepared/unknown and committed receipts, response loss and retained drafts before permitting new intent. Queued after UAT019. |
| UAT005 | Initial Deploy baseline prompt was interrupted before its outcome was read. | Interrupted UAT, not proof of a create failure. Later reported versions supersede the empty setup observation. Verify an isolated first-run create/cancel/retry journey; do not create a replacement live baseline to diagnose it. |
| ENV003 | Native control could not verify the current Chrome URL. | Tooling unresolved at that point. Restore a verified browser context before further runtime acceptance; no product code fix is established. |

### Data-copy report and its limits

The source reports a subject-load correction followed by cloning two Deploy draft versions and LORD current/future records. It reports thirty trolleys in ten carts, 420 devices, 29 future bookings with 87 item rows, and no notification jobs enqueued by the clone. These are historical assertions from the ledger, not reads performed by this task. The source later explicitly withdrew its broad “data entry complete” conclusion: matching stored rows does not prove usable settings or frontend parity.

| ID | Reported observation | Current classification and closure evidence |
| --- | --- | --- |
| UAT006 | Deploy Excel export stalled and timed out after roughly 127 seconds. | Export/browser failure reported; cause uncertain because the control session also reset. Measure the export request, response, workbook and download separately with a synthetic school-sized fixture. D1 fallback did not close the export defect. |
| ENV004 | Browser debugger was unattached; native fallback could not inspect the sink window. | Tooling limitation; final visual verification was omitted. It does not turn stored-row verification into a frontend pass. |
| UAT007 | Copied Deploy teachers and LORD booking owners were not reconciled to authoritative Contacts/Core identities. | Initial empty Contacts state is superseded by the later reported active-staff migration, with matching Deploy Staff IDs. Core account links, LORD owner reconciliation, accepted facts and refreshed frontend evidence remain unverified; no inferred roles or grants. |
| UAT008 | Whole-cart selection/rendering was not verified; the API exposed individual trolleys. | Consolidated with source-confirmed UAT021–023 below. Closure requires grouped booking/availability plus trolley-level collection/return, not display-name substitution. |
| UAT009 | Source collection/return reminders were five minutes before the event; v1 used other timings and ignored the reminders setting. | Source-confirmed timing/eligibility gap. Claim separately from inventory and monitor work. Test distinct collection/return windows, send-time eligibility, obsolete jobs, duplicate scheduling and restart; no live notifications. |
| UAT010 | Source admin monitor ran every five minutes; v1 bucketed monitoring hourly. | Source-confirmed semantic gap: legacy scans for overdue sessions, whereas v1 emits an hourly summary. A five-minute summary would not restore parity. Separate claim must preserve grace periods, per-session deduplication, custody checks and uncertain delivery. |
| UAT011 | A duplicate source venue identifier required a disambiguated Pump Room identifier. | Historical transformation reported, not an instruction to rewrite current IDs. Verify uniqueness and all references across affected projections; preserve source-to-target provenance and recovery evidence. |
| UAT012 | Periods/resources/lists were copied, but Contacts refresh, roles and notification setup parity were unverified. | Readiness work remains open. Existing setup UI is not evidence of accepted identity, fresh Contacts references, equivalent templates or working transport. Verify each owner boundary separately; do not enable sending as a test. |

### Settings-page audit and correction

| ID | Reported observation | Current classification and closure evidence |
| --- | --- | --- |
| UAT013 | A Science fortnight-split row was omitted because its copied key retained the old subject spelling. | Historical correction reported, with read-back and a version revision increment; the original row was retained for recovery. Frontend refresh was not verified. Check the correct displayed row, value and absence of double counting; no repeat correction authorised. |
| UAT014 | Editing a fortnight value gave no usable save action and navigation stayed blocked. | Reported frontend save/navigation defect; exact failing path needs synthetic reproduction. Third queued implementation after UAT019/UAT004. Verify draft entry, visible save/discard controls, successful save/reload, failed or unknown receipt handling and navigation without silent loss. |
| UAT015 | Membership showed zero rows despite copied version membership data. | Source inspection showed an empty Contacts catalogue overriding copied Deploy data. The later reported 59 Contacts role definitions may already address the missing dependency; refreshed UI requires retest. Do not restore a competing Deploy-owned authority copy. |
| UAT016 | School Leader positions were empty; copied reporting links appeared under Needs review. | Accepted authority dependency, not permission to infer leaders from copied appointments or links. Contacts must supply the required explicit accepted records and stable identities before refreshed display is certified. |
| UAT017 | Relief inputs matched, but demand was unavailable and the qualifying teacher count was zero. | Contacts/EO evidence dependency. Test calculations with explicit accepted facts and truthful missing-evidence behaviour; never infer EO from teaching duties or force a numeric result. |
| UAT018 | HR Terms and teacher profiles differed from source version-owned editing. | Ownership difference and direct-editing scope, related to PR158. Contacts remains authoritative; acceptance needs the approved Contacts editing design and verified projections, not copying authority into Deploy. |
| UAT019 | Venue counters matched but a Saved draft was told to choose an unpublished planning version. | Source-confirmed frontend status mismatch: the source UI checks `status === "planning"`, while the v1 projection uses `draft`. Next bounded fix. Test eligible unpublished drafts, published or previously published versions, read-only users, exact preview/save and stale revisions without widening destructive permissions. |
| UAT020 | ASC Export subpanels could not be audited because the stuck edit blocked navigation. | Incomplete UAT; no ASC settings were certified. After UAT014, inspect destination/profile, cycle/bells, crosswalk and class-local divisions. Only newly demonstrated defects enter implementation scope. |

### Cart-versus-trolley correction audit

| ID | Reported observation | Current classification and closure evidence |
| --- | --- | --- |
| UAT021 | Source offered ten 42-device carts; sink showed thirty 14-device internal trolley IDs. | Source-confirmed booking-resource projection mismatch. Test named cart rows, device types, aggregate capacities and source display order using synthetic equivalents. |
| UAT022 | Existing trolley names/cart metadata were present, but `reference()` and `bookingView()` exposed individual/first-item IDs. | Source-confirmed model/adapter mismatch. Derive booking groups from cart metadata, expand reservations atomically and retain the existing physical identities. Group selection, availability and schedules must agree for existing and new bookings. |
| UAT023 | Replacing trolleys with carts loses collection structure; adding carts duplicates inventory. | Rejected data-only workarounds, with no correction write reported. Keep one booking identity and existing records/history; retain trolley-specific quantities/photos during collection/return. Test conflicts, membership races, cancellation, response loss/restart and restricted signage without replaying notifications. |

The copied frontend also sorts by device class and name, rather than merely trusting `sortOrder`; the required source order must be verified with representative device types. Do not hardcode the ten school labels. Booking-group repair, reminder timing and overdue monitoring are three separate implementation scopes.

### Later Contacts migration report

The ledger reports migration of **161 active staff**, excluding **21 inactive staff**, and retention of **59 role definitions**. These later statements supersede earlier zero-record/empty-catalogue observations. They do not prove refreshed UI, accepted EO completeness, account linkage or operational readiness. Reported source role flags were used where present; missing EO/personnel evidence was deliberately left unknown. No new migration or acceptance write is authorised by including this history.

| ID | Reported observation | Current classification and closure evidence |
| --- | --- | --- |
| UAT024 | Directory bulk import remained disabled; row editing had already encountered catalogue prerequisites. | Related to UAT002/UAT003 and PR158. Establish one approved import/edit workflow with validation, preview, atomic outcome and recoverable receipts; historical D1 fallback is not a frontend import pass. |
| UAT025 | Source Contacts export stalled and reset computer control. | Export cause uncertain; Google Sheets reads supplied the historical fallback. Distinguish source export failure, browser download failure and tool interruption before choosing a code fix. No new source access is authorised here. |
| UAT026 | Compatibility role/tag codes were normalised while display labels retained source spelling. | Related to PR158/direct editing. Verify labels round-trip through choices, directory, editing, export and Deploy references. Preserve stable identities; do not substitute display text for security facts. |
| UAT027 | Browser control failed after migration, so refreshed Contacts was not inspected. | Runtime verification omitted. Confirm the reported active-record count and representative labels/details only in separately authorised UAT; stored read-back is insufficient. |
| UAT028 | Explicit EO authority and complete personnel classification were absent from source columns. | Open accepted-authority dependency, shared with UAT016/UAT017. No default records or inference from roles/tags/duties. Owner review and authorised Contacts acceptance, followed by active-staff readiness and epoch checks, remain necessary. |

## Source anchors for the next claims

Read-only diagnosis uses [implementation snapshot ab247392](https://github.com/helper-gsps/gsis/commit/ab24739203f3bcc03c5b7e6c96f8fa2144a84654), not a claim that it is deployed or that a live record was inspected.

- Contacts recovery: [grid receipt mapping](https://github.com/helper-gsps/gsis/blob/ab24739203f3bcc03c5b7e6c96f8fa2144a84654/v1/services/contacts/grid.mjs#L208) and its status projection must handle absent results on aborted receipts.
- Deploy venue action eligibility: [copied frontend condition](https://github.com/helper-gsps/gsis/blob/ab24739203f3bcc03c5b7e6c96f8fa2144a84654/public/app.js#L695). A v1 adaptation must retain publication restrictions and server-side validation.
- LORD booking groups: [reference projection](https://github.com/helper-gsps/gsis/blob/ab24739203f3bcc03c5b7e6c96f8fa2144a84654/v1/services/lord/service.mjs#L418), [first-item display](https://github.com/helper-gsps/gsis/blob/ab24739203f3bcc03c5b7e6c96f8fa2144a84654/v1/services/lord/service.mjs#L235), [booking input](https://github.com/helper-gsps/gsis/blob/ab24739203f3bcc03c5b7e6c96f8fa2144a84654/v1/services/lord/model.mjs#L99), and [v0.9 grouping](https://github.com/helper-gsps/gsis/blob/ab24739203f3bcc03c5b7e6c96f8fa2144a84654/lord-suite/Source/backend/Code.gs#L6144).
- LORD timing: [scheduled reminder offsets](https://github.com/helper-gsps/gsis/blob/ab24739203f3bcc03c5b7e6c96f8fa2144a84654/v1/services/lord/jobs.mjs#L148), [fixed return-reminder path](https://github.com/helper-gsps/gsis/blob/ab24739203f3bcc03c5b7e6c96f8fa2144a84654/v1/services/lord/service.mjs#L1117), [hourly monitor](https://github.com/helper-gsps/gsis/blob/ab24739203f3bcc03c5b7e6c96f8fa2144a84654/v1/services/lord/jobs.mjs#L518) and [source five-minute reminder windows](https://github.com/helper-gsps/gsis/blob/ab24739203f3bcc03c5b7e6c96f8fa2144a84654/lord-suite/Source/backend/Code.gs#L6968). Changing an hourly summary to five-minute frequency does not reproduce the legacy overdue monitor.

## Ordered work and readiness ownership

1. **V1-20261115-01 / PR160:** implementation and exact-head suites complete; independent Claude review pending. No merge/deployment or live recovery inferred.
2. **UAT019:** small frontend compatibility fix claimed on main at `7b5f1eb2a9c12b9d27ffd9dab4de694f8885aefd`, branch `codex/v1-deploy-draft-status`, task `docs/coordination/tasks/v1-deploy-draft-status.md`. Implementation and synthetic verification in progress; runtime UAT remains Not tested.
3. **UAT004:** separate Contacts receipt/draft recovery fix; establish original terminal versus unknown outcomes, without coupling it to the redesign.
4. **UAT014:** reproduce and repair the fortnight editor's save/navigation journey in a separate claim.
5. **LORD UAT008/UAT021–023**, then **UAT009**, then **UAT010:** independent booking-group, reminder and monitor scopes. Preserve physical inventory, existing reservations, custody, audit, provider uncertainty and current authority. No migration, scheduler activation or sending follows from a code fix.
6. **Contacts direct editing / UAT002–003, UAT018, UAT024, UAT026:** coordinate with PR158; do not duplicate or implicitly expand it. Export investigations UAT006/UAT025 and remaining ASC audit UAT020 require reproductions before code scope.

Contacts owns accepted staff facts, role definitions and fresh projections; Core owns account-to-Staff-ID links and application grants. Deploy owns saved planning versions and publications, consuming accepted Contacts facts and canonical Venues metadata. LORD owns inventory, reservations, custody, local reference observations and notification intents. None may invent another owner's authoritative records to clear an unavailable state.

Readiness evidence must distinguish source reports, database read-back, refreshed frontend observations, accepted authority, original operation receipts and actual provider delivery. The earlier broad clone-completion statement remains withdrawn. A later migration report can supersede an empty-store observation without closing every dependency. Environment/tooling failures remain recorded and must not be relabelled product defects or silently counted as tested.

Each implementation needs a published bounded claim, reproduced failure, positive/negative and race/recovery tests appropriate to its change, unchanged regression evidence, exact tested head/CI and Claude exact-head review. This queue does not itself authorise live data access, migration, merge or deployment. F5 remains **OPEN**. Official T1B-01/T1B-02 and all unperformed runtime UAT remain **Not tested**.
