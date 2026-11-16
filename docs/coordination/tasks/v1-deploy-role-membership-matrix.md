# v1 Deploy role Membership matrix and publication authority

- Status: claimed.
- Model/owner: Codex. Coordinator: ChatGPT. Independent exact-head reviewer: Muse (owner role directive `12b06eb43cb0a6f1a6eca7c787b22100c6a57875` on `claude/zealous-archimedes-4i2lv1`).
- Updated: 16 November 2026, Asia/Singapore.
- Branch: `codex/v1-deploy-role-membership-matrix`.
- Base: main `9b86b4bd955857d83fb09f41eaaf5bb730e1e4dc`.
- Authority: owner requests the v0.9 role Membership page in v1, then explicitly states SMC/EO/SL values must grant existing application permissions on publication through Contacts. Owner permits publication to update the publisher's own permissions; promotion and accidental self-removal risks are accepted because changes are audited and another authorised publisher/Global Admin can correct them. Global Admin is never granted by this mechanism. This exception is specific to verified Deploy publications; direct Contacts self-acceptance controls remain unchanged.

## Scope and ownership

One cohesive v1 implementation PR. Main, all remote heads, claims and actual open PR files were refreshed; sole open PR182 is v0.9 and disjoint. Older merged task statuses do not allocate new work. The latest frontend UAT branch was read; broader restore/duplicate-name defects are separate backlog work. Read root/v1 instructions, workflow, lanes, status, directives, deployment evidence and engineering policy. Reference v0.9 `public/app.js:membershipPage`, `backend/Planning.gs` and `shared/teaching-rules.js` without editing them.

Exact allowlist:

1. `docs/coordination/tasks/v1-deploy-role-membership-matrix.md`
2. `docs/coordination/OWNER_DIRECTIVES.md`
3. `docs/v1/contacts/MEMBERSHIPS_PUBLISH_BACK.md`
4. `v1/services/deploy/role-memberships.mjs`
5. `v1/services/deploy/model.mjs`
6. `v1/services/deploy/service.mjs`
7. `v1/services/deploy/workbooks.mjs`
8. `v1/services/deploy/README.md`
9. `v1/services/core/contributions.mjs`
10. `v1/services/contacts/service.mjs`
11. `v1/services/contacts/membership-publication.mjs`
12. `v1/services/contacts/authority-publication.mjs`
13. `v1/migrations/contacts/0006_authority_publications.sql`
14. `v1/web/shared/deploy-ui.js`
15. `v1/web/shared/deploy-publication.js`
16. `v1/web/shared/workbooks.mjs`
17. `tests/v1-product-deploy-role-memberships.mjs`
18. `tests/v1-product-deploy-role-memberships-browser.mjs`
19. `tests/v1-product-authority-publication.mjs`
20. `tests/v1-product-deploy-memberships-browser.mjs`
21. `tests/v1-product-contacts-projection-browser.mjs`
22. `tests/v1-product-deploy-workbooks.mjs`

Deploy owns version-specific explicit role mappings and immutable publication intent. Contacts owns the current ordinary fields and accepted SMC/EO/School Leader records, history, audit, ordering and receipt. Core keeps its existing permission rules and reads current Contacts evidence. Role names/grade text alone never imply EO or other permissions: add an explicit EO yes/no/unknown value alongside appointment grade. MKE+SMC remains invalid. No Global Admin or module-grant inference. Preserve current session, school, capability, revision, idempotency, size and service-proof checks.

The main Membership view is the v0.9-style role matrix, usable even with zero teachers. Retain the existing per-person editor and canonical Membership workbook separately. A distinct Role Membership workbook supports canonical round-trip and explicit preview of the legacy role-matrix format; preserve school/version/revision checks for canonical input and never reinterpret another table. No invented school-specific role/authority defaults. Explicit matrix mappings determine the ten managed grouping labels for matched people; preserve unrelated custom labels and unmatched/unknown facts. EO appointment grade and accepted EO employment flag remain separate.

Publication authority changes use a new explicit schema marker and a narrow verified proof path; historical publications are not reinterpreted. Contacts applies each represented person's authority tuple and corresponding Memberships atomically, preserving older immutable records and advancing durable ordering/revisions. Later direct edits survive delayed delivery; newer deliberate publications can replace them. Audit original publisher, applying/recovering actor, target stable ID, old/new values, time, publication and operation IDs. An authorised operator can reconcile/resume a publication after the original publisher loses access; a lost response never fabricates success or repeats a grant. No cross-D1 atomicity claim. Direct Contacts acceptance keeps its existing safeguards outside this publication exception.

## Verification and boundaries

Meaningful synthetic tests through actual built browser, Workers and local D1: empty-school matrix; add/edit/delete/check/uncheck/EO unknown; save/reload/recalculate/version isolation/Duplicate; untouched versus explicit clear; canonical and legacy Excel preview/apply/reload; malformed/oversize/foreign/stale/unauthorised/preview denial; retries and changed intent; publication promotes/demotes via current Core policy; self-removal and authorised recovery; revoked/unknown outcome handling; direct-edit ordering; immutable/audited history; MKE+SMC rejection; no Global Admin grant. Existing Memberships publication/recovery and Contacts projection regressions remain required. Run canonical build, discovery, required full Node/LORD and product/package CI at exact head, plus local migration upgrade evidence. Keep commits small and labelled Model: Codex.

Q01 claimed scope above; Q02–Q05 design/invariant evidence in implementation/PR; Q06 tests/CI pending; Q07 Muse review pending; Q08 no merge, deployment, hosted migration, live staff/configuration change, provider send, Google activation or prune in this task. The previous v1.01 release is separately recorded. F5 OPEN; official T1B-01/T1B-02 and unperformed runtime UAT Not tested. Repository engineering principles applied; no optional skill package executed or copied.
