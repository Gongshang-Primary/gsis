# Deploy internal catalogue and teacher links

Model: Codex. Coordinator: ChatGPT. Reviewer: Muse at the exact head. Status: claimed. Updated: 17 November 2026, Asia/Singapore. Branch: `codex/v1-deploy-internal-links`. Base: `ecc26a6d69eff5411468daaf5463d83496633cc3`.

Owner authorises “fix and review deploy internal linkages taking reference from v0.9 where necessary”, including the recent HR Terms and Membership-to-Teachers changelogs. This supersedes the preceding no-code instruction for this bounded implementation only. The separate UAT ledger remains on PR197; read it at `753ff61f1e07934bbfe1096d4ee40f13a16c66d9` without merging that branch. No deployment, hosted data editing or Google/Contacts catalogue publication extension in this task.

## Exact allowlist

1. `docs/coordination/tasks/v1-deploy-internal-links.md`
2. `docs/v1/contacts/DEPLOY_INTERNAL_LINKS.md`
3. `v1/services/deploy/catalogue-links.mjs`
4. `v1/services/deploy/model.mjs`
5. `v1/services/deploy/service.mjs`
6. `v1/services/deploy/workbooks.mjs`
7. `v1/web/shared/deploy-ui.js`
8. `tests/v1-product-deploy-internal-links.mjs`
9. `tests/v1-product-deploy-internal-links-browser.mjs`
10. `tests/v1-product-deploy-workbooks.mjs`
11. `tests/v1-product-contacts-projection-browser.mjs`
12. `v1/services/deploy/README.md`
13. `v1/web/shared/deploy-publication.js`

Scope clarification before the dependent edit: the existing canonical import controller explicitly rejects HR Terms and installs an export-only table registration. Remove those two obsolete restrictions for the new version-owned HR Terms contract, retaining ordinary workbook preview, identity/revision checks and confirmation. This exact controller path is necessary for the already claimed Excel acceptance case; no new publication or Contacts effect.

Main, remote heads and open PRs refreshed. PR197 owns its two documentation paths; PR196 owns release records; PR182 is disjoint v0.9. Do not edit their files. Source reference v0.9 `d9d180ced16d32c836a94d67d9cff8d3030eb21d`; deployed v1 `d5c8899aeb867448ad7399f9925f46ac11371380`.

## Design and boundaries

One version-owned catalogue resolver supplies Role choices from that version's explicit Membership matrix, including empty-school usage, and other configured HR choices from that version. HR Terms edits ordinary dropdown definitions through native v1 operations; built UI owns its renderer in `deploy-ui.js`, with no added `build-web.mjs` text patches. Preserve fixed date/month/Active lists, Membership-derived Role and explicit EO yes/no separate from grade. Do not autoassign a Role to staff merely because a role row exists. Role selection drives existing per-teacher grade/managed-group projection; custom labels survive. Keep out-of-list values stored and flagged. Untouched fields stay untouched; explicit empty lists stay empty. Catalogue edits save/reload, copy and export/import within the selected version. Contacts observation values are not a substitute for the configured choice list.

Current Contacts authority and eligibility, Core permission combinations and publication proof/audit/recovery stay unchanged. No inferred authority or Global Admin grants. This internal-link scope does not implement the separate external Contacts catalogue overwrite portion of the v0.9 workflow; document that remaining boundary clearly rather than imply it exists. Internal dropdown choices must work before publication.

## Verification

First reproduce Membership present but Teachers Role picker empty in the actual built browser/Workers/local D1 using synthetic fixtures. Test native save/reload, selected-version isolation, explicit empty versus absent, Membership edits/import and Role/grade/group projection, HR options edit/import, preserved unknown values, stale/unauthorised/changed-intent rejection and unchanged publication-authority regressions. Run canonical build/no generated drift, relevant regressions, runner discovery and required exact-head Node/LORD and product/package CI. Record actual results and omissions, visible changes, rollback and review. F5 OPEN; T1B-01/T1B-02 and hosted/runtime UAT Not tested.

Skill: Superpowers systematic debugging, read from its available package; root-cause trace before fix, real behavioural failing tests, then bounded repair and verification. No third-party code copied.

## Implementation and initial verification

The accepted claim `bd8c001` and controller scope clarification `490820d` were published on main before implementation and incorporated by fast-forward. The branch implements a version-owned choice resolver, native `setHRChoices`, compatibility projections for the copied UI, and canonical HR Terms export/import. Membership Role Shortform now feeds Teachers on an empty school. Five editable HR lists persist separately from observed Contacts facts; fixed lists and derived Role stay protected. No new builder text patch or Contacts writer was added.

Initial red evidence: the new built-browser test failed with “Saved role matrix must supply Add teacher Role choices even with zero teachers”. The same test passes after repair. Further review found mixed queued HR/role edits, existing-grid grade preview and Contacts-only teacher single-field saves; tests exposed the last case as `Unknown staff`, and the owning save now obtains the existing Contacts reference before editing. An imported teacher grade is checked against the proposed Role's exact mapping. No grade is accepted as authority.

Passed locally, `TZ=Asia/Singapore` and installed Chromium for browser tests: new internal-links Worker/D1 test; new built-browser test including native HR save/reload, canonical Excel download/import, Add teacher choices and existing-grid Role save/reload; existing role Membership Worker/D1 and browser regressions; eight authority-publication groups; seven Contacts projection browser groups; Deploy workbook regressions; canonical `npm run build` with no generated drift; discovery now includes 122 product programs; whitespace and exact scope checks. Some test-development failures were incorrect harness expectations (hidden native selector, datalist location, synthetic flags and seeded Contacts choice); they were corrected without weakening product safeguards. Full product and exact-head CI are pending, not claimed as passes.

Visible changes: HR Terms is a Field/Choices editor; Role choices reflect the selected version's Membership matrix before publication; existing teacher Role changes display their mapped grade immediately; Membership grade inputs suggest this version's configured grades. See [internal link map](../../v1/contacts/DEPLOY_INTERNAL_LINKS.md) for implemented links and explicit deferred fields/external catalogue publication.

Internal Codex review found and resolved the above cases; independent Muse exact-head review remains required. Q01–Q05 have scoped ownership and invariant evidence; Q06 full-suite/CI and Q07 pending. No hosted tests, records, credentials, migrations or deployment changed. F5 OPEN; T1B-01/T1B-02 and hosted/runtime UAT Not tested.
