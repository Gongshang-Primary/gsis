# GSiS v1 accelerated implementation specification

Version 1.0. Prepared 13 November 2026, Asia/Singapore.

Repository https://github.com/helper-gsps/gsis

Inspected product source `27fa498657965169b9d971a9caabc33c8b19bc69`. Latest Contacts owner policy inspected on PR136 at `0081eea4e8924691818b68d18c5d53d6927985fa`. Product deployment and live configuration have not been verified by this specification exercise.

## 1. Delivery objective and how to use this document

Deliver an operational GSiS v1 that preserves the familiar v0.9 screens and workflows while moving operational computation, storage and jobs to Cloudflare. A teacher must be able to report an absence, allocate relief, book equipment, read a timetable and use the calendar without an Apps Script round trip. Multiple staff must be able to work concurrently with visible conflicts and recoverable saves.

This document is the complete accelerated build brief. Read it with its frozen Deploy contract appendix and the linked source records. The owner asked for a complete specification and a handoff for Codex using Astra at Ultra reasoning. This turn produces that specification. The execution prompt in section 19 is intended for the owner to submit to the builder. Submitting that prompt supplies the implementation instruction. Existing implementation permissions for earlier tasks remain independently valid. Merge, paid provisioning, school data import, provider sends and production cutover retain their existing owner control.

Complete the build as one sustained delivery effort with internal integration checkpoints. A reusable contract library alone does not meet this outcome. The deliverable includes the frontend, authenticated routes, real persistence adapters, domain logic, jobs, import/export, operational recovery, deployment configuration and verification evidence. Work through dependencies without repeatedly returning routine engineering choices to the owner.

### 1.1 Requirements precedence

1. Latest explicit owner instructions and decisions, including this conversation's allocator rules and the accepted Contacts policy recorded on PR136.
2. Latest operative clauses of Revision 49, especially TV01–TV07, with later owner changes applied. Its older superseded proposals are historical evidence.
3. This document's concrete engineering defaults where the owner left the implementation detail open.
4. Current v0.9 behaviour at the implementation baseline for functions without an explicit v1 change.

Record each baseline commit at implementation start. Compare subsequently merged v0.9 fixes before final release, port the relevant approved behaviour, and document dispositions. Preserve distinct evidence for source inspection, automated tests, runtime UAT and live deployment.

The owner now asks to preserve most existing UIUX. Use the current source and supplied screenshots as the visual baseline. Collect runtime reference captures with synthetic data during implementation. Missing new screenshots for an existing unchanged workflow can be resolved by the builder's source-backed comparison. A genuine policy conflict needs a focused decision, while independent work continues.

### 1.2 Engineering defaults selected for this complete brief

These choices make the build executable. They are recommendations made in this specification, rather than claims of earlier owner votes.

| ID | Selected default | Reason and verification |
| --- | --- | --- |
| E01 | Eight owner domains with one Worker and one D1 each, plus one frontend gateway Worker | Layout has editable owned data. Reuse domain Workers for scheduled jobs initially. Validate actual resource mapping in release manifest. |
| E02 | Pure allocator package bundled with Roster initially | Replaceable through one serialisable contract. A separate engine Worker can be substituted through an adapter. |
| E03 | Layer 3 selects by the saved preference order, recomputed after each allocation | The owner deferred Layer 3 spiral policy, then approved daily capacity as first preference. Provide a configurable spiral switch, initially off for Layer 3 and on for Layers 1 and 2. |
| E04 | Capacity compares daily total headroom first, capped relief headroom second | Retains the intended preference for visibly lighter timetables even when both candidates hit a three-period relief cap. The exact score is defined in section 8. |
| E05 | Subject continuity settings are stored per layer, initially PAL 3 and FORM 2 | Matches the owner's per-layer business-rule screenshot. A complete configured block is assigned atomically to an eligible teacher. |
| E06 | Published duties become assumed completed after their frozen end time, with explicit corrections | Preserves existing operational counting and makes the assumption visible in the ledger. |
| E07 | Direct Google Drive API for continuity exports, direct Google Calendar API for enabled sync, direct approved email API for required email | Replaces Apps Script integrations. Provider credentials are explicit deployment inputs. A provider failure leaves the operational result and retry record visible. |
| E08 | Fresh v1 school data initialization through approved imports, with v0.9 historical system retained | Carries forward the approved fresh-start decision. Include explicit opening relief balances and controlled import mappings. |
| E09 | Initial performance test uses 30 concurrent signed-in sessions and a synthetic 200-staff school | Fits the stated usage envelope with headroom. Measure the full UI and request path. |
| E10 | Keep audit and duty history, with automatic history deletion disabled initially | Retention is an owner policy. Provide export and controlled retention settings without inventing a deletion period. |
| E11 | Use durable revision pins for strict cross-owner authority at protected commit | Preserve the frozen authority contract. Pins remain until a destination receipt or fenced abort proves the outcome; uncertainty cannot silently release them. |

## 2. Full product scope and source map

The release manifest lists nine v0.9 frontends. Port all nine, and add the shared v1 Home/authentication shell. Include editable Layout data formerly maintained through its owned Google repository.

| Route | Existing source | Required user experience | Owner service |
| --- | --- | --- | --- |
| `/` and `/admin` | Existing module navigation and v1 Core contracts | Module launcher, sign-in/out, permissions, school setup, admin health and recovery | Core / gateway |
| `/contacts` | `contacts-update/public/`, `backend/Contacts_*.gs`, `Contacts_Code.gs` | Staff directory, partial search, edit/self-service, provisional records, catalogues, accepted facts, contributions and readiness | Contacts |
| `/deploy` | `public/`, `shared/workload.js`, `shared/relief.js`, `shared/teaching-rules.js`, `backend/Relief.gs` | Versions, IP, TG, departments, occupancy, HR settings, reporting hierarchy, canonical Excel, publication and receipt recovery | Deploy |
| `/roster` | `roster-update/public/`, `shared/roster-*.js`, `backend/Roster*.gs` | Absences, allocation, daily plans, staff views, communications, ledger and admin tools | Roster |
| `/calendar` | `calendar-update/public/`, `calendar-backend/`, `calendar-job-worker/` | Weekly/term navigation, calendar editing, publication roles, venue lookups, configured sync and exports | Calendar |
| `/layout` | `layout-update/public/`, `shared/layout-data.js`, `backend/LayoutRepository.gs` | Layout, 3D Campus, TG allocation views and an in-app/Excel replacement for owned Sheet edits | Layout |
| `/venues` | `venues-viewport/public/` and source backend identified by manifest | Room availability, venue records, bookings, closures and conflict handling | Venues |
| `/lord` | `lord-suite/Source/lord` | Booking, collection, return, photos, booking-for-teacher workflow | LORD |
| `/overlord` | `lord-suite/Source/overlord` | Equipment/booking administration, incidents and recovery | LORD |
| `/starlord` | `lord-suite/Source/starlord` | Signage and photo refresh with restricted read projection | LORD |

Preserve existing product names, navigation, fonts, colours, table density, selected tabs, filters, frozen headers/columns, keyboard editing, modal scale and responsive behaviour. Reuse CSS and DOM components wherever feasible. Required refinements are unified routing/authentication, dependable save/status/conflict states, the specified Roster configuration, Contacts authority acceptance and replacement of direct Sheet editing. Links, exports, worker imports and assets must work beneath subpaths and through direct page refresh.

Preserve complete user journeys. Each existing menu entry, public operation, scheduled task, export and external integration receives a mapping to its v1 implementation and acceptance test. Maintain that compact map in `docs/v1/accelerated-delivery/PARITY.md` during the build. A route returning mock data or forwarding to Apps Script does not satisfy parity.

### 2.1 Roster viewport inventory

Report Absence; Manage reported absences; Assign Relief; Daily Notify; Absences by Date; Manage Ad-hoc relief; Stapler; WhatsApp Inbox; Check Availability; Timetable; Daily Updates; Statistics; Baseline Timetable; My Relief Duties; Learn about Auto Allocation; Recess Regression; SMC Duty Roster; Custom Notifications; Manage Absence Type; System Config; Opening balances; Prune records; administrator System Health.

Reuse `roster-operations-ui.js`, `roster-settings-ui.js`, `roster-stapler-ui.js`, `roster-duty-ui.js`, `roster-inbox-ui.js`, `roster-statistics-ui.js`, `roster-calculations.js`, `roster-learning.js` and `roster.css`. Refresh Learn about Auto Allocation to describe the new layer rules and use the same saved configuration as the engine.

## 3. Cloudflare architecture and ownership

| Worker | D1 authority | R2 use |
| --- | --- | --- |
| `gsis-core` | Accounts, subject links, sessions, suspension, independent admin grants, capability configuration, authority decision evidence | Protected recovery artifacts where needed |
| `gsis-contacts` | Permanent Staff IDs, accepted effective facts, field/group revisions, catalogues, contributions and acceptance audit | Immutable fact artifacts or exports where useful |
| `gsis-deploy` | Planning versions, drafts, edit leases, publication pointer, immutable metadata, operation receipts and delivery intents | Published payloads and large exports |
| `gsis-roster` | Absences, effective day plans, relief assignments, Ri/quota ledger, completion ledger, peer requests, configuration, run state and notification intents | Timetable/input snapshots, exports, media and BURROWS packages |
| `gsis-calendar` | Calendar events, publication/audience state, calendar settings, sync mappings and jobs | Exports and large attachments where applicable |
| `gsis-lord` | Resources, bookings, loan lifecycle, collection/return records, incidents and jobs | Photos and exports |
| `gsis-venues` | Venue master records, bookings, closures, reservation/conflict decisions and source occupancy projections | Exports where needed |
| `gsis-layout` | Campus geometry/configuration, Layout-owned annotations, local TG metadata, pupil/programme evidence and adopted allocation projections | 3D assets and immutable imports |
| `gsis-web` | Frontend routing and static assets | Optional built asset delivery |

