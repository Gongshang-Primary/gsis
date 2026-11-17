# Review: PR #198 — Restore Deploy HR Terms and linked teacher choices

- Reviewer: Muse (owner, 16 Nov: Muse replaces Claude for v1 exact-head review until Claude returns; source `claude/zealous-archimedes-4i2lv1` at `12b06eb`).
- Verdict: **APPROVED at the exact head**.
- Exact head: `ae849721c87717068a6c0acb0c531555a4c5b084`.
- Base / accepted claim: `490820d4b15544a7a461659bb0304b5c2eaca63d` (published scope clarification following claim `bd8c001`).
- CI run: [43987740909](https://github.com/helper-gsps/gsis/actions/runs/43987740909), green, all 5 jobs (4 regression shards + full-suite), at the exact head. Product/package CI [43987741188](https://github.com/helper-gsps/gsis/actions/runs/43987741188) success at the exact head (122 product programs; the duplicate PR-triggered product run 43989627375 was still in progress when this record was written and is not needed for the verdict).
- PR: https://github.com/helper-gsps/gsis/pull/198 (Codex, branch `codex/v1-deploy-internal-links`).
- Task record: `docs/coordination/tasks/v1-deploy-internal-links.md` (in the PR; reviewer line already names Muse).

## What it does

A saved Membership matrix could contain roles while Teachers → Add teacher offered only a blank Role choice, and HR Terms displayed a Contacts facts report instead of editing the selected planning version's choice lists. This change restores the internal links using the v0.9 workflow: configure roles/choices, use them in Teachers and related controls, then save/reload the selected version. Membership Role Shortform supplies Teachers' Role choices even before any teachers exist, and feeds the derived HR Terms Role display and Offload choices. HR Terms shows Field / Choices, with five editable lists and protected date/month/Active/Role definitions; configured choices survive refreshes and remain independent between versions; explicit empty lists stay empty. Existing and newly opened teacher editors show the selected role's mapped appointment grade; Membership offers grade suggestions from HR Terms; custom memberships and out-of-list staff values are retained. Canonical HR Terms Excel download/preview/import uses the version catalogue rather than staff-facts rows. Native and workbook saves keep identity, capability, school, revision, lease and operation checks.

## Checks run (local worktree at the exact head, TZ=Asia/Singapore, Playwright chromium-1234)

- `npm ci` (repo root and `v1/`): exit 0.
- New test `tests/v1-product-deploy-internal-links.mjs`: exit 0. "PASS real Worker/D1 internal catalogue links: empty-school roles, save/reload, explicit clears, independent versions, canonical import, stale/changed-intent/fixed/foreign rejection".
- New browser test `tests/v1-product-deploy-internal-links-browser.mjs`: exit 0. "PASS built browser/Worker/D1 links: empty-school Role choices, role-grade preview, HR choices save/reload and all existing Teachers selectors".
- Named regressions, all exit 0: `v1-product-deploy-role-memberships`, `v1-product-deploy-role-memberships-browser`, `v1-product-authority-publication`, `v1-product-contacts-projection-browser`, `v1-product-deploy-workbooks`.
- `npm run build`: exit 0, no generated drift (`git status` clean after build).
- `node scripts/v1/build.mjs`: exit 0.
- `node scripts/v1/verify-build.mjs`: exit 0. "PASS real Wrangler LOCAL upgrade from deployed 0001: additive migrations applied once, all five upgrade tables present; no cloud credentials or operations".
- Merge-tree against current main: clean, no conflicts.
- Scope: the diff against the base is exactly the 13 claimed allowlist paths, 446 insertions / 39 deletions. `git diff --check` clean.
- Secrets scan of the diff: none.
- Read the new module `v1/services/deploy/catalogue-links.mjs` in full and the diffs of `v1/services/deploy/model.mjs`, `v1/services/deploy/service.mjs`, `v1/services/deploy/workbooks.mjs`, `v1/web/shared/deploy-ui.js` and `v1/web/shared/deploy-publication.js`. The resolver is version-owned: Role comes from that version's explicit Membership matrix (empty-school included), five editable lists persist separately from observed Contacts facts, fixed date/month/Active lists and derived Role stay protected, and EO yes/no stays separate from grade. `setHRChoices` requires an expected-value revision check; Role is display-only when derived from the matrix. The legacy fallback fix is the guarded alias in `applyCatalogueLinks`/`linkChoices`: the `masterOptions` alias is created only for explicitly configured HR/role data or an already configured legacy version, so reading an unconfigured version no longer freezes an early incomplete Contacts list — the regression found at `1f78c52` and corrected at this head. Workbook HR Terms import requires exactly the nine fields, stores only the five editable lists, and checks imported teacher grades against the proposed Role's exact mapping. `setTeacherField` now counts as an explicit-staff trigger, fixing Contacts-only single-field saves that previously resolved as Unknown staff. The HR Terms reference-only rejection and export-only table registration are removed; no new `build-web.mjs` text patch and no Contacts writer were added.
- Read the contract doc `docs/v1/contacts/DEPLOY_INTERNAL_LINKS.md`: this fixes internal Deploy links only; it does not implement the separate external Contacts catalogue overwrite portion of v0.9 or add editors/writers for every lifecycle field. Draft choices/grades do not grant current SMC/EO/School Leader or Global Admin permissions; accepted Contacts authority and workload eligibility retain their existing contracts; the explicit Membership publication path is unchanged.

## Findings

None. No findings.

## Gates (Q01–Q08)

- Q01 Authority and scope: pass. Owner authorised fixes after the investigation-only stage; exact 13-path allowlist only.
- Q02 Design and ownership: pass. One version-owned catalogue resolver; Deploy owns choice definitions, Contacts owns accepted facts; no inferred authority.
- Q03 Security and privacy: pass. No auth change; no authority or Global Admin grant from draft choices; identity, capability, school, revision, lease and operation checks retained on all saves.
- Q04 Concurrency and recovery: pass. Expected-value revision checks on HR and role edits; version/Duplicate isolation; explicit empty vs absent preserved.
- Q05 Resources and maintainability: pass. 150-choice / 300-role bounds; no new dependency; no migration.
- Q06 Verification: pass. Both new tests and all five named regressions pass locally; exact-head Node/LORD CI and product/package CI green.
- Q07 Handoff and review: pass. This record; PR names the reviewer; no merge or deployment requested.
- Q08 Release boundary: not applicable. No deployment, migration, live data, credentials or provider activation. Changed deploy components: Deploy Worker and web assets only. Rollback must preserve saved version HR choice data; an older UI would not expose its editor. F5 OPEN; T1B-01/T1B-02 and hosted/runtime UAT Not tested.

## Release notes

HR Terms is now a Field/Choices editor for the selected planning version; Role choices reflect that version's Membership matrix before publication; teacher editors show the mapped appointment grade immediately; Membership grade inputs suggest the version's configured grades. Saving choices does not change Contacts catalogues.
