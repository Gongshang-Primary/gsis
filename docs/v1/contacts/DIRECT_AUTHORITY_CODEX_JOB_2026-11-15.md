# Codex job: authoritative Contacts editing without catalogue setup

Date: 15 November 2026, Asia/Singapore.
Status: owner-requested implementation handoff; this publication changes documentation only.
Coordinator: ChatGPT v1. Builder: Codex. Independent exact-head reviewer: Claude.
Repository: helper-gsps/gsis.
Inspected main: 26bbccd229962700409bb6e9c80b1e9bec170d20.
Suggested implementation branch: codex/v1-contacts-direct-authority.

## Owner intent

Owner: “compare repos, write up a codex job that renders Global Admin and Power users edit into contacts-viewport as authoritative, remove this catalogue thingy”.

Make the Contacts viewport the single editor for authoritative staff facts. A Global Admin or a Contacts Power User can independently add and edit Contacts-owned information. Remove the generic catalogue/classification workflow and the requirement to create or choose catalogue IDs, catalogue kinds, codes or revisions before saving a person.

“Power User” here means Contacts-scoped Power User (contacts.manage), not a Power User from another module. Application grants remain Core-owned. This task does not grant every module Power User access to staff data.

This supersedes the generic catalogue prerequisite for staff editing. It does not remove input validation, explicit authority acceptance, stable Staff IDs, field history, concurrency checks or recovery.

Do not implement merely by hiding the catalogue panel or seeding enough catalogue rows to make the current screen work. Remove the runtime dependency from ordinary Contacts writes and current staff reads. Historical compatibility may retain a bounded reader for old reference-shaped data.

## What comparison actually established

Both generations are in the SAME repository, not two repositories. v0.9 source lives in contacts-update/public and backend; v1 uses v1/services, v1/contacts, v1/web/shared and a build adapter that reuses the legacy viewport. The inspected commit is current main at review time, not independent proof of the deployed Worker/assets revision.

| Concern | v0.9 source | v1 source at inspected head |
| --- | --- | --- |
| Role and dropdown definitions | roles and sys_fields tables; Deploy publishes membership/options into Contacts | Contacts-owned revisioned definitions with catalogueId/revision/code references |
| Direct staff editing | Admin writes through Edit Info; KP can view | Backend already permits admin or contacts.manage; build adapter exposes ContactsPowerUser |
| Validation | Dropdown choices, alias/mobile/date/uniqueness checks; prior out-of-list values retained | Nonempty Role, appointment and modifier values must resolve to exactly one active catalogue entry |
| Startup | Existing tables/options are used; built-in date and Active options | Staff endpoint returns lists: {}; generic definition screen must supply references |
| Authority | Legacy role/group mappings and separate application access table | Explicit accepted SMC, EO and School Leader records, independent of display roles |
| Failure observed in UAT | No comparative write attempted | First populated staff row rejected with “Select a current unambiguous catalogue value”; retry remained locked/unconfirmed |

Therefore “v0.9 has no catalogue” is not technically correct. It has hidden lookup tables and publication machinery. The new obstacle is v1 exposing a generic reference-management system as a prerequisite for normal staff editing.

## Evidence and exact source locations

All paths below are relative to the inspected commit:
https://github.com/helper-gsps/gsis/tree/26bbccd229962700409bb6e9c80b1e9bec170d20

1. backend/Contacts_Code_with_Deploy_API.gs:411–423: Admin-only writes versus Admin/KP read, grid lists and derived columns.
2. Same file:494–503: legacy TTb and EO appointment derivation.
3. Same file:574–615: validated fields, stored/fallback choices, validation and administrative tables.
4. backend/Contacts_Catalogue.gs:6: applyDeployCatalogues_ writes roles/sys_fields, journals and revision-checks publication.
5. contacts-update/public/app.js:260–280: dataRequest retained and grid locked when failure is not marked draftEditable.
6. v1/services/contacts/grid.mjs:115–159: toValue catalogue lookup and CATALOGUE_SELECTION_REQUIRED rejection.
7. Same file:163–207: admin/contacts.manage accepted; prepareOperation occurs before later field conversion and validation.
8. Same file:460–480: save receipt exposes unknown/prepared/committed states.
9. v1/services/contacts/service.mjs:934–950: manager access is returned but field-choice lists are empty.
10. v1/web/shared/contacts-catalogues.js:5: separate classifications/definition UI; IDs, kinds, codes, revisions and role flags.
11. v1/services/contacts/catalogues.mjs: validateAssignments, deriveDisplay and saveCatalogue: references affect staff validity, TTb derivation, snapshots and source pins.
12. v1/contacts/contracts.mjs: GROUPS/FIELDS/reference/validateFields: references are embedded in read contracts, so deleting the UI alone cannot solve this.
13. scripts/v1/build-web.mjs: updateContacts already maps ContactsPowerUser into legacy controls; updateDeploy blocks catalogue ownership in Deploy.
14. v1/web/shared/client.js:467–526: capability projection and computed-column defaults; contacts-catalogues.js also changes grid behaviour. Inspect final built output, not just one source file.
15. v1/web/shared/contacts-authority.js: explicit independent Admin/Contacts Power User acceptance and no self-acceptance.
16. Open PR136, head 0081eea4e8924691818b68d18c5d53d6927985fa, records the owner's independent Admin/Contacts Power User decision. It is branch evidence, not merged documentation. Reconcile it without silently overwriting its history.

