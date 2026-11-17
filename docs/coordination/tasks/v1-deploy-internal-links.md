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

Main, remote heads and open PRs refreshed. PR197 owns its two documentation paths; PR196 owns release records; PR182 is disjoint v0.9. Do not edit their files. Source reference v0.9 `d9d180ced16d32c836a94d67d9cff8d3030eb21d`; deployed v1 `d5c8899aeb867448ad7399f9925f46ac11371380`.

## Design and boundaries

One version-owned catalogue resolver supplies Role choices from that version's explicit Membership matrix, including empty-school usage, and other configured HR choices from that version. HR Terms edits ordinary dropdown definitions through native v1 operations; built UI owns its renderer in `deploy-ui.js`, with no added `build-web.mjs` text patches. Preserve fixed date/month/Active lists, Membership-derived Role and explicit EO yes/no separate from grade. Do not autoassign a Role to staff merely because a role row exists. Role selection drives existing per-teacher grade/managed-group projection; custom labels survive. Keep out-of-list values stored and flagged. Untouched fields stay untouched; explicit empty lists stay empty. Catalogue edits save/reload, copy and export/import within the selected version. Contacts observation values are not a substitute for the configured choice list.

Current Contacts authority and eligibility, Core permission combinations and publication proof/audit/recovery stay unchanged. No inferred authority or Global Admin grants. This internal-link scope does not implement the separate external Contacts catalogue overwrite portion of the v0.9 workflow; document that remaining boundary clearly rather than imply it exists. Internal dropdown choices must work before publication.

## Verification

First reproduce Membership present but Teachers Role picker empty in the actual built browser/Workers/local D1 using synthetic fixtures. Test native save/reload, selected-version isolation, explicit empty versus absent, Membership edits/import and Role/grade/group projection, HR options edit/import, preserved unknown values, stale/unauthorised/changed-intent rejection and unchanged publication-authority regressions. Run canonical build/no generated drift, relevant regressions, runner discovery and required exact-head Node/LORD and product/package CI. Record actual results and omissions, visible changes, rollback and review. F5 OPEN; T1B-01/T1B-02 and hosted/runtime UAT Not tested.

Skill: Superpowers systematic debugging, read from its available package; root-cause trace before fix, real behavioural failing tests, then bounded repair and verification. No third-party code copied.
