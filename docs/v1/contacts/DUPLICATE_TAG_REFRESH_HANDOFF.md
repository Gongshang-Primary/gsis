# Duplicate version: complete Contacts tag copy

Model: Codex. Branch: `codex/v1-deploy-duplicate-contacts-tags`. Accepted claim/base: `38aa1332a847bf6c052fb37c3f58ba0c5fd1d7e9`, amending initial claim `47bf16af376c34fdff69d696f15f21ea34ba61c9`. Reviewer: Muse at the exact PR head, under the owner role decision on `claude/zealous-archimedes-4i2lv1` at `12b06eb43cb0a6f1a6eca7c787b22100c6a57875`.

This implements the first eleven-field copy under the [Contacts lifecycle design](CONTACTS_LIFECYCLE_DESIGN.md) and its [owner-reviewed responses](../../coordination/review/v1-contacts-lifecycle-and-pr184-r2-claude-review.md). It is a subset of C17, not completion of the entire Contacts lifecycle.

## Behavior and ownership

The existing create/Duplicate operation already reads the current Contacts projection and preserves the selected version's planning data. The previous projection omitted Employment Status and Personnel Category; the version also lacked a lossless representation of all eleven tag fields. A real local Worker/D1 reproduction demonstrated those omissions before editing.

Contacts now supplies the two missing ordinary fields under the same bounded, revision-checked deployment projection. Deploy retains the complete typed inputs on each refreshed teacher as `deploymentTags`:

| Version field | Contacts field | Type |
| --- | --- | --- |
| Employment Modifier | employmentTags | ordered string list |
| Subject Modifier | subjectTags | ordered string list |
| MK Modifier | mkTags | ordered string list |
| Role | role | string |
| EO Appt Level | eoAppointmentLevel | string |
| Appointment Status | appointmentStatus | string |
| Memberships | memberships | ordered string list |
| Employment Arrangement | employmentArrangement | string |
| Employment Status | employmentStatus | string |
| School Section | schoolSection | string |
| Personnel Category | personnelCategory | string |

Current accepted/effective values are copied. Empty lists remain empty lists. The existing ordinary-field writer records an explicit null clear as `superseded`; the deployment projector now marks that case `cleared:true` only when its stored null, revision, operation, unrevoked state and interval prove a current owner-written clear. It remains `effective:false`, never accepted authority. Deploy copies that marked clear as a present null property. Missing, other nonaccepted, revoked, future or expired evidence remains absent; copying never manufactures a clear from that absence. Existing field revisions and the Contacts projection reference accompany the teacher. Historical catalogue references retain the existing projection validation; the new snapshot does not claim to solve F5 evidence retention.

The legacy `profile` remains a derived text projection used by the current screens and calculations. In particular, its Employment Modifier display still combines arrangement and tags. The typed snapshot keeps those inputs separate so a later lifecycle implementation need not reverse-parse that display. The compatibility view is not another editable authoritative record. Existing R/budget calculation inputs, accepted authority checks and teaching eligibility are unchanged.

Duplicate preserves stable IDs, inactive teachers, planning assignments, Deploy-only notes and draft-only teacher values. The latter retain the existing missing-Contacts/eligibility indication; this package does not invent authority evidence for them. The source version and Contacts are not written by duplication. An exact retry returns the same created version, including after restart.

## Boundaries

The common mapper is also used by current load/save/recalculation paths. This package does **not** implement C18's later freeze of version-owned teacher data; current automatic refresh behavior remains. Do not describe an existing draft as permanently insulated from subsequent Contacts updates yet.

Also deferred: the complete category-exclusion rules, new-person namespace reservation, Basic Name edit timestamps/precedence, independent TTb derivation, publication's eleven-field overwrite/clear transaction, active reconciliation, Roster mobile writes and generic lifecycle recovery. No new field editor or authority shortcut is introduced. Memberships and EO/security acceptance still follow the existing contracts.

Visible changes: the same Duplicate control now saves the complete eleven-field data; no new screen, label or control layout. No new build text patch, dependency, migration or v0.9 change.

## Verification and release gates

`tests/v1-product-deploy-duplicate-contacts.mjs` drives the actual built Duplicate button, prompt and current-version selection through all nine local Workers and D1. Its snapshot assertion first failed on main. It covers all eleven current values, separate arrangement/modifiers, unchanged legacy calculation input, inactive/partial people, explicit clears versus missing data, retained assignments/notes/draft-only IDs, unchanged source and Contacts records, exact retry/changed intent, unauthorized and foreign-school attempts, plus restart/lost-response recovery without another version. Existing planning rows used as fixtures are synthetic local D1 data; no hosted state or provider response is used.

The Core/Contacts, Contacts projection, Deploy storage and Roster workload-snapshot regressions check compatibility. The existing projection test changes only its expected public field list to include the two authorised fields; privacy and authority checks remain unchanged. Canonical build, runner discovery, exact six-file scope, links, whitespace, full product and exact-head Node/LORD CI are recorded in the task/PR; unfinished checks remain pending.

Muse's exact-head review is required. No deployment, migration, live read/write or provider operation occurred. F5 **OPEN**. Official T1B-01/T1B-02 and hosted/runtime UAT **Not tested**. Synthetic Worker/D1 evidence is not hosted UAT.
