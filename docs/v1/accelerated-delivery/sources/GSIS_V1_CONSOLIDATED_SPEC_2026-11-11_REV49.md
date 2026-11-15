# GSiS v1 — Specification and Owner Decision Checkpoint

**Checkpoint date:** 10 November 2026 (Singapore)
**Repository:** https://github.com/helper-gsps/gsis
**Read-only audit reference:** main at `8194dd3a0b93297b3d790541397d80b3bd68f36f` (9 November 2026). This is NOT a claim about current main or deployed production.
**Status:** Specification only. No v1 branch, implementation, repository changes, skill installations, infrastructure changes or deployment authorised.

## 1. Operating and architectural baseline (approved in earlier Core reviews)

- Keep v0.9.9* in production while v1 is specified and developed. Unified `gsis.gsps.edu.sg` with module routes; preserve familiar frontend look and workflows.
- One GitHub repository; create v1 branch from then-current main only after explicit owner authorisation. Separate merge, approval and production deployment.
- Cloudflare authoritative operations; domain-owned D1 stores and R2 immutable artifacts where appropriate; service bindings and validated/versioned projections, not cross-domain direct writes or implied distributed transactions.
- Google Workspace `@gsps.edu.sg` OAuth; Core owns accounts, verified Google subject linkage, sessions and application capabilities. Ten-day absolute session; explicit GSiS suspension revokes immediately. Workspace-only suspension may leave an existing session until absolute expiry, as owner accepted. Employment status and app access are separate.
- Purpose-limited operational audit, backend-enforced read-only preview, admin System Health and controlled recovery; no unnecessary personal data in audit.
- Google-readable operational continuity outputs, checked backups and manual/offline continuity are separate. BURROWS readiness package on major Roster revisions; complete module recovery policy deferred. Cloudflare remains authority; offline changes reconcile explicitly.
- Hybrid publication signal + pull verified data + periodic reconciliation; optimistic concurrency and idempotency by default. Immutable publications, atomic activation and bounded freshness. No generic event bus or suite-wide lock.
- ChatGPT/Codex sole AI ecosystem. Future repository AGENTS.md and verified skills; Rust-inspired ownership, transaction, serialization and performance discipline without Rust rewrite.
- Browser-only school maintenance; GitHub-hosted build/test/deploy, human-triggered and approved release, versioned migrations, rollback, school-portable configuration and successor handover.

### Core Review 4D — approved U01–U14 (14/14)
U01 Browser-only setup and maintenance; U02 School-specific configuration; U03 Guided first installation; U04 Administrator bootstrap; U05 Infrastructure configuration as code; U06 One canonical build pipeline; U07 Separate merge and deploy; U08 Exact release traceability; U09 Controlled database migrations; U10 Safe application rollback; U11 Repository-level AI instructions; U12 Rust-inspired engineering discipline; U13 Simple PR workflow; U14 Successor handover verification.

### Audit reconciliation still required
Work's `GSIS_V1_CORE_OWNER_DECISION_PACKAGE.md` identified five contracts to settle before Contacts implementation: identity linkage, capabilities, catalogue ownership, safe writes and projection freshness. The audit found Contacts↔Deploy catalogue cycles, cross-scope transaction guards that cannot carry over unchanged to split D1 databases, CI that builds/tests but does not deploy, and backups not proven restorable. The audit lacked complete wording for Core Reviews 2–3 and V1-021/022; conversation owner decisions take precedence where accessible. No Graphify installation was authorised. Do not mistake audit recommendations for owner approvals.

## 2. Contacts Review 1A — approved CT01–CT12 (12/12)
CT01 Contacts owns staff directory and stable IDs.
CT02 Core owns account identity, subject linkage, sessions, suspension and application capabilities.
CT03 Staff records can exist without Google accounts.
CT04 Employment and GSiS access are separate.
CT05 Contacts operates without Deploy.
CT06 Deploy owns planning assignments, workload, planning versions and publication selections; Contacts may show read-only projections.
CT07 Each field/catalogue has one authoritative owner.
CT08 School roles do not automatically grant application privileges.
CT09 Staff self-service is limited to explicitly permitted fields; admin edits require capabilities.
CT10 Stable IDs and historical references survive names/emails/employment changes.
CT11 Safe atomic revision checks and idempotent writes; visible conflicts.
CT12 Validated, versioned purpose-limited projections with explicit freshness rules.

### CT13 — approved option B
Use separate explicit school section, personnel category, employment arrangement and employment status, rather than blanks encoding 'Primary / full-time EO'. **Important clarification after CT14:** these classifications are required for a *completed profile*, not initial provisional creation. Never infer ambiguous historical facts automatically; flag for administrator review.

### CT14 — approved option A, amended
- Deploy Power Users (currently SMC) are NOT thereby Contacts Power Users. They may create a **provisional Contacts-owned Staff ID immediately** through a narrow, authorised operation using **Basic Name alone**; mobile, Google account and employment classification are not required for planning.
- Optional tag/modifier such as `(MTL)` distinguishes TTb names. Search existing, including provisional/inactive, and display likely Basic Name matches. Different resulting TTb Names may be accepted as distinct; exact resulting TTb Name collisions require reuse or a distinguishing tag. Never silently merge on name. Use idempotent creation requests and stable immutable Staff IDs.
- Contacts Power Users / Global Admins may complete other fields authoritatively later. Deploy retains its own planning write permissions and cannot freely edit Contacts records.
- Roster morning relief must be able to register/use an ad hoc teacher rapidly with Basic Name and Mobile No for WhatsApp, without `@gsps.edu.sg` login. Roster daily activation is separate from permanent employment status. Valid mobile alone does not prove WhatsApp delivery.
- Do not require complete employment data before permitted Deploy planning or daily Roster relief.
- Pending detailed lifecycle review: how Contacts edits propagate into Deploy/Roster, duplicate review when mobile is later added, and whether planning-only registration and daily relief have distinct operation scopes.

## 3. Contacts Review 1C — APPROVED (10/10, three amended)
Approved without amendment: CF01 permanent Staff ID; CF02 Deploy narrowly scoped provisional registration with Basic Name and optional TTb tag, without general Contacts edit rights; CF03 later Contacts Power User / Global Admin completion; CF06 explicit duplicate review when mobile added, no silent merge; CF08 no mobile means no WhatsApp readiness but planning remains allowed; CF09 separate provisional/profile-complete/employment-active/daily-relief-activated states; CF10 Contacts owns staff records and Deploy cannot overwrite them via publication.

Approved amendments:
- **CF04 — Revision-aware pull:** Contacts remains the staff-data authority. Deploy and Roster check Contacts' current revision and fetch changed directory information through Cloudflare Worker Service Bindings on relevant page/data loads. Reuse a verified local snapshot if revision unchanged; use bounded cache/freshness rules. Routine Contacts name edits do not require webhooks. Do not fetch on every cell render/edit. Fresh permission/eligibility-sensitive operations must fail safely if required information is stale. This is an approved design direction; exact cache TTL and failure thresholds remain to be specified.
- **CF05 — Historical identity and audit:** Keep stable Staff IDs; current directory names update in consumers, while immutable historical publications/communications retain appropriate historical display snapshots. Log changes with actor ID, origin viewport, timestamp, changed fields, operation ID, and purpose-limited before/after information. Restrict audit access and avoid unnecessary sensitive values; audit history is not Excel-editable.
- **CF07 — SMC rapid registration:** Roster SMC users, when authorised through Core's Roster SMC capability, may register or reuse provisional teachers using Basic Name and Mobile No via a narrow Contacts-owned operation. Contacts checks duplicates and returns the stable Staff ID. SMC role/membership information may be sourced from Contacts, but the backend must enforce Core capability rather than relying on a UI tag or stale role cache. This does not grant broad Contacts editing rights. Daily relief activation is separate from employment activity.

The earlier, withdrawn CF01–CF12 field-level proposal remains NOT APPROVED; the **revised** CF01–CF10 lifecycle review above is the approved version. Next: source-grounded Contacts field definitions, editing authority, and exact lifecycle semantics. Relevant legacy fields: Staff ID plus TTb Name, Basic Name, Statutory Name, iCON/CES/GSPS aliases, Mobile No, EXT, Day of Birth, Month of birth, Role, EO Appt Level, Appointment Status, Employment Modifier, Subject Modifier, Active, MK Modifier. Legacy ownership differs from proposed v1; do not silently transplant it.

Existing Contacts UI: Contact list, Sys Admin, Edit Info, DIY update (Statutory Name/Mobile No), My signature, Signature settings. Preserve familiar UI where possible. Existing Deploy teacher proposals and Contacts approval path, and Roster `rosterContactCreate_`, were identified from source; no live browser verification claimed.

## 4. Contacts Review 1D — APPROVED (8/8, three amended; owner 10 Nov 2026)

Approved without amendment:
- **FD01:** Basic Name is entered; TTb Name is the derived operational display name using an optional distinguishing tag. Staff ID is the permanent identity.
- **FD02:** Explicit provisional/profile-completeness state, separate from Active and employment fields; permitted planning and daily relief must work for incomplete profiles.
- **FD05:** Contacts retains Mobile No, EXT and iCON/CES/GSPS directory aliases. Core independently verifies Google subject linkage; aliases do not prove login identity.
- **FD06:** Authorised self-service for Statutory Name and Mobile No, bound to stable Staff ID, safely committed and audited.
- **FD08:** Migrate unambiguous legacy employment defaults to explicit classification; ambiguous records require Contacts Power User review. Preserve original values and migration audit evidence.

Approved with owner amendments:
- **FD03 — Explicit storage, compact display:** Store school section, personnel category and employment arrangement explicitly (e.g. Primary, EO, Full-time). Suppress ordinary/default Primary and full-time EO labels in compact directory presentation to avoid clutter, while showing complete values in authorised administrative editing and exports. Non-default categories remain visible where operationally relevant. Provisional records can remain incomplete. The legacy UI's exact appearance still requires visual verification; source inspection supports blank-as-default semantics, not a full rendered UI claim.
- **FD04 — Appointment-derived module capabilities:** Contacts owns school appointment and membership facts. Core evaluates explicit, module-specific policies (including SMC eligibility for Roster) and enforces capabilities server-side; individual viewport policy mappings remain for later review. School appointments never automatically confer Global Admin. Changes to role/membership must invalidate stale privileged authority. This refines earlier CT08; it does not grant blanket application privileges.
- **FD07 — Automatic Calendar birthdays:** Contacts sends a durable, narrowly scoped change signal for birthday-relevant staff changes. Calendar pulls validated Contacts data through a Service Binding and reconciles Calendar-owned birthday events; idempotent retries and periodic reconciliation recover missed signals. Manual Admin reconciliation remains as recovery, not normal operation. Whether updates to released teacher-visible events occur automatically remains deferred to Calendar policy review.
  - **FD07-A — Owner clarification (approved, 10 Nov):** Automatic acceptance/reconciliation of Contacts birthday information applies **only to internal GSiS Calendar records**. It must **not** trigger Google Calendar synchronisation, external publication, notifications, or automatic release to teachers. Existing manual Google Calendar sync remains manual. Calendar draft/released visibility rules are a separate Calendar review decision.

**Legacy evidence checked at audit SHA:** `shared/workload.js` interprets blank Employment Modifier as ordinary Full time; `shared/teaching-rules.js` uses Role, Appointment Status, Employment Modifier, Subject Modifier and memberships for eligibility/workload, including acting rules. `backend/Contacts_Birthdays.gs` emits authoritative Staff-ID-keyed birthday source; `calendar-backend/Birthdays.gs` validates and reconciles owned events, excludes inactive/MK, and does not delete on incomplete source. `calendar-update/public/index.html` exposes manual `Update birthdays from Contacts` in People & Roles. `backend/Contacts_Code_with_Deploy_API.gs` exposes current Roster SMC authority from active Contacts role membership. These are source findings, not live verification.

**Further review required:** exact meaning/ownership of Appointment Status, Subject Modifier and membership catalogue; which staff changes alter Deploy workload/eligibility; Calendar draft vs released birthday visibility, selected-year handling, source failure and reconciliation cadence; Roster SMC permission and provisional relief activation; Contacts compact display across mobile/desktop; migration and projection failure cases. No new broad event bus or cross-domain writes.

## 5. Cross-viewport editable table standard — PROPOSED, not yet fully approved
TBL01 Consistent shared table toolbar.
TBL02 Export Excel dropdown: Export All (full authorised import-compatible snapshot) and Export Visible (filtered/visible columns and sorted displayed rows).
TBL03 Matching Import Excel for Export All workbook schema.
TBL04 Validate, preview change set and conflicts, explicit confirm.
TBL05 Existing domain permissions, business rules, ownership and Save/Publish boundaries govern bulk edits.
TBL06 Freeze appropriate header rows and identifying columns.
TBL07 Partial-text searchable names and filter/sort/hide-column tools.
TBL08 Compact View fits content on initial full load, manual resizing survives refresh; button re-fits.
TBL09 Cross-viewport regression tests.
TBL10 Proposed UI detail: every import attempt opens a modal overlay with blurred backdrop, scrollable contents, red-outlined invalid/conflicting cells and clear explanations; user may reimport corrected Excel in the same modal. This was supplied as an owner condition but the complete TBL01–TBL10 package has not yet had explicit final approval.

**Approved bulk import policy A:** all-or-nothing. If any invalid/conflicting/unauthorised cell exists, commit zero rows. Preview is mandatory before confirmation; recheck server-side permissions and revisions at commit. Large imports must not claim atomicity across independent transactions without a safe staging/activation design.

Source inspection at audit SHA: `shared/table-tools.js` has browser export of visible data and hide-column tools, but not a universal Export All / Visible dropdown or generic import. `shared/table-viewport.js` has Compact fitting, frozen columns and header handling. `shared/excel-export.js` emits OOXML with literal strings. Partial-name search, filtering and sorting exist in selected viewports; not yet verified on every editable table. Full screen-by-screen inventory remains pending.

## 6. Next steps / gates
1. Reviews 1C and 1D are approved, including FD07-A. **Contacts Review 1E is partially decided; FE03 and FE05 require amendments**: FE01 Appointment Status; FE02 Subject Modifier; FE03 role/membership catalogue; FE04 staff-change effects in Deploy/Roster; FE05 unclassified staff eligibility. Calendar birthday release policy remains deferred to Calendar review.
2. Complete cross-viewport editable-table inventory and final approval of TBL01–TBL10, with exceptions for read-only/visual tables.
3. Reconcile approved Core decisions with Work audit, then freeze minimum Core interfaces before Contacts implementation.
4. Only on explicit owner approval: create v1 branch, repository instructions/skills, CI and implementation. No repository or production changes before that gate.

## 7. Evidence cautions
This checkpoint records conversation approvals and source-inspection findings, not a tested implementation. Source snapshot and current production may differ. A later assistant must distinguish APPROVED from PROPOSED and DEFERRED, and must not treat this checkpoint as authorisation to edit the repository.

## 8. Contacts Review 1E — OPEN (not yet approved)
- FE01: Contacts owns Appointment Status including Acting/Ag; Deploy consumes for workload without silently modifying saved planning versions.
- FE02: Contacts owns enduring subject specialisms/eligibility; Deploy owns actual subject assignments. Audit legacy Subject Modifier workload semantics before migration.
- FE03: Contacts owns staff role and membership facts; Core owns capabilities; Deploy owns planning groups; one writer per catalogue.
- FE04: Contacts revisions propagate by revision-aware Service Binding pull; Deploy/Roster must not silently rewrite saved/published plans.
- FE05: Provisional/unclassified staff remain usable for permitted planning; eligibility-sensitive operations must not silently assume ordinary full-time EO. Specify safe provisional rules per module.
These are **review proposals**, not owner approvals.


## 9. Contacts Review 1E — owner decisions (10 Nov 2026)

**Approved:** FE01 (Contacts owns Appointment Status including Acting/Ag; Deploy reads for workload without rewriting saved versions); FE02 (Contacts owns enduring subject/specialism tags; Deploy owns assigned subjects; preserve existing workload semantics); FE04 (Contacts revision-aware reads update current displays; saved and published plans are not silently rewritten).

**Discuss, NOT approved yet:**
- **FE03:** Owner asks what “planning groups” means. Source distinction: Deploy Teaching Groups (TGs), classes and subject assignments are version-owned planning structures, not staff membership groups. Legacy `backend/Planning.gs` also has version-owned `membership` catalogue with SL/SC/SMC/KP/TL/SDT/CMT/SAT/Support/MK flags, published to Contacts. V1 proposal separates Contacts-owned staff role/membership facts from Deploy-owned TG/class/assignment planning structures. **Owner requirement:** extract relief calculations and their controls from Deploy into Roster. Deploy retains teaching/workload calculations including timetabled occupancy W_i. Exact cross-module contract requires review.
- **FE05:** Owner requires provisional name-only staff to honour supplied tags (specialist, BT, UT). Do not silently assume generic full-time EO. Define allowed tags, provenance, editing rights and workload/relief effects. Distinguish a TTb name-disambiguation suffix (e.g. MTL) from verified staff qualification/eligibility tags.

**Source evidence (read-only at SHA 8194dd3):** `backend/Planning.gs` has version-owned `MEMBERSHIP_FIELDS_` and `membershipCatalogue_`; `shared/teaching-rules.js` uses appointment, membership and tag rules; `shared/workload.js` derives employment and subject tokens; `backend/Contacts_Code_with_Deploy_API.gs` restricts Roster registration to name/mobile and optional modifiers. No live verification.

**Next:** resolve FE03 and FE05, then review Deploy–Roster relief boundary. No repository changes authorised.


## 10. Deploy–Roster Review 2A — owner decisions (10 Nov 2026)

**Approved (8 of 9):**
- DR01: Deploy owns workload W_i, teaching occupancy and offload/SIUE inputs and results; not relief quota or allocation priority.
- DR02: Roster owns relief R_i, eligibility, priority, cumulative duties and allocation. Relief controls move out of Deploy.
- DR03: Roster uses effective published Deploy workload, not unpublished planning edits.
- DR04: Versioned, Staff-ID-keyed workload contract, including effective version and source revisions; reject incomplete/mismatched data.
- DR06: Relief-specific settings and controls reside in Roster; Core enforces capabilities.
- DR07: Preserve historical relief decisions and audit/calculation context; no silent rewriting of published/completed relief.
- DR08: Clearly dated verified workload snapshots may be displayed during Deploy outage; new allocations require an explicit safe freshness policy.
- DR09: No circular calculation dependency; Deploy does not require R_i or cumulative relief to calculate W_i; optional relief displays in Deploy are read-only.

**DR05 — Discuss; awaiting final owner approval of amendment:** Revision-aware pull must follow the **effective in-force published Deploy version for the operational date**, NOT unpublished edits within any version. Separate draft revision, committed published workload revision, and effective version/date. A future-dated published version becoming effective is a refresh trigger even without a new publication event. Roster resolves the effective version for the date and refreshes through Cloudflare Service Binding when the operationally effective workload identity/revision changes. Draft saves/previews must not affect Roster.

**Still unresolved:** FE03 (Contacts membership vs Deploy planning structures and role catalogue ownership), FE05 (provisional operational tags), DR05 amendment, exact formula/input parity, publication cutover/freshness and safe fallback rules. These must not be silently marked approved.

No GitHub, deployment or production changes authorised.


## 11. Subsequent owner decisions and corrections — 10 November 2026 (supersedes earlier status where inconsistent)

### Review 2A
**DR05 APPROVED:** Roster reads the effective in-force published Deploy workload for the operational date. Unpublished edits do not trigger refresh. Future-dated published versions trigger refresh upon becoming effective. Thus DR01–DR09 are all approved. Earlier DR05-pending statements in this document are superseded.

### Allocator scope
Owner intends a substantial redesign of Roster auto-allocation rules. Review 2B RA01–RA10 is **DEFERRED; none approved**. Do not spend substantial design effort preserving legacy auto-allocation scoring. Owner proposes an independent allocation microservice. **DR10 remains a proposal, not yet explicitly approved**: a replaceable, preferably stateless allocator receives a versioned snapshot and returns a proposal; Roster owns authoritative assignments, validation, commit, audit and manual fallback. Do not confuse proposal with approved architecture.

