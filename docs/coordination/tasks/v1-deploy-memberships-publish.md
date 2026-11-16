# Deploy Memberships editing and publish-back

Model: Codex. Coordinator: ChatGPT. Independent reviewer: Muse at exact head. Status: claimed. Branch: `codex/v1-deploy-memberships-publish`. Base: main `67dff5202e3321237b8c5b17deed6f36888a3a6b`. Updated: 16 November 2026 (Asia/Singapore).

Owner instruction: "Complete publish-back before deployment", after explaining that creating a Deploy version with Memberships and publishing it does not yet update Contacts. This is a prerequisite to the already authorised v1.01 deployment. Implement the complete Memberships path, not the rest of the Contacts lifecycle by implication. The approved Contacts lifecycle design controls immediate publication, preservation of later explicit edits, deliberate republication, retry/recovery and version ownership. Ordinary Memberships never grants accepted SMC/EO/School Leader authority.

## Exact file allowlist

1. `docs/coordination/tasks/v1-deploy-memberships-publish.md`
2. `docs/v1/contacts/MEMBERSHIPS_PUBLISH_BACK.md`
3. `v1/services/deploy/model.mjs`
4. `v1/services/deploy/service.mjs`
5. `v1/services/deploy/workbooks.mjs`
6. `v1/web/shared/deploy-ui.js`
7. `v1/web/shared/deploy-ui-tables.js`
8. `v1/web/shared/deploy-publication.js`
9. `v1/services/contacts/membership-publication.mjs`
10. `v1/services/contacts/service.mjs`
11. `v1/services/contacts/grid.mjs`
12. `v1/services/contacts/contributions.mjs`
13. `v1/services/core/contributions.mjs`
14. `v1/migrations/contacts/0005_membership_publications.sql`
15. `tests/v1-product-deploy-memberships.mjs`
16. `tests/v1-product-deploy-memberships-browser.mjs`
17. `tests/v1-product-membership-publication.mjs`
18. `tests/v1-product-contacts-projection-browser.mjs`
19. `tests/v1-product-deploy-workbooks.mjs`
20. `tests/v1-product-integration.mjs`

Scope clarification, 16 November: ChatGPT adds only the existing Contacts-projection browser regression above. It asserts that the Memberships screen has no editable inputs, which directly conflicts with the owner's newly authorised editing workflow. Update that expectation while retaining its authority, filtering, sorting and HR Terms checks. No additional product path is authorised; current PR182 and the release-label claim are disjoint. This is a necessary test update, not a relaxation of verification.

The existing workbook regression is also in scope: its unconditional Membership import rejection must become a successful Membership round trip while retaining HR Terms rejection and all other validation. The first unchanged run failed at that obsolete rejection assertion. No other product scope changes.

Full-suite scope clarification, 16 November: ChatGPT adds only `tests/v1-product-integration.mjs`. Its scheduler-only delivery assertion must distinguish Contacts ingestion from actual field application under the new publication marker; retain exact recipient count, states and error checks. No product or workflow changes are added. This preserves the requirement that ingestion is never reported as applied.

Main and remote branches refreshed. PR182 is v0.9, disjoint. The separate v1.01 label implementation owns eight disjoint paths and is frozen for CI/review. ChatGPT authorises this independent bounded group alongside that label work, based on its accepted main claim, not the unreviewed label branch. No extra implementation stacking or edits to v0.9/build text patches.

## Required behavior

- Existing Deploy HR Membership view edits version-owned per-person Memberships, with bounded free text, explicit empty-list clearing and unchanged omitted values. Preserve stable IDs, drafts, current save/receipt recovery and the shared table export/import behavior.
- New/Duplicate refreshes Memberships from Contacts. Later load/save/recalculation/export/publication preserves the saved version values while still checking current authority and eligibility. Do not freeze or implement other lifecycle fields implicitly.
- A new immutable publication explicitly identifies this Memberships contract. Publishing applies those Memberships to Contacts automatically, including clears. Existing historical publications keep their original contribution semantics.
- Preserve newer explicit Contacts edits and newer publications using durable publication-sequence evidence, not browser clocks or delayed job timestamps. Bind every update to the original immutable payload, actor, publication and operation. Direct individual and grid/import Contacts Memberships writes participate in the same ordering.
- Keep each owner's writes atomic, with history, revision and receipt. No cross-D1 atomicity claim. Current account, school, capability and accepted authority checks remain; a narrow delegated field write cannot expand to authority fields.
- Provide bounded request-driven progress and restart recovery for this internal delivery without enabling the general scheduler, Drive, or any provider sender. Ingestion is not application: display pending until actual per-record outcomes are known.

## Evidence and completion gates

Real built browser and real local Worker/D1 tests: editable Memberships/save/reload, current-fact refresh only at new/Duplicate, changed-intent/stale/unauthorised/foreign-school denials, Excel round trip, publication application/clear, old-publication compatibility, interleaved direct/grid edits and publications, concurrent delivery, lost responses/restart, revoked authority, bounded batch continuation, and scheduler-disabled completion with no provider calls. Preserve unrelated staff fields, accepted authority, saved assignments and historical records.

Run canonical build/no generated drift, focused and relevant unchanged regressions, runner discovery, full required Node/LORD and product/package CI. Muse reviews exact head. Update this record/contract with verification and omissions. Deployment additionally requires final candidate checks, fresh private D1 backups and existing GitHub approval; do not apply this new migration to hosted data while implementing. F5 OPEN; official T1B-01/T1B-02 and unperformed runtime UAT Not tested.