This is a proposed deployment topology of nine Workers and eight D1 databases. Bundling the gateway with Core can reduce it to eight Workers. A separately deployed allocator adds one Worker and zero D1 databases. Queue consumers and cron handlers initially live with their owner Worker. R2 bucket layout is an operational configuration, independent of the number of domains.

One service owns each authoritative field. Service Bindings expose bounded versioned operations. Each service validates caller identity, actor context, school scope, request schema and capability. The gateway strips client-supplied internal identity headers. Browser clients receive only public scoped routes and server-derived results. Each domain binds only its own D1. All cross-domain writes go through the owning service.

Contacts owns staff facts and catalogues. Core evaluates privileges. Deploy owns planning and Wi. Roster owns Ri and effective daily timetables. Venues owns physical room records and reservation decisions. Layout owns its presentation metadata and editable local evidence. A Layout teacher-label override is local display evidence and never changes Deploy's staff assignment. Calendar event locations are descriptive until a Venues reservation has actually succeeded.

The app uses D1 queries and transactions over indexed records. Avoid whole-school read-modify-write JSON on every edit. Large immutable payloads belong in R2, with D1 pointers exposed after durable content and digest validation. Preserve simple existing pure calculations and renderers. Introduce an adapter only where it isolates storage, transport, provider access or the replaceable engine.

## 4. Identity, permissions and Contacts

Reuse the merged `v1/core/*.mjs` T1A library and `v1/contacts/*.mjs` T1B library and their tests. Implement their real stores and trusted adapters. Preserve finite profile schemas, and add separate purpose-scoped contact-detail contracts for mobile, email, birthday and aliases.

### 4.1 Core

Google sign-in verifies issuer, signature, audience, expiry, nonce and configured hosted domain. Link canonical issuer plus Google subject to a permanent Staff ID through the approved flow. Global Admin controls relinking and duplicate identity reconciliation. School names, domains, time zone and bootstrap identity are install configuration.

For an unknown signing-key `kid`, perform one bounded refresh from Google's trusted signing-key endpoint. If the refreshed keys still lack it, return invalid identity. A failed trusted-key refresh is a provider availability failure. Preserve the Core distinction between missing authority evidence (`403 AUTHORITY_EVIDENCE_MISSING`, non-retryable) and provider unavailability (retryable availability failure).

Sessions have an absolute lifetime of 864000000 milliseconds. Fresh successful Google verification creates a new session. Failed reauthentication denies access. Explicit GSiS suspension invalidates protected operations immediately under the existing Core contract. Secure, HttpOnly session cookies, CSRF/origin validation for browser mutations and current server-side capability checks apply. Logout invalidates the session and clears protected browser recovery data. Read-only impersonation is visibly labelled, carries real actor and viewed subject, and every mutation is denied server-side.

Use a one-time installation bootstrap for the named first administrator. Admin continuity and recovery are auditable and remain available during Contacts provider failure. Protect against removing the last working administrator through routine settings. Secrets remain in Worker secrets/GitHub environment configuration, never in downloads or browser state.

### 4.2 Capability matrix

| Surface or action | Required authority |
| --- | --- |
| Deploy read | Independent Core Admin or currently accepted SMC |
| Deploy edit/publish/import apply | Exact predicate: `Admin || (SMC && (EO || SchoolLeader))`, with current accepted evidence and scope |
| Contacts management, including accepted SMC/EO/School Leader values | Either Global Admin or Contacts Power User acting independently under the latest owner decision |
| Contacts own profile | Explicit self-service fields from the approved Contacts field contract |
| Roster school allocation/admin operations | Current Roster capability derived from approved SMC/power-user policy |
| Roster own absence/duties | Authenticated linked staff within own record scope, plus existing allowed on-behalf workflows |
| Stapler sponsored editor | Date-scoped SMC sponsorship permits planning and publication of that date, with a fenced single-editor lease |
| Calendar | Preserve Admin, Parent Publisher and Teacher action/audience matrix from v0.9, enforced on backend |
| LORD/OVERLORD/STARLORD | Preserve authenticated borrower/admin roles and narrow booking-link/signage permissions |
| Venues/Layout | Preserve existing reader/editor/admin scopes, mapped to explicit module capabilities |

Extract module-specific permissions from current source before wiring each route. The table sets the boundary and never makes Deploy permission a universal privilege. Test every exposed operation with permitted, denied and impersonated actors. Sensitive exports and history use the same field and school protections as the screen.

### 4.3 Contacts acceptance and readiness

Preserve provisional Staff ID creation using Basic Name in Deploy and Basic Name plus Mobile No in the Roster registration workflow. Existing inactive/provisional records are searched for reuse. TTb collisions need an explicit distinguishing tag or existing identity selection. The immutable Staff ID survives renames and employment changes. Daily relief activation is separate from long-term employment status. Mobile availability and provider delivery are separate states.

Maintain school section, personnel classification, employment arrangement/status, appointment, memberships and operational modifiers as structured facts. Preserve combined tags and explicit unknown values. TTb names are derived display information and never the authority for eligibility. Changes are effective dated. Future and pending facts remain visible for planning while current operational projections use accepted facts effective at the requested instant.

Carry the owner policy in PR136 into implementation. Either Admin or Contacts Power User alone may accept EO, SMC and School Leader true or false. Preserve self-acceptance protection using permanent Staff ID, MKE plus SMC rejection, full acceptance audit and the owner's choice to omit a notification workflow for these changes. Evaluate School Leader as its own permitted term in the Core predicate; do not fabricate an accepted EO fact from it.

One Contacts transaction conditionally validates field/dependent-group revisions, writes accepted facts, advances revision evidence, appends audit and saves the idempotent result. Related section/EO/SMC changes share a consistency revision. Independent fields can accept separately. Same operation ID and same canonical intent return the original result. Changed intent under the same operation ID conflicts. Request IDs identify individual attempts and may differ across retries.

Readiness uses one bounded consistent owner-side read with epoch and effective-time rechecks. Include active provisional/unlinked people and unknown Active values. Known inactive people may appear as informational. Upon reactivation, incomplete required records deny Contacts-derived capabilities until corrected. Independent Core Admin remains governed by Core identity, session and suspension checks. Start with bounds of 512 staff and 1 MiB response, then measure. Use a visible bounds failure if exceeded. This implements the simplified PR136 design.

### 4.4 F5 evidence recovery

Complete F5 during the build. Persist a versioned association keyed by school and authority decision ID linking the canonical security event, real actor/subject, historical account linkage, evaluatedAt, source revision vector, validated Contacts query observation and actual asOf. Retain the immutable Contacts content and catalogue dependencies needed to reproduce the decision. Capture the observation before a narrow adapter drops fields. Save authority event, evidence association and idempotent receipt atomically in the chosen evidence owner.

A protected mutation references its decision evidence. Repeated reads can share immutable content identity and retain distinct observations. Restart and backup restore must reconstruct the exact historical chain. Keep retention configurable with automatic evidence deletion disabled for the initial release.

Privileged mutation commit requires confirmed durable decision evidence. An unavailable or uncertain evidence write leaves the mutation pending or uncommitted, with reconciliation by the original decision/event ID. Independent Admin decisions record `contacts-not-required` without fabricated Contacts evidence. Evidence of authorization alone is not evidence that the business mutation committed; link its destination receipt explicitly.

## 5. Writes, concurrency and failure semantics

Every mutation carries an operation ID, school scope, authenticated actor context, expected affected revision and typed payload. Store a canonical intent digest with the receipt. A matching retry returns the original outcome, even after newer changes. Reusing the operation ID for different intent returns a conflict. Read endpoints never mutate hidden business state as a convenience.

Use record/scope revision checks and short owner-side D1 transactions. Atomic writes include the domain change, revision bump, audit, receipt and outbox intents. D1 `batch()` can provide a transaction, but a conditional update affecting zero rows is a normal SQL outcome. The implementation must gate every dependent statement or explicitly fail the batch, and prove that a lost CAS cannot leave side effects. Validate the chosen SQL on the actual Workers D1 test runtime.

Expose committed, pending, conflicted, terminal-not-committed and unknown-to-client outcomes accurately. A network timeout never proves a write failed. Verify using the original operation ID before offering retry. Fence expired/cancelled writers using monotonic tokens. Large imports and solver work run outside the final commit transaction and commit only after revision revalidation.

Two people editing different records should succeed independently. Conflicting editors keep their local draft and receive the current value and a meaningful conflict response. Use cell/scope leases only for workflows already requiring exclusive editing. Lease expiry, renewal and replacement must be fenced at the write boundary.

### 5.1 Cross-domain consistency

Service calls and D1 sessions do not create a transaction across databases. A final remote read alone cannot guarantee current authority at the destination commit. Preserve TV02/TV05/TV06 with the following narrow admission protocol for protected writes. Ordinary historical reads and asynchronous projections retain their own stated freshness contracts.