### Review 1F
**APPROVED:**
- FC02: Deploy owns teaching groups, classes, teaching assignments, timetables and planning versions, distinct from Contacts staff membership.
- FC03: Provisional staff can carry supplied optional operational tags such as Specialist, BT, UT, linked to permanent Staff ID.
- FC04: TTb disambiguation suffix and operational tags are distinct; name suffix alone does not grant qualification, eligibility or permission.
- FC05: Defined supplied tags affect permitted Deploy/Roster behaviour; missing classifications remain unknown rather than defaulting to full-time EO.
- FC06: Contacts audits staff tag/membership changes with actor, and propagates current facts without rewriting historical published operational records.

**FC01 DISCUSS — owner correction (NOT YET APPROVED AS AMENDED):** Contacts owns the *current authoritative* school role/membership facts, but Deploy **may update Contacts through publication**. Treat this as a permitted, field-scoped write to Contacts, not an independent authoritative Deploy catalogue or an unconditional replacement of Contacts data. Proposed safeguards for owner confirmation: Deploy publication submits explicit field-level changes through a restricted Contacts operation, with Staff ID, actor, idempotency key, expected Contacts revision, validation, conflict detection, and audit. The write must not overwrite newer Contacts edits from an old Deploy snapshot. Core remains authority for capability evaluation. Need specify whether a Contacts conflict blocks the whole Deploy publication or yields a separate explicit review/retry state; no distributed transaction assumed.

**FE03/FE05:** FE05 substance resolved by approved FC03–FC05; FE03's final catalogue write boundary remains dependent on amended FC01. Do not mark FE03 fully closed until FC01 is confirmed.

**Next:** Confirm FC01's scoped publication-write semantics and conflict policy; then Contacts editing permissions. This checkpoint is a specification record only. No repository edits, deployment or production changes.


## 10. FC01 second amendment — owner direction, 10 November 2026 (latest ruling supersedes blocking proposal)

**Status: owner-directed policy, FC01 final wording pending confirmation.** Deploy publication is operationally important and **must not be blocked by Contacts conflicts**. Contacts remains authoritative for current staff roles and memberships. Deploy may submit permitted field-scoped staff updates arising from publication. The publication and Contacts application are separate outcomes; do not claim Contacts was updated merely because Deploy published. Contacts applies valid nonconflicting updates, retains conflicting fields, and creates a durable, actionable conflict record for Contacts Power Users. Notify Contacts Power Users to resolve at the Contacts end. Preserve actor, Staff ID, origin publication, field-level before/proposed values, timestamps, idempotency key and status, subject to privacy controls. Use durable retry and reconciliation for delivery failures; no silent overwrite, silent loss, or rollback of a successful Deploy publication. No distributed cross-D1 transaction.

**Design detail still to decide:** Should partial acceptance of independent nonconflicting staff fields occur per field, or should each staff record's proposed field set be accepted/rejected as a unit? In either case, Deploy publication remains independent. Also define how pending Contacts changes appear to Deploy Power Users, and alert acknowledgement/escalation.

**FE03:** The catalogue authority is Contacts; Deploy has an authorised contribution path at publication. Staff membership is distinct from Deploy Teaching Groups/classes/assignments. FE03 is substantively resolved subject to final FC01 confirmation.

**FE05:** Approved FC03–FC05 establish provisional staff tags, name-tag distinction and application of known tag semantics without assumed employment defaults. Exact tag vocabulary and permissions remain for later review.

**Next review: Contacts editing permissions.** Cover self-service, Contacts Power Users, Global Admin, Deploy publication contributor, Roster SMC provisional registration, role-based capability enforcement and conflict resolution.

**Read-only specification only.** No repository edits, branches, implementation, deployment or live data changes.


## Review 1G owner decisions — 10 November 2026 (supersedes earlier proposed status)

**Approved:** CP01 staff self-service; CP02 Contacts Power Users; CP03 Global Admin; CP04 Deploy Power Users narrow registration and publication contributions; CP06 Contacts conflict inbox; CP07 nonblocking publication delivery; CP08 current backend capability enforcement and revocation.

**CP05 — Discuss, not approved yet:** Owner asks whether “reuse” refers to the Active/Inactive tag. Proposed clarification: reuse means find and select the existing permanent Contacts Staff ID, regardless of Contacts employment Active/Inactive status, rather than create a duplicate. A Roster SMC may activate a teacher for a specific relief day without silently changing Contacts employment Active/Inactive. An existing record's employment state and daily operational availability are independent. For a new teacher, Roster may request provisional Contacts creation with Basic Name, Mobile No and allowed tags. Confirm with owner before approving CP05.

**FC01 conflict policy, as clarified by owner and supported by CP04/CP06/CP07:** Deploy publication is operationally independent and must not be blocked by Contacts write conflicts. Deploy may contribute authorised staff-field changes to Contacts through a narrow, auditable, durable delivery path. Contacts remains authoritative for current staff fields, accepts valid changes, and places conflicts in an actionable Contacts Power User inbox. Publication success and Contacts update delivery are separate statuses. A rejected/pending Contacts update must not be misrepresented as applied. Detailed field allowlist and delivery protocol remain implementation-contract work.

**Review status:** Contacts Review 1G 7 approved, CP05 pending clarification. No repository changes or production verification.


## CP05 — Owner clarification, 10 November 2026 (awaiting final wording confirmation)

The owner clarified that normal relief uses timetabled full-time EOs. On high-absence days, Roster SMC may add extra non-timetabled manpower, including previously registered SRE/FAJT teachers currently marked Active=N. SMC switches them to Active=Y **for the selected operational day**. In v1, preserve the familiar Roster Active Y/N control, but model its effect as date-scoped relief-pool activation, not a permanent change to Contacts employment status. It expires for subsequent dates unless explicitly activated again.

Roster SMC may create a previously unknown teacher in Contacts through a narrowly scoped operation. Basic Name is mandatory; Mobile No is part of the Roster registration workflow for WhatsApp readiness; optional known SRE or FAJT tags are allowed and retained. Staff ID is assigned by Contacts; duplicate checks offer reuse of existing Staff IDs, including records not currently active in Roster. An existing record should not be duplicated just because it is inactive.

**Owner-stated allocation intent, algorithm deferred:** Activated non-timetabled ad hoc manpower should be considered first to absorb ("tank") relief duties, followed by ordinary teachers. Do not infer that they are available in every period, or silently assume ordinary full-time EO classification. Detailed allocation priorities, limits and exceptions remain for the separate Allocator review.

**Status:** CP01–CP04 and CP06–CP08 approved; CP05 clarification supplied, awaiting explicit confirmation of revised wording. No GitHub edits or production changes.

**Next review 1H:** field-level Contacts write permissions, Deploy publication contributions and Roster SMC registration, with nonblocking Contacts conflict resolution.


## Review 1H — Approved field-level write permissions (10 November 2026)

**Owner explicitly approved all six proposals CW01–CW06:**

- **CW01:** Contacts Power Users may edit staff identity, employment classifications, memberships, contact details and operational tags, with validation and audit.
- **CW02:** Deploy Power Users may contribute Basic Name, school role, appointment, membership, employment and subject-tag updates to Contacts during publication. Contacts accepts valid nonconflicting changes; publication is not blocked by Contacts failures or conflicts. The exact allowlist and conflict granularity require an implementation contract.
- **CW03:** Roster SMC may create or reuse Contacts records through a restricted operation with Basic Name, Mobile No and optional known SRE/FAJT tags. Roster controls date-scoped Active Y/N for additional manpower. No general Contacts editor access.
- **CW04:** Staff may edit their own Statutory Name and Mobile No only, verified by Core Staff ID and audited.
- **CW05:** Contacts Power Users review Deploy-contributed conflicts with current/proposed values and accept, reject or correct them, without rolling back Deploy publication.
- **CW06:** Contacts writes record actor, origin, Staff ID, changed fields and operation ID. Restricted writes enforce field permissions, optimistic concurrency and idempotency.

**CP05 reconciled in substance by the owner clarification and CW03 approval:** Existing inactive SRE/FAJT records are reused by permanent Staff ID; Roster SMC activates them for a particular day through the familiar Active Y/N control, not by changing Contacts' long-term employment status. New Roster-created records require Basic Name and Mobile No, with optional known SRE/FAJT tags. Normal relief draws from timetabled full-time EOs; additional non-timetabled manpower is intended to take relief first on high-absence days. Exact allocator scoring and constraints remain deferred. The owner did not separately submit an Agree to CP05's earlier rewritten wording, but CW03 and the explicit operational clarification supersede the misleading earlier interpretation. No claim that all CP05 wording is independently approved.

**FC01 reconciled in substance through approved CP04, CP06, CP07, CW02, CW05 and CW06:** Contacts owns current authoritative staff facts; Deploy is a permitted, field-scoped contributor on publication. Deploy publication must not be blocked by Contacts conflicts. Durable delivery, Contacts-side conflict inbox and audit are required. Do not imply that publication success equals Contacts update success. Precise field conflict granularity, retry and escalation policies remain to specify.

**Open follow-up:** Define Contacts field-level matrix, exact Roster SMC permitted updates to existing Mobile No, Contacts conflict granularity, operational tag vocabulary, and the separation of daily relief Active Y/N from employment status. Auto-allocation Review 2B is deferred. DR10 allocator microservice remains a proposal rather than an explicit owner approval. Cross-viewport TBL01–TBL09 remain proposed; all-or-nothing import policy and red-cell preview/correction requirements are owner-approved.

**Evidence:** Owner decisions in this ChatGPT Project; earlier read-only repo inspection at `8194dd3a0b93297b3d790541397d80b3bd68f36f`. This file is a specification checkpoint, not an implementation or production verification. No repository, deployment or live-data changes authorised.

## Review 1I — Approved restricted writes and conflict resolution (10 November 2026)

**Owner explicitly approved CI01–CI05, five of five.** These supersede earlier references to the following details as undecided.

- **CI01 Roster Mobile No update:** Authorised Roster SMC may add or correct the Mobile No of an existing selected Staff ID when arranging relief, through a narrow Contacts-owned operation. Validate and audit; no access to unrelated staff fields.
- **CI02 Field-level conflict resolution:** Contacts accepts independently valid, non-conflicting fields contributed by Deploy publication and queues only conflicting fields for Contacts Power User review. A conflict on one field does not reject unrelated valid changes. Each accepted field must be checked against the relevant current revision; preserve current and proposed values and actor provenance for conflicts.
- **CI03 Independent publication:** Deploy publication is independent of Contacts delivery, application and conflict resolution. A durable receipt tracks pending, retry, applied and conflict outcomes. Do not roll back successful publication for Contacts failure or silently lose changes.
- **CI04 Controlled provisional tags:** Deploy/Roster may supply recognised operational tags on provisional creation, including SRE, FAJT, BT, UT and recognised specialist tags. Unknown tags require Contacts Power User review before they acquire business-rule effects. Preserve the distinction between TTb name suffixes and operational tags. The exact controlled vocabulary and effects remain for later policy review.
- **CI05 No automatic identity merging:** Show possible duplicate staff identities for selection. Reject exact duplicate operational names or require selection of existing Staff ID. Contacts Power Users handle later identity reconciliation with a full audit trail; no silent merge.

**Resulting Contacts write boundary:** Contacts is authoritative for current staff data. Contacts Power Users have field-scoped administrative editing; staff self-service covers own Statutory Name and Mobile No; Deploy publication can contribute authorised fields asynchronously without blocking publication; Roster SMC can create/reuse provisional staff and update an existing selected staff member's Mobile No. Every backend path enforces Core capabilities, Staff ID, field allowlist, validation, optimistic concurrency, idempotency and audit. Roster's day-scoped Active Y/N is separate from Contacts employment status.

**Status:** Contacts Review 1I CLOSED (5/5). The earlier FC01, FE03 and CP05 discussions are reconciled in substance through later CW and CI approvals; preserve their historical owner comments rather than rewriting them as independently voted approvals. Auto-allocation business rules remain deferred. DR10 independent allocator is a proposal. TBL01–TBL09 still proposed; bulk import policy approved. No GitHub, branch, implementation or deployment changes authorised.

**Next specification considerations:** (1) operational tag catalogue and precise downstream semantics; (2) identity reconciliation and audit/privacy boundaries; (3) Contacts/Deploy publication delivery and conflict inbox lifecycle; (4) read/projection freshness and failure modes; (5) final Core prerequisites before Contacts implementation. Avoid re-opening settled ownership or publication decisions.


## Contacts Review 1J — 10 November 2026 (owner reconciliation; Rev 8)

**Approved:** TJ02 controlled tag catalogue; TJ03 multiple structured tags per staff member; TJ04 Contacts stores authoritative tag facts while Deploy/Roster own their business effects; TJ05 preserve recognised provisional tags; TJ06 audit and revision tag changes; TJ07 migrate unambiguous legacy values and flag ambiguous ones.

**TJ01 — Discuss, NOT yet approved:** Owner clarifies that some operational tags appear in TTb Name and others do not: SMC is not displayed; BT is displayed. Replace rigid separation with a catalogue-controlled display policy. Proposed amendment: Contacts stores structured authoritative classifications; each tag definition separately specifies whether and how it contributes to the derived TTb Name. Examples: SMC hidden; BT displayed; UT/SRE/FAJT/Specialist/MTL display behaviour must be confirmed against legacy semantics and owner decisions. Display suffixes alone must not be used as an authority for eligibility or privileges; do not invent classification facts from arbitrary name text. No automatic merge or identity replacement.

**Decision state:** TJ01 awaiting owner confirmation; TJ02–TJ07 approved. Existing Contacts 1I CI01–CI05 remain approved. Auto-allocation rules deferred; independent Allocator is a proposal pending formal approval. No repository edits or implementation authorised.


## Contacts Review 1J — CLOSED: TJ01 revised approval (10 November 2026; Rev 9)

**Owner explicitly approved revised TJ01. All seven TJ01–TJ07 are now approved.** This section supersedes the prior Rev 8 statement that TJ01 was pending.

**TJ01 definitive contract:** Contacts stores staff classifications as structured authoritative facts independently of the derived TTb Name. Each recognised tag's catalogue definition controls whether it contributes a visible parenthesised suffix. Preserve the verified v0.9 derivation ordering: Basic Name, then visible Employment Modifier tags, then visible Subject Modifier tags, then visible MK Modifier tags. School role/membership flags such as SMC and KP are not shown merely because membership exists; BT appears when represented as a visible employment modifier. Do not parse TTb Name to infer permissions, relief eligibility or qualifications. Avoid duplicate suffixes; keep stable Staff ID and audit changes.

**Verified v0.9 source evidence, read-only at `8194dd3a0b93297b3d790541397d80b3bd68f36f`:** `Contacts_Code.gs`, `deriveContacts_`, computes `TTb Name = Basic Name + tags(Employment Modifier) + tags(Subject Modifier) + tags(MK Modifier)` and injects required subject modifiers for MTL, PE, Art, Music role shortforms; `MEMBERSHIP_FLAGS` separately enumerates SL, SC, SMC, KP, TL, SDT, CMT, SAT, Support, MK. `shared/teaching-rules.js` consumes classifications for eligibility/workload. This is source inspection, not production-data or browser verification.

**TJ02–TJ07 retained:** Controlled tag catalogue; multiple structured tags per staff; consumer-owned effects (Deploy workload, Roster relief); preserve tags on provisional registration; revision/audit; careful legacy migration.

**Still open for Contacts Review 1K:** Exact per-tag display choices (notably UT, SRE, FAJT, Specialist), catalogue ordering within each category, subject/role-derived modifiers, deprecation and migration exceptions. These are not inferred as owner-approved solely by approval of TJ01. Review 1K must not specify the deferred allocation algorithm.

**Parallel task:** Work may perform a read-only v0.9 operational tag audit with exact commit/file:line evidence. No Codex implementation until v1 contracts approved. No GitHub edits, branches, PRs, production-data access or deployments.


## Contacts Review 1K — CLOSED: TTb tag display and derivation (10 November 2026; Rev 10)

**Owner approved all five decisions TK01–TK05.** These decisions refine, and do not replace, approved TJ01–TJ07. Prior Rev 9 references to Review 1K as pending are superseded by this section.

- **TK01 — Visible legacy modifiers:** Recognised Employment Modifier tags, including BT, UT, SRE and FAJT, remain visible in the derived TTb Name when supplied and configured as visible. Normal Primary, EO and Full-time classifications remain stored but hidden from ordinary name display.
- **TK02 — Subject and specialist display:** Recognised Subject Modifier tags, including MTL, PE, Art and Music, remain visible. Do not add a generic `Specialist` suffix by default; display depends on the precise controlled tag definition.
- **TK03 — Role-derived subject tags:** Preserve the v0.9 rule that recognised MTL, PE, Art and Music role shortforms imply the corresponding subject modifier if absent. Contacts persists/derives the structured tag; consuming modules must not implement a competing name-derived inference.
- **TK04 — Multiple suffixes and order:** Generate `Basic Name`, then visible Employment tags, then visible Subject tags, then visible MK tags. Use one parenthesised suffix per visible tag; deduplicate equivalent tags. Do not render hidden school memberships (e.g., SMC/KP) merely because they are present. Within-category order follows a controlled catalogue policy, preserving existing legacy order on migration unless deliberately changed.
- **TK05 — Current display versus history:** A display-policy or staff-tag change updates the current derived TTb Name without replacing Staff ID. Preserve the necessary name snapshots on previously published records, and audit the actor, source, timestamp, before/after values and operation ID.

**Implementation guardrails:** Store authoritative classifications independently of TTb Name; never infer permissions, eligibility or qualification by parsing display suffixes. Preserve exact legacy suffixes during migration where mapping is unambiguous; flag ambiguous records for Contacts Power User review. These are specifications only, not a claim of implemented behaviour.

**Status:** Contacts Review 1K CLOSED (5/5). Contacts Reviews 1I and 1J remain CLOSED. The precise catalogue values and downstream business effects still require an evidence-backed tag audit before migration. Roster auto-allocation rules remain deferred. TBL01–TBL09 remain proposed; all-or-nothing Excel import conflict policy is approved. No GitHub edits, commits, branches, PRs, deployment or production-data access.

**Suggested next review:** Contacts 1L — tag catalogue lifecycle and migration exceptions, informed by the read-only v0.9 tag audit; alternatively Contacts 1L — identity reconciliation and operational change auditing. Avoid reopening settled TTb presentation decisions.


## Contacts Review 1L — CLOSED: Tag catalogue lifecycle and migration (10 November 2026; Rev 11)

**Owner approved all seven decisions TL01–TL07.** This section supersedes prior references to Review 1L as pending.

- **TL01 — Stable catalogue governance:** Contacts maintains a predefined, stable catalogue. Contacts Power Users may assign/remove existing tags. Deploy and Roster may apply recognised tags within their restricted authorised workflows. New tag definitions are expected to be rare and are maintained by Global Admin; no proposal queue or separate governance service. Audit definition changes.
- **TL02 — Definition and display:** Each tag has a stable code, category, label, TTb visibility, display order and active status. Deploy workload formulas and Roster relief/allocation rules are not encoded in Contacts tag definitions.
- **TL03 — Retirement:** Retired tags cannot be newly assigned. Existing assignments and historical records remain readable until explicitly reviewed. Never reuse a retired code for a different meaning.
- **TL04 — Definition changes:** Global Admin may change labels or display rules with revision and audit history. A material semantic change requires a new code.
- **TL05 — Legacy mapping:** Map v0.9 Employment Modifier, Subject Modifier, MK Modifier and membership data to structured classifications only where meaning is unambiguous; flag uncertain mappings for Contacts Power User review.
- **TL06 — Migration preview and recovery:** Before migration, show mapped, ambiguous, duplicate and unresolved values/counts. Retain original source values and a recoverable pre-migration snapshot. Never silently discard unknown values.
- **TL07 — Consumer compatibility:** Deploy and Roster use stable tag codes and catalogue revisions. Unknown or retired tags must not silently acquire new workload, relief or permission effects. Historical records preserve original context.