UAT on 15 November: source directory had 182 records; sink initially zero. A single new staff row with Role P failed, then one same-operation retry remained unconfirmed. No confirmed staff creation. No direct database inspection establishes whether a durable prepared operation remains; investigate before clearing anything. Do not include real contact details in fixtures or public reports.

## Required behaviour

### 1. One authoritative Contacts editor

Keep the familiar Contacts directory and Edit Info grid. Put staff details, appointments, employment, school section and modifiers in that workflow. Remove the separate “Staff classifications and controlled catalogues” and “Maintain catalogue definitions” panels and their user-facing technical concepts.

Provide direct editing for Basic Name, Statutory Name, mobile, extension, aliases, birthday, employment active/status/arrangement, personnel category, school section, Role, Appointment Status, EO Appointment Level, memberships and employment/subject/MK modifiers. Preserve blank/unknown where allowed. A minimal named provisional contact can be saved before its optional details or authority review are complete.

TTb Name stays a server-derived display field with immediate preview. Preserve ordered, deduplicated modifiers and existing supported suffix semantics. Role labels must not manufacture SMC, EO or School Leader authority. EO Appointment Level is an explicit editable staff fact; it must not be substituted with EO yes/no or inferred from Role.

Use field-specific controls rather than generic catalogue management. Fixed structural values use built-in choices. Role, appointment and operational labels can use simple editable choices or suggested existing values, with bounded validated input. Adding a legitimate new label from the field must succeed in the same save without external setup. Do not recreate the same prerequisite under “dictionary” or “classification”.

Retain existing domain rules, including required subject-tag behaviour for specialist roles where approved; express them as tested domain rules, not operator-created catalogue dependencies. Unknown labels must never silently acquire workload, eligibility or access semantics.

### 2. Permissions and acceptance

Apply identical server-enforced management rights to Global Admin and Contacts Power User across create, edit, validation, import, receipt lookup and recovery. Another module's Power User and ordinary staff cannot perform management writes. Preserve current limited self-service and read-only impersonation.

SMC, EO and School Leader remain explicit reviewed records within the same Contacts viewport. Either authorised manager may independently accept another person's records. Do not add a second approver or Admin notification. Preserve no self-acceptance by permanent Staff ID including aliases, MKE+SMC rejection, proposer/accepter/time/operation audit, effective dates and missing-versus-false distinctions.

Do not infer those facts from P, HOD, school section, memberships, modifiers or display text. Missing authority can block authority-dependent actions without preventing a provisional contact from being saved. Preserve active-staff readiness and reactivation rules. Core continues to own login identity and Global Admin/module Power User grants.

### 3. Direct storage and compatibility

Contacts D1 remains the sole writer for staff master facts. Introduce a simple versioned direct-field representation with field/staff revisions. Current writes must not require contacts_catalogues records or catalogue reference selection.

Inventory every reader of reference-shaped staff values before changing the contract: Contacts contract library, snapshots/history, Core authority adapters, Deploy projections, Roster eligibility/capacity, LORD recipients, Calendar birthdays and relevant Layout/Venues projections. Update affected consumers atomically at the software-contract level or provide an explicit compatible version boundary.

Retain old immutable snapshots and audit evidence. Supply a bounded, idempotent conversion for existing current/future values, resolving each old reference using its pinned definition. Preserve Staff IDs, labels, explicit authority, effective intervals and provenance. Ambiguous/missing references produce a repair report, never guessed values, dropped facts or a whole-school wipe. Preserve retired values already assigned. No live conversion in this coding job without separate migration authorisation.

Remove obsolete generic current-write endpoints and unused UI/bundle code once callers are migrated. Keep only justified historical readers; document their scope. Do not drop historical tables blindly.

Deploy consumes Contacts facts and does not publish over them. Planning proposals remain proposals until resolved in Contacts. Retain Deploy-owned planning, workload and relief-policy data. Do not remove unrelated venue/resource/subject catalogues just because they share the word.

### 4. Fix save and recovery semantics

Reproduce the clean-install failure through the built viewport and actual service handler using a synthetic person and Role P.

Distinguish deterministic rejected/not-committed operations from genuine uncertainty. Validate before preparing an operation when possible. If an operation is already prepared, terminalise/fence it safely before permitting a corrected payload/new operation ID. Do not equate every 409 with safe-to-edit.