1. Create the destination's durable prepared operation, canonical intent digest, relevant local revisions and monotonic fence. Perform computation and R2 preparation before acquiring short commit pins.
2. Obtain owner-side revision pins in a deterministic order: Core identity/session/suspension/account-to-Staff-ID linkage and all used independent Admin/capability grants, applicable Contacts authority and accepted business-input groups/catalogue dependencies, then the applicable Deploy publication pointer. Each owner atomically verifies the expected revision/effective evidence and registers a pin bound to school, destination service, operation ID, canonical intent digest and destination fence. An already pending source change blocks new pins. Independent Admin skips Contacts-derived authority pins while retaining any Contacts facts needed by the business operation. Acquisition is bounded: if any owner refuses or cannot confirm its pin, durably fence/abort the prepared destination operation and resolve all acquired or uncertain pins before a fresh attempt. Never wait indefinitely while holding earlier pins for a queued owner change; test source-update and revocation cycles explicitly.
3. Pins prohibit conflicting owner changes from being reported committed while the destination commit remains possible. A revocation, suspension or publication update may request cancellation of prepared operations; the destination atomically fences/aborts them or returns their committed receipt. The source update proceeds only after each conflicting pin's outcome is resolved. Display pending rather than falsely reporting successful revocation. Give queued source changes admission priority so repeated saves cannot starve them.
4. After all required pins and durable F5 evidence are confirmed, the destination transaction checks its operation fence, local revisions, stored pin identities and valid time limits, then commits the business change, receipt, audit and outbox atomically. The operation must commit before session/effective-evidence expiry; time validity is checked inside the final transaction. A missing pin, changed revision, cancellation or expired validity produces no business effect.
5. Release pins after a committed receipt or a durable fenced abort. A timeout or expired lease alone never releases an uncertain pin. Recovery queries the destination by the original operation ID, resolves committed/aborted state or atomically aborts a still-prepared operation. Unavailable destinations leave the affected change visibly pending with administrator recovery. No unrelated module is globally locked.

This orders the relevant authority/source update against the local business commit without pretending to have a general distributed business transaction. A source change that wins first invalidates the operation. A destination commit that wins first remains valid and auditable before that source change takes effect. The builder must demonstrate both orders, abandoned-pin recovery, expiry, cancellation and loss of provider/owner response on the actual persistence adapters. Core suspension becomes effective when its authoritative change commits; pending suspension must be clearly shown and block new admission immediately. Measure pin duration and expose old pins in System Health. Do not enable protected mutations until this protocol is proven. If implementation cannot satisfy it, report the concrete blocker rather than silently weakening the frozen contract.

### 5.2 Jobs and external effects

Use a durable owner outbox and stable job/event keys. Claim with a lease and fencing token, store attempt and next retry, bound concurrency, and show last success/error. A crash after domain commit leaves enough state to dispatch later. Queue redelivery and scheduler overlap produce one business effect through idempotency. Provider acceptance, delivery and reading are distinct events. Ambiguous sends retain their uncertainty and provider identity for reconciliation. Avoid claiming universal exactly-once email/WhatsApp delivery.

The browser save completes when its domain transaction commits. Google exports, calendar sync, email and WhatsApp proceed asynchronously with truthful per-item status. Provider outages are isolated to their dependent actions. Required provider credentials get clear setup diagnostics, synthetic test adapters and an explicit live-verification item.

## 6. Deploy implementation contract

Carry the frozen TV01–TV07 appendix into code and tests. The following clauses are especially easy to regress.

Save changes a planning draft. Explicit Publish produces an immutable publication and activates the selected saved revision. Preserve the simplified manual publication model. Future planning versions take effect through the approved manual activation/publication action. Every publication records school, stable version identity, saved working revision, publication sequence, calculation/schema version, accepted Contacts revision/asOf, settings revision, payload digest and actor decision evidence.

Write and verify any R2 payload first. In one Deploy D1 transaction, CAS the working revision and in-force pointer, write immutable publication metadata, committed operation receipt and independent downstream delivery intents. Delivery retries reference the original publication. Publication success stays visible even when a consumer delivery is pending or failed. Receipt verification displays both the requested operation's result and the currently active pointer.

Contacts contributions are nonblocking, field-limited proposals with original actor evidence, accepted base field/group revision, effective date and source publication ID. Contacts returns pending/applied/conflicted/rejected/superseded per field or dependent group. Later fact acceptance may flag review and manual republication.

### 6.1 Workload and units

Deploy owns Wi and its verified inputs. Roster calculates Ri from the accepted projection. Keep raw timetabled occupancy, cap-counted actual work and weighted Wi as separate values.

| Setting | Initial value |
| --- | --- |
| Full weekly budget / timetabled periods | 84 / 60 |
| Four-fifths budget fraction | 0.80 |
| FAJT budget | 65 periods |
| General SIUE coefficient | 1.9 |
| PE / Art / Music SIUE coefficients | 0.9 each, independently editable |
| HOD standard / acting offload | 30% / 20% |
| Junior KP standard / acting | 20% / 0% |
| ST standard / acting | 20% / 0% |
| LT standard / acting | 30% / null |
| MTT standard / acting | null / null |
| HOD SM | 50%, with role-specific precedence |
| BT / TC | 20% each under their applicable rules |
| UT cap | 26 actual applicable weekly periods |

SIUE is a coefficient in `1 + SIUE`. Legacy 190% becomes coefficient 1.9. Multiple recognised specialisms select the lowest configured applicable coefficient. Preserve the approved ban on individual SIUE overrides. Configured catalogue rates remain editable.

For 4/5 plus BT, teaching-target retained capacity is 0.64, weekly budget is 67.2 and workload OF is 0.20. The earlier OF 0.36 example was superseded. Fixed load 6, teaching 10, average 12 and SIUE 1.9 produce Wi 41.96 and Ri 18 with factor 5/7. Keep FAJT factor and UT actual-cap semantics from the frozen contract. Validate all source-specific rounding and cap precedence with deterministic fixtures.

A structurally valid plan may publish estimated or unavailable workload with explicit quality and reasons. Only verified inputs can authorise new workload-dependent Roster decisions. Valid configured defaults have traceable provenance. Missing personal facts remain unknown or explicitly estimated.

### 6.2 Excel and planning UI

Implement exact sheets, column order and replacement scopes in TV03. Export All provides the importable format. Export Visible supports reporting. Every import has a large table-faithful preview, inline TTb matching where allowed, red errors, replacement diff and explicit Confirm. Recheck authority, base revision, dependency revisions and lease after preview. Commit the selected scope atomically. Preserve scroll and frozen identities in tables and previews.

IP import replaces Classes, FormTeachers and class TeachingAssignments together. TG import replaces TeachingGroups, TGClasses and TGTeachers together. Dept import replaces Departments and DepartmentMembers. Span of Control reconciles RO Columns and Hierarchy as one graph. Preserve unassigned staff, deep hierarchy, multiple deputies/TLs and multiple form teachers. Membership and HR Terms are reference exports in Deploy, with edits handled in their owning domain.

## 7. Roster operational contract

Preserve the effective-day rule. A confirmed Stapler plan contains its full intended day and remains meaningful independently of its source baseline. Baseline replacement/pruning must not mass-cancel valid daily plans or completed relief. Cache keys use the resolved effective source ID and revision. Each published day preserves period timing, assignment and source snapshots.

Keep absence reporting, latest submission and overlap reconciliation, exact duplicate acknowledgement, partial overlap merge/keep/edit, on-behalf reporting, information-only instructions, received report recovery and clear transport state. Relief instructions reach the assigned teacher through duty details and applicable notifications. Preserve existing LSE/recess policy and duty SMC routing.

Peer requests reserve their intended scope while pending. Accepted arrangements and SMC decisions carry durable origin and protection. Preserve current manual override policies with explicit warnings, authority and audit. A routine automatic run operates within the configured eligibility constraints. Daily ad hoc activation records date and available periods, keeping permanent staff facts independent.

Keep the existing scheduler times from the implementation baseline, stored as school-time configuration. The inspected allocator uses half-hour slots from 16:00 overnight, then 05:45, 06:00, 06:15 and 06:29, with 06:30 handover. SMC summaries have a separate configurable schedule including 05:30. Preserve quiet hours, missed-slot receipt semantics, date boundaries, cancellation and source revalidation.

Ri has its own ledger and publication provenance in Roster. Weekly applicability and accrued quota records are immutable after capture, apart from explicit audited corrections. A newly published workload change applies according to the approved next-week checkpoint policy; it does not recalculate past weeks. During new workload-dependent decisions, verify the current publication and that the applicable quota basis remains valid. A known source change scheduled for next week is recorded as such. An unverifiable source never becomes quota zero. Preserve historical reads and independent operations while exposing the failed dependency.

## 8. Auto-allocation engine and business policy

### 8.1 Boundary and run lifecycle

Implement `allocate(snapshot, policy, runOptions) -> proposal` as a pure, separately testable package. Supply time, random seed if any and all input data explicitly. The package imports no Worker bindings, storage, credentials, notification clients or browser modules.

Roster builds and persists a versioned input snapshot, calls the selected adapter, validates the proposal, rechecks relevant revisions/current authority and commits changes with audit and outbox in one Roster transaction. Different engine implementations use the same public contract. Include a test engine that proves replacement through the adapter without editing Roster UI or persistence.

The input carries schema and policy version, run/operation ID, school/date/time zone, observed time, digest, effective timetable and period timings, current canonical Staff IDs/facts, availability, absences, relief demands, exemptions, protected assignments, manual no-cover decisions, peer reservations, started periods, weekly R and usage, employment caps, rotation history, config revision and authority/publication evidence.