**Status:** Contacts Review 1L CLOSED (7/7). Earlier Reviews 1J and 1K remain closed. The next phase is a read-only Contacts specification completeness and integration-gap audit, not additional catalogue governance. No auto-allocation algorithm decisions were approved; its rules remain deferred. Cross-viewport TBL01–TBL09 remain proposed, while all-or-nothing Excel import and preview requirements are approved.

**Implementation prohibition:** Specification only. No repository edits, branches, commits, PRs, deployments or production-data access.

## Contacts Review 1M — Integration contracts (10 November 2026)

Owner-approved decisions:
- TM01 Stable identity across modules: Agree. Contacts Staff ID is permanent; mutable names, aliases and classifications do not replace identity.
- TM02 Revision-aware directory reads: Agree. Deploy and Roster use Cloudflare Service Bindings and revision checks at relevant load/refresh boundaries, reusing verified snapshots when unchanged.
- TM03 Nonblocking delegated writes: Agree. Deploy publication is independent of Contacts update acceptance; field-level conflicts queue for Contacts Power Users. Roster restricted writes are idempotent.
- TM04 Cross-module failure handling: Agree. Verified snapshots may support read-only or otherwise safe operations during Contacts outages; current authority/eligibility-dependent operations fail safely, without unnecessarily disabling unrelated functions.
- TM05 Combined tag semantics: Agree. Recognised tags are independent structured facts. Consumers evaluate all applicable tags; `FAJT,BT` must not lose FAJT effects due to string equality. Numerical effects and allocator rules remain outside Contacts.
- TM06 Current versus historical records: Agree. Current directory views reflect current names/classifications; published records and audits retain required historical context.
- TM07 Change propagation and diagnostics: Agree. Revision markers and actionable status diagnostics; avoid general-purpose event bus.

**TM08 APPROVED (revised, 10 November 2026).** Owner required a non-stringent acceptance standard. Approved formulation: small, risk-based contract checks for Staff ID after rename, provisional create/reuse, nonblocking Deploy publication with Contacts conflict, SMC permission/revocation, combined FAJT+BT, safe Contacts outage behaviour, and internal Calendar birthday reconciliation (without Google Calendar sync). Prefer lightweight automated checks where practical; manual UI smoke checks acceptable; no exhaustive matrix or coverage target. No exhaustive end-to-end matrix or numerical coverage target is required.

**External Work operational tag audit reported** at commit `9f9f2a5c1ecf4978599b54b237c0f095a4b69a04`: inconsistent tag interpretations; combined `FAJT,BT` can miss a restriction; UT caps total rather than only teaching workload; specialist, assignment pools and SIUE are distinct. Treat as audit findings, not additional approved numeric rules. Full report and line evidence not independently re-opened in this checkpoint update.

Specification only; no GitHub changes or production access.


### Review 1M closure — owner confirmation (10 November 2026)

Owner explicitly approved the revised TM08 lightweight risk-based integration checks. **TM01–TM08 are all approved; Review 1M CLOSED.** Keep the essential integration checks small and focused on severe regressions. Automated contract checks where practical and manual UI smoke checks are acceptable. No fixed coverage target.

**Next review:** Contacts 1N — audit-driven closure of residual integration gaps, using the parallel Work completeness report when available. Until that report is supplied, review only grounded outstanding contract questions, and do not invent findings. Core implementation prerequisites remain gated. Independent Allocator design and allocation business rules remain deferred. Cross-viewport TBL01–TBL09 remain proposed, with all-or-nothing Excel import and preview policy approved.

**No repository changes, implementation, production access or deployment authorised.**


## Review 1N — CLOSED: Contacts readiness and UI/UX preparation (10 November 2026; Rev 14)

**Owner approved CN01–CN06 (6/6).** These decisions apply to the v1 specification and release workflow; they do not authorise implementation.

- **CN01 — Audit gate:** Reconcile the completed read-only Work Contacts completeness/integration audit against the consolidated requirements before Contacts implementation. Resolve genuine blockers; defer noncritical improvements. The audit report has not yet been independently available in this specification update. Do not invent findings or treat audit recommendations as approved decisions.
- **CN02 — Mandatory screenshots:** Before Codex implementation of any affected viewport, request representative v0.9 screenshots from the owner for significant pages, tabs, dialogs and editing flows. Classify each as Keep, Refine, Redesign or Remove.
- **CN03 — Selective familiarity:** Preserve effective navigation and workflows, but allow explicitly approved departures from v0.9. Familiarity is not a blanket prohibition on redesign.
- **CN04 — Shared conventions:** Apply approved cross-viewport table, accessibility and responsive conventions where appropriate, without forcing specialised timetable/allocation interfaces into generic tables. TBL01–TBL09 are still proposed unless individually approved elsewhere.
- **CN05 — Two approvals:** Functional specification approval is separate from viewport UI/UX approval. Record owner-approved visual/interaction changes, then obtain explicit owner authorisation before issuing a Codex implementation task. No implied approval.
- **CN06 — Lightweight UI acceptance:** Representative desktop/mobile screenshots and focused interaction checks for redesigned workflows; no exhaustive screenshot matrix unless a particular risk warrants it.

**Implementation gate, in order:** complete relevant functional specification → reconcile relevant Work audit → request v0.9 screenshots for affected interfaces → owner chooses Keep/Refine/Redesign/Remove → record and approve UI/UX specification → separately authorise Codex implementation. Read-only Work audits can proceed in parallel.

**Status:** Review 1N CLOSED. Contacts audit-driven gap closure pending receipt/reconciliation of Work report. Roster allocator business rules remain deferred. Existing v0.9 production remains untouched. No repository edits, branches, commits, PRs, implementation or deployment authorised.

**Next specification track:** Deploy v1 planning/publication/workload contracts; distinguish already-approved DR/FE/CW integration decisions from new owner decisions, and avoid repeating Contacts governance or designing the Roster allocation algorithm.


## Contacts Work completeness audit reconciliation and Review 1O — CLOSED (10 November 2026; Rev 15)

**Evidence:** Read-only Work audit `GSIS_V1_CONTACTS_COMPLETENESS_AUDIT_2026-11-10.md` (Library ID `libfile_e9aa2143986c8191a85f1a77125029e4`), inspected repository commit `8b5dda0c1ccf8901fd224a82e360af4e67d35f0e`, using Revision 11 as baseline. Supporting operational tag audit inspected `9f9f2a5c1ecf4978599b54b237c0f095a4b69a04`. Findings are source evidence at inspected commits, **not** current production verification. Audit recommendations are not approvals. Reviews 1M and 1N, which postdate the audit baseline, resolve several policy questions.

**Owner approved CO01–CO05 (5/5), closing Review 1O:**

- **CO01 Identity reconciliation:** Only Global Admin may relink a Google identity to a different Contacts Staff ID or approve duplicate-identity reconciliation. Audit every operation. No silent Staff ID merge or historical reference rewrite. Core remains authority for account linkage and capabilities.
- **CO02 Field-level permissions:** Contacts Power Users maintain profiles. Deploy Power Users may contribute authorised planning-related staff fields, appointments, employment and memberships through approved restricted workflows. Roster SMC may create/reuse provisional staff and correct Mobile No for an existing Staff ID. Staff self-service is limited to their own Statutory Name and Mobile No. Enforce backend capability × operation × field permissions; ordinary staff writes never create new tag definitions. Exact schema/matrix to be enumerated without broadening these rights.
- **CO03 Nonblocking publication supersession:** Every Deploy-to-Contacts contribution carries operation ID, publication ID and field-level base revision. A newer valid proposal may supersede an older pending proposal for the same Staff ID and field, retaining audit and conflict history. Unrelated fields remain independently resolvable. Contacts must revalidate against the current authoritative field revision before accepting; no stale proposal may overwrite newer Contacts edits. Delivery failure/conflict never reverses successful Deploy publication. Durable idempotent retry and outcome tracking remain required.
- **CO04 Contacts outage:** Verified snapshots may support directory display and existing operational views, with visible stale-state indication. Relinking, permission changes, staff creation and eligibility-changing writes require authoritative checks. Unrelated safe Roster operations may continue; bounded retry and recovery must not unnecessarily block a whole module. Define exact operation-specific degraded states in implementation contract.
- **CO05 Birthday visibility:** Contacts birthday changes reconcile Calendar internal working data automatically. Already released/published Calendar birthday entries retain the released snapshot; changes stage for Calendar-authorised review rather than silently changing external visibility. No automatic Google Calendar sync, external publication or notifications. Calendar owns review and recovery.

**Audit findings resolved in policy by earlier reviews and CO01–CO05:** stable Staff ID and no silent merges (TM01/TM06/CO01); separate provisional create/reuse and daily activation (CT14/CW03/CI04); restricted write authority (CW/CI/CO02); independent Deploy publication and field-level conflicts (CW02/CI02/CI03/TM03/CO03); revision-aware reads and safe outage boundaries (TM02/TM04/TM07/CO04); independently evaluated combined tags (TM05/TL07); internal Calendar-only reconciliation and release visibility (FD07-A/CO05); risk-based lightweight acceptance tests (TM08); pre-Codex screenshot gate (CN02–CN06).

**Still open as detailed contracts, not new approvals:**
1. Enumerate exact field × operation × capability allowlist, payload validation, duplicate warning and conflict response shapes; preserve the already-approved narrow rights.
2. Specify per-field delivery state machine, idempotent replay, supersession, durable recovery and acceptance-time revalidation; maintain nonblocking publication.
3. Specify purpose-specific Contacts projections, revision/freshness bounds and safe degraded actions. Ensure Subject Modifier and other necessary structured tags are not omitted from consumer projections.
4. Define migration mapping for ambiguous legacy aliases/specialisms and rename/tag-change collisions, with explicit review and recoverable originals (TL05–TL07, CO01).
5. Specify Calendar internal birthday reconciliation detail including eligible years and leap-day handling, without changing CO05 release visibility.
6. Define Roster create-success/activation-failure recovery: preserve returned Staff ID, allow independent idempotent activation retry. Daily activation remains Roster-owned.

**Deferred to Deploy/Roster policy reviews:** UT is a *total* workload cap in inspected legacy code; exact v1 limits remain unapproved. SIUE multi-specialism precedence and migration settings need a Deploy decision. FAJT workload-budget ownership across Deploy/Roster must avoid circular settings dependencies. Assignment pools and enduring specialist tags remain separate. Consumer matching must evaluate FAJT+BT as independent codes; do not infer detailed allocation precedence. No redesign of future Roster allocation algorithm is authorised here.

**Other unresolved programme decisions:** Deploy DP01–DP06 were presented but **not yet voted**. DR10 stateless Allocator is still a proposal. TBL01–TBL09 shared-table proposals remain unapproved except already-confirmed all-or-nothing import/preview policy. UI/UX screenshot collection and separate owner approval are mandatory before Codex implementation. No GitHub changes, branches, commits, PRs, deployment, or production access authorised.


## Core–Contacts Review 1P — CLOSED (10 November 2026; Rev 16)

**Owner explicitly approved CC01–CC07 (7/7).** Reconciled against the read-only Revision 15 consistency audit (`GSIS_V1_REV15_CONSISTENCY_AUDIT_2026-11-10.md`, Library ID `libfile_115834ff1b648191a2153e5f48ebe6df`). The audit is evidence and recommendation, not independent owner approval. Earlier Core decision coverage remains to be verified against original owner records; do not claim full certification. Old status labels in historical sections are superseded by the latest explicit closure statements, not by silent rewriting of decision history.

- **CC01 Effective-dated contributions:** Future-dated Deploy publication may submit appointment, membership and employment changes to Contacts immediately. Contacts records their effective dates; Core and consumers use *currently effective* values for present permissions and operational effects. No premature grant or revocation. An authorised administrator can explicitly apply an urgent immediate change; audit it.
- **CC02 Account linkage and recovery:** Core links a verified Google account to a Contacts Staff ID. Only Global Admin approves relinking or duplicate identity reconciliation (CO01). Audit and never silently merge Staff IDs or rewrite historical references.
- **CC03 Current capability enforcement:** Core enforces current effective capability at protected operations, including delayed writes and conflict acceptance. Immediate GSiS suspension overrides a still-valid session. Planned future appointments have no current authority effect.
- **CC04 Purpose-limited personal data:** Return only fields necessary for a module's function. Mobile, statutory name and birthday are not universal directory projections. Backend permissions cover read, export, conflict history and write.
- **CC05 Provisional identity without login:** Contacts may create a Staff ID without a Google account or completed profile. Later Core linkage requires authorised verification. Deploy planning and permitted Roster provisional workflows must not require login or full employment data.
- **CC06 Dependent-field validation:** Contacts may accept independent Deploy field contributions separately but validates interdependent fields together when partial acceptance would create invalid role/tag/membership/employment combinations. Publication remains nonblocking.
- **CC07 Session and permission freshness:** Effective capability changes apply at the next protected operation. A displayed page may remain until refresh, but stale capabilities cannot authorise a new sensitive write. No forced full-page reload.

**Implementation contracts still required:** precise capability × field × operation mapping and purpose-specific projections; effective-date scheduling and immediate-change precedence; idempotent contribution retry/supersession and related-field validation; current-capability checks on queued operations; migration/identity collision handling. These are technical contracts, not new owner permissions.

**Next review:** Deploy planning, effective publication and workload, including UT total workload caps, multi-specialism SIUE precedence and FAJT budget ownership. DP01–DP06 remain proposed and unvoted. Roster allocator algorithm remains deferred.

**Operational transition context (owner clarified):** v0.9 operates through end of school year (20 November 2026) and retains historical records. v1 is developed and accepted as the eventual live system, initially on workers.dev, with its own fresh D1/R2 resources and no automatic v0.9 operational-history migration. Existing table import/export and preview/all-or-nothing policy support controlled Excel-based initialisation of current reference/master data; TBL01–TBL09 are not all approved. One repository is intended, with transfer to Gongshang-Primary after v0.9 stabilises and initial v1 development. Deployment manually triggered by owner; dedicated Cloudflare API token planned, not created. No separate staging copy is intended.

**Mandatory pre-Codex gate:** collect owner screenshots of each affected v0.9 page/dialog, classify Keep/Refine/Redesign/Remove, record and approve UI/UX changes, concurrently author module-specific human-readable UAT Markdown with stable IDs and Not tested status, then obtain separate explicit Codex implementation approval. Lightweight testing only (TM08/CN06).

**Scope:** specification-only update to local Markdown. No repository or infrastructure changes, Cloudflare resource creation, tokens, GitHub transfer, implementation or deployment authorised.


## Deploy Review 1A — 10 November 2026 (Revision 17)

**Approved by owner:** DP01 planning/operational authority; DP02 effective published versions; DP03 atomic publication; DP04 nonblocking Contacts contributions; DP05 workload authority. These approvals are subject to the DP06 clarification below where publication terminology overlaps.

**DP06 — Discuss; not yet approved as revised wording.** Owner: “future planning changes within same version in-force: a publish updates contacts/roster/etc; future planning of a different version, no change.”

**Proposed reconciliation for owner confirmation:** A planning version has stable identity; each successful publication creates an immutable snapshot/revision. Edits to the currently in-force planning version do not affect consumers until published. A new publication of the in-force version updates relevant current operational projections in Contacts, Roster and other consumers, subject to domain ownership, nonblocking Contacts contributions, effective-date checks and historical safeguards. Publishing a different future-effective version does not change current consumers; its latest approved publication activates at its effective date. Completed historical records are not silently rewritten. The word “immutable” in DP02/DP03 applies to publication snapshots, not to a permanently frozen planning version. This is **proposed** pending owner approval of DP06.

**Unresolved for Deploy Review 1B:** UT total workload cap basis and configured limits; SIUE multi-specialism precedence; FAJT weekly budget ownership; offload treatment; versioned Roster workload projection and timing. Do not infer v1 policy from v0.9 code alone.

**Implementation gates remain:** Mandatory owner-provided v0.9 screenshots for affected viewports; Keep/Refine/Redesign/Remove UI/UX approval; concurrently authored module-specific UAT Markdown; explicit Codex authorisation. No repository or infrastructure changes authorised.


## Deploy Review 1A — Final owner reconciliation (Revision 18; supersedes pending DP06 status above)

**Approved: DP01–DP06 (6/6).** On 10 November 2026 the owner explicitly approved revised DP06. The earlier “Discuss/not yet approved” statement in the Revision 17 historical section is superseded; it is retained solely as decision history.

- **DP01:** Deploy owns teaching plans, assignments and workload; Roster owns daily relief. Draft changes do not alter operational Roster state.
- **DP02:** Each successful publication has an immutable snapshot/revision and an effective date; the underlying planning version may continue to be edited. Roster consumes the effective publication for its operational date, not an unpublished draft.
- **DP03:** Publication of a complete validated snapshot is atomic; failed publication leaves the previous effective snapshot intact.
- **DP04:** Authorised Contacts field/membership contributions are nonblocking, revision-checked and effective-dated under CC01/CO03; Contacts remains authority.
- **DP05:** Deploy owns authoritative teaching occupancy, offload, SIUE and total workload; Roster consumes the published effective workload projection without recalculating it.
- **DP06:** A planning version has stable identity and successive immutable publication snapshots. Publishing an updated revision of the **currently in-force** version refreshes relevant operational projections in Contacts, Roster and other consumers, subject to effective-date, permission, conflict and domain-authority rules. Draft edits alone have no effect. Publishing a **different future-effective** version does not change current consumers; its latest approved publication activates when effective. Completed historical records remain preserved, without silent retroactive rewriting.

**Terminology clarification:** Immutable *publication snapshot*, not immutable *planning version*. This clarification governs DP02, DP03 and DP06 together. Publication and downstream delivery are separately tracked; Contacts delivery failure must not roll back a valid Deploy publication.

**Next:** Deploy Review 1B remains unapproved, covering UT total workload cap basis and settings, multi-specialism SIUE precedence, FAJT budget authority, offload policy and effective workload projections to Roster. Legacy code and Work audits are evidence, not automatic owner approvals.

**Unchanged safeguards:** Single v1 system with fresh D1/R2; Excel-based controlled initialisation; existing v0.9 operational history retained separately. Screenshot-led UI/UX review, simultaneous UAT Markdown authoring and explicit owner approval before Codex. Specification only; no GitHub, Cloudflare or production changes.


## Deploy Review 1B — Owner decisions (Revision 19, 10 November 2026)

**Approved:** DW01, DW03, DW04, DW05. **DW02: Discuss; pending confirmation of multi-specialism precedence.**

- **DW01 UT total workload cap:** The configured UT cap applies to total applicable weekly workload, not only teaching periods. Deploy computes teaching plus applicable nonteaching commitments against a configurable cap.
- **DW02 PE/Art/Music SIUE:** Owner states: “keep PE / Art / Music SIUE's freely configurable as per current way.” Preserve independent configuration of PE, Art and Music rates. No hardcoded or merged generic specialist rate. The v0.9 audit reports that where multiple rates apply, the lowest configured rate is selected; whether to preserve that precedence in v1 awaits explicit owner confirmation. Do not mark the full original DW02 as approved. Contacts owns specialism facts; Deploy owns rate settings and calculation.
- **DW03 FAJT workload budget authority:** Deploy owns weekly FAJT workload budgets used in teaching/workload planning; Roster consumes effective published values and separately owns relief eligibility and scheduling rules. Avoid circular authority.
- **DW04 Appointment offload:** Deploy calculates offload using effective Contacts appointments and approved Deploy settings. Future-dated appointments take effect only on their effective date. In-force publication revisions update current workload projections.
- **DW05 Versioned workload exchange:** Deploy publishes effective-date-scoped workload projections containing Staff ID, immutable publication revision, teaching occupancy, applicable workload and offload values, and relevant limits. Roster consumes through revision-aware Service Binding. Drafts and other future-effective publications do not alter current relief planning.

