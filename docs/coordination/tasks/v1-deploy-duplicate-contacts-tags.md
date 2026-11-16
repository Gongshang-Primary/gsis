# v1 Duplicate version: all eleven Contacts tag fields

Model: Codex. Status: implemented; verification/CI and review pending. Coordinator: ChatGPT v1. Builder: Codex. Reviewer: Muse at the exact head, under the owner directive on `claude/zealous-archimedes-4i2lv1` at `12b06eb43cb0a6f1a6eca7c787b22100c6a57875`. Branch: `codex/v1-deploy-duplicate-contacts-tags`. Base: main `963ea2dcbd0388286ad4240b58bb6142e761c02f`. Accepted scope amendment: `38aa1332a847bf6c052fb37c3f58ba0c5fd1d7e9`. Updated: 16 November 2026.

Authority: owner 16 November work order 3(f), first Contacts lifecycle claim only. Read `docs/v1/contacts/CONTACTS_LIFECYCLE_DESIGN.md` and `docs/coordination/review/v1-contacts-lifecycle-and-pr184-r2-claude-review.md` owner answers on main `ccab5f7`. Duplication refreshes Contacts-backed teachers from current Contacts and retains the selected planning assignments and draft-only stable identities. This claim addresses the eleven-field copy, not the entire lifecycle.

## Exact file scope

1. `docs/coordination/tasks/v1-deploy-duplicate-contacts-tags.md`
2. `docs/v1/contacts/DUPLICATE_TAG_REFRESH_HANDOFF.md`
3. `v1/services/contacts/service.mjs`
4. `v1/services/deploy/model.mjs`
5. `tests/v1-product-deploy-duplicate-contacts.mjs`
6. `tests/v1-product-contacts-projection.mjs`

Main, all remote heads and open PRs #182/#185–#188 were refreshed. Those PR files, the completed venue-demand claim and this scope are disjoint. This branch starts from its accepted main claim, never another unreviewed product branch. The earlier jobs are implemented and awaiting CI/review; no additional chained implementation base is introduced.

## Proven gap and bounded implementation

Read-only synthetic reproduction at main `30559ad`: create a version, explicitly update all eleven Contacts tag fields through its real Worker, then duplicate through Deploy's real Worker and inspect the actual saved D1 version. Employment Status and Personnel Category are absent. Memberships survives only as a derived group list; Employment Arrangement is combined with Employment Modifier in a legacy display field. The copied version has no complete, lossless eleven-field representation.

Extend the existing Contacts deployment projection with its two omitted ordinary fields. Store the eleven typed values distinctly in each refreshed teacher's `deploymentTags` snapshot; accepted explicit null/empty values remain distinguishable from an absent/unavailable field by property presence and the existing revision evidence. Keep the current legacy profile as a derived calculation/display projection, including its combined employment display, so this fix does not change R/budget calculations or v0.9 code. No competing editable master is introduced by that compatibility view.

Creation/Duplicate already invokes the common Contacts projection mapper. Keep its current capability, school, effective-authority and immutable operation/retry checks. Preserve stable IDs, assignments, Deploy-only notes and draft-only teacher values. Do not rewrite the source version or turn an unchanged copy into a Contacts edit.

Explicitly deferred: automatic publication reconciliation, namespace reservation, new-person creation, timestamp precedence, independent TTb derivation, all category exclusions and the later C18 freeze of version-owned people across load/save/recalculation/export. Existing automatic refresh behavior outside Duplicate is not represented as solved. No change to security acceptance, allocation or publication policy.

## Evidence and handoff

Actual built Deploy browser plus real local Workers/D1: first fail on missing tag snapshot; update all eleven fields, invoke Duplicate, verify exact stored values and stable IDs, assignments/notes/source-version preservation, inactive and partial records, explicit clears versus missing values, exact retry/changed intent, school/capability denial and restart replay. Check legacy employment/R calculation compatibility through existing regressions. Synthetic data only; no hosted reads/writes or provider operations.

Run canonical build, focused and existing Core/Contacts/Deploy regressions, runner discovery and required exact-head Node/LORD plus PR product CI. Record omissions honestly, visible changes and each quality gate in this record/PR. One bounded PR; Muse exact-head review before merge. No deployment, migration, Google activation or live UAT. F5 OPEN; official T1B-01/T1B-02 and hosted/runtime UAT Not tested.

## Verification-driven scope clarification, before editing the existing test

The existing Contacts projection test asserts its exact public field allowlist. The authorised two-field extension requires updating that expectation, while retaining every privacy and authority assertion. Add only that existing test as the sixth path; it has no overlapping open PR owner. This does not expand the eleven-field product behavior.

The real owner clear writer represents an explicit optional null as a `superseded` row with an operation/revision and interval, not an accepted null record. Preserve that narrowly identified ordinary-field clear in the deployment projection and typed snapshot. Do not relabel it as accepted authority or treat generic missing/superseded/out-of-interval evidence as a clear. Tests must distinguish a current explicit clear from a never-set field.

## Verification checkpoint

- Q01: the six claimed paths only; no overlap with the other open v1 implementation files. No unsupported-operation probe entry is removed for this data-copy correction.
- Q02: [handoff](../../v1/contacts/DUPLICATE_TAG_REFRESH_HANDOFF.md) records the typed eleven-field snapshot and its derived legacy display, ownership and explicit deferred C18/lifecycle work.
- Q03/Q04: `TZ=Asia/Singapore GSIS_BROWSER_EXECUTABLE=/usr/bin/chromium node tests/v1-product-deploy-duplicate-contacts.mjs` passes through the actual built Duplicate control and real Workers/D1. The new snapshot assertion failed before implementation. Tests now prove eleven fields, inactive/partial records, current clears versus future/expired/unowned clears, unchanged source/Contacts storage, retained assignments/notes/IDs, denied unauthorized/foreign access and full restart receipt recovery. Current/effective field selection, existing authority/capability/school and operation-intent guards are retained; no Contacts write occurs on copy.
- Q05: no dependency, new query per teacher, migration, unbounded collection or build patch. Existing 512-person/page and atomic version-write bounds remain; legacy employment/R input is preserved.
- Q06: the new test and existing Core/Contacts, projection (only two expected field names added), Deploy storage and Roster workload-snapshot regressions pass. `TZ=Asia/Singapore npm run build` completes all 18 components without generated drift. Discovery: 108 product / 1209 Node programs, including the new test. Syntax, whitespace, six-file scope and three relative links pass. Full product and required exact-head Node/LORD plus PR CI remain pending; final results belong in the PR.
- Q07: Muse exact-head review pending. The existing Duplicate control remains; no new layout or control.
- Q08: no deployment, Google activation, live-data access or provider operation. F5 OPEN; official T1B-01/T1B-02 and hosted/runtime UAT Not tested.