The result carries input digest and revisions, engine version, assignment proposals, retained/protected references, unresolved demands, layer/round, rule comparison values, exclusions, backfill moves, search status and elapsed/budget metrics. A bounded search reports its status. It never claims proof that no valid solution exists unless the search established that conclusion.

An allocation run is durable and cancellable. Snapshot/computation occurs outside the write transaction. Resume from a meaningful checkpoint or restart from a fresh snapshot after invalidation. Repeatedly timing out on the same work must produce an actionable failure. A late cancelled worker cannot commit. System Health shows queued/running/yielded/committed/conflicted/cancelled/failed state and the current useful progress.

### 8.2 Layers

Users select 1 to 9 layers, default 3. Group chips move between layers. Each person belongs to exactly one layer per date. Daily ad hoc activation without a baseline timetable takes precedence, then configured employment group, then applicable appointment group and residual EO membership. Show the resolved teacher list for each layer. Conflicting group mappings are a configuration validation error, rather than duplicated candidates.

| Default layer | Pool | Distribution |
| --- | --- | --- |
| 1 | Explicitly activated daily ad hoc relief staff without a baseline timetable | Spiral rounds by relief periods already assigned today |
| 2 | FAJT and SRE with baseline timetable and positive applicable R | Spiral rounds while remaining R and other constraints permit |
| 3 | Other eligible timetabled EO staff, HODs, SH/LH/AYH, TLs and applicable appointments, including BT/UT/4/5 | Saved preference order with daily capacity first; configurable spiral available, initially off as E03 |

Use the current layer until it can make no further valid assignment or demand is exhausted. Then advance. Spiral gives each eligible teacher at the current relief-count level an opportunity before advancing to the next level. Existing manual/peer/automatic relief that remains in the day's plan counts toward the level and daily limit. When reoptimising, remove movable proposals from the starting counts before recomputation and count each accepted proposal once.

A configured continuous lesson block is an atomic allocation. A three-period block adds three to the teacher's relief count. The other eligible teachers then receive opportunities at lower counts. This is the engineering resolution for block continuity within a spiral; audit the jump explicitly.

### 8.3 Rule settings and defaults

All layers share the same rule catalogue and have independently saved values and preference order. Keep familiar v0.9 controls, drag handles, up/down buttons, on/off switches and restore defaults. Configuration changes have actor, revision, effective time and before/after audit. A run freezes the effective config and conflicts if a relevant edit intervenes before commit.

| Rule | Initial setting |
| --- | --- |
| Maximum total occupied periods today | 8, per layer |
| Maximum relief periods today | 3, per layer, enabled |
| Maximum final consecutive occupied stretch | 5, per layer |
| Same relief teacher for subject block | PAL 3, FORM 2, configurable per layer |
| Preference 1 | Prioritise teachers with more capacity to take on relief today, up to the layer's maximum daily relief allocation |
| Preference 2 | Fewer alternative relief periods |
| Preference 3 | More weekly R remaining |
| Preference 4 | Rotation order |
| Preference 5 | Same teaching subject |
| Preference 6 | Same teaching level |

All enabled limits constrain the final plan together. Reordering limit cards changes presentation. Reordering preferences changes ranking. Show this distinction in the control labels/help. The user can tune supported policies without backend edits. New algorithms remain an engine replacement or code change.

The orange annual utilisation rule is replaced by daily capacity. The earlier suggestion to use projected annual R% was never adopted. Cumulative annual statistics remain available in the ledger.

### 8.4 Exact daily capacity comparison

Let `occupiedToday` be distinct effective timetable period indices with a lesson, duty or protected occupied block, plus fixed and proposed relief. Preserve current source classification for any cells that explicitly have no occupancy. Let `reliefToday` count relief periods already assigned in the current complete plan. A consecutive-count exclusion still contributes occupied time and stays unavailable.

First reject a candidate if the proposed lesson/block would exceed an enabled limit, availability, employment restriction, remaining quota or another binding rule. For eligible candidates in the same layer, compare fewer `occupiedToday` first. This is equivalent to greater `maxDailyTotal - occupiedToday` when that shared limit is enabled, and remains defined when it is disabled. Then compare greater feasible additional relief periods, bounded by eligible outstanding-demand periods, verified weekly R where applicable, and each enabled total/relief cap. Omit disabled cap terms; never use infinity or NaN. Recompute after every allocation/block. This definition gives the teacher with four occupied periods priority over one with seven, and over one with five when both have three relief places remaining. The first comparison captures visible daily workload, while feasibility prevents assigning unusable headroom.

Within spiral layers, apply this comparison among the teachers eligible in the current round. A person at a higher relief-count level waits for lower-count eligible people. Layers retain their order. Remaining ordered preferences settle equal capacity cases. Stable final ties use permanent Staff ID after the enabled rotation preference, producing reproducible proposals.

### 8.5 Global demand and eligibility settings

Preserve subject exclusion wildcards, specific subject selection and combined preview. Matching new absence lessons become No Relief Required. Preserve historical/manual decisions and saved-scope behaviour. These exclusions determine vacancies before layers run.

Preserve shared lesson cover. For selected subjects at the same venue and period, a present co-teacher covers the shared lesson. When all are absent, create one vacancy for the shared group. Keep accepted peer/manual scopes and avoid duplicate relief charges.

Preserve employment period restrictions. Default SRE and FAJT restricted periods are P0 and P13–P16 for new automatic relief. Restrictions follow employment facts across layers. Existing timetabled activities remain valid. SMC manual overrides follow the existing authorised workflow and audit.

Preserve Subjects treated as a break in the consecutive period count, with wildcards, subject picker and preview. Use BLK as the initial exact selected subject shown by the owner. Matching occupied cells break the consecutive run but remain occupied. Relief demand exclusions are controlled separately.

Subject continuity uses actual effective timetable blocks, including partial absence, shared lesson identity and existing manual anchors. A candidate must cover the complete remaining block required by their layer's rule. Detect incompatible anchors or insufficient quota and surface the gap. Defaults PAL 3 and FORM 2 apply initially in every layer.

Derive block identity from the effective source lesson, class/group, subject and contiguous period sequence, including shared-teacher identity where applicable. Do not group solely by adjacent absence rows. Once a block is anchored, its identity and same-teacher requirement persist through later layer passes and backfill. Incompatible lower-layer block settings produce a visible unresolved block; they cannot split an existing required block or create duplicate cover. Show this conflict during configuration preview where determinable.

### 8.6 Backfill and protection

After the final layer, attempt to cover remaining gaps through valid moves of automatic assignments. Preserve the allocated count of each higher layer where possible. The initial conservative rule requires that a move avoid reducing higher layer usage or breaking any enabled constraint. If that prevents a solution, show the gap to SMC with the reason. This keeps exceptional policy relaxation for a later owner decision.

Auto Allocate can reoptimise movable automatic assignments across the day. Manual commitments, accepted peer work and started/completed duties are fixed. Preserve current publication protection initially. Auto Fill Blank retains every existing assignment and fills only empty slots.

For example, if Layer 1 covered P2, P3 is uncovered, and Layer 2 can cover only P2, move Layer 1 to P3 and Layer 2 to P2 when both assignments satisfy constraints. Log both moves and the reason.

Every run records the original snapshot/config/engine versions, layers tried, candidate comparisons, binding exclusions, selected duties, backfill changes and unresolved lessons. Store a concise explanation with drill-down. Include all considered candidates needed to reconstruct a choice, with purpose-limited facts and bounded payload sizes.

## 9. Relief duties done ledger

Maintain a durable calendar-year ledger and date-filtered reporting. Each duty retains permanent duty/assignment ID, Staff ID, Singapore service date, period/timing snapshot, class/group context, origin, publication/source version, completion basis and chargeable relief amount. Count distinct duty periods separately from chargeable R units so zero-charge cover is explainable.

Include completed manual, peer and automatic duties consistently. A draft or future unfinished duty contributes zero to Duties Done. The initial completion rule is assumed completed after the end of a valid published duty, with explicit completion/non-completion corrections taking precedence. Label assumed completion in drill-down. Repeated jobs or publication retries credit the duty once.

Use permanent service-duty identity plus accounting correction revision for unique credits/reversals. A new publication ID alone never creates another completed-duty credit. Preserve duty identity across republication and unchanged reassignment records; an actual changed person/charge is an explicit atomic reversal and replacement linked to the original service duty. Enforce uniqueness in D1 and test concurrent completion against republication.

Corrections append an audited revision/reversal with actor and reason. Reassignment after service requires an explicit accounting correction. Opening balances carry year and cutoff, prevent double counting and show their limited granularity. Date-range reports never invent period-level history from an opening total.

Provide From and To inclusive date pickers, Year to date default, Full calendar year with year selection, and Custom range including ranges across years. Show totals per authorised teacher and individual-duty drill-down. UI, CSV/XLSX and printable exports reconcile under the same filters. Staff see their own scope; SMC/power users see their authorised school scope. Reporting range never silently changes allocator policy.

## 10. Calendar, LORD, Venues and Layout

### 10.1 Calendar

Port the weekly grid, term/week labels, date navigation, event editor, audience/publisher roles, drafts, publication, search and export. Preserve scroll and open drafts on refresh. Calendar D1 owns the operational event and publication record. Retain recurrence, all-day/timed dates, school-time semantics and existing visibility rules after source inspection.