**Reconciliation:** DP01–DP06 remain approved. DW05 respects DP06: new publication of the currently in-force planning version refreshes consumers; another future-effective version does not change current consumers until activation. UT caps and FAJT budgets are workload policy, not approval of the deferred Roster allocator algorithm.

**Pending:** Confirm DW02 multi-specialism precedence; technical schemas, numeric settings and UI/UX choices are not settled here. Preserve the mandatory owner screenshots, Keep/Refine/Redesign/Remove review, simultaneous module UAT Markdown authoring, and separate explicit Codex authorisation. No repository, infrastructure or production changes authorised.


## Deploy Review 1B — Final owner reconciliation (Revision 20; supersedes pending DW02 above)

**Approved: DW01–DW05 (5/5).** On 10 November 2026, the owner approved revised DW02. Historical “Discuss/pending” labels in the Revision 19 section above are superseded, not current status.

- **DW01:** UT cap covers total applicable weekly workload, including applicable nonteaching commitments; the cap is configurable.
- **DW02:** PE, Art and Music SIUE rates remain **independently and freely configurable** in Deploy as in v0.9. If multiple recognised specialisms apply to a teacher, use the **lowest applicable configured rate**, unless an explicitly authorised staff-specific override exists. Contacts owns staff specialism facts, while Deploy owns rates, override validation, effective settings and calculation. No hardcoded generic specialist rate.
- **DW03:** Deploy owns the FAJT weekly workload budget used in teaching/workload planning; Roster consumes the effective published value, independently controlling relief eligibility and scheduling.
- **DW04:** Appointment offload uses effective Contacts appointments and Deploy settings, respecting effective dates.
- **DW05:** Roster receives revision-aware, effective-date-scoped published workload projections. In-force publication revisions refresh consumers; different future-effective versions do not change current operations before activation.

**Outstanding technical specification, not owner approval:** Define initial SIUE configuration defaults, staff-specific override authority and representation, the published settings revision, and workload projection schema. No Roster allocation redesign is authorised.

**Next review:** Deploy Review 1C — planning workflow, version lifecycle, validation and publication UX behaviour. Before any Codex implementation, obtain owner screenshots for every affected significant viewport, classify Keep/Refine/Redesign/Remove, and author corresponding module-specific UAT Markdown during the screenshot review. Owner must separately approve UI/UX and Codex implementation.

**Scope:** Specification only; no repository, infrastructure or production changes.


## Deploy Review 1C — Planning workflow and publication controls (Revision 21)

**Owner decision date:** 10 November 2026. **Approved DV01–DV07 (7/7)**. This section supersedes any earlier pending Review 1C labels, without altering historical discussion.

- **DV01 — Planning version lifecycle:** Versions support Draft, Published and Archived states. A published version may be edited through a new draft revision; every successful publication creates an immutable publication snapshot. Version identity is distinct from publication revision identity (DP02, DP03, DP06).
- **DV02 — Copy and create:** Deploy Power Users can create a blank planning version or copy an existing one into a distinct planning identity. Copying does not change the source version or current operational state.
- **DV03 — Save versus publish:** Saving persists planning edits only. Publication is a separate explicit action with validation and a change summary. Draft changes have no downstream operational effect.
- **DV04 — Validation and warnings:** Structural invalidity, unresolved identity references and impossible references block publication. Workload imbalance and advisory concerns are visible warnings, not universal publication blockers. Exact validation predicates remain technical specification work.
- **DV05 — Publication impact preview:** Before publication, show affected staff, timetable changes, workload changes, effective date and Contacts contributions. Distinguish an in-force revision from a different future-effective version.
- **DV06 — Correction and rollback:** A published version can be corrected through another publication revision. Restoring an earlier snapshot requires explicit republication; publication and audit history remain intact.
- **DV07 — Downstream delivery visibility:** Deploy publication is independent of Contacts contribution delivery. Authorised Deploy users see current, pending, conflicted and failed downstream states, with appropriate retry/recovery controls. Contacts owns authoritative field validation, conflicts and effective-dated application (CC01, CO03).

**Reconciliation with DP01–DP06 and DW01–DW05:** Each publication snapshot is immutable, while the same planning version may be republished. Publishing a revision of the *currently effective* version refreshes operational consumers, subject to nonblocking Contacts delivery. Publishing a *different future-effective* version must not change current operational consumers until its effective date. Roster receives effective-date- and revision-scoped Deploy workload projections; historical completed operations are not silently rewritten. The approved configurable UT cap, PE/Art/Music SIUE rates and lowest-rate multi-specialism precedence, FAJT budget ownership and appointment offload are unchanged.

**Still unresolved:** Detailed validation matrix, publication preview schema, delivery status/retry contracts, version activation race handling, source-backed implementation audit, and viewport-specific UI/UX choices. Do not silently convert these into owner approvals. The future Roster allocator algorithm remains deferred.

**Mandatory pre-Codex gate:** Owner supplies screenshots for significant affected v0.9 pages/dialogs; each is classified Keep/Refine/Redesign/Remove; UI/UX changes are approved; concurrent module-specific UAT Markdown is authored with observable acceptance criteria and initial Not tested status; implementation requires separate explicit owner authorisation.

**Scope:** Specification only. No repository, Cloudflare infrastructure, live data, branch, PR, implementation or deployment changes authorised.


## Deploy Review 1D — Planning data and validation (Revision 22)

**Owner decision date:** 10 November 2026. **Approved: DX02–DX06 (5/6). Pending: DX01 (not submitted).** The original proposal for DX01 must not be recorded as approved. This section reconciles with Deploy Reviews 1A–1C, DR and the cross-viewport table import/export requirements.

- **DX02 — Staff availability in planning (approved):** Deploy may plan with provisional and future-effective staff. Missing profile fields remain unknown rather than inferred. Only applicable identities and effective classifications influence operational publication. This respects Contacts ownership, Core permissions and CC01 effective dating.
- **DX03 — Timetable import and validation (approved):** Accept compatible timetable/planning workbooks, validating structure, Staff IDs, classes, subjects and references before commit. Use the approved preview workflow: error identification, correction by replacement workbook, and all-or-nothing commit. The v1 Export All format should support reimport; v0.9 files may require explicit mapping. Imports never bypass authority, publication or revision checks.
- **DX04 — Planning conflicts (approved):** Identify teacher/class overlaps, invalid period references and duplicate assignments. Impossible structural conflicts block publication; advisory planning warnings do not automatically block it. Exact predicates remain a technical contract.
- **DX05 — Publication consistency (approved):** Publish one internally consistent timetable/workload snapshot. Downstream consumers use the same immutable publication revision. No mixed-revision partial publication. Contacts field contributions remain separately delivered and nonblocking as previously approved.
- **DX06 — Effective-date transitions (approved):** At activation, the latest successfully published snapshot of the future version becomes effective. Operational consumers move to that version without retroactively changing completed records. Activation failures must be visible and recoverable.
- **DX01 — Planning data ownership (pending, omitted from owner submission):** Proposed only: Deploy owns teaching assignments, classes, subjects, timetable planning and workload settings; Contacts owns staff identity, appointments and classifications; cross-module references use stable identifiers. Prior DR/Contacts approvals establish much of this boundary, but the specific DX01 proposal has not been voted on.

**Outstanding:** DX01 confirmation; detailed workbook mapping and validation rules; conflict severity criteria; atomic publication and activation recovery contract; source-backed verification. No new allocation-algorithm decisions are implied.

**Mandatory UI/UX and UAT gate:** Before Codex work, request owner screenshots of each significant affected v0.9 viewport/dialog. Classify Keep/Refine/Redesign/Remove, record owner-approved changes and concurrently write module-specific UAT Markdown with Not tested status. Implementation requires separate owner approval.

**Scope:** Specification only. No repository, Cloudflare infrastructure, production data, branches, PRs, implementation or deployment changes authorised.


## Deploy Review 1D — Final reconciliation (Revision 23; supersedes DX01 pending in Revision 22)

**Owner decision date:** 10 November 2026. **Approved DX01–DX06 (6/6). Review 1D CLOSED.** The pending DX01 status in the preceding historical Revision 22 section is superseded; it is not a current open decision.

- **DX01 — Planning data ownership (approved):** Deploy owns teaching assignments, classes, subject assignments, timetable planning and workload settings. Contacts owns authoritative staff identities, appointments and classifications. Modules refer to other domains by stable identifiers rather than duplicating authoritative records. This confirms the previously approved DR, Contacts, DP and Core–Contacts ownership boundaries.
- **DX02–DX06 (approved in Revision 22):** Provisional/future-effective staff may be used in planning without invented profile facts; workbook imports are validated and all-or-nothing; structural timetable conflicts block publication while advisory concerns warn; published timetable/workload snapshots remain internally consistent; future-effective activation is visible and recoverable without retroactive edits to completed operational records. The full operative wording remains in the preceding Revision 22 section.

**Reconciliation:** DP01–DP06, DW01–DW05 and DV01–DV07 remain approved. Each successful publication is an immutable snapshot; the same in-force planning version can receive new published revisions and refresh downstream consumers. A distinct future-effective version does not change current operational state until activation. Contacts contributions remain independently validated, effective-dated and nonblocking. The future Roster allocator algorithm is still deferred.

**Next phase — screenshot-led Deploy UI/UX review:** The owner supplies screenshots of significant v0.9 Deploy pages, tables, dialogs and workflows, beginning with the main planning/version-selection screen. For each viewport, classify Keep / Refine / Redesign / Remove; capture requested behaviour and responsive considerations; write observable UAT scenarios in a module-specific Markdown artifact as each screen is reviewed, initially marked Not tested. The approved table import/export and preview standards must be included wherever applicable. Do not infer owner UI/UX approval from functional approval. No Codex work until the affected viewport's UI/UX specification and UAT are approved and the owner separately authorises implementation.

**Outstanding technical contracts (not new owner decisions):** Workbook field mapping, publication validation details, version activation failure/retry semantics, downstream projection schema and permissions, initial data setup, and source-backed checks. Keep the school-year fresh-start model: new v1 D1/R2 resources, portable Excel initialisation, no automatic v0.9 operational-history migration.

**Scope:** Specification only. No repository, GitHub, Cloudflare, live-data, branch, PR, code, infrastructure or deployment changes authorised.


## Deploy UI/UX Review 1 — IP Deploy table (10 November 2026; Revision 24)

**Evidence:** Owner-provided v0.9 IP Deploy desktop screenshot. **Status:** UI01–UI05 APPROVED. This is a UI/UX specification, not permission to implement. Screenshot-led review of other Deploy viewports remains pending.

- **UI01 — Nonblocking live validation:** Accept temporarily invalid entries while editing. Detect and update validation continuously. Duplicate class names and duplicate form-teacher assignments must be visually marked on all affected cells with prominent thick red outlines and clear explanatory detail. Editing is not prevented; validation state is separate from data-entry acceptance.
- **UI02 — Save gate:** Save is permitted only when blocking errors are resolved. Noncritical workload/planning warnings remain visible but do not block saving. Publication continues to follow the separately approved stricter structural validation and impact-preview contract; saving a valid draft is not publication.
- **UI03 — Concurrent cell editing:** Active edit by another user shows orange outline and translucent orange tint, with actor identity on hover. The cell is locked against concurrent editing by others while actively held. Lock lifecycle, lease expiry, disconnect recovery, accessibility fallback and backend revision checks must be specified. A visual lock does not replace optimistic concurrency validation at Save.
- **UI04 — Unsaved edit recovery:** Recover locally unsaved draft edits after refresh or temporary network loss; clearly distinguish recovered local edits from authoritative saved state. Revalidate recovered edits and base revisions before saving. Do not silently overwrite other users' changes.
- **UI05 — Shared table standard:** Apply applicable Export All / Export Visible, matching Excel import, all-or-nothing validation preview with erroneous-cell highlighting and workbook replacement, sorting, filtering, column controls, freeze identifying columns and Compact behaviour. Respect permissions and domain validation. Existing v0.9 Export to Excel and Columns controls do not satisfy the complete standard.

**Reconciliation:** DP03/DV03 save-versus-publish separation remains intact. DV04 blocks invalid publication and allows advisory warnings. DX04 structural conflicts remain blocking at Save/Publish as applicable, not at input. DP06 in-force publication revisions remain the only means to update operational consumers. UI decisions do not modify Contacts authority, effective dates or Roster relief logic.

**Open implementation-design details (not owner approvals):** Critical versus advisory error catalogue; edit-lock TTL/renewal and offline behaviour; conflict resolution UX; local draft privacy and expiry; mobile/touch editing state; workbook column mapping; detailed screenshot review of rename/teacher assignment dialogs.

**UAT artifact:** `GSIS_V1_DEPLOY_IP_UAT_2026-11-10.md` (draft, all Not tested). Mandatory owner UI/UX approval and separate Codex authorisation remain required.


## Deploy UI/UX Review 2 — Class rename (10 November 2026; Revision 25)

**Evidence:** Owner-provided v0.9 screenshot of expanded inline Rename class editor. **Owner decisions:** UR02 controlled predefined class names APPROVED; UR03 temporarily duplicated class names APPROVED; UR01 original layout options DISCUSSED and superseded by the owner's specific direction, accepted as the operative UI requirement. Do not mislabel the original UR01 proposal as approved.

- **UR01 — Anchored overlay without reflow (owner-directed):** Preserve the existing searchable dropdown and controlled choice list. Render its expanded content as a higher stacking-layer anchored overlay above the grid, not a panel that enlarges a row, column, or cell. Reposition near viewport edges; preserve normal table dimensions and horizontal/vertical scroll positions when opening, filtering, selecting, applying, cancelling, and closing. No table jump to the top after *any* cell operation, including teacher assignment. Support keyboard navigation and visibility above scroll/overflow containers.
- **UR02 — Controlled vocabulary (approved):** Rename choices are drawn from the authorised predefined class-name catalogue; no arbitrary free-text class names through this control. Search/filter within the dropdown is retained.
- **UR03 — Duplicate permitted in draft (approved):** Choosing an occupied class name changes only the selected class; do not automatically displace, rename or clear the existing class. Flag both class-name cells with thick red outlines and explain the conflict. Allow the user to continue edits and resolve the temporary duplication; block Save until all critical errors are resolved, per UI01–UI02.
- **Identity preservation:** Renaming must preserve stable class identity and associated teacher assignments, teaching groups, and related references. Display names are not stable identifiers.
- **Concurrent editing:** Orange presence/lock behaviour from UI03 applies to the edited class-name cell; backend revision validation still prevents stale writes.

**UAT update:** Add UAT-DEP-IP-011 through 015 to the existing Deploy IP Markdown file, all Not tested, covering non-displacing rename, identity preservation, duplicate resolution, overlay geometry, and scroll stability across cell operations.

**Next screenshot:** Form Teacher (FT) add/remove or reassignment interaction. Screenshot-led review and concurrent UAT authoring continue. No Codex, repository, infrastructure, production or deployment changes authorised.


## Deploy UI/UX Review 3 — FT assignment dropdown and conflict state (10 November 2026; Revision 26)

**Evidence:** Owner-provided screenshot of v0.9 FT teacher selector; owner decision to highlight the entire FT cell. **Status:** Whole-cell FT error highlighting APPROVED. No implementation authorised.

- **FT conflict presentation (approved):** When the same teacher is temporarily assigned as Form Teacher to more than one class, give **each affected entire FT cell** a thick red error outline. Do not limit the outline to individual teacher chips/entries. Permit the draft edit and continuously recalculate conflicts. Save remains blocked until critical errors are resolved; all affected outlines clear after resolution.
- **Teacher selector overlay (owner-directed):** Retain the existing searchable, controlled teacher dropdown. Render the expanded choices as an anchored, higher-layer overlay without expanding the FT cell, table row or column. Preserve horizontal and vertical scroll position through opening, filtering, selecting, applying and closing. Near edges, reposition the overlay without resizing the grid.
- **Concurrent editing (previous UI03):** Active editor presence and cell locking use an orange outline with translucent orange tint and actor identity on hover. The orange state must not conceal an underlying red validation error. Distinct visual indications or accessible messages must communicate both states. Expired locks must recover; backend revision checks remain authoritative.
- **Stable references:** Teacher selections use Contacts Staff IDs; displayed TTb names are not authoritative identity keys. The approved Deploy and Contacts permission and effective-date contracts remain in force.

**UAT artifact:** Update `GSIS_V1_DEPLOY_IP_UAT_2026-11-10.md` with cases 016–019, all **Not tested**, covering whole-cell duplicate FT highlighting, conflict resolution and Save gate, overlay without grid reflow/scroll reset, and simultaneous lock plus validation states.

**Next review approach:** Inspect repository HTML/JavaScript/CSS to establish existing control behaviour; request owner screenshots only for significant viewports or where runtime visual evidence materially helps. Do not ask for every dropdown screenshot. Source review is read-only and does not approve implementation.

**Scope:** Specification only; no repository, infrastructure, implementation or production changes.


## Deploy Excel import — one-time TTb Name bridge (10 November 2026; Revision 27)

**IMP01 owner decision: APPROVED — `once`.** The import-time mapping applies only to the current workbook import and **must not create or update permanent aliases or other Contacts records**.

- Deploy's Excel **Export All** is the canonical replacement-import format. A legacy v0.9 workbook may need explicit column mapping and a one-time TTb Name identity bridge.
- Match a valid existing Contacts Staff ID first. If absent, match an unambiguous current TTb Name. Historical TTb Names with temporary employment modifiers (e.g. `FAJT`, `4/5`) may be suggested as candidates; ambiguous or uncertain matches require explicit user confirmation. Never infer or modify employment classification from a name suffix.
- Store the selected Staff ID in the imported Deploy draft. Preserve the original imported text and actor's confirmation in the **import transaction audit** only. No Contacts alias registration, merge, profile edit, tag change, permission change, or automatic permanent identity mapping.
- The confirmed mapping is scoped to the current workbook/import transaction; if a corrected workbook is uploaded in the preview, revalidate mappings against its actual rows. Do not silently carry mappings into a later independent import.
- All required identities must resolve before atomic **Replace** import; any unresolved or invalid reference blocks the whole import. A failed import leaves the previous draft unchanged. Successful import does not publish or trigger downstream Contacts/Roster effects.
- Cross-viewport import-preview requirements apply: show mapped/unresolved names, validation errors with thick red cell outlines, preview of additions/changes/removals, and allow replacement workbook in the same overlay. Removing referenced records requires dependency resolution.

**UAT:** See `GSIS_V1_DEPLOY_IMPORT_UAT_2026-11-10.md`, all Not tested. No repository, infrastructure, production or Codex changes authorised.


## Deploy UI/UX and Excel import reconciliation — Revision 28 (10 November 2026)

**Current authority:** This section supersedes any more elaborate IMP01 bridge design or pending label above. All items remain specification-only.

