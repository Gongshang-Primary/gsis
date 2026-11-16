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

Scope clarification, 16 November: ChatGPT adds only the existing Contacts-projection browser regression above. It asserts that the Memberships screen has no editable inputs, which directly conflicts with the owner's newly authorised editing workflow. Update that expectation while retaining its authority, filtering, sorting and HR Terms checks. No additional product path is authorised; current PR182 and the release-label claim are disjoint. This is a necessary test update, not a relaxation of verification.

The existing workbook regression is also in scope: its unconditional Membership import rejection must become a successful Membership round trip while retaining HR Terms rejection and all other validation. The first unchanged run failed at that obsolete rejection assertion. No other product scope changes.

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

## Implementation and verification record

Implementation starts from accepted main scope commit `318007d351ee2736eb89e79003b9e202a82d4d3f` (initial claim `e3785df4f4dcb5dc898fdaca6f9955e8afda633b`). [Contract](../../v1/contacts/MEMBERSHIPS_PUBLISH_BACK.md) records the independent field ownership, sequence frontier, immutable marker, limits and recovery rules. No skill package was invoked; repository engineering principles were applied directly.

- Existing Membership view now uses a v1-owned module; no new build-web text patch. Membership workbook preview includes the operation identity required by current Core authorization.
- Saved unknown values stay unknown; only New/Duplicate refreshes them. Current Contacts authority and teaching eligibility still refresh independently.
- Bounded proof pages and per-staff proof selection avoid the 1 MiB service-response limit without changing that limit. Up to eight independent owner requests apply a chunk; a 256-person synthetic publication larger than 1 MiB exercises this path.
- Application, preservation of a later edit, ingestion and publication commit have separate evidence. A lost response retains its request; only proven non-commit permits a new progress request. Monotonic current progress is returned separately from an immutable historical request receipt.
- Changed deploy components: Core, Contacts, Deploy and web. New additive Contacts migration: `0005_membership_publications.sql`. No settings, hosted schema, data, credentials or provider activation changed.

Focused checks completed during implementation (all with `TZ=Asia/Singapore`; browser commands use `GSIS_BROWSER_EXECUTABLE=/usr/bin/chromium`): all three new Memberships programs; existing `tests/v1-product-deploy-workbooks.mjs`, `tests/v1-product-deploy-storage.mjs`, `tests/v1-product-deploy-duplicate-contacts.mjs`, `tests/v1-product-contacts-projection-browser.mjs`, `tests/v1-product-contacts-direct-authority.mjs` and `tests/v1-product-deploy-venue-ui.mjs`; canonical `npm run build` (18 components, no generated drift). Full product and exact-head Node/LORD CI results are pending and will be recorded in the PR before review.

The publication test passes seven groups, including accepted SMC+EO publishing without an Admin grant, direct/grid ordering, concurrent first delivery, explicit clears, expired apply/skip recovery after Worker restart, actor revocation and narrow proof bounds. It completed in 25.868 seconds; eight fresh applications took 0.636 seconds in that local run (earlier runs 1.510–2.301 seconds). These are local observations, not hosted latency claims. The built-browser editor/import/publication/reload test completed in 18.154 seconds, including real D1 acknowledgement failure, proven-abort automatic retry and lost-response replay without duplicate field revisions. Both are within the unchanged 45-second per-program runner limit.

Eighteen files changed within the nineteen-path allowlist; `deploy-ui-tables.js` needs no edit because its existing canonical table registration is reused. Local scope/link/whitespace checks pass. A publishing user's own Memberships update can invalidate the progress request's earlier authority observation: the server retains that check, while the browser confirms the aborted receipt and resumes automatically with a new bounded progress request and unchanged per-person publication identities.

Runner discovery: 116 product programs and 1,217 Node programs on this branch, including all three new Memberships programs. The separate release-label branch adds one more program when combined. Syntax and whitespace checks pass. An incorrectly invoked discovery command briefly started a partial Node run; it was stopped and is not counted as full-suite evidence.

Failures corrected while testing: obsolete Membership import-rejection expectation; use of D1 `LIKE` with an overlong digest pattern (replaced by an indexed bounded range); missing operation ID in the existing workbook preview; unknown-value refresh; and receipt/progress recovery edge cases. Test harness corrections (browser executable and local database fixture/teardown) are not hosted evidence.

Q01–Q05: Pass — accepted scope, documented ownership/security/recovery/resource boundaries and the focused behavioral evidence above. Q06: focused checks pass, full suites pending. Q07: exact-head PR/Muse review pending. Q08: deployment held for this prerequisite, review, CI and fresh backups. No Memberships are fabricated or entered for the school. Owner-entered data/publication and hosted runtime UAT remain unperformed; F5 OPEN and T1B-01/T1B-02 Not tested.