Preserve all ten tabs: Events, Weekly View, Stats, Parent Publishing, Year Setup, Columns, Glossary, Conditional Formatting, People & Roles, and URL Setup. Include create/edit/delete/relocate, parent-side fields, day notes, tags, lanes, colour/order, school-year/holiday/week-parity setup, release state, PDFs and bounded archive/wipe preview. Unreleased years remain private. Expose a versioned dates/week-parity contract to Roster and Venues. Staff and Parent external sync each have independent durable progress, error and recovery state.

Replace Apps Script sync with a durable Worker integration using the direct Google Calendar API where configured. Store external event/calendar IDs, intent IDs, revisions, change tokens and delete/tombstone evidence. Provider retries are idempotent and cannot resurrect deleted events. Contacts birthday changes reconcile the intended birthday record; retain the approved manual Google sync action. School events and public/parent views receive their existing field-limited projections.

Venue selection resolves a stable Venues ID but does not claim a booking. Where a user requests a reservation, record reservation status separately and show conflicts/pending states. Avoid a cross-domain atomicity claim.

### 10.2 LORD suite

All three frontends share one LORD service and D1. Port resource catalogue, inventory, booking availability, booking on behalf, booking credentials, collection, photo uploads, partial returns, returned-with-issues, cancellation, overdue processing, administrative changes, signage and export. Preserve all current supported equipment types including MacBook Airs, carts and tablets.

Resource reservation is one owner-side transaction with conflict protection for overlapping times and inventory quantities. Define half-open intervals and existing preparation/buffer rules from source. Two concurrent bookings for the last available resource result in one booking and one meaningful conflict. Collection and return accept idempotent retries and record per-resource state and photo references. Photo content is stored privately in R2 with authorised reads and bounded uploads.

Use current Contacts purpose-specific mobile/name projections. Keep booking-for teacher recipients, collection/return reminders, overdue checks, auto-close release rules and incident response semantics. Scheduled notifications verify the current booking state immediately before dispatch. Cancelled/returned bookings suppress obsolete reminders. Retain original send uncertainty and provider receipts.

OVERLORD controls administrative actions and recovery. STARLORD gets only the permitted signage data and photos under a narrowly scoped device session. Keep signage refresh bounded and conditional on revision changes. Portable setup replaces sheet IDs and Apps Script URLs with service/resource bindings.

Include batch bookings, booking edits, signed/scoped incident response links, notification preferences, background recovery, admin grants and REIGN archive preview/close. The existing LORD queue phase 1 covers notification preferences only; it is not proof that booking/storage operations have already migrated.

Preserve the approved reference policy: refresh the local Contacts/Deploy copy daily at 02:03 SGT, accept up to 26 hours of verified age, expose immediate administrator refresh, and attempt recovery refresh before refusing a stale send. Core authorization remains independently current. Revocation, consent, booking state and final recipient checks still apply at dispatch; reference cache age never overrides them. Use stable Staff IDs and purpose-scoped projected fields.

### 10.3 Venues

Own the canonical venue ID, name, usable state, bookings, closures and reservation decisions. Adopt versioned occupancy projections from published Deploy, effective Roster days and confirmed Calendar reservations with source IDs and revision. Display stale or unknown availability explicitly. A booking commit checks the relevant occupancy revision and revalidates source freshness required by its contract.

Two overlapping concurrent reservations for the same capacity produce one accepted result and one visible conflict. Edits/cancellations are revision guarded. Imports and source projection updates preserve provenance and never erase unrelated bookings. Show source and reason for occupied slots without exposing absence reasons, mobile numbers or internal authority data.

Port booking/amend/cancel/approve/reject, recurring series, owner responses, ownership transfers, timetable transfer/waiver, closures, room policy owners, open hours, capacity/features, buffers, linked spaces, source refresh and notification recovery. Roster supplies effective occupancy after cover/movement. A teacher's absence alone never frees a venue.

Preserve a durable Venues publication fence. Before committing a source publication that changes occupancy, call a scoped source-begin operation with immutable operation/source identity and affected venue/time scope. Venues atomically records the fence; booking admission checks it in the same transaction as reservation commit. Only then may the source commit. Source-complete adopts the verified committed projection and clears the fence atomically. Recovery uses source-status and the immutable source receipt to decide adoption or a proven aborted source operation. Expiry alone cannot clear a fence when source commitment is unknown. Existing reservations must be revalidated and any required conflict/waiver decision exposed before source activation under the current source policy. Test publication versus simultaneous booking in both orders.

### 10.4 Layout

Layout includes Layout, 3D Campus and TG allocation views, and editable owned data. Port geometry, room placement, adopted class/TG allocation snapshots, local programmes/notes/active flags and pupil evidence. Existing `backend/LayoutRepository.gs` permits local TG teacher labels, pupil count/text, programmes, active and notes, plus active flags for local records. Provide a small familiar admin table and canonical Excel import/export for these edits to replace the Sheet workflow.

Preserve current campus geometry, camera/navigation, block visibility, room selection and labels from source. Physical venue changes flow through Venues. Published teaching assignments flow from Deploy. Layout local display overrides stay explicitly local. Import validates stable references, preview and revision before atomic apply. Store source payload/version evidence so a later refresh can distinguish adopted source data from local annotations.

Preserve verified per-year snapshots, local MTL pupil/programme evidence across Deploy republication, Excel/print, filters/search and source evidence. Reject wrong-year adoption. A failed publication preserves the last verified head. Public/layout reader projections omit private staff details and internal authority facts.

## 11. Integrations, continuity and recovery

All operational reads/writes and scheduled logic execute on Workers/D1/R2. Replace Apps Script `doPost`, SpreadsheetApp, ScriptApp, DriveApp, MailApp and UrlFetchApp dependencies through native domain persistence or direct provider adapters. Add static and runtime egress checks to prove normal v1 journeys make zero requests to Apps Script endpoints. Keep Google sign-in, readable exports and intentionally configured Google sync through their direct APIs.

Use the existing approved WhatsApp templates, recipient rules and verified business configuration. Template and credential values are deployment inputs. Webhooks require provider validation, deduplication and safe ordering. Notification queues distinguish accepted, failed, uncertain and delivered. Current authority and audience are checked when delayed work executes.

Google Drive readable outputs are an asynchronous operational continuity channel. Store export job revision, digest, destination mapping and last successful artifact. Preserve the last valid output through a failed update. Show the failure in System Health and allow idempotent retry. Export content includes useful human-readable timetable, relief, inventory and planning files according to current source workflows.

Provide recoverable backups of D1 authoritative state, immutable R2 artifacts, schema/configuration versions and integrity manifests. Backup completion means every required part and digest verified. Restore into isolated test resources and exercise representative operations before claiming restore success. Keep a tested recovery procedure and latest verified restore evidence. Readable Excel exports support continuity and controlled import; complete restore uses the backup manifest.

Generate a BURROWS readiness package for effective Roster day/publication changes. Include the supported offline timetable/staff data, source IDs/time and compatible import formats. If an existing BURROWS source is unavailable, produce and validate the readiness export and state the missing offline tool explicitly. An offline tool must operate from the exported files without network access. Reconcile any returning offline edits through preview and conflict handling.

## 12. Performance and observability acceptance

Removing Apps Script changes one bottleneck. Measure D1 query cost, payload size, polling, browser rendering and whole-state serialization as well. Use narrow purpose-specific queries and composite indexes for school/date/staff/resource/status lookup. Batch reference loading and reuse verified immutable content. Use conditional reads/revision signals for refresh and avoid one network call per table cell.

Initial synthetic performance dataset includes 200 staff, 40 classes, P0–P16, odd/even weeks, one calendar year of duties, representative inventory, 50 simultaneous relief demands and 30 concurrent browser sessions. Include a larger high-absence solver fixture. Performance targets are proposed acceptance budgets, not measured claims.

| Measurement | Initial target |
| --- | --- |
| Warm standard list/read request p95 | At most 1 second |
| Ordinary committed write p95, excluding provider delivery | At most 2 seconds |
| Meaningful first screen under representative school network | At most 3 seconds |
| Large import/solver start | Receipt/progress visible within 2 seconds |
| Standard allocation fixture | Complete or useful bounded result within 10 seconds |
| Scheduled due-job dispatch | Normally within 2 minutes of due time, excluding provider outage |
| Concurrent edit test | Zero lost updates, silent overwrites or duplicate business effects |

Record hardware/runtime, region, dataset, cold/warm split, operation mix, p50/p95/max and errors. Tune documented budgets with measurements when necessary and expose missed targets. A long solver uses durable jobs/checkpoints and remains cancellable.

System Health is administrator scoped. Each domain reports build/schema version, authority/readiness, reference freshness, queued job counts/oldest age, last success/error, uncertain provider outcomes, backup and restore status. Record request/run/operation IDs to correlate issues without logging secrets or full personal payloads. User errors include a short action and reference ID.

## 13. Deployment, initialization and handover

Use one canonical GitHub build/test/package pipeline and an owner-triggered deployment workflow. Generate versioned Worker configurations, migrations and a resource manifest. Resolve service bindings, database IDs, R2 buckets, queues, schedules, domains, OAuth redirect URIs and required secrets from school configuration. Browser-only school maintenance remains a requirement. Wrangler or other tooling can run inside GitHub Actions; the school operator uses the GitHub/browser interface.

Package the nine frontends through a unified gateway. Start v1 on its designated preview/development hostname with isolated resources, then use `gsis.gsps.edu.sg` subpaths after acceptance. Preserve deep links in planned redirects from existing domains. A static ZIP alone cannot provision D1, Worker bindings, migrations and secrets; the release must include the actionable browser setup/deployment path and downloadable source/build artifacts.