- **FT conflict presentation refinement (owner approved):** Every FT cell containing a duplicated FT teacher receives a thick red outline and subtle red tint for rapid scanning. **Only the duplicated teacher name(s) within those cells appear in red text**; unaffected names retain normal text styling. Both cell and text indicators clear immediately after resolution. Tooltip/accessible error detail identifies the conflicting class(es). Orange active-editor lock presence must remain distinguishable from the red error state.
- **TG tab:** Keep the existing v0.9 Teaching Group creation/editing UI/UX. Apply applicable shared table standards and regression tests without redesign.
- **Dept tab:** Keep existing v0.9 Dept UI/UX; apply product-wide table requirements, including Excel Export All/Visible, canonical reimportable Export All template, validated preview, filtering, sorting, column controls, Compact and authorised edits.
- **Excel import mode (owner approved):** **Replace the entire corresponding Deploy draft table**, not merge/update. Preview additions, changes, removals and dependencies. Any unresolved dependency or critical validation error blocks atomic import. A failed import leaves the previous draft unchanged; successful import does not publish or propagate operational changes.
- **IMP01 simplified by owner clarification (supersedes Rev27's elaborate identity-migration framing):** TTb Names are deliberately mutable, including temporary 4/5 load and FAJT suffixes. The one-time import bridge is a **lightweight Power User data-entry convenience**. Match Staff ID where supplied; otherwise exact TTb Name where unambiguous; offer simple Basic Name/TTb Name suggestions and a searchable manual teacher picker for historical/ambiguous text. Use the selected existing Staff ID for that import only. Do not build a permanent alias registry, hashing/accuracy certification, dedicated identity migration, or separate identity mapping ledger. Do not change Contacts. Normal import audit suffices. Do not guess ambiguous identity. Unresolved required teacher references block import.
- **Next review:** Deploy workload settings and summary; source-led review with owner decisions for policy and significant UI changes.

**UAT:** See `GSIS_V1_DEPLOY_IP_UAT_2026-11-10.md`, `GSIS_V1_DEPLOY_IMPORT_UAT_2026-11-10.md`, and `GSIS_V1_DEPLOY_DEPT_TG_UAT_2026-11-10.md`. All cases Not tested.

**Restriction:** No repository edits, code, Codex implementation, infrastructure, deployments or live-data changes authorised.


## Deploy Review 1E — WE01–WE03 reconciliation (Revision 29; 10 November 2026)

**Authority:** WE01 approved with owner clarification; WE02 approved; WE03 remains open for owner decision. This section supersedes the older pending WE01/WE02 presentation questions. Specification only.

- **WE01 — KEEP existing layout.** Preserve the existing Deploy settings and summary visual layout and interaction. Apply the GSiS suite-wide table standards where applicable, including canonical Export All Excel template and Export Visible, validated atomic Replace import into draft, sorting/filtering/column controls, Compact, stable scrolling, permissions and clear validation. Do not redesign the viewport solely for the terminology change.
- **WE01 — Terminology.** Replace user-facing references to generic “load” or “workload” in this context with **Timetabled occupancy**, defined as the count of periods occupied within the applicable timetabled hours. Rename Deploy's existing **Relief Settings** UI section to **Occupancy Settings**. Preserve the exact existing relief-settings equations, mathematical symbols, weighting, offload and SIUE terms, and computational semantics until a separately approved formula review; **raw occupied-period count must not be conflated with weighted W_i**. Roster continues to own relief allocation/priority/quota controls under the previously approved Deploy–Roster boundary. Any legacy labels outside this viewport require a context-sensitive terminology audit rather than indiscriminate replacement.
- **WE02 — Advisory.** Capacity, occupancy and applicable workload-cap warnings are visible and nonblocking for both Save and Publish. Critical structural, identity, permission and reference errors remain blocking. The published preview must communicate material advisory warnings.
- **WE03 — DISCUSS / not approved.** The earlier DW02 language permitted an “explicitly authorised staff-specific override” of SIUE precedence, but no owner-defined role, use case or UI exists. An individual SIUE override would change one teacher's effective configured rate independently of the general PE/Art/Music rates. **Do not assume an override UI or authorisation policy.** Ask owner whether to remove this exception and rely solely on independently configured standard rates, or retain it with a defined permission and audit model. Do not silently change the previously approved lowest-applicable-rate rule until owner rules.
- **Review method:** Read-only repository source may establish current layout and equations; owner screenshots are for significant viewport acceptance, not each individual control. No implementation approval implied.

**UAT artifact:** `GSIS_V1_DEPLOY_OCCUPANCY_UAT_2026-11-10.md`, all Not tested.


## Deploy Review 1E — WE03 final decision and DW02 amendment (Revision 30; 10 November 2026)

**Owner decision: WE03 APPROVED — remove individual SIUE overrides. Review 1E WE01–WE03 CLOSED.** This section expressly supersedes the WE03 pending language in Revision 29 and the staff-specific override exception in Revision 20 DW02; all other approved DW02 terms remain authoritative.

- **DW02 amended:** PE, Art and Music SIUE rates remain independently configurable in Deploy. When multiple recognised specialisms apply to one teacher, apply the **lowest applicable configured SIUE rate**. **No staff-specific SIUE override, override authority, override reason, override control or override indicator** is part of v1. Contacts continues to own staff classifications; Deploy owns the configured rates and their calculation.
- **WE01 retained:** Keep the existing settings and summary UI/UX, applying applicable suite-wide table standards. Label the existing Deploy 'Relief Settings' section **Occupancy Settings**. Use **Timetabled occupancy** for raw occupied periods in the applicable timetabled hours; preserve the existing equations, symbols and computational meaning of weighted W_i, including offload and other terms. Do not conflate the two.
- **WE02 retained:** Capacity/occupancy warnings are advisory for Save and Publish, with prominent presentation; structural/identity/reference/permission errors remain blocking.
- **UAT:** Update `GSIS_V1_DEPLOY_OCCUPANCY_UAT_2026-11-10.md`, all cases **Not tested**, to test independently configurable specialist rates, lowest-rate precedence, and absence of staff-specific SIUE override UI/API/logic. No owner decision is pending for WE03.
- **Next specification review:** Deploy publication and activation UI/UX: same-version republication versus future-version activation, impact preview, current/pending/conflicted/failed downstream status, recovery, and confirmation. Existing DP/DV approvals are not reopened; seek owner decisions only for unresolved presentation or recovery details. Read-only source review and significant-viewport screenshots where necessary; no implementation or repo changes.

**Scope restriction:** Specification/UAT authoring only. No GitHub edits, Codex work, infrastructure creation, deployment or live data changes.


## Deploy Review 1F — PF01 publication and operational status (Revision 31; 10 November 2026)

**Owner decision PF01: APPROVED — display separate Publication status and Operational status for each planning version.** This refines presentation of approved DP06, DV01–DV07 and effective-dated activation contracts; it does not introduce a new publication lifecycle or permit future versions to affect current Roster operations. Review 1F remains open for subsequent presentation/recovery decisions.

- **Publication status** describes the planning version's draft/published/archived state and the existence of an immutable publication snapshot. A same-version republication produces a new immutable snapshot/revision; a future-effective publication is published even before operational activation.
- **Operational status** describes the version/snapshot's relationship to the in-force timetable and consuming modules. Present clearly distinguishable scheduled/future, active/current, superseded/historical, and activation-pending/failed/degraded conditions as appropriate. These are **proposed UI labels**, not additional persisted lifecycle states; final exact label catalogue and transition contract remain to be specified.
- Show both statuses together in the existing Deploy version selector/detail area, retaining familiar layout. Display effective date, publication revision/identifier and last relevant activation/projection outcome where available. A publication-success indication must not imply successful activation or downstream adoption.
- Draft versions never become operationally effective. A published future-effective version remains non-operative until its effective date and the authoritative activation rules permit it. Operational consumers such as Roster must continue to use the effective published snapshot and must not read a future or draft version.
- On activation, report whether the authoritative effective snapshot and downstream consumers/projections have converged. Distinguish scheduled, pending, conflicted and failed propagation without silently substituting a draft or future version. Preserve historical operational records and support explicit authorised recovery under the existing publication/republication rules.
- Keep structural/permission/reference errors blocking; advisory occupancy/capacity warnings do not block Save or Publish (WE02). All transitions remain auditable and revision-aware.
- **Open review items:** PF02+ may cover activation failure presentation, notification and recovery, confirmation of impact preview, and whether the current effective version is emphasised in the selector. Do not assume owner approval for specific UI controls or auto-recovery policies.
- **UAT artifact:** `GSIS_V1_DEPLOY_PUBLICATION_UAT_2026-11-10.md`; all cases **Not tested**. Specification and UAT only; no repository, infrastructure, production or Codex changes authorised.


## Deploy Review 1F — Owner simplification of publication model (Revision 32; 10 November 2026)

**OWNER OVERRIDING DECISION:** No scheduled publication or future activation in Deploy v1. **Exactly one in-force planning version; any number of unpublished drafts; manual owner-authorised Publish and Make In Force action.** This decision expressly supersedes conflicting future-effective publication/activation requirements in DP06, DV01–DV07, PF01 and the Revision 31 section above. Earlier approvals remain valid only where consistent with this simplification. PF02 scheduled-activation failure question is withdrawn, not pending.

- **Draft:** Editable unpublished planning version; Save does not affect the in-force snapshot. Drafts may be created by copying the in-force version or other permitted source, subject to existing rules.
- **In force:** Exactly one authoritative, immutable published snapshot/revision for current operational consumption. An authorised user explicitly publishes a validated draft and makes it in force in a single controlled operation. No effective-date scheduler, scheduled queue, future activation, or separate publication-versus-operational status columns.
- **Historical:** Previously in-force snapshots remain available for reference/audit; completed Roster assignments and historical facts are not rewritten.
- **Republishing:** A user can make revised content in force by an explicit publication action; do not mutate a prior immutable snapshot. Keep existing optimistic revision checks, impact preview, audit and structural validation. Occupancy/capacity warnings are advisory, not blocking.
- **Downstream:** Core/Contacts/Roster consumers read the authoritative in-force revision only, never a draft. An integration delay or failure after the authoritative switch is a projection/integration-health concern, not a separate scheduled activation lifecycle. Do not claim consumers have refreshed until confirmed. Preserve recoverability and avoid silent stale-data operation.
- **UI:** Retain familiar version selector and general layout. Show clearly which version is In force and which are Draft or Historical. Use one simple user-facing lifecycle/status presentation, not separate publication and operational columns.
- **Unresolved, do not assume:** Exact authorised publishing role; whether edits to the in-force version occur via an automatically generated draft; behaviour when downstream delivery fails after the authoritative switch; whether historical versions can be copied into a new draft. Review these only as needed and prefer minimal workflow.
- **UAT:** Replace obsolete future-scheduling test scenarios with manual-publication and single-in-force tests in `GSIS_V1_DEPLOY_PUBLICATION_UAT_2026-11-10.md`; all tests Not tested. No implementation, GitHub changes, infrastructure changes, or deployment authorised.


## Deploy Review 1F — In-force version editing decision (Revision 33; 10 November 2026)

**Owner decision: EDIT approved.** This supersedes the Revision 32 unresolved question and any earlier recommendation that the in-force version must be read-only or that users must manually create a separate draft before editing. The simplified **one in-force version, multiple unpublished versions, manual publication only** model remains authoritative. No scheduled activation.

- **Edit in-force version:** An authorised Deploy editor may open the version labelled **In force** and edit its planning data directly in the familiar UI. Saving these edits records **unpublished working changes associated with that version**; it **does not change** the immutable authoritative in-force publication snapshot or operational consumers. The interface must visibly distinguish **In force (published snapshot)** from **Unpublished changes** within the same selected version. No requirement for the user to create or select a separate named draft.
- **Publish:** Only an explicit authorised **Publish** or **Publish and Make In Force** action validates and publishes the current working changes as a **new immutable publication revision**, then atomically updates the single authoritative in-force pointer. Historical publication revisions remain immutable and auditable. Editing an in-force version is not an operational mutation until this action succeeds.
- **Other versions:** Other planning versions remain unpublished drafts until manually published; publishing one replaces the authoritative in-force pointer, leaving the previous publication in history. Do not schedule or automatically activate.
- **Safety and UX:** Save and Publish are separate controls. Show an unambiguous **Unpublished changes** marker, and clearly identify which revision Roster currently consumes. Existing structural/identity/reference validation and optimistic concurrency apply. Occupancy warnings remain advisory. A failed save or publication must not silently alter the in-force snapshot. Browser refresh recovery and active cell locks follow UI01–UI05.
- **Reconciliation:** Rev32's phrase 'editable unpublished planning version' must not be read to forbid edits on the selected in-force version; the working-copy/snapshot distinction is internal and need not create a separate visible planning version. The earlier separate-draft recommendation is rejected.
- **Open design detail:** On switching away from an in-force version with unpublished edits, determine whether to warn, autosave to its working copy, or rely on existing explicit Save. Do not infer an owner decision.
- **UAT:** `GSIS_V1_DEPLOY_PUBLICATION_UAT_2026-11-10.md` updated for direct editing, unpublished Save, explicit republication, revision isolation and unchanged consumer reads. All tests **Not tested**.

**Restriction:** Specification and UAT only. No repository, infrastructure, production or Codex changes authorised.


## Deploy Review 1F — PF03 version-switch unsaved-edit warning (Revision 34; 10 November 2026)

**OWNER APPROVAL PF03: WARN.** This closes the version-switch decision raised in Revision 33 and is authoritative over any earlier alternative. It is consistent with UI04 browser-refresh/local-draft recovery. Review 1F manual-publication decisions remain unchanged: one in-force published revision, other unpublished planning versions, direct editing of the in-force version's unpublished working data, explicit Save distinct from explicit Publish, and no scheduled activation.

- On a user-initiated version switch with **unsaved current-session edits**, show a clear confirmation offering **Save**, **Discard**, and **Cancel**.
- **Save:** validate and persist current edits to the selected version's unpublished working state, then switch only after Save succeeds. If validation blocks Save or the write fails, stay on the current version, retain all edits, and show actionable errors. Save never publishes or changes the authoritative in-force snapshot.
- **Discard:** abandon **only the unsaved current-session edits** for the selected version and then switch. Never erase earlier successfully saved but unpublished working changes, immutable published revisions, or edits belonging to other versions. If local recovery data exists for those discarded edits, invalidate that discarded recovery copy.
- **Cancel:** remain on the selected version with the edits unchanged.
- If there are **saved but unpublished changes** and **no unsaved current-session edits**, switching versions requires no warning; retain the saved working state and its visible **Unpublished changes** marker.
- UI04 still applies independently to browser refresh, navigation away, crash, or temporary disconnection: offer local recovery of unsaved edits where technically feasible, without silently publishing or overriding newer server revisions. Restore only after checking the selected version and current revision; stale recovery data requires user review rather than silent overwrite.
- A version-switch prompt must not be bypassed by table rerenders, changing tabs, or asynchronous updates. Preserve current table scroll and dropdown behaviour per UI01–UI05 when Save fails or the user cancels.
- Avoid auto-saving on switch and avoid silently discarding edits. No scheduling, new activation workflow, repository or infrastructure changes.
- **UAT:** `GSIS_V1_DEPLOY_PUBLICATION_UAT_2026-11-10.md` includes PF03 tests, all **Not tested**.

**Current owner-approved status:** Deploy Review 1F PF01's former separate publication/operational statuses are superseded by Rev32's manual single-in-force model; PF02's scheduled-activation failure question withdrawn; direct in-force editing approved Rev33; PF03 warning approved Rev34. Further review should focus only on remaining material permission, publication and failure-recovery policy gaps, not reintroduce scheduling.


## Revision 35 — Deploy Review 1G PG01: Contacts-derived publication permissions (owner approved, 10 Nov 2026)

This section supersedes any earlier proposed Deploy Publisher role or Global-Admin-only publication rule. It does not change Revision 34 manual publication or PF03 unsaved-change handling.

**PG01 approved:** Global Admins and Deploy Power Users may edit, save, import, and manually publish Deploy planning versions. Deploy Power User is a derived capability: **current SMC membership AND current Education Officer (EO) classification**. School Leaders count as EOs automatically, but do **not** automatically count as SMC members. Current SMC members who are not EOs have Deploy view-only access. EO status alone, without SMC membership, does not grant Deploy Power User access. Global Admin capability is an independent authorisation path.

**Ownership:** Contacts owns the authoritative staff classifications and SMC memberships and supplies them to Core via revision-aware current records. Core derives and enforces Deploy permissions; Deploy must not maintain a second independently editable list of Power Users. Effective/current Contacts facts control eligibility, not historical, pending, or future-dated records. Existing account linkage and staff identity rules remain applicable.

**Operations:** The UI must indicate view-only versus Power User capability. Backend operations for edit/save, Excel replacement import, and Publish and Make In Force must revalidate current permissions at execution/commit, including delayed operations. Loss of eligibility must revoke mutation/publish authority without waiting for the user to sign out. A stale read-only Contacts snapshot must not be used to authorise new privileged writes. Audit the publisher and publication revision.

**Not decided here:** Default Deploy visibility for non-SMC/non-Admin users, and whether a School Leader is automatically an SMC member; neither is implied by the EO classification rule. Existing Core baseline access policy governs until specifically reviewed.

**UAT:** See `GSIS_V1_DEPLOY_PUBLICATION_UAT_2026-11-10.md` PG01 tests; all Not tested. Specification only; no repository/infrastructure changes or implementation authorisation.


## Revision 36 — Deploy Review 1G PG02: SMC-only viewing (owner approved, 10 November 2026)

**PG02 approved: Deploy access is restricted to current SMC members and Global Admins.** This closes the visibility question left open in Revision 35 and supersedes any broad default authenticated-staff view access for Deploy.

**Authoritative permission matrix:**

| Current status | Deploy access |
|---|---|
| Global Admin | Full access: view, edit, save, import and manually publish, regardless of SMC/EO |
| SMC member AND Education Officer (EO) | Deploy Power User: view, edit, save, import and manually publish |
| SMC member, not EO | View only |
| Non-SMC, not Global Admin | No Deploy access, including no read-only access |

School Leaders count as EOs for the intersection test; **School Leader classification alone does not imply SMC membership or access**. Current effective Contacts classifications and SMC memberships are the source facts. Core enforces access for UI, API and data reads, and revalidates mutations at execution. Stale sessions, guessed URLs and stale cached permissions must not bypass access restrictions. A Contacts outage must not elevate access or expose restricted Deploy data to unauthorised users. Where current authorisation cannot be established, fail closed for new access and privileged operations; any previously authorised degraded read-only handling must respect Core's existing safe-access policy and not grant new access.

The permission rule does not alter the approved manual single-in-force publication model, direct working edits, PF03 Save/Discard/Cancel switching, or the fact that Save is not Publish. No independent Deploy user list.

**UAT:** `GSIS_V1_DEPLOY_PUBLICATION_UAT_2026-11-10.md` PG02 cases, all **Not tested**. **Review 1G PG01 and PG02 closed.** No repository, infrastructure, production or Codex implementation authorised.


## Revision 37 — Deploy Review 1H: Publication failure and recovery (owner approved, 10 November 2026)

**PH01 RETAIN, PH02 VERIFY, PH03 WARNING approved. Review 1H closed.** This section supersedes any earlier open publication-failure policy question and reconciles with Revision 32–36. The model remains **one authoritative in-force published revision, editable saved-but-unpublished working state, other unpublished versions, explicit manual publication, no scheduled activation**. Current Core-derived Deploy permissions apply at every privileged execution.

### PH01 — Failure before authoritative commit
- If validation, permissions, or publication persistence fails **before the authoritative commit**, preserve the existing in-force publication and all previously saved unpublished working edits. Do not mark the new revision as published.
- Show a clear, actionable failure message and **Retry** when safe. A retry must revalidate current permissions, saved planning data, and publication revision. Blocking errors require correction before retry.
- Never silently discard saved working data, replace the in-force pointer, or alter completed Roster history.

### PH02 — Timeout or uncertain commit outcome
- A timeout, interrupted connection, or missing response is **not evidence that publication failed**. First query the authoritative publication record and compare the intended publication operation/revision with the committed result.
- If committed, show **Published** with the authoritative revision and do not publish again. If definitively not committed, show **Safe to retry** and retain edits.
- If the authoritative outcome still cannot be verified, show **Status uncertain — retry unavailable until verified**, retain planning work, and offer Refresh status. Do not blindly resubmit or claim failure/success.
- Publication must be idempotent for the same intended operation, or otherwise guarded by a unique operation identifier and current-revision check. No duplicate publication, conflicting in-force pointers, or silent overwrite.

### PH03 — Downstream integration failure after successful publication
- A successful authoritative publication **remains successful** if Roster, Contacts or another downstream consumer has a delayed or failed refresh. Do not roll back the publication or add a second activation/approval process.
- Display a visible **Integration warning** naming the affected consumer(s), current/expected revision where available, last known result and retry state. Retry downstream delivery/refresh automatically with bounded attempts and actionable diagnostics; allow safe manual retry/refresh where needed.
- Operational consumers must not read unpublished working data. A consumer that has not adopted the latest revision must not be presented as current; show its lag explicitly. Do not silently rewrite completed Roster history.
- Publication status and downstream integration health are distinct **diagnostic facts**, not two separate activation statuses. This does not revive PF01's superseded scheduled-activation model.

### Consistency with prior decisions
- Save is not Publish. PF03 Save/Discard/Cancel on version switch and UI04 unsaved-edit recovery remain unchanged.
- The owner-approved PG01–PG02 permissions govern who may view, edit, retry and publish; any delayed privileged action must recheck current authority.
- Structural errors block publication; occupancy warnings are advisory. No individual SIUE overrides.
- Preserve existing Deploy UI layout and apply the shared table requirements where applicable.

**UAT:** `GSIS_V1_DEPLOY_PUBLICATION_UAT_2026-11-10_REV37.md` adds PH01–PH03 scenarios. All **Not tested**.

**Restriction:** Specification and UAT authoring only. No repository, infrastructure, production or Codex implementation changes authorised.

---
# Revision 38 — Deploy Review 1I and Work audit reconciliation (11 November 2026)

**Current authoritative reconciliation.** Supersedes older open-status labels and conflicting recommendations in earlier revisions, including DR08's undecided fallback, the D05 open staff-fact policy, any automatic future publication/activation, and any individual SIUE override. Requirements remain **specification only**. Source audit: Work read-only audit of `helper-gsps/gsis` at exact commit `795f9f0c61cafafd01298ab0b78688ed91041cbe`, `GSIS_V1_DEPLOY_INTEGRATION_GAP_AUDIT_REV37_2026-11-10.md`. Nine findings D01–D09 reconciled below. No audit finding asserts that v1 is implemented.

## Approved owner decisions — D04 and D05

**D04 / Review 1I SAFE — Roster consumption on missing current workload.** Roster may continue historical/read-only access and operations whose correctness does not depend on the unavailable or unverified current Deploy workload. It **must not make new workload-dependent relief decisions** using an older snapshot, an unverified projection or a guessed default. Do not provide an emergency age-based fallback or privileged override in v1 without a separate owner decision. Roster retains its last verified accepted projection for history and diagnostic display only, marked **stale / not valid for new workload-dependent decisions**. New decisions resume after a current authoritative in-force publication is fetched, verified and adopted. A non-workload-dependent action must be explicitly classified as such and cannot indirectly consume stale workload. Existing completed decisions retain their recorded source context. Show an actionable warning, last verified publication and refresh/retry status; safe automatic refresh is allowed. A transient network failure is not authority to use a prior revision.

**D05 / Review 1I FIXED — accepted effective Contacts facts at manual publication.** The immutable operational workload snapshot is computed from **Contacts-accepted facts effective at the publication instant**, alongside the exact saved Deploy working revision and approved configuration. Pending, conflicted, rejected, future-effective or merely proposed Contacts contributions may appear as clearly marked planning assumptions, but **must not be treated as accepted operational staff facts** or silently alter published workload. If a future-dated Contacts fact later becomes effective, or a previously pending contribution is accepted, the published workload **does not automatically recalculate**; Deploy should flag that review/republication may be needed. A currently authorised Power User must save/review and **manually republish** to change operational workload. No scheduler, dated workload slices or second activation state. Contacts delegated updates remain nonblocking; their later acceptance or rejection cannot retroactively change the immutable publication. Publication preview must distinguish accepted effective facts from pending planning assumptions and show material mismatches. Publication may proceed only with a complete internally consistent workload based on authoritative inputs; unresolved facts that make a required operational value unknowable are blocking structural/input errors, not permission to invent a value. This last condition is a consistency rule, not a new Contacts approval prerequisite.

## D01 — Core authorisation execution contract (technical detail, no new policy)

- Contacts owns current SMC, EO and School Leader facts and effective dates. School Leader qualifies as EO but does not imply SMC. Core binds verified account subject to Staff ID and evaluates capabilities. Global Admin has independent Deploy access; SMC+EO may view/edit/import/save/publish; SMC non-EO view only; others no access.
- Define capability checks for **each** protected endpoint: read/list/detail, export, edit/save, lease acquire/renew/release, import preview/confirm, publish/republish, publication receipt/status, retry/recovery and internal consumer read. Do not expose private data to unauthorised callers via preview or error details. Internal service consumers receive narrow authenticated projection reads, never Power User rights.
- Recheck current authority at protected execution and immediately before the authoritative commit, including after waits, conflicts, queued work and retries. Check effective fact revision and operation-specific rights; do not assume the original session's authorisation remains valid. If authority cannot be verified, refuse new privileged operations; bounded safe viewing is not authority to edit. No teaching-eligibility predicate may substitute for EO classification. Cross-D1 checks use versioned facts and safe refusal, not fictitious distributed transactions.

## D02 — Nonblocking Contacts contribution delivery (technical detail)

- Publication and durable delivery intent commit together in Deploy D1. **Do not synchronously require Contacts approval** before Deploy publication.
- Queue only allowlisted Contacts-owned field contributions with actor/Staff ID, publication ID, operation ID, field base revision, effective date and source context. Independent fields may apply separately; dependent fields validate as a group. Contacts accepts/rejects with current authority and field-level optimistic validation.
- Outcomes: pending, applied, conflicted, rejected, superseded. Preserve diagnostics and retry without duplicate effects; newer contributions supersede older ones safely. Rejection cannot roll back publication and cannot rewrite the published workload. Contacts remains authoritative for accepted facts and memberships; Deploy never replaces Contacts authority through a planning-version catalogue.

## D03 — Durable publication identity and uncertain-outcome recovery (technical detail)

- Pin the exact saved working revision and authoritative accepted effective Contacts-fact revision reviewed in the impact preview. Use an idempotent operation ID and compare-and-set on the single in-force publication pointer.
- Commit immutable snapshot identity, in-force pointer, durable operation receipt and downstream delivery intent atomically in Deploy D1. If a snapshot artifact is in R2, verify immutable artifact persistence before referencing it as authoritative.
- Operation lookup distinguishes committed, conclusively not committed and unknown/in-progress. A timeout does not prove failure. An older operation may have committed but later been superseded: report its historical success and the **separate current in-force publication**; never blindly replay it. Historical lookup addresses every immutable publication ID, not only the latest per planning version.
- If no definitive outcome is available, preserve edits, show uncertain state and disable blind retry until verified. PH01–PH03 remain controlling.

## D04 — Roster-owned accepted projection contract (owner decision + technical detail)

- Roster pulls the current in-force immutable Deploy publication via authenticated Service Binding; validates publication ID, schema/model version, integrity and source revisions; adopts to its **own D1** only after verification. Store accepted ID, adoption time, status, model version and expected/current publication identifiers.
- Prevent out-of-order responses from replacing newer accepted projections. A separate-domain D1 cannot use the legacy shared-D1 cross-scope SQL revision guard. Roster decisions record exact consumed publication ID and model revision; completed history remains stable.
- When the current authoritative projection is unavailable or cannot be verified, apply the **D04 SAFE** rule above. Mark lag explicitly, show retry/health status and allow only operations demonstrably independent of current workload. No stale-snapshot workload-dependent fallback.

## D05 — Workload input provenance (owner decision + technical detail)

- The immutable publication includes source Contacts accepted-facts revision/time, Deploy saved working revision, effective-date evaluation time, configuration/formula version, relevant Staff IDs, and the resolved inputs and computed workload values needed by Roster. No future-dated automatic recomputation.
- Pending Contacts changes are **not** accepted workload inputs. Display them separately as planning assumptions; the preview must expose mismatches and any blocking missing authoritative inputs. Accepted Contacts changes after publication trigger an informational **Republish may be required** indicator, not automatic operational mutation.
- The one-time TTb-name Excel picker resolves existing Staff IDs only; it never changes employment facts or supplies an authoritative classification. Publication does not wait for nonblocking Contacts contribution acceptance when an internally consistent snapshot can be computed from accepted facts.

## D06 — Occupancy, workload and relief ownership (technical detail)

- Preserve the already approved Relief/Occupancy Settings equations, symbols and precedence; do not infer a new formula from a UI label. Define separately (a) **Timetabled occupancy**: occupied periods inside applicable timetabled hours, (b) weighted **W_i** under the approved equation, and (c) **actual total workload** for UT cap checks, which is not simply W_i. Document units, null semantics, inputs, source revisions and representative parity calculations in the implementation contract.
- Deploy owns occupancy, teaching timetable, W_i, appointment offload, configurable independent PE/Art/Music SIUE, lowest applicable SIUE, UT total cap and FAJT budget inputs. No individual SIUE overrides. Contacts owns accepted staff classifications and appointments; combined tags are not flattened. Roster owns relief allocation, R_i and cumulative relief; consumes published workload and budgets, does not recalculate W_i or feed R_i into Deploy.
- Existing v0.9 defaults (including UT 26 and FAJT 65 where found) are **source evidence, not automatically approved v1 defaults**. Initialise from explicitly approved configuration; flag missing values rather than silently adopting legacy constants. Occupancy warnings are advisory; structural/input errors block.

## D07 — Canonical Excel replace-table contract (technical detail)

- For each applicable IP, TG, Dept and settings table, specify versioned **Export All** workbook schema: target table/scope, stable row IDs, required/optional columns, types, foreign keys, valid catalogues, writable versus calculated fields, source version and expected draft revision. Export Visible is reporting output, not guaranteed importable. Calculated fields cannot be authoritative inputs.
- **Replace** means the entire specified draft table/scope, not the whole Deploy planning version or linked tables. Preview exact creates/updates/deletes, cross-table dependency effects, invalid cells and critical versus advisory findings. No silent deletion of referenced classes/teachers/groups. Replace is all-or-nothing; at confirmation recheck authority, draft revision, active leases and dependencies; stale or invalid input commits nothing.
- A supplied invalid Staff ID is an error and is **never** silently name-matched. Only absent Staff IDs may use simple exact TTb/Basic Name lookup and a Power User's one-time searchable selection for ambiguity. No alias database, mapping ledger, Contacts write or hash-based reconciliation. Replacing the workbook reruns validation for changed rows.

## D08 — Cell locks, bulk import and browser recovery (technical detail)

- Stable cell/resource keys, owner actor/session, lease expiry/renewal and fencing token prevent stale editors writing after a lock transfers. An orange outlined/tinted cell identifies the active editor with hover identity; validation errors remain discoverable. Locks do not replace optimistic revision checks. A full-table replacement conflicts with active relevant cells; reject or require refreshed preview, never overwrite silently.
- Browser draft recovery is scoped to actor, school, planning version, base revision and operation; must be protected on shared devices, cleared on sign-out/revocation and never grant authority. Recovered edits must be revalidated against current draft revision, leases and permissions; never silently overwrite newer changes.
- PF03 Save/Discard/Cancel affects only the current session's unsaved edits. Saved-but-unpublished work remains. Publish exactly the saved revision shown in preview; no incidental browser edits.

## D09 — Approved UI/UX implementation differences (no further owner decision)

- Class and FT selectors remain searchable but render as anchored **overlays** without expanding table cells, rows or columns; preserve both scroll axes on every cell operation. Rename affects only the selected class, never displaces another into `(undefined)`; duplicate names may exist temporarily while editing but block Save.
- Duplicate FT: outline/tint **entire affected FT cells red**, colour only the duplicate teacher name red, show contextual explanation; permit temporary duplicate draft entries but block Save until resolved. Live validation never blocks typing. Orange concurrent-editor state must not hide errors.
- Keep TG, Dept and existing occupancy layout. Apply shared table controls where applicable. Critical structural errors block; advisory occupancy warnings do not block Save/Publish. Significant affected viewport screenshots and owner UI/UX approval remain a pre-Codex gate; do not request screenshots of every dropdown variant.

## Readiness and verification

**All nine Work audit findings are dispositioned in specification.** D04 and D05 owner decisions approved; D01–D03, D06–D08 are technical contracts; D09 is an already-approved UI implementation delta. This is **not a claim that Deploy is ready for Codex**. Remaining pre-authorisation work: verify technical contract completeness against the nine findings, freeze canonical workbook column schemas and workload initial configuration, finish significant-viewport screenshot/owner UI/UX gate, and review the UAT additions. All UAT remains **Not tested**. No repository, infrastructure, production or Codex changes authorised.


---

# Revision 39 — Deploy Review 1J: Canonical Excel workbook contract (11 November 2026)

**Owner decisions:** JT01 SEPARATE; JT02 PROTECTED; JT03 OWNER CLARIFICATION: one-time legacy support only for *front-end-style* v0.9 exports, with practical TTb-name fuzzy suggestions and manual selection matching normal frontend entry. No hash-based matching, strict historical migration, backend dump importer or permanent alias ledger. This section supersedes broader legacy-conversion proposals. **Specification only.**

**Source baseline:** Work-audited commit `795f9f0c61cafafd01298ab0b78688ed91041cbe`. Relevant existing files `public/table-tools.js` (display/export rather than canonical import), `public/planning-ui.js` (Dept/organisations), `public/app.js` (class/TG/assignment references), `shared/planning.js` (Dept roles and member slots), `CLASSES.md` (class ID/name catalogue). These are source observations, not claims that the v1 workbook importer exists.

## 1J.1 Workbook strategy and shared rules

- **One workbook per editable Deploy table/scope**, not a single giant multi-table workbook. Supporting worksheets in that workbook are permitted where a flat grid cannot faithfully represent linked rows.
- Each canonical **Export All** workbook is also the corresponding **Import** template. **Export Visible** is a filtered reporting export and is not promised to be importable.
- Keep user-friendly editable labels. Include **visible, protected stable-ID columns** alongside names, including row identity and foreign keys where needed. IDs are generated/resolved by the application for new rows, not invented by users. Protecting a spreadsheet cell is a usability safeguard, **not** a security or integrity boundary: the server validates every submitted value.
- Workbook-level metadata: schema version, product/module, table/scope, planning-version identifier, saved draft revision, export time and column contract. No file-content hash is required for ordinary matching; revision checking, referential validation and atomic commit remain mandatory.
- The import is **Replace** of exactly the selected editable draft table/scope, never the whole planning version. Show adds, changes, removals, invalid references and dependencies in a preview. A valid import is atomic; it does **not** publish. Do not silently delete or rewrite linked records in other tables. Block if dependencies cannot be preserved or explicitly resolved through an approved operation.
- Importable columns are explicitly enumerated. Calculated totals, warnings and operational publication data are read-only reference values and never writable source inputs.
- Source revision, permissions, active leases and cross-table dependencies are rechecked on **Confirm Import**. Stale or invalid imports do not partially commit.
- Treat a protected ID column with a supplied but invalid/nonmatching ID as an error, not as permission to fuzzy-match by name. Blank Staff ID may use TTb/Basic Name suggestions and manual selection. Empty row IDs are allowed for newly created records only under the target schema's create rule.
- One-time *front-end-style* legacy exports may be read as user-entered table rows where column meaning is recognisable. Convert to the current draft template in preview, resolving missing IDs via existing user-facing pickers. Reject unsupported/raw backend dumps with a clear explanation. **Do not promise full-fidelity migration of legacy metadata, hash parity, or automatic reconstruction of relationships absent from the visible workbook.**
- Ordinary import audit records actor, table, operation, counts and chosen Staff IDs as necessary; do not create a Contacts alias registry or a separate identity-mapping ledger.

## 1J.2 Proposed canonical logical sheets and field contracts

These are **schema design requirements**, not final code-level column keys. Builders must reconcile the precise source data shape and produce a field-by-field schema before implementation; do not invent missing editable fields.

| Target scope | Canonical sheet(s) | Writable logical fields | Protected identity/reference fields | Read-only / derived |
|---|---|---|---|---|
| IP Classes | `Classes` plus `FormTeachers` where multiple FT assignments require rows | class display-name selection from controlled catalogue, existing class attributes that are editable in the viewport, FT teacher selection | class ID/ref, FT Staff ID, FT association row key if needed | calculated counts, occupancy, display-only composite keys |
| IP Teaching Assignments | `TeachingAssignments` | target class/TG selection, subject, teacher, periods and venue **only when editable in the corresponding existing UI** | assignment ID, target class/TG ID, Staff ID | computed totals, derived workload |
| TG | `TeachingGroups` plus `TGClasses` and `TGTeachers` where required to represent many-to-many associations | TG name, subject, level/scope, class associations, editable periods/venue and teaching assignments | TG ID, class refs, assignment IDs, Staff IDs | computed occupancy and cross-table summaries |
| Dept | `Departments` plus `DepartmentMembers` | department name, role/position, assigned teacher, membership entries allowed by existing Dept UI | department/group ID, Staff ID, membership key/slot | member counts and eligibility indicators |
| Occupancy Settings | `OccupancySettings` | approved editable configuration keys, units and values | configuration key, scope/row identity | W_i, UT-cap result, other calculated totals |
| Other editable Deploy tables | One table-specific workbook per supported viewport | Existing approved user-editable fields only | stable row and relationship identifiers | calculated/summary values |

**Important schema nuances:**
- Class identity is not the displayed class name. Renames preserve references and never displace another class into `(undefined)`. Temporary duplicate names may exist in the editor, but critical errors block Save/Import confirmation.
- FT duplicate conflict highlights the **whole cell** in red with the conflicting teacher's name in red. It remains permissible temporarily while editing; cannot be committed as invalid.
- Dept is not merely one Head/Deputy column: the existing source also models additional deputies, TLs and member slots. The canonical workbook must represent these without dropping multiplicity or ordering. A normalized `DepartmentMembers` sheet is preferred over a lossy fixed-width export.
- TG class associations may involve multiple classes and whole-level scope. Preserve association semantics and stable class refs, not only display names.
- For any setting or field whose editability is not already approved, **do not turn a read-only summary into an importable setting**. A proposed new writable field requires owner approval.
- For IP and TG, do not automatically import the same assignment twice through separate sheets. Declare a single canonical owner for each assignment row and make any duplicate display/reference sheet read-only.

## 1J.3 Lightweight legacy TTb-name convenience

- Legacy compatibility covers only user-recognisable *front-end-style* table exports. No generic backend snapshot or comprehensive data-migration importer.
- On missing Staff ID, try exact current TTb/Basic Name, then show **fuzzy suggestions** in the same searchable picker style as manual frontend teacher entry. The Power User confirms uncertain matches. Never auto-select ambiguities.
- Changes in FAJT, 4/5 load or other TTb modifiers are expected; TTb Name is not a stable identity.
- Use the selected existing Staff ID for this one import only. Do not change Contacts, staff tags, employment facts, or store permanent aliases.
- Unresolved mandatory teacher references block import; legacy rows with unrepresentable relationships are reported clearly rather than silently guessed.

## 1J.4 Validation and import transaction

1. Select a target Deploy draft table/scope and upload the matching workbook.
2. Check schema, required columns, types and supplied protected IDs; for front-end-style legacy imports, first identify the recognised visible layout.
3. Resolve missing teacher references with exact/fuzzy TTb suggestions and manual picker; validate classes, TGs, Dept roles, other foreign keys and dependent rows.
4. Display full replacement diff, affected links, blocking errors (red cell outlines) and advisory warnings. Permit corrected workbook replacement without closing the preview.
5. On Confirm, recheck current Core capability, current draft revision, lock ownership and cross-table dependencies. Commit **only** the target draft scope atomically; retain saved unpublished edits elsewhere. Do not publish or send Contacts contributions merely because an import succeeded.

**Implementation readiness:** Owner policy JT01–JT03 is settled. Exact workbook column keys, sheet ownership and required field/type matrices are **technical design tasks** to verify against the existing frontend and approved editable fields before Codex authorisation; not an invitation to redesign TG/Dept UI. Source-led and screenshot approval for significant viewports remains required. All UAT **Not tested**.

**No repository, infrastructure, live-data or Codex changes authorised.**

---

# Revision 40 — Deploy Review 1K, source-audited occupancy defaults (11 November 2026)

**Status:** Round 1 and Round 2 owner decisions reconciled, **except OK10 TC initial rate remains pending clarification**. This section supersedes older default values where inconsistent. Specification only; no repository, infrastructure, Codex or production changes.

**Source audit:** `helper-gsps/gsis` at `795f9f0c61cafafd01298ab0b78688ed91041cbe`, notably `shared/relief.js`, `shared/workload.js`, `shared/teaching-rules.js` and `backend/Relief.gs`. Source defaults describe v0.9, not automatically approved v1 defaults.

## 1K-A — General Occupancy Settings, owner-approved OK01–OK05

| Setting | v1 initial value | Behaviour |
|---|---|---|
| Full weekly budget | 84 periods | Editable and saveable in Deploy Occupancy Settings |
| Timetabled periods | 60 | Editable and saveable; current ratio 60/84 = 5/7 |
| Four-fifths budget fraction | 0.80 | Editable and saveable |
| FAJT weekly budget | 65 periods | Editable and saveable |
| General SIUE coefficient | **1.9** | Editable and saveable |
| PE SIUE coefficient | **0.9** | Independently editable and saveable |
| Art SIUE coefficient | **0.9** | Independently editable and saveable |
| Music SIUE coefficient | **0.9** | Independently editable and saveable |
| Teacher-specific relief block periods | **Not owned by Deploy** | Roster determines unavailable periods from the effective baseline timetable and approved daily timetable changes |

**Units and formula parity:** SIUE 1.9/0.9 are **coefficients in the approved `1 + SIUE` expression**, not total teaching multipliers. Hence general multiplier 2.9; PE/Art/Music multiplier 1.9. The legacy source stores percentage SIUE: v1 coefficient 1.9 corresponds to legacy 190%, and coefficient 0.9 to legacy 90%. Do not confuse 1.9 with 1.9% or a total multiplier of 1.9. Preserve the approved mathematical equation and existing weighting/precedence, with explicit input units. Changes to settings save into the working Deploy version and take operational effect **only on explicit publication**, consistent with Revision 33.

## 1K-B — Appointment/tag configuration, owner-approved OK06–OK09 and OK11

| Rule | Standard offload default | Acting offload default | Other default | v1 handling |
|---|---:|---:|---|---|
| HOD | 30% | 20% | | Editable/saveable |
| Junior KP (SH/LH/AYH) | 20% | 0% | | Editable/saveable |
| ST | 20% | 0% | | Editable/saveable |
| LT | 30% | **Blank** | | Editable/saveable; blank is not zero |
| MTT | **Blank** | **Blank** | | Requires configuration when applicable; blank is not zero |
| 4/5 modifier | 20% | n/a | Separate 0.80 weekly-budget fraction | Editable/saveable |
| BT | 20% | n/a | | Editable/saveable |
| UT | n/a | n/a | **26-period weekly cap on total actual workload** | Editable/saveable |
| FAJT | n/a | n/a | **65-period weekly budget** | Editable/saveable |
| SRE | n/a | n/a | Existing classification-specific treatment | Preserve existing rules; no invented fixed rate |
| HOD SM | 50% | n/a | Role-specific rule supersedes general HOD offload | Editable/saveable |
| TC | **PENDING OK10** | n/a | Legacy executable default 20%; source note references 30% | Do not freeze initial value until clarified |

**OK11:** Combine applicable offload rates multiplicatively, retaining existing precedence. Do not silently sum offloads. Preserve combined-tag recognition, including FAJT+BT, UT cap basis, and independent staff classification versus assignment pool. Individual teacher-specific SIUE overrides remain disallowed by WE03; editable *catalogue/configuration* rates are not individual SIUE overrides.

**OK10 discrepancy:** Owner message says “keep existing 30%” while also specifying “school based decision is 20%”. The audited executable `shared/teaching-rules.js` default is **20%**, and its note says 30% is recommended. The owner attribution to MOE has not been independently verified here; retain it as an owner-supplied note, not as independently established policy. Ask owner whether the **initial TC rate is 20% or 30%**. Either value can be edited/saved by authorised Deploy Power Users. No silent resolution.

## 1K-C — Audit and remaining technical contract checks

- Preserve separate raw Timetabled occupancy, cap-counted actual workload and weighted `W_i`. The existing `shared/relief.js` model calculates `W_i` from FTT, PD, duties, other nonteaching, teaching and offload allowance with SIUE; v1 Roster owns the relief quota `R_i` and does not write it back to Deploy.
- Validate 84, 60, 0.8, 65 and SIUE coefficient inputs using explicit units and configured bounds. Do not carry over legacy percentage fields without conversion.
- Verify specialist precedence when a teacher has several subject modifiers, and ensure staff classification comes from accepted Contacts facts rather than TTb suffixes.
- Confirm acting LT blank and MTT blank are surfaced as unresolved when calculation requires them, not silently interpreted as zero.
- Verify default-vs-configured settings and publication provenance. Editing a saved working version must not change operational Roster inputs until manual republication.
- Parity scenarios should include general SIUE 1.9, PE/Art/Music SIUE 0.9, mixed specialisms, HOD SM precedence, 4/5 + BT, FAJT + BT, UT 26 total actual workload cap, acting LT blank, MTT blank and TC rate once decided.
- Note existing v0.9 `shared/relief.js` still computes `R`; the approved v1 contract moves R ownership to Roster. Source audit does not authorise copying that coupling.

**Next owner decision:** OK10 initial TC rate (20% versus 30%). All UAT Not tested. No implementation authorised.

---

# Revision 41 — Deploy Review 1K Round 3, OK10/OK12/OK13 (11 November 2026)

**Approved owner decisions:** OK10 = 20%; OK12 = retain combined-tag effects; OK13 = fallback configured default, show unavailability, do not unnecessarily block operations. This section supersedes the TC pending labels and the stricter blanket unavailability interpretation in earlier Review 1K text. All other Revision 40 rules remain.

## OK10 — TC default
- TC initial offload is **20%**, editable and saveable in Deploy Occupancy Settings by authorised Power Users.
- Include an informational note: the owner identifies 30% as the MOE recommendation and 20% as the school's local decision. This external recommendation is **owner-reported, not independently verified** in this specification.

## OK12 — Combined classifications
- Retain independently applicable tags and multiplicative offload, including FAJT+BT. FAJT uses its configured 65-period initial budget, and BT's configured initial 20% offload remains applicable where the established calculation requires it.
- Preserve the precedence of HOD SM over the general HOD rule, the lowest configured applicable specialist SIUE and UT's total actual workload cap. Do not use TTb-name suffixes as authoritative classifications.

## OK13 — Missing inputs and safe fallback
- When a required input is missing, use a **valid configured default for that exact field** if one exists, label the affected calculation **estimated / unverified**, and identify the missing input and fallback used. Never silently substitute zero or an unrelated default. Blank LT acting and MTT rates remain unresolved where no valid configured fallback exists.
- **Editing, saving, browsing, exports and other operations not dependent on a verified calculation remain available**, subject to existing structural validation, permissions and conflicts. Occupancy/calculation incompleteness is advisory for publication when the underlying planning data is structurally valid; clearly display any unavailable workload result and the affected staff before confirmation.
- **Critical distinction from approved D04:** A fallback estimate or unavailable calculation must **not** be promoted to an authoritative verified published workload value for Roster. Roster may continue historical and non-workload-dependent operations, but new workload-dependent decisions requiring missing or unverified current workload must wait for verified data. This is a safety boundary, not a blanket Deploy-operation block.
- If a configured default is authoritative and valid for the field, it may be used as an ordinary calculation input. Only **substitution for a missing required person-specific fact** is labelled an estimate. A genuine verified calculation must have traceable accepted Contacts facts and a published Deploy input revision.
- No automatic Contacts modification or publication; changes to saved configuration become operational only after explicit manual republication.

## Source parity and implementation check
- Legacy `shared/relief.js` expresses SIUE as percentage; v1 UI coefficients 1.9 and 0.9 correspond to 190% and 90%, yielding teaching multipliers 2.9 and 1.9 respectively. The existing mathematical structure is retained.
- Audit representative cases: TC 20%; FAJT+BT; 4/5+BT; HOD SM; UT cap; multiple specialisms; blank acting LT and MTT; missing input with an applicable configured default; missing input without one; and Roster's D04 verified-workload guard.
- **Status:** Review 1K Round 3 reconciled; calculation examples and source parity still to be completed before implementation readiness. All UAT Not tested. No repository, infrastructure or Codex implementation changes authorised.


---
# Revision 42 — Deploy Review 1K Round 4: numerical parity examples (11 November 2026)

**Status:** Specification-only calculation examples, **not executed v1 tests**. Uses source-audited `shared/relief.js` at `795f9f0c61cafafd01298ab0b78688ed91041cbe` and owner-approved Rev 41 defaults. This section does not alter policy or authorise implementation.

## Common synthetic fixture

For every case: FTT=2, PD=2, duties=1, other nonteaching=1, actual teaching Ti=10, average teaching T_avg=12 (all periods/week). Therefore base non-SIUE components = 6 and cap-counted actual total = 16. These are **test assumptions**, not real school data. No per-teacher timetable blocks. Full-time budget=84, timetable factor=60/84=5/7; 4/5 budget=67.2; FAJT budget=65 and source-model FAJT factor=1. General SIUE coefficient=1.9; specialist coefficient=0.9.

W_i = 6 + (1 + SIUE) * (10 + OF * 12).
Normal quota = floor(max(0, timetable factor * (weekly budget - W_i))). Where a cap applies, quota = floor(max(0, min(raw quota, max(0, cap - cap-counted actual workload)))).

| Case | SIUE | OF | Budget | Factor | W_i | Raw R | Expected quota |
|---|---:|---:|---:|---:|---:|---:|---:|
| Full-time general | 1.9 | 0 | 84 | 5/7 | 35 | 35 | **35** |
| PE/Art/Music specialist | 0.9 | 0 | 84 | 5/7 | 25 | 42.142857 | **42** |
| HOD SM (role-specific override) | 1.9 | 0.50 | 84 | 5/7 | 52.4 | 22.571429 | **22** |
| 4/5 + BT, multiplicative retained fraction 0.8×0.8 | 1.9 | 0.36 | 67.2 | 5/7 | 47.528 | 14.051429 | **14** |
| FAJT + BT | 1.9 | 0.20 | 65 | 1 | 41.96 | 23.04 | **23** |
| UT, total actual workload cap 26 | 1.9 | 0 | 84 | 5/7 | 35 | 35 | **10** (26−16 headroom) |

**Interpretation caveat:** These are mathematical **legacy-source-model parity targets** under the specified synthetic fixture, not an assertion that Deploy v1 owns or computes R_i. Approved v1 ownership remains Deploy W_i, Roster R_i. The existing FAJT factor=1 and the 4/5 factor=5/7 should be explicitly verified in the eventual technical contract; do not silently replace with a universal factor.

## Unresolved input and integrity cases

- Acting LT and MTT blank rates: no fabricated zero; show unavailable and preserve non-dependent operations.
- Missing staff-specific input with a valid default: display the fallback estimate and provenance; never certify it as verified for Roster D04-dependent decisions.
- Combined specialist modifiers: choose lowest configured applicable SIUE coefficient; current PE, Art and Music defaults are all 0.9.
- Multiple offloads: multiply retained fractions; 4/5 + BT gives OF=1−(0.8×0.8)=0.36, not 0.40.
- HOD SM replaces HOD default rather than stacking another HOD offload.
- UT cap uses actual counted workload, not weighted W_i. Other caps retain their approved source-specific basis.
- Changed draft defaults do not affect published workload until manual publication; invalid/unverified current workload does not become authoritative merely because publication succeeded.

**Next:** Review 1L significant viewport UI/UX acceptance; do not request another broad Work audit without a specific unresolved source conflict. All UAT Not tested. No repo, infrastructure or Codex changes.

---

# Revision 43 — Deploy Review 1L Round 1 UI/UX decisions (11 November 2026)

**Owner approved:** UX01 preserve; UX02 same; UX03 overlay; UX04 keep. These supersede any broader redesign proposals. This revision is specification-only. Source inspected read-only at commit `795f9f0c61cafafd01298ab0b78688ed91041cbe`; no runtime screenshots were captured and **visual acceptance is pending**.

## UI contract

- **UX01** Preserve the existing v0.9 Deploy fonts, palette, density, spacing, table hierarchy, navigation, and interaction vocabulary unless an approved v1 functional change requires a local adjustment. Maintain accessible focus, contrast and keyboard operation; do not interpret preservation as a prohibition on fixing defects.
- **UX02** Keep **Occupancy Settings** in the existing settings viewport (v0.9 labels this `Relief Settings` in navigation). Present editable and saveable 84/60, 4/5 0.80, FAJT 65, SIUE coefficients 1.9 general and 0.9 PE/Art/Music, appointment and staff-tag offload defaults, TC 20% note, and associated approved settings without creating a new configuration page. Display coefficients and resulting multipliers distinctly. Preserve the established calculations and advisory warnings. Do not add Deploy-owned relief-availability blocks; Roster derives availability from its effective timetable.
- **UX03** Import preview is a **large modal overlay** anchored to the current Deploy table, not a separate route. Preserve underlying table scroll offsets and user context through open, validation, correction, cancel, success and close. Show the target replacement scope, row-level diff, invalid cells, dependencies, editable TTb match pickers, Confirm and Cancel. Ensure overlay stacking, responsive sizing, focus management, keyboard access and no underlying accidental edits. Corrected workbook may be loaded in the same preview.
- **UX04** Preserve **Save** and **Publish** as distinct actions. Save affects draft only; Publish creates a new immutable operational revision and advances the in-force pointer after authoritative confirmation. Clearly distinguish unsaved, saved-unpublished, publishing, published, delivery-warning and uncertain-commit states. Incomplete calculations may produce warnings without blocking structurally valid Deploy Save/Publish, but unverified workload must not silently become authoritative for new Roster workload-dependent decisions (D04).
- IP Deploy: preserve familiar cell editing and dropdowns while implementing previously approved overlay, scroll, cell-lock and red conflict conventions. TG and Dept: keep existing layout and interactions; shared table controls and Excel import are additive.

## Read-only source observations for screenshot review

- `public/app.js` lines 630–648 define Deploy navigation, including `IP Deploy`, `Dept`, `Relief Settings`, `Workload`, `Classes & TGs`, and other tabs. v1 must use the approved `Occupancy Settings` terminology, not blindly preserve the legacy label.
- `public/app.js` lines 468–551 show existing version/publication status and publish handling; the current UI's Contacts-sync messages are legacy behaviour and must **not** be copied as a synchronous v1 publication dependency.
- `public/planning-ui.js` lines 8–19 implement existing Dept/group settings and membership views; preserve these instead of replacing them with a novel dashboard.
- `public/table-tools.js` implements generic table export and controls; its visible-grid export is not the canonical reimport workbook agreed in Review 1J.
- Existing source code is evidence of intended control structure, **not visual proof**. Required screenshot gate: capture baseline and proposed states at representative desktop/laptop and narrow viewport sizes for (a) IP Deploy cell editing/conflict, (b) Occupancy Settings expanded controls, (c) Excel preview with error/TTb matching, (d) publication status. TG and Dept need comparison screenshots only if shared controls materially alter their visible layout. Record viewport width, source revision and owner approval/rejection per capture.

## Acceptance status

UX01–UX04 policy **Approved**; source audit **Read-only complete for identified entrypoints**; screenshot-led visual acceptance **Pending**; all related UAT **Not tested**. Do not claim viewport parity, accessibility, screenshots or implementation has been verified. No repo, infrastructure, Codex, live-data or production changes authorised.


---

# Revision 44 — Deploy Review 1L: HR Settings visual acceptance and Excel contracts (11 November 2026)

**Owner-approved scope:** Screenshot-led review of six v0.9 HR Settings viewports. Preserve the existing visual layouts of **Span of Control, Teachers, Exclusions, Membership, Offload, and HR Terms**. Apply the suite-wide canonical Export All / Import contract to ordinary editable tables, subject to the existing **Contacts/Core authority and field-ownership boundaries**. Move **Span of Control** to the **rightmost HR Settings submenu position**. For Span of Control Excel, adopt **one column per Reporting Officer plus a supporting lossless hierarchy/Staff ID sheet**. Specification and UAT only; no implementation authorisation.

## 1L-HR01 — Navigation and visual preservation

HR Settings submenu order:
`Teachers | Exclusions | Membership | Offload | HR Terms | Span of Control`

Keep each viewport's existing controls, density, column structure, dropdown/picker patterns, alternating table rows, scroll behaviour, search, Compact control, and save/discard workflow. Existing Span of Control remains an interactive drag/drop multi-layer reporting workspace; Excel is an additional workflow, not a replacement.

## 1L-HR02 — Standard Excel contract for ordinary editable HR tables

- Apply TBL01–TBL09 and Review 1J: per-table **canonical Export All** with visible protected stable IDs, explicit schema/version/scope/revision, previewed **atomic replacement of the selected draft scope**, and **Export Visible** for reporting only. The latter need not be reimportable.
- **Teachers:** Excel may write only Deploy-owned planner fields and other fields explicitly delegated for that actor under the approved Contacts contribution contract. Contacts-owned identity, employment, appointment and contact facts must **not** become authoritative via Deploy import. Where an approved delegated contribution is supported, stage it as a nonblocking, field-scoped Contacts proposal with its own review and current-authority checks; never synchronously gate Deploy publication.
- **Exclusions:** Excel rows keyed by stable Staff ID; P1–P6 exclusions are boolean values. Existing `⚠ Pn` assignment badges remain advisory, including after import; never block ordinary assignment or Save solely due to exclusion.
- **Membership:** Preserve current role-to-group and EO appointment mapping presentation, but Core/Contacts own the authoritative identity and access facts in v1. A Deploy import must **not** grant SMC/EO privileges or overwrite the authoritative Contacts catalogue. Export may be read-only/reference unless the final field-ownership contract explicitly authorises a controlled contribution; any proposed new write path is **blocked pending contract verification**, not implicitly approved by this Excel decision.
- **Offload:** Import/export existing rule rows with stable rule IDs, match source/value, standard and acting percentage, weekly cap, notes. Blank versus explicit zero remains distinct. Combined rules remain multiplicative, role-specific replacement precedence retained. Editable Deploy configuration follows approved capability rules.
- **HR Terms:** Preserve the visible choices editor but respect catalogue ownership. Import only those choice lists confirmed Deploy-owned/configurable under the approved field-ownership contract. Contacts-owned employment/appointment vocabulary must not be overwritten by a Deploy import. Unsupported fields are exported as read-only reference or excluded from the importable scope, with clear user explanation.
- For all supported imports: same current-capability, draft-revision, stable-ID, cross-reference, preview, atomicity, nonpublication and no-partial-write protections as Review 1J.

## 1L-HR03 — Span of Control Excel contract

**Canonical workbook:** one workbook for Span of Control with two sheets:

1. **`RO Columns`** (user-friendly primary sheet): each RO has a separate column; header displays RO's TTb/Basic Name and is backed by a **protected stable RO Staff ID**. Under each column are direct-report teacher names, with protected Staff IDs for canonical round-trip. The ordering of staff in a column is presentation only unless an existing frontend feature explicitly gives it meaning.
2. **`Hierarchy`** (lossless supporting sheet): one row per eligible reporting person with protected `Staff ID`, readable `Staff Name`, `Parent RO Staff ID` (or blank for allowed root), `Parent RO Name`, and any existing authoritative hierarchy fields required for reconstruction. Preserve every reporting layer and root; avoid lossy flattening. Include workbook schema, planning version, saved draft revision and scope metadata.

**Consistency rule:** the RO Columns sheet is the friendly edit surface; the Hierarchy sheet is the canonical complete structure. On import, reconcile the two. A changed placement in RO Columns must update the proposed parent link, but conflicting edits to both sheets require an explicit user resolution in preview; never silently prefer one. New/renamed RO headings resolve to a stable Staff ID using the ordinary one-time teacher picker where ID is missing; supplied invalid IDs are rejected. A column headed by a teacher who is not eligible as an RO is invalid.

**Validation:** no duplicate staff placements; no unknown/inactive/ineligible reporting person where current rules prohibit; no self-reporting, circular parent chains, orphaned parent links, illegal root changes or lost deep-level links; respect school leaders/OSO restrictions already represented in the frontend. The import is an atomic replacement of **Deploy's reporting draft only** and never changes Contacts staff identity, employment or permissions. Retain drag/drop editing and the existing layer count as a view control.

**Technical source evidence:** at audited commit `795f9f0c61cafafd01298ab0b78688ed91041cbe`, `public/app.js` `reportingPage` and `GSISReporting` model the reporting tree; `reporting.officers` stores person-to-parent RO links. The existing frontend's other HR tables and version-owned planning data appear in `public/app.js` and `shared/planning.js`. Screenshots establish appearance, not tested interactions.

## 1L-HR04 — Visual review findings and open verification

- **Keep** existing Offload table and its columns, including notes and preserved legacy-data panel. Do not move the editor into Occupancy Settings. Provide a navigational link from Occupancy Settings if useful; preserve the single Deploy-owned configuration.
- **Keep** Exclusions table and its advisory warning trigger. Level Exclusions are Deploy-owned planning preferences, not Contacts employment tags.
- **Keep** Membership and HR Terms screens visually, while replacing v0.9's claims that publication directly replaces Contacts mappings/choices with v1-accurate nonblocking, authority-respecting wording.
- **Observed saved-value difference:** screenshot shows LT acting offload **20%** while the source-audited factory default was blank. Do not overwrite existing saved settings with factory defaults or infer that the screenshot changes the v1 factory default. Record as a saved-version value, not a new owner decision.
- **Outstanding technical gate:** exact column keys/types and field-by-field Contacts/Deploy catalogue ownership, especially Teachers, Membership and HR Terms, must be verified before authorising implementation. An Excel requirement does not override the approved authority boundary.
- **Visual approval:** six layouts approved as preservation baselines. Interaction tests, import/export and all UAT remain **Not tested**.

**Change control:** Revision 44 supersedes any earlier proposal to relocate Offload to Occupancy Settings or make Contacts-owned HR facts directly writable by Deploy. No repository, infrastructure, Codex or live-data changes.

---

# Revision 45 — Deploy Review 1L Round 6: Excel import-preview visual acceptance (11 November 2026)

**Owner approvals:** UX07 Agree; UX08 Inline; UX09 Agree. These decisions refine, rather than replace, the canonical Excel contracts of Revisions 39 and 44. This is specification-only work; no implementation or UAT execution.

## UX07 — Large, table-faithful preview overlay

- Open a large, responsive overlay above the existing Deploy table. Preserve the underlying page's horizontal and vertical scroll positions and any existing filter/column/Compact settings when the overlay closes.
- Render the *selected target table's* familiar columns and structure, including frozen identity columns and horizontal/vertical scrolling where necessary. Do not replace the preview with an unrelated generic summary table.
- Show the workbook name, target planning version and selected draft scope, schema/compatibility status, and counts of additions, changes, removals, blocking errors and advisory warnings.
- Highlight each invalid cell with a thick red outline and subtle red tint, with a concise reason and an accessible textual equivalent. Preserve existing cell-conflict styling conventions; do not rely on colour alone.
- Keep the preview responsive; narrow viewports may stack the summary/actions, but must not discard identity columns or change the underlying table.

## UX08 — Inline TTb matching

- When a recognised frontend-style legacy row lacks a Staff ID, offer exact current TTb/Basic Name matches and then fuzzy suggestions in an **inline searchable picker anchored to the affected cell**. The picker overlays the table without expanding its rows/columns or moving the scroll position.
- A Power User explicitly selects any ambiguous candidate; no silent fuzzy auto-match. A selected candidate resolves to the existing stable Staff ID **for this import only**. Do not create permanent aliases or modify Contacts.
- Supplied invalid/nonmatching Staff IDs are hard validation errors, not an invitation to fuzzy match. Unresolved mandatory teacher references block confirmation.
- Replace-file revalidation clears or rechecks mappings for changed rows. Display the selected identity visibly in the preview before confirmation.

## UX09 — Replacement diff and confirmation

- Show added, changed and removed records and affected cross-table relationships before confirmation. The exact replacement boundary is the **selected editable draft table/scope** only; no other table, Contacts-owned facts or published revision is implicitly replaced.
- Critical structural/reference errors disable **Confirm import**; advisory warnings do not. The preview remains available for correction and workbook replacement. Offer Cancel and Replace file.
- On Confirm, recheck current Core capability, draft revision, relevant locks and dependencies, then commit the selected draft scope atomically or commit nothing. A successful import is **not** publication; preserve the separate Save/Publish workflow and its status.
- The design mockup previously shown in chat is illustrative, not a screenshot of implemented functionality. Actual screenshot approval of the new overlay remains pending implementation; UAT stays **Not tested**.

## Next review

Proceed to Review 1L publication UI acceptance: distinct Save versus Publish, in-force versus unpublished version, timeout/unknown-status recovery, nonblocking Contacts contribution diagnostics, and downstream Roster projection warning without reversing a committed publication. Do not authorise Codex or repository/infrastructure changes.

---

# Revision 46 — Deploy Review 1L Round 7: Publication UI acceptance and implementation-readiness assessment (11 November 2026)

**Owner decisions:** UX10 KEEP; UX11 VERIFY; UX12 SEPARATE; UX13 VERSIONS. This section reconciles Revision 45 with Deploy publication audit findings D01–D09 at inspected commit `795f9f0c61cafafd01298ab0b78688ed91041cbe`. **Specification only. No repository, infrastructure, Codex, deployment or production changes authorised.** All UAT remains **Not tested**.

## UX10 — Status location and saved draft distinction

Preserve the compact publication status beside the existing version selector; show explanatory text immediately below the toolbar when necessary. Keep Save and Publish as distinct actions. Distinguish unsaved edits, saved but unpublished draft, in-progress publication, committed publication and failed publication. An in-force planning version remains editable: Save updates only its unpublished working state, and Publish creates a new immutable revision and changes the authoritative in-force pointer. Other planning versions remain unpublished. Version switching with unsaved edits requires Save / Discard / Cancel. Do not introduce scheduled publication or automatic activation.

## UX11 — Publication timeout and verification

Each publication attempt has a durable operation identifier and receipt. During a timeout or uncertain transport result, show **Verifying publication…** and query that exact operation's authoritative receipt. Do not retry blindly, assume failure, or infer the outcome from the current in-force pointer alone: another later publication may have superseded it. If committed, display its immutable publication identity and whether it remains in force. If definitively not committed, allow safe retry while retaining the saved draft. If still unknown, display **Publication status unknown** and a manual refresh/diagnostic action; do not enable a duplicate publish of the same uncertain operation. The existing in-force revision is not displaced by pre-commit failure. R2 artifacts must be verified before a pointer references them; pointer changes are guarded by compare-and-swap and current permission checks.

## UX12 — Separate publication from downstream deliveries

A committed Deploy publication is successful even when the Contacts contribution or Roster workload projection delivery is delayed or fails. Display the publication receipt and independent **Contacts contribution** and **Roster projection** statuses (pending, delivered/accepted where meaningful, failed/retry). Do not label a pending Contacts proposal as an accepted Contacts fact. Do not synchronously gate Deploy publication on Contacts acceptance or Roster refresh. Durable retries and health diagnostics handle delivery; a downstream failure never silently rolls back the immutable publication. Roster's D04 SAFE rule remains in force: when authoritative current workload cannot be verified, continue read/history and operations not dependent on workload but block **new workload-dependent decisions** until verified recovery. Do not treat an estimated or fallback-only calculation as verified workload.

## UX13 — Version history and visibility

Retain the existing Versions viewport, version selector, familiar publication controls and dense layout. Display prior immutable publication revisions with operation ID, revision/publication ID, timestamp, outcome and downstream status where authorised. Historical receipts remain accessible even when later publications supersede the revision. The Versions viewport must not imply that saved unpublished edits are operationally in force. Longer diagnostics remain available without crowding the header. No new broad dashboard is required.

## Final Deploy implementation-readiness assessment — specification phase

**Owner-policy status:** UX10–UX13 resolved; previous decisions D04 SAFE, D05 FIXED, JT01–JT03, OK01–OK13 and UX01–UX09 retained. UI preservation decisions are documented. This is **not** a verified implementation-ready or tested release.

**Outstanding technical contract gates (before Codex authorisation):**

1. **Field ownership and capability matrix:** exact endpoint × operation × capability × field for Contacts/Core/Deploy, including current authority after waits, effective-dated Contacts facts, and the limits on Excel import into Teachers, Membership and HR Terms. No privilege can be gained from a Deploy workbook.
2. **Canonical workbook schema:** exact worksheet names, column keys/types, stable IDs, association-row ownership, protected/read-only fields, replacement boundaries and cross-table dependency checks for each supported Deploy table, including Span of Control's RO Columns + lossless Hierarchy sheets.
3. **Publication operation contract:** precise receipt states and lookup, immutable publication identity, R2 verification, in-force pointer CAS, idempotency/retry, current permission recheck and status handling when a later publication supersedes an earlier uncertain operation.
4. **Roster workload projection contract:** exact publication revision/freshness validation, monotonic refresh, failure behaviour under D04 SAFE, stamping workload revision on new workload-dependent decisions, and preservation of historical decisions. Distinguish raw timetabled occupancy, weighted W_i and actual cap-counted workload.
5. **Occupancy parity and configuration:** executable parity cases for the approved editable budgets, general SIUE coefficient 1.9 and specialist coefficient 0.9, combined classifications, UT total cap, missing-input advisory fallback and no unverified operational quota. Prior numeric examples are expected values, not executed tests.
6. **Concurrency and visual gates:** exact cell lock keys, lease/fencing/revision rules, import-vs-cell-lock conflict handling, local draft recovery and shared-device privacy. Confirm significant viewports at supported widths; desktop screenshots establish appearance but not interaction. Publication status visual placement approved conceptually, not screenshot-tested.
7. **UAT execution:** all UAT files remain Not tested. No integration, browser, security or deployment test has been executed or passed by this review.

**Readiness verdict:** **Owner-policy and conceptual UI decisions substantially closed; technical design and verification remain open. Not yet ready for unconditional Codex implementation authorisation.** Next action: targeted, read-only contract verification against the exact baseline, then freeze a coherent implementation specification and request explicit owner authorisation separately. Do not repeat broad exploratory audits without a specific uncovered contract.

---
# Revision 47 — Deploy Review 1M final technical contract freeze (11 November 2026)

**Status:** Owner decision TV01 approved (`legacy`); technical contracts TV02–TV07 adopted as **normative implementation requirements**, not claims of implemented functionality. Source: final read-only Work verification report, inspected main `65d7bb5efe0fc8dfeedb8d852bab0a703f84c441`, historical baseline `795f9f0c61cafafd01298ab0b78688ed91041cbe`. Existing implementation does not demonstrate compliance. All UAT **Not tested**. No code/infra/production/Codex authorisation.

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

## Freeze disposition

**Owner policy:** TV01 and prior decisions settled. **Normative technical contracts:** TV02–TV07 frozen for implementation design, subject to verifying exact implementation feasibility, source-aligned field types and cross-D1 race tests. **Implementation readiness:** conditionally ready for a separate, explicit build authorisation after handoff review; not implemented, not tested, not deployed. Existing v0.9 behaviour is not evidence of v1 compliance. No repository/infrastructure/Codex changes authorised by this document.

---

# Revision 48 — Deploy Review 1N: Implementation-design controls (11 November 2026)

**Status:** Owner-approved implementation *planning*, not implementation authorisation. Revision 47 remains the substantive Deploy technical contract baseline; this revision adds sequencing and handoff controls. All Deploy UAT: **Not tested**.

## IN01 — Seven-phase delivery sequence

| Phase | Bounded deliverable | Mandatory acceptance evidence |
|---|---|---|
| 1. Core and Contacts contracts | Current capability resolution; effective-dated accepted Contacts facts; field ownership and constrained nonblocking contributions | Server-side denial tests, stale/revoked authority tests, field/endpoint matrix, source-aligned schemas |
| 2. Deploy authoritative persistence | Domain-owned D1 schema; drafts, leases/fencing, saved revisions, immutable publications, durable operation receipts, transactional pointer CAS and downstream intents | Idempotency, duplicate requests, late-writer fencing, R2 digest/pointer integrity, crash and recovery tests |
| 3. Canonical Excel | Per-table workbook schemas, protected IDs, preview, conflict resolution, atomic draft-scope replacement, SOC two-sheet reconciliation | Exact round-trip fixtures; cross-scope dependency, stale-preview, tampering and identity ambiguity tests |
| 4. Deploy UI | Approved v0.9 visual layouts, Occupancy Settings, inline teacher matching, publication/recovery states, reference-only catalogue displays | Source-linked visual baselines; desktop and narrow viewport evidence; preserved scroll, keyboard and table behaviour |
| 5. Workload computation | Versioned Wi model and inputs; separate teaching-target and workload offload; 4/5+BT legacy OF=.20 fixture; quality classifications | Deterministic calculation fixtures, incomplete-input handling, cap and precedence tests; never present estimates as verified |
| 6. Roster contract | Revision-aware verified workload envelope, adoption and decision-time authority check, D04 SAFE, separate Ri ownership | Older-delivery rejection, partial verification, pointer races, delayed delivery and safe fallback tests |
| 7. Integrated acceptance | End-to-end recovery, publication/delivery history, UAT and independent review | Exact-head CI, reviewer findings disposition, UAT outcomes, rollback/recovery demonstration and explicit owner cutover approval |

**Sequence dependency:** phase 1 contracts precede phase 2 authoritative writes; phase 2 durable semantics precede phase 3 import commits and phase 6 adoption. Work on independent UI presentation may be parallelised only if it does not bypass an unfinished authoritative contract. Phase numbering is an acceptance order, not a requirement for one large branch or one PR per entire phase.

## IN02 — Separate-D1 consistency and service binding constraints

1. Keep separate authoritative D1 databases per owner domain and prefer Cloudflare Service Bindings for trusted service-to-service calls. Service Bindings are transport, **not** cross-D1 atomic transactions.
2. A Deploy publication transaction is atomic only within Deploy's D1: compare-and-swap expected saved revision and in-force pointer, write immutable metadata, final receipt and durable delivery intents. Verify referenced R2 payload digest before pointer visibility.
3. Core/Contacts facts and current authority are independently checked with revision/as-of evidence. A remote check cannot lock another domain's D1; implementation must explicitly specify the publication and Roster decision linearisation boundary, the revalidation point after waits and the safe behaviour when verification fails.
4. Roster may adopt a verified publication into its own D1, but must reverify current authority at each new workload-dependent decision. No cache-age grace, guessed zero, stale fallback, or implicit distributed transaction. Preserve existing historical decisions and their publication stamps.
5. Require race-condition tests for revocation, supersession, in-flight commit, delayed delivery, stale imports, duplicate retries and concurrent pointer changes before the related phase is accepted.
6. No new infrastructure resources, production bindings, secrets, migrations or deployment are authorised by this specification revision.

## IN03 — Controlled Codex handoff, not build permission

- Prepare small, reviewable tasks and PR boundaries around the contracts, not broad UI rewrites. One task/PR should have one clear ownership boundary, dependencies, negative tests, exact-head CI and reviewer evidence.
- When and only when the owner separately authorises coding, the builder must first read `AGENTS.md` and current coordination documents, refresh current main, claim the task under repository workflow, then follow the existing reviewer/merge process. This document itself grants no permission to claim, branch, edit, commit, create PRs, merge or deploy.
- Keep v0.9.9* production independent until an explicit owner-authorised cutover. Never use production data for unapproved rehearsals.
- A passing CI run does not authorise merge or deployment. A reviewed PR does not imply UAT passed. Each acceptance gate needs evidence and owner-controlled promotion.
- Any discovered incompatibility with Revision 47 must be documented as a proposed specification amendment before code relies on a new rule. Do not silently reopen approved owner decisions.

## Readiness and unresolved verification

**Design baseline:** Revision 48 (Rev47 contracts plus IN01–IN03). **Readiness:** conditionally ready for implementation planning only. Exact field types and transport schemas must be demonstrated against source during design; cross-D1 consistency must be validated with concurrency tests; approved screenshots and new interaction states must be linked to acceptance evidence. No v1 implementation or runtime UAT is claimed.

---

# Revision 49 — Deploy Review 1O: Tranche 1 planning boundary (11 November 2026)

**Owner decisions:** T101 APPROVE, T102 APPROVE, T103 PLAN ONLY. This is a planning-only amendment to Revision 48. It does **not** authorise Codex, a task claim, repository edits, branches, commits, PRs, merges, infrastructure provisioning, deployment, migration, or production changes. All UAT remains **Not tested**.

## T101 — Bounded Tranche 1

Tranche 1 is limited to four independently reviewable contract packages, in dependency order:

1. **T1A — Core current authority:** server-side read/edit/publish capability resolution and school scope, including revoked/future memberships, SMC-and-EO eligibility, Global Admin, impersonation read-only and denial on unavailable current authority. No client-trusted privilege.
2. **T1B — Contacts accepted facts:** versioned read contract for permanent Staff ID, accepted effective-dated facts, field/group revision, catalogue ownership, as-of evidence, and absence/staleness handling. Pending or future facts cannot masquerade as accepted.
3. **T1C — Nonblocking contributions:** explicit staff-field allowlist, original actor context, expected per-field/dependent-group revision, Contacts-side acceptance and conflict outcomes. Publication does not wait for contribution acceptance. No privilege grants or catalogue mutation via contribution.
4. **T1D — Trusted service contracts:** Cloudflare Service Binding request/response schema, service identity and school scoping, version negotiation, bounded timeouts, safe unavailable-service outcomes, retry/idempotency and failure isolation. Bindings are not cross-D1 transactions.

**Excluded from Tranche 1:** Deploy UI changes, Excel implementation, Deploy authoritative publication, Roster integration, workload calculation implementation, migration, production authentication changes, or any new infrastructure. Technical design documents may describe future contracts without implementing them.

## T102 — Isolation and compatibility

All planned v1 work must coexist with the operational v0.9.9* suite, without touching its deployed code, auth, domains, production data or current users. The intended v1 service contracts and separate domain-owned D1 are design constraints, **not** approval to create resources. No v0.9.9* data migration or production cutover is part of Tranche 1.

## T103 — Explicit authorisation gates

**Current state: PLAN ONLY.** Preparing a Codex task description, PR decomposition, test matrix or reviewer checklist does not grant execution permission. After a separate owner authorisation naming the exact package (initially T1A), the builder must refresh the repository, read AGENTS.md and current coordination instructions, verify lane availability, claim according to workflow, and limit the diff to the authorised package. CI, independent review, merge, deployment and cutover remain separate gates. No UAT status changes without executed evidence.

## Tranche 1 acceptance design (not executed)

| Package | Required planned negative evidence | Stop condition |
|---|---|---|
| T1A | Revoked/future authority; SMC without EO; non-SMC; read-only impersonation; school mismatch; missing authority | Any unauthorised mutation or stale privilege acceptance |
| T1B | Future/pending facts; missing Staff ID; stale/mismatched revision; invalid as-of; Contacts unavailable | Treating unknown or unaccepted facts as authoritative |
| T1C | Delayed acceptance after revocation; dependent-field conflict; duplicate retry; catalogue/permission tampering | Privilege escalation, partial cross-group acceptance or synchronous publication dependency |
| T1D | Version mismatch; service unavailable; wrong school; retry duplication; transport timeout | Unsafe fallback, cross-school leakage or invented distributed atomicity |

**Next gate:** review the exact T1A task specification and acceptance evidence, then request a *separate* owner decision whether to authorise T1A. No code execution is implied by this revision.
