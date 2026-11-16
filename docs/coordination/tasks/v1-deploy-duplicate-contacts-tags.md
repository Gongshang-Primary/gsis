# v1 Duplicate version: all eleven Contacts tag fields

Model: Codex. Status: claimed. Coordinator: ChatGPT v1. Builder: Codex. Reviewer: Muse at the exact head, under the owner directive on `claude/zealous-archimedes-4i2lv1` at `12b06eb43cb0a6f1a6eca7c787b22100c6a57875`. Branch: `codex/v1-deploy-duplicate-contacts-tags`. Base: main `963ea2dcbd0388286ad4240b58bb6142e761c02f`. Updated: 16 November 2026.

Authority: owner 16 November work order 3(f), first Contacts lifecycle claim only. Read `docs/v1/contacts/CONTACTS_LIFECYCLE_DESIGN.md` and `docs/coordination/review/v1-contacts-lifecycle-and-pr184-r2-claude-review.md` owner answers on main `ccab5f7`. Duplication refreshes Contacts-backed teachers from current Contacts and retains the selected planning assignments and draft-only stable identities. This claim addresses the eleven-field copy, not the entire lifecycle.

## Exact file scope

1. `docs/coordination/tasks/v1-deploy-duplicate-contacts-tags.md`
2. `docs/v1/contacts/DUPLICATE_TAG_REFRESH_HANDOFF.md`
3. `v1/services/contacts/service.mjs`
4. `v1/services/deploy/model.mjs`
5. `tests/v1-product-deploy-duplicate-contacts.mjs`

Main, all remote heads and open PRs #182/#185–#188 were refreshed. Those PR files, the completed venue-demand claim and this scope are disjoint. This branch starts from its accepted main claim, never another unreviewed product branch. The earlier jobs are implemented and awaiting CI/review; no additional chained implementation base is introduced.

## Proven gap and bounded implementation

Read-only synthetic reproduction at main `30559ad`: create a version, explicitly update all eleven Contacts tag fields through its real Worker, then duplicate through Deploy's real Worker and inspect the actual saved D1 version. Employment Status and Personnel Category are absent. Memberships survives only as a derived group list; Employment Arrangement is combined with Employment Modifier in a legacy display field. The copied version has no complete, lossless eleven-field representation.

Extend the existing Contacts deployment projection with its two omitted ordinary fields. Store the eleven typed values distinctly in each refreshed teacher's `deploymentTags` snapshot; accepted explicit null/empty values remain distinguishable from an absent/unavailable field by property presence and the existing revision evidence. Keep the current legacy profile as a derived calculation/display projection, including its combined employment display, so this fix does not change R/budget calculations or v0.9 code. No competing editable master is introduced by that compatibility view.

Creation/Duplicate already invokes the common Contacts projection mapper. Keep its current capability, school, effective-authority and immutable operation/retry checks. Preserve stable IDs, assignments, Deploy-only notes and draft-only teacher values. Do not rewrite the source version or turn an unchanged copy into a Contacts edit.

Explicitly deferred: automatic publication reconciliation, namespace reservation, new-person creation, timestamp precedence, independent TTb derivation, all category exclusions and the later C18 freeze of version-owned people across load/save/recalculation/export. Existing automatic refresh behavior outside Duplicate is not represented as solved. No change to security acceptance, allocation or publication policy.

## Evidence and handoff

Actual built Deploy browser plus real local Workers/D1: first fail on missing tag snapshot; update all eleven fields, invoke Duplicate, verify exact stored values and stable IDs, assignments/notes/source-version preservation, inactive and partial records, explicit clears versus missing values, exact retry/changed intent, school/capability denial and restart replay. Check legacy employment/R calculation compatibility through existing regressions. Synthetic data only; no hosted reads/writes or provider operations.

Run canonical build, focused and existing Core/Contacts/Deploy regressions, runner discovery and required exact-head Node/LORD plus PR product CI. Record omissions honestly, visible changes and each quality gate in this record/PR. One bounded PR; Muse exact-head review before merge. No deployment, migration, Google activation or live UAT. F5 OPEN; official T1B-01/T1B-02 and hosted/runtime UAT Not tested.