Fresh v1 data setup imports the permitted current Contacts, Deploy, timetable, Calendar, inventory, venues and Layout reference data with stable IDs or explicit mapping. Keep v0.9 historical records accessible under its existing environment. Any historical relief opening totals have a verified cutoff and explicit source. Produce per-module import counts, rejected rows, mapping decisions and source digests.

Before cutover, resolve any open live loans, future bookings, pending absences, upcoming events and current effective day plans. Prepare a final delta import with an explicit cutoff and source revision. Rehearse with synthetic/approved copies. Freeze only the affected old writer for the final handover interval. Confirm completeness and activate the new route. Record the first v1 commit/write time. After new writes, rollback requires a reconciled recovery plan that accounts for those writes and messages. Reverting a frontend alone is insufficient evidence of data rollback.

Release evidence includes source commit, dependency lockfile, schema migration versions, artifact hashes, binding manifest, feature parity map, tests, screenshots, load measurements, restore evidence, unresolved issues and operator steps. Secrets and personal school data stay outside distributable artifacts.

## 14. Acceptance matrix

All cases below start **Not tested**. The builder records result, exact commit, test command or manual steps and evidence path. Every module includes a happy path, denied action, conflicting write, retry after timeout and representative provider/dependency failure where applicable.

| ID | Scenario | Required result |
| --- | --- | --- |
| CORE01 | Valid Google login, wrong domain/audience, expired session, failed re-login | Correct acceptance/denial and exact ten-day expiry |
| CORE02 | Suspension, future authority, missing accepted facts, impersonated mutation | Current capability enforced with meaningful reason |
| CORE03 | F5 restart and restored backup | Exact decision and original observation reconstructable |
| CT01 | Name-only provisional creation retried, later mobile/name edit | One stable identity and field-scoped conflict protection |
| CT02 | Admin or Contacts Power User accepts authority, self-acceptance, MKE+SMC | Latest owner policy and full atomic audit |
| CT03 | Active incomplete/reactivated staff and unknown Active | Included in readiness and denied appropriately until complete |
| DP01 | Save versus Publish, republish, switch versions | Draft isolation, atomic pointer and immutable history |
| DP02 | Publication timeout before/after commit, repeated request | Original receipt resolves with one publication |
| DP03 | Contribution delivery failure and later acceptance | Independent outcome, accepted facts controlled by Contacts |
| DP04 | IP/TG/Dept/SOC round trip and stale/tampered preview | Exact TV03 scope, all-or-nothing apply and no cross-scope deletion |
| DP05 | 4/5+BT, FAJT+BT, HOD SM, UT, specialists, null rates | Frozen numerical semantics and quality labels |
| DP06 | Competing publication, revoked capability and stale current pointer | Tested local CAS and cross-domain observation boundary |
| RO01 | Absence save timeout/retry and overlap | Durable outcome, accurate latest/duplicate/partial behaviour |
| RO02 | Information-only instructions and accepted peer arrangement | Instructions retained and delivered with protected scope |
| RO03 | Baseline pruned after confirmed Stapler plan | Effective day remains usable and history intact |
| RO04 | Manual choice/config change during solver | Stale proposal rejected, draft retained/recomputed |
| AL01 | Three layers with eligible candidates in all | Sequential layer use and auditable passes |
| AL02 | Layers 1/2 with four eligible teachers and six demands | First relief opportunity for each before second round |
| AL03 | Four versus seven occupied periods; four versus five under cap | Lighter timetable wins first preference when eligible |
| AL04 | Total 8, relief 3, consecutive 5 | All enabled limits enforced in final plan |
| AL05 | BLK break with occupied slot, subject exclusions, shared lesson | Correct run counts, slot eligibility and vacancy count |
| AL06 | PAL3/FORM2 partial absence and fixed anchor | Complete compatible block or explicit gap |
| AL07 | R=0, missing quota, daily ad hoc, inactive/duplicate staff | Correct distinct eligibility outcomes |
| AL08 | P2/P3 backfill and genuinely unfilled lesson | Valid swap logged, remaining gap shown to SMC |
| AL09 | Auto Fill Blank and Auto Allocate | Correct movable/fixed scope for each mode |
| AL10 | Engine adapter replaced by test implementation | Same Roster UI/persistence contracts and invariant validation |
| LED01 | Draft, assumed completed, correction, duplicate completion job | Duties done count and charge reconcile exactly |
| LED02 | YTD, prior year and cross-year custom range | Inclusive date totals match exports and drill-down |
| CAL01 | Two editors, audience change, publication and week navigation | Safe revisions, scoped views and preserved drafts/scroll |
| CAL02 | Delayed Google sync, recurring update, deletion and retry | One intended external state and truthful job history |
| LORD01 | Two simultaneous bookings for last resource | One booking, one visible availability conflict |
| LORD02 | Collect, partial return, issues, photo failure/retry | Per-resource state and media refs consistent |
| LORD03 | Cancel/return just before reminder, uncertain send | Obsolete reminders suppressed, ambiguity retained |
| VEN01 | Overlapping bookings and stale timetable projection | Owner-side conflict check and honest availability |
| VEN02 | Source publication versus booking; source response lost | Durable fence prevents incompatible admission and recovers from original receipt |
| LAY01 | Edit/import local metadata and refresh source projection | Local and source ownership preserved, geometry/UI retained |
| INT01 | Normal journeys through all nine frontends | Zero Apps Script network dependencies |
| INT02 | One owner service or provider unavailable | Dependent operations fail visibly, independent modules usable |
| CON01 | 30 concurrent sessions, disjoint and same-record writes | No lost update or duplicate effect |
| REC01 | Crash between data commit and job dispatch | Outbox recovery with original intent identity |
| REC02 | Complete backup restore and BURROWS export | Valid manifest and usable operations after restore |
| UX01 | Desktop and narrow viewport comparisons | Familiar controls/layout, usable keyboard/focus/scroll |
| REL01 | Clean browser-only install/deploy rehearsal | Reproducible configuration, migrations and operator steps |

Run existing source regressions where behaviour is retained and add focused meaningful tests for new semantics. Exercise actual D1/Worker adapters for transaction/concurrency cases. Pure mocks alone do not establish storage correctness. Perform a final independent review of identity/privacy, domain integrity, concurrency/recovery and UI parity. Record unresolved findings honestly.

## 15. Build sequence for a sustained Codex run

1. Refresh main, active claims, PR136 and source changes. Pin the build baseline and map approved requirements to current code. Reuse T1A/T1B and merged Package A.
2. Establish isolated v1 workspace/build, unified routes, real Core/Contacts owner stores, trusted transport and F5 evidence persistence. Bring one existing Contacts screen through a complete authenticated save.
3. Implement Deploy draft storage, leases, canonical imports, workload and publication. Prove one real publication and Roster adoption with verified evidence.
4. Implement Roster operational persistence and current UI journeys, then integrate the replaceable layered engine, ledger, scheduler and notification outbox.
5. Port Calendar, LORD, Venues and Layout using independent ownership scopes and shared frozen service contracts. Parallel work may proceed after shared contracts are stable.
6. Complete direct provider adapters, reference refresh, readable exports, backups, offline readiness and browser-only install/release packaging.
7. Run integrated parity, concurrency, failure/recovery, performance and visual checks. Fix defects through the normal entry points and rerun affected checks.
8. Produce reviewable product commits/PRs, downloadable release artifacts and an owner acceptance report with exact evidence and any real external setup blockers.

These are implementation checkpoints inside the requested sustained effort. They do not require the owner to approve each routine step. Use repository-compatible bounded PRs or stacked branches with explicit dependency ownership. Where active production and v1 assignments compete for the same implementer, honour current coordination and ask only for the genuine scheduling decision.

## 16. Known source state and remaining uncertainty

T1A and T1B are merged libraries without production routes or owner stores. Package A missing-authority mapping is merged. Contacts acceptance/readiness/F5 designs exist. PR136 records the newer owner permission policy and simplified readiness scan, but remains unmerged at the inspected head. Source inspection does not prove its CI or runtime acceptance.

Open PR40 contains stale quota/FAJT work and PR72 stale allocator continuation work. Their current records explain unsafe rebase conflicts. Use the relevant lessons and current contracts; reconstruct required v1 behaviour from its own contracts and tests. Avoid importing an old mixed stack wholesale.

Root release/readme/deployment records include historical Google-first wording alongside later D1 code and release notes. Refresh source and current owner records rather than treating one old header as live authority. The current deployed build, credentials and data remain unverified here.

Google/Meta/email credentials, approved sender configuration, final resource IDs and production domains are deployment inputs. They may require administrator setup. Complete adapters and synthetic acceptance before listing the exact missing setup. Never manufacture successful provider calls or production readiness.

The remaining owner-visible defaults are E01-E11. The full product has broad scope and a single model run cannot guarantee a defect-free release. This specification makes the work actionable and auditable; acceptance evidence determines release readiness.

## 17. Evidence and reference index

Use immutable links for inspected source and refresh them for the build baseline.