A proven validation rejection shows the field-specific error, retains draft values and allows correction. It must not loop into “operation could not be confirmed”. A genuinely uncertain save retains its original identity and payload, exposes a visible operation reference and uses the existing recovery path. Commit confirmation is required before “Saved”.

Handle pending saves created by the old catalogue path. Do not clear local state, abandon prepared requests or create duplicate staff blindly. Recovery must prove committed or terminal-not-committed under existing admission/source guards.

Preserve optimistic concurrency, atomic writes/audit/receipt, school isolation, authorisation freshness and idempotency. An accepted/pending receipt is not a saved record.

### 5. Grid and Excel parity

The grid and Contacts-owned import use the same permissions, field validators and writer. Preserve Export All/Visible, import preview, conflict handling and stable Staff IDs. Derived TTb remains protected.

Return useful per-field editability and validation metadata from the server; eliminate conflicting computed-field overrides between client.js, the catalogue extension and generated legacy code.

Keep current bounded batch limits explicit in the UI. Do not require operators to discover the 64-cell/16-staff service limits through a locked save. Full legacy-sheet onboarding/import expansion is not a prerequisite for this job; manual creation must work immediately and supported imports must round-trip the newly direct fields.

## Implementation scope and workflow

Before implementation, refresh main and active claims/PRs, including PR136, PR137 accelerated specifications, PR144 deployment records and PR157 reviewer policy. Read root AGENTS.md, docs/v1/AGENTS.md and current coordination files. Record the new base; this comparison is not permission to overwrite concurrent work.

Claim one bounded v1 Contacts task using the existing process. This handoff is not an implementation claim and does not reassign an occupied Codex lane. Do not edit v0.9 production sources merely to change v1; use the v1 adapter or extract a suitably isolated v1 editor if needed.

Expected primary scope: v1/services/contacts/, v1/contacts/, v1/web/shared/contacts-*.js and CSS, relevant client.js and scripts/v1/build-web.mjs changes, Contacts D1 migrations, affected projection adapters, focused tests and docs/v1/contacts/. Record exact additional consumer paths after dependency inventory. Avoid unrelated shared-framework rewrites.

Deliver one coherent implementation PR, with migrations prepared but not executed live. No merge, deploy, credential changes, notifications, reset, production data writes or UAT cloning is authorised by this documentation task. Publish exact tested head and ask Claude to review through the normal owner handoff.

## Acceptance scenarios

1. Fresh empty Contacts storage with no catalogue definitions: both a Global Admin and a Contacts Power User can create a named provisional person with Role P, then edit its details and reload the saved result.
2. Populate supported appointment/employment/modifier fields; save and round-trip without catalogue setup, IDs or revisions anywhere in the user flow.
3. New bounded role/modifier labels work through the field; invalid dates/mobile/aliases and duplicates produce editable field errors, not false uncertainty.
4. TTb derivation preserves tag order/deduplication; explicit EO Appointment Level persists; Role P/HOD never creates SMC/EO/School Leader acceptance.
5. Independent manager acceptance works; self/alias acceptance, impersonation, wrong-school and non-Contacts Power User writes fail server-side.
6. Existing mixed old-reference/direct-format data converts idempotently; historic snapshots remain byte/semantically unchanged; unresolved mappings are reported without data loss.
7. Two managers edit concurrently: stale same-field writes conflict without lost data; supported nonconflicting edits behave as documented.
8. Known precommit validation failure leaves an editable retained draft. Failure after prepare is terminalised or retained for recovery according to durable evidence.
9. Lost response after commit, duplicate retry, stale retry and reload recovery yield one person and one intended effect, with visible original operation ID.
10. Contacts projections and relevant Core/Deploy/Roster/LORD/Calendar consumers retain authority, eligibility and privacy semantics after the direct-field change.
11. Supported Excel export/import retains direct values, permissions, conflict preview and bounds. No import grants authority implicitly.
12. Built v1 Contacts viewport works on desktop and narrow viewport with keyboard access; no legacy catalogue script or obsolete field override remains active. v0.9 build behaviour is unchanged.

Run meaningful service/storage integration and actual built-browser regression tests, then repository-required build/Node/LORD suites and exact-head CI under TZ=Asia/Singapore. Report unrun checks as pending. Synthetic fixtures only; no real messages or live school-data tests.

## Handoff and evidence status

This job is based on read-only repository inspection plus the earlier frontend UAT observations. No implementation, migration, runtime test or fix is claimed. The precise deployed revision and database operation outcome were not independently verified.

The acceptance bar is a clean-install, full staff-row save through the real frontend without catalogue setup, under both authorised roles, followed by reload and downstream contract checks. Seeding catalogues, adding a tooltip, hiding the panel, or passing mocked UI tests alone does not meet the request.

Skill-policy principles applied: ownership/blast-radius analysis, simplify unnecessary layers, distinguish validation from uncertain writes, evidence-based acceptance. No code skill execution or independent review is claimed.