* [Inspected main](https://github.com/helper-gsps/gsis/tree/27fa498657965169b9d971a9caabc33c8b19bc69)
* [Release viewport inventory](https://github.com/helper-gsps/gsis/blob/27fa498657965169b9d971a9caabc33c8b19bc69/release-installation-manifest.json)
* [v1 engineering instructions](https://github.com/helper-gsps/gsis/blob/27fa498657965169b9d971a9caabc33c8b19bc69/docs/v1/AGENTS.md)
* [Owner directives](https://github.com/helper-gsps/gsis/blob/27fa498657965169b9d971a9caabc33c8b19bc69/docs/coordination/OWNER_DIRECTIVES.md)
* [Latest Contacts policy](https://github.com/helper-gsps/gsis/blob/0081eea4e8924691818b68d18c5d53d6927985fa/docs/v1/contacts/AUTHORITY_ACCEPTANCE_DESIGN.md)
* [Latest readiness design](https://github.com/helper-gsps/gsis/blob/0081eea4e8924691818b68d18c5d53d6927985fa/docs/v1/contacts/AUTHORITY_READINESS_SCAN_DESIGN.md)
* [F5 recovery design](https://github.com/helper-gsps/gsis/blob/27fa498657965169b9d971a9caabc33c8b19bc69/docs/v1/core/F5_EVIDENCE_RECOVERY_DESIGN.md)
* [Roster allocation source](https://github.com/helper-gsps/gsis/blob/27fa498657965169b9d971a9caabc33c8b19bc69/shared/roster-allocation.js)
* [Roster operations source](https://github.com/helper-gsps/gsis/blob/27fa498657965169b9d971a9caabc33c8b19bc69/shared/roster-operations.js)
* [Layout write ownership](https://github.com/helper-gsps/gsis/blob/27fa498657965169b9d971a9caabc33c8b19bc69/backend/LayoutRepository.gs)
* [Exact full Revision 49 source](https://github.com/helper-gsps/gsis/blob/df67543cfc01d5f2e0e6d678af2c539bccea6ae6/docs/v1/accelerated-delivery/sources/GSIS_V1_CONSOLIDATED_SPEC_2026-11-11_REV49.md)
* [LORD daily reference policy](https://github.com/helper-gsps/gsis/blob/27fa498657965169b9d971a9caabc33c8b19bc69/docs/coordination/tasks/lord-contacts-sync-daily.md)
* [D1 database API](https://developers.cloudflare.com/d1/worker-api/d1-database/)
* [D1 sessions and read replication](https://developers.cloudflare.com/d1/best-practices/read-replication/)
* [Worker Service Bindings](https://developers.cloudflare.com/workers/runtime-apis/bindings/service-bindings/)
* [Queue delivery guarantees](https://developers.cloudflare.com/queues/reference/delivery-guarantees/)
* [Google OpenID Connect](https://developers.google.com/identity/openid-connect/openid-connect)

Revision 49 source file is `GSIS_V1_CONSOLIDATED_SPEC_2026-11-11_REV49.md`, Library identity `libfile_fde3_f-9a2e49c81d7c8191ab6c630fbe3a7725_40e0f117a83081919a0ebd23b08b5601`, version 1, 206016 bytes. The current Library footer was checked against the supplied local source. Its frozen technical clauses are included below to avoid relying on a historical chat.

Full source SHA256: `8fce6177b98d8e5fd87ba924e56be31f4d70e179407782bc6dd1d78495762683`. The repository source link above preserves that file. Read its latest operative clauses across all reviews; historical planning-only statements describe their original date. Submission of the section 19 execution prompt supplies the new implementation scope, while its production gates remain explicit.

## 18. Frozen Deploy technical appendix

The following TV01–TV07 content is preserved from Revision 49. Apply the latest Contacts owner policy in section 4 where privilege wording has evolved. Earlier chronology and planning-only status remain available in the source document. The appendix governs field/schema/numerical details.

## TV01 — Authoritative 4/5 + BT interpretation

Separate **teaching-target retained capacity** from **workload offload OF**. Teaching-target retained fraction = 0.8 (4/5) × 0.8 (BT) = **0.64**. For workload calculation, the 4/5 reduction is already applied to weekly budget (84 × 0.8 = **67.2**) and **must not be applied again to OF**. BT alone contributes OF = **0.20**. With FTT+PD+Duties+Other=6, Ti=10, T_avg=12, SIUE=1.9, factor=5/7: Wi = 6 + 2.9 × (10 + 0.20×12) = **41.96**, R=floor((5/7)×(67.2−41.96)) = **18**. The former Rev42 OF=.36 / Wi=47.528 / R=14 example is **superseded and invalid**. This rule does not change FAJT+BT, HOD SM precedence, UT total actual cap, or specialist SIUE. Source `shared/relief.js:48–60,73–96` and `shared/teaching-rules.js:20–47` at audited current main.

## TV02 — Core/Contacts/Deploy endpoint × authority × field contract

Proposed endpoint names are **contract-level interfaces**; the implementation may use equivalent versioned Service Binding operations. Core resolves **current** permissions server-side. `deploy.read`: Global Admin or current SMC; `deploy.edit` and `deploy.publish`: Global Admin or current SMC **and** EO; School Leader implies EO but does not automatically imply SMC. Read-only impersonation cannot mutate. Recheck authority at apply, publication commit and retry after waits; future facts, stale cache or expired session cannot grant access.

| Operation | Authority | Authoritative scope / response |
|---|---|---|
| Read versions, tables, receipts | deploy.read + school/record scope | Deploy-owned planning state and field-filtered references |
| Acquire/renew/release edit lease; save table | deploy.edit + revision CAS + fencing token | Deploy draft only |
| Preview import | deploy.edit | Read-only parse, match, validate, diff; no authoritative writes |
| Apply import | deploy.edit rechecked + exact preview/base/lease | Atomic selected Deploy draft scope only |
| Publish saved revision | deploy.publish rechecked | Deploy immutable publication and durable receipt |
| Verify/retry publication operation | Current scoped read for receipt; current publish for new commit attempt | Same operation ID/digest, no blind republish |
| Read accepted staff facts | Trusted Deploy service with constrained school/actor context | Contacts-owned accepted/effective facts, revision and as-of |
| Register provisional staff | Restricted Core-authorised capability | Contacts allocates permanent Staff ID; permitted Basic Name/tags only |
| Submit Deploy contributions | Trusted delivery + original actor proof | Contacts field-scoped pending proposal; nonblocking |
| Resolve contribution | Contacts-authorised current Power User/Global Admin | Contacts acceptance/rejection with per-field revisions |
| Read current publication and workload | Trusted Roster binding | Deploy immutable envelope/current pointer |
| Commit workload-dependent Roster decision | Current Roster authority + verified current publication | Roster owns decision and stamps publication context |

**Field ownership:** Permanent Staff ID is Contacts-assigned; verified Google linkage and capabilities are Core-owned. Basic Name, Role, Appointment Status, Employment Modifier, Subject Modifier and employment Active may be **proposed** by Deploy's approved Teachers workflow, never directly overwritten as accepted Contacts facts. Staff membership assignment may be proposed only where the existing approved staff editor exposes it; membership-to-capability mappings and catalogues are not staff contributions. EO Appt Level, TTb Name, statutory name, mobile, email and directory aliases are **reference-only/no new Deploy Excel write**. Planner Notes, Dept, TG, class assignments, reporting links, exclusions and offload configuration are Deploy-owned. Membership role/group catalogue and HR Terms catalogue are **reference-only Export** in Deploy; **no Deploy import/apply** unless separately authorised by owner-domain contract. Preserve their familiar visible screens with read-only explanation where appropriate.

**Contribution contract:** Carry school, actor, Staff ID, field path, proposed value, accepted base field/group revision, effective date, source publication/operation ID and original authority evidence. Return pending/applied/conflicted/rejected/superseded **per field or dependent field group**. Contacts validates dependent classification/appointment/membership groups atomically where required by its validator; independent fields need not be whole-record locked. Contacts rechecks current authority on delayed acceptance. Later acceptance flags review/manual republication, never mutates an immutable publication. Publication never waits for contribution acceptance.

## TV03 — Canonical workbook contracts and atomic replacement ownership

Each importable Export All workbook carries a visible metadata block: School ID, Version ID, Base Working Revision, Table Scope, Schema Version. Visible protected IDs are **not** a security boundary. IDs/codes are text, booleans TRUE/FALSE, levels integers 1–6, numeric fields finite decimals, blanks preserve null (not zero). Server rejects foreign scope, unknown schema, invalid supplied IDs, duplicates, broken references and stale base. A valid ID conflicting with a displayed name requires explicit resolution. Missing Staff ID may use one-time TTb fuzzy picker; no hash/alias ledger. Export Visible is reporting-only. Imports do not publish.

| Workbook | Sheet and exact column order | Writable boundary / replacement scope |
|---|---|---|
| IP | `Classes`: Class ID, Level, Class Name, Short Name, Ability, Venue ID | Controlled editable class attributes; class ID stable, existing level not silently changed |
| IP | `FormTeachers`: Class ID, Staff ID, TTb Name | Form-teacher relationships; preserve multiple FTs |
| IP | `TeachingAssignments`: Assignment ID, Class ID, Subject Code, Staff ID, TTb Name | **Class-only** subject assignments; immutable/server-issued assignment ID |
| TG | `TeachingGroups`: TG ID, TG Name, Subject Code, Levels, Weekly Periods, Venue ID, Whole Level, Anchor Class ID | TG definition, class scope and periods as existing UI permits; levels semicolon-separated, weekly periods nullable where existing model permits |
| TG | `TGClasses`: TG ID, Class ID | Existing class references; whole-level and explicit-class modes cannot conflict |
| TG | `TGTeachers`: Assignment ID, TG ID, Staff ID, TTb Name | **TG-only** assignments, full TG periods counted once per teacher |
| Dept | `Departments`: Department ID, Department Name | Stable department definition |
| Dept | `DepartmentMembers`: Department ID, Staff ID, TTb Name, Position, Order | Head, Deputy, TL, Member; preserve multiple deputies/TLs and order |
| Teachers | `Teachers`: Staff ID, TTb Name, Basic Name, Role, EO Appt Level, Appointment Status, Employment Modifier, Subject Modifier, Active, Planner Notes | Only Planner Notes directly Deploy-owned; eligible staff facts are nonblocking proposals; missing rows never deactivate Contacts staff |
| Exclusions | `Exclusions`: Staff ID, TTb Name, P1, P2, P3, P4, P5, P6 | Deploy-owned advisory boolean matrix |
| Membership | `Membership`: Role Shortform, Formal Role Name, SL, SC, SMC, KP, TL, SDT, CMT, SAT, Support, MK, EO Appt Level | **Reference export only; no Deploy replacement** |
| Offload | `Offload`: Rule ID, Rule Name, Source, Match, Standard Percent, Acting Percent, Period Cap, Notes | Deploy-owned rule table; blank acting ≠ zero; validate match source and cap |
| HR Terms | `HR Terms`: Field, Value | **Reference export only; no Deploy replacement** |
| Span of Control | `RO Columns` and `Hierarchy` | One atomic reporting graph replacement after both sheets reconcile |

IP replacement transaction includes **Classes + FormTeachers + class TeachingAssignments**; TG replacement includes **TeachingGroups + TGClasses + TGTeachers**; Dept replacement includes **Departments + DepartmentMembers**. **Never replace TG assignments from an IP workbook** even though TG rows appear in the IP matrix. Import preview shows dependency impact and rejects cross-scope deletion/cascade without an explicit supported resolution. Teachers replacement applies eligible draft proposals and planner notes only, never a Contacts deletion. Exclusions and Offload replace their own draft tables. All scopes validate references at Confirm and commit all-or-nothing.

**Span of Control:** `RO Columns` has exactly one physical column per RO; its header pairs readable RO name and protected permanent Staff ID. Each occupied cell pairs readable direct-report name with bracketed Staff ID **in the same cell**; retain empty RO columns and an Unassigned column. `Hierarchy` columns: Staff ID, Staff Name, Parent RO Staff ID, Parent RO Name, Role, Is SL, Is OSO, Active. Only Parent RO Staff ID relationship is editable; all other fields are reference evidence. Preserve deep levels, roots and unassigned state. Compare both sheets against exported base: one-sided change applies, identical changes agree, conflicting proposed parents require user resolution. Reject duplicate placement, cycles, self-parent, orphan, ineligible RO and illegal root changes; never silently erase omitted people. This cell encoding is the frozen contract for import preview, **not** a change to the existing drag/drop viewport.

## TV04 — Durable publication operation and recovery contract

Publish request binds stable operation ID to school, actor, planning version, saved working revision, expected in-force pointer sequence and canonical payload digest. Reusing an ID with a different digest is rejected. Capture accepted effective Contacts facts with revision/as-of evidence and current actor authority; exclude pending/future facts. R2 immutable payload, if used, must be durable and digest-verified **before** exposing a pointer. One **Deploy D1** transaction must CAS working revision and pointer, record immutable publication ID/monotonic school publication sequence, committed receipt and separate durable Contacts/Roster delivery intents. A failed transaction cannot partially activate; unreferenced R2 blobs are harmless.

Receipt states: **pending**, **committed**, **terminal-not-committed**. A client timeout is **unknown to client**, not a terminal server state. An absent receipt does not prove an in-flight writer cannot commit. A terminal failure must fence late writers. Retry verifies the **same** operation ID/digest and returns the original committed result even if a newer publication is now in force; display both the original outcome and current pointer. Never generate a new publication to repair delivery. Separate recipient delivery records carry publication ID, attempts, status, last error and idempotent consumer acknowledgement; Contacts proposal outcomes are separate from delivery acknowledgements. Preserve historical immutable revisions while Roster history references them. Manual Publish only; no scheduled activation.

Required public response semantics: operation accepted/pending; committed with publication ID and sequence; terminal-not-committed with reason; conflict (working revision/pointer); revoked authority; missing accepted facts; payload integrity failure; incompatible schema/projection. Exact code literals are implementation choices; no silent unknown-success claim.

## TV05 — Roster projection, verification and D04 SAFE

Deploy-owned workload envelope must contain: schoolId, publicationId, monotonic publicationSequence, workingRevision, schemaVersion, calculationVersion, publishedAt, accepted Contacts revision/asOf, settings revision, payload digest. Each Staff ID row carries raw timetabled occupancy, weighted Wi, actual cap-counted workload, budget/factor/cap inputs, and **verified/estimated/unavailable** quality with reasons. Shared inputs (including T_avg) carry quality; a row is not verified if any required shared dependency is unverified. Null ≠ zero. Deploy owns Wi; Roster owns Ri, day activation and relief allocation.

Roster checks current authoritative pointer, school, digest, schema/model, required input closure and publication sequence, then adopts atomically in its **own D1**; delayed lower sequences never replace newer adoption. Every new workload-dependent Roster decision must verify **current** authority at decision time and persist publicationId, sequence and calculationVersion. Cache age alone is not freshness. Explicitly classify each operation as workload-dependent or independent; an administrative action that allocates remains dependent. If verification fails, block only new dependent decisions; permit history/read and genuinely independent operations. Do not reallocate, cancel or rewrite completed historical decisions on refresh. There is **no cross-D1 transaction**: engineering must define and test the final authority revalidation boundary and race handling without a stale-grace or emergency bypass.

D05 FIXED: publication captures accepted Contacts facts effective at publication instant; later accepted/future-effective facts flag review/manual republication, never silently recalculate a published Wi. OK13: structurally valid planning data may be published with estimated/unavailable calculations, clearly labelled; those values cannot authorise new workload-dependent Roster decisions. This supersedes older blanket publication-block wording.

## TV06 — Contacts snapshot/as-of contract

For each publication, persist an immutable reference to accepted Contacts staff fact revision(s), effective-as-of instant and validated staff-field projection. Core capabilities are evaluated at **operation time**, not frozen as permission to act later. The final check before commit must revalidate accepted-fact evidence and current actor permission; explicitly record cross-domain consistency limitations. A Deploy D1 transaction cannot atomically lock Contacts D1; if evidence is stale or unverified, return a retryable safe failure rather than silently mix fact revisions. Future-effective, pending, rejected and superseded proposals never become published workload inputs. Contacts changes after commit do not alter historical publication; they may flag review/republication.

## TV07 — Concurrency, browser recovery and visual evidence

Lease identity is school + planning version + editable scope/cell; grant includes holder actor, expiry and monotonic fencing token. Renew/expiry/release cannot allow a superseded token to write. Save/import rechecks current capability, expected draft revision, fence and affected dependency revisions **at commit**, after preview/waits. Bulk replacement detects active intersecting leases; no partial application. Browser recovery draft is bound to school, actor, version and base revision; it is clearly unsaved and cannot be restored after signout, revocation or incompatible base without explicit safe review. Preserve horizontal/vertical scroll, frozen identity columns and approved UI baselines.

**Visual gates:** pre-implementation evidence = approved existing screenshot baselines (IP, Occupancy, six HR views) plus approved proposed import/publication states. Post-implementation evidence = runtime desktop/narrow screenshot comparison and executed UAT. Do **not** require runtime screenshots of unimplemented features as a prerequisite for coding. All UAT remains Not tested.

## 19. Prompt to give Codex using Astra Ultra

Select Astra and Ultra reasoning in the Codex interface. Then submit the following instruction with this specification's exact repository commit link.

> Implement the complete GSiS v1 product defined in `docs/v1/accelerated-delivery/GSIS_V1_ACCELERATED_IMPLEMENTATION_SPEC_2026-11-13.md` at the supplied specification commit. I authorise isolated v1 implementation, tests, build configuration, documentation, task branches and reviewable PRs for this delivery. Use the documented engineering defaults E01-E11, preserving later explicit owner decisions. Continue through all implementation checkpoints without requesting approval for routine reversible engineering choices. Preserve the current v0.9 UIUX and approved subsequent v0.9 features. Deliver functioning frontends, real Cloudflare domain stores and authenticated service routes, the replaceable allocator, direct provider adapters, concurrency/recovery, imports/exports, deployment artifacts and acceptance evidence. Reuse the merged T1A/T1B contracts and reconcile PR136's owner policy. Complete F5. Read AGENTS.md and current coordination, refresh source, record exact baselines, and claim bounded disjoint work. Use parallel agents for independent domains after interfaces are frozen. Keep integration owned by one agent. Follow the specification's test matrix and independently review the final product. Merge, paid provisioning, live data migration, real notifications and production cutover require my existing explicit authority for those actions. Preserve the current operational system while preparing v1. If an external credential or unresolved school policy prevents one action, finish the independent work, provide the exact configuration/decision needed, and report that item with truthful status. A contract-only prototype or UI wired to Apps Script does not satisfy delivery. Return the product and evidence, with remaining limitations stated precisely.

## 20. Specification verification record

This specification has been assembled from the conversation decisions, supplied Revision 49, current source at the recorded baseline and current Contacts policy evidence. Parallel read-only source reviews covered Roster, Core/Contacts/Deploy and Calendar/LORD/Venues/Layout. Runtime implementation, performance, user acceptance and deployment checks remain Not tested. The authoring task publishes documentation and a handoff, and makes no claim that the product has been built.
