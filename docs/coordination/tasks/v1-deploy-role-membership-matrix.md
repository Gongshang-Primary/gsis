# v1 Deploy role Membership matrix and publication authority

- Status: implemented; final verification and independent exact-head review pending. See the implementation PR for its final head and CI results.
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
23. `v1/services/contacts/intervals.mjs`
24. `v1/services/contacts/contributions.mjs`
25. `tests/v1-product-core-contacts.mjs`

Deploy owns version-specific explicit role mappings and immutable publication intent. Contacts owns the current ordinary fields and accepted SMC/EO/School Leader records, history, audit, ordering and receipt. Core keeps its existing permission rules and reads current Contacts evidence. Role names/grade text alone never imply EO or other permissions: add an explicit EO yes/no/unknown value alongside appointment grade. MKE+SMC remains invalid. No Global Admin or module-grant inference. Preserve current session, school, capability, revision, idempotency, size and service-proof checks.

The main Membership view is the v0.9-style role matrix, usable even with zero teachers. Retain the existing per-person editor and canonical Membership workbook separately. A distinct Role Membership workbook supports canonical round-trip and explicit preview of the legacy role-matrix format; preserve school/version/revision checks for canonical input and never reinterpret another table. No invented school-specific role/authority defaults. Explicit matrix mappings determine the ten managed grouping labels for matched people; preserve unrelated custom labels and unmatched/unknown facts. EO appointment grade and accepted EO employment flag remain separate.

Publication authority changes use a new explicit schema marker and a narrow verified proof path; historical publications are not reinterpreted. Contacts applies each represented person's still-eligible authority fields and corresponding Memberships atomically, preserving older immutable records and advancing durable ordering/revisions. Ordering is per field: later direct Memberships or EO edits cannot suppress an unrelated SMC removal. Results record applied and superseded fields. Newer deliberate publications can replace earlier direct edits. Audit original publisher, applying/recovering actor, target stable ID, old/new values, time, publication and operation IDs. An authorised operator can reconcile/resume a publication after the original publisher loses access; a lost response never fabricates success or repeats a grant. No cross-D1 atomicity claim. Direct Contacts acceptance keeps its existing safeguards outside this publication exception.

## Verification and boundaries

Meaningful synthetic tests through actual built browser, Workers and local D1: empty-school matrix; add/edit/delete/check/uncheck/EO unknown; save/reload/recalculate/version isolation/Duplicate; untouched versus explicit clear; canonical and legacy Excel preview/apply/reload; malformed/oversize/foreign/stale/unauthorised/preview denial; retries and changed intent; publication promotes/demotes via current Core policy; self-removal and authorised recovery; revoked/unknown outcome handling; direct-edit ordering; immutable/audited history; MKE+SMC rejection; no Global Admin grant. Existing Memberships publication/recovery and Contacts projection regressions remain required. Run canonical build, discovery, required full Node/LORD and product/package CI at exact head, plus local migration upgrade evidence. Keep commits small and labelled Model: Codex.

Q01 claimed scope above; Q02–Q05 design/invariant evidence in implementation/PR; Q06 tests/CI pending; Q07 Muse review pending; Q08 no merge, deployment, hosted migration, live staff/configuration change, provider send, Google activation or prune in this task. The previous v1.01 release is separately recorded. F5 OPEN; official T1B-01/T1B-02 and unperformed runtime UAT Not tested. Repository engineering principles applied; no optional skill package executed or copied.

Scope refinement before dependent edits: include `v1/services/contacts/intervals.mjs` only to carry explicit original proposer and actual accepter through the existing field/history writer, preserving default callers. This avoids duplicating the authoritative interval/history writer and is necessary for truthful publication-recovery attribution; no new business policy or live authority is added. ChatGPT coordinator records this implementation detail within the owner-authorised feature.

Second narrow scope refinement before dependent edits: `v1/services/contacts/contributions.mjs` excludes proof-bound authority publication bundles from the ordinary manual contribution inbox, alongside the existing Memberships publication exclusion. This prevents an unrelated manual contribution path from editing the immutable permission intent; no other contribution semantics change.

Third scope refinement, before the dependent test edit: exact-head CI at `959977f5092c968df564da1435c0d9aa6d98c4fc` exposed the existing two-owner Core/Contacts integration fixture's missing Deploy publication-order binding. Add only `tests/v1-product-core-contacts.mjs` so this required regression uses a real local Deploy database, named publication reader and pin handler; preserve its explicit contribution proof injection. Product frontier validation remains fail-closed. ChatGPT records this bounded test-fixture scope adjustment within the authorised feature; no new product policy, hosted access or release authority.

## Implementation evidence

Claims `630d0ce`, `e16699e` and `9889627` were published to main before their dependent edits and fast-forwarded into this branch. Product source started at `9889627d6fa4ff188a034622b2685a5d0e0826aa`; the reference v0.9 screen is unchanged at `9b86b4bd955857d83fb09f41eaaf5bb730e1e4dc`. The implementation PR records the final exact head and independent review. All 24 changed paths are inside the exact allowlist; no workflow, dependency, v0.9 source or generated production file changes.

- The matrix owns explicit checkbox values, appointment level and separate EO tri-state; it works before teachers exist. One deliberate blank-role row is allowed. No school-specific role catalogue is invented. Native `setRoleMemberships` preserves saved-version isolation and expected-value/revision checks. The legacy browser's implicit SH→SMC and ST→TL inference is disabled only for explicit v1 matrices; unchecked values remain unchecked after reload/recalculation. Custom per-person labels remain separate.
- Canonical Role Membership workbooks retain school/version/revision metadata; legacy v0.9 Excel is recognised only by the explicit Role Membership import flow and requires preview. The browser test uses the actual v0.9 Excel exporter with synthetic data. Foreign metadata and formulas are rejected. Existing per-person Memberships workbooks retain their scope.
- Core verifies the immutable publication and a fresh exact source/version/batch/resumer decision, current account/session and existing capabilities. Only transport `requestId` is excluded from the request digest. Contacts rejects fabricated publication flags and invalid MKE+SMC combinations. Ordinary Role/Basic Name proposals retain their previous contribution path.
- Contacts commits eligible fields, immutable history, field frontiers, acceptance audit, snapshot and receipt in its own D1 transaction. Each SMC/EO/School Leader field has its own frontier. Direct later custom Memberships/EO edits do not cancel an unrelated SMC removal. Current source pins, CAS and operation identities remain enforced.
- Self-publication can change access. If Contacts commits before Deploy's final revalidation loses authority, the response says `saved:false`, `receiptRecorded:false` and supplies actual Contacts progress separately from the conclusively settled outer attempt. Another currently authorised resumer can finish the same immutable publication. No Global Admin or module grant is written.

Final combined checks use `TZ=Asia/Singapore`; local browser checks also set `GSIS_BROWSER_EXECUTABLE=/usr/bin/chromium` and `ROSTER_TEST_CHROMIUM=/usr/bin/chromium`. A local browser invocation without those overrides stopped because the Playwright-managed binary was absent; the corrected run uses the installed Chromium. CI installs its own pinned Playwright browser.

| Command | Result |
| --- | --- |
| `node tests/v1-product-deploy-role-memberships.mjs` | Pass: real Workers/local D1 matrix editing, bounds, managed/custom groups, version/Duplicate isolation, authority isolation, workbook preview/apply, stale/foreign/denied requests, restart and exact retry. |
| `node tests/v1-product-deploy-workbooks.mjs` | Pass: extended Role Membership contract plus unchanged selected-fact/workload and workbook negative cases. |
| `node tests/v1-product-authority-publication.mjs` | Pass, 8 groups: permission changes, explicit EO, self-change/recovery, unchanged-self revision, per-field ordering counterexamples, MKE atomic rejection, source/batch/session/aborted proof, ordinary contribution compatibility, lost response and real Worker restart. |
| `node tests/v1-product-membership-publication.mjs` | Pass, 7 groups; 25.3s locally. Eight-person chunk measured 1.35s locally; this is not hosted latency evidence. |
| `node tests/v1-product-contacts-direct-authority.mjs` | Pass, 10 groups; 19.4s locally. |
| `node tests/v1-product-contacts-projection.mjs` | Pass, 9 groups; real local owner projections and 512-person paging. |
| `node tests/v1-product-deploy-role-memberships-browser.mjs` | Pass: real built browser plus Workers/local D1; matrix edit/save/reload, dense desktop and 390px viewport inspection, Core filters/sort/column hide-show, canonical Excel and actual legacy exporter round-trip, unchecked SMC/TL, custom labels, read-only denial, self-removal and authorised recovery. |
| `node tests/v1-product-deploy-memberships-browser.mjs` | Pass: existing per-person editing, publication and lost-acknowledgement recovery retained. |
| `node tests/v1-product-contacts-projection-browser.mjs` | Pass, 7 groups: existing Contacts projection/Deploy browser regression. |
| `npm run build` | Pass, all 18 canonical components; no generated production drift. |
| `node scripts/v1/test.mjs --list` | 120 programs discovered, including all three new programs; no runner change or skip. |
| `git diff --check` and allowlist comparison | Pass; 24 changed paths, zero outside scope. |

Supplemental local migration evidence: real Wrangler local D1 upgrade from the exact deployed `8e85f3055b34b3262cde926efa7dc06c8fcf1a3b` Contacts chain through 0005 to 0006 passed on its first run. All 26 existing tables/schema/index definitions and synthetic field/history/acceptance/frontier/operation/audit rows were preserved. Three field frontiers coexist for one person; duplicate key and invalid field produce the intended constraint errors; repeat migration is a no-op; `quick_check` passes and foreign-key errors are zero. Migration SHA-256: `3c3f64da8662722344b2c59aafb21c4078b9fc8660cb7f0dd2914965f68e1c30`. Supplemental harness/result are local `/tmp/gsis-authority-0006-upgrade.mjs` and `/tmp/gsis-authority-0006-upgrade-result.json`, not repository artifacts; repository integration tests independently create and exercise this schema. No hosted migration was run.

Retained correction evidence: browser testing exposed legacy grade-based implicit groups and the self-removal protected-state-clear race; both required product fixes. Internal review caught source/request binding and whole-tuple ordering counterexamples before final verification. Test fixture corrections distinguished unlinked-evidence 503 from linked read-only 403, selected the direct summary after adding nested Columns, and avoided a Roster entry screen for a Deploy-only reader. These were not counted as passing product evidence until corrected checks ran. Internal builder security review found no unresolved backend finding; it is not Muse's exact-head approval.

## Release and remaining gates

Visible changes: HR Settings → Membership now opens the role matrix, with the separate staff editor below; Add/Delete, explicit EO, Core filtering/sorting and canonical/legacy import preview are available. Publish explains the permission changes including the publisher's own values, distinguishes per-field outcomes and provides recovery after self-removal. No app permission is granted merely by saving a draft or entering free-text labels.

Changed deploy components, if later approved: Core, Contacts and Deploy Workers plus the Deploy frontend; additive Contacts migration 0006 requires a fresh private D1 backup first. No configuration, credentials, providers, Google activation, allocation policy or live data changes. Retain the new frontiers/history on rollback; reconcile new marked publications before reverting to an older implementation. Appointment-grade/catalogue and all remaining ordinary deployment-tag publish-back rules are not claimed complete by this slice.

Q01–Q05 **Pass**: scope/authority, existing domain owners, negative boundary checks, durable local recovery and bounded 300-row/512-person/eight-person batches evidenced above. Q06 **Pending** until exact-head full Node/LORD/product/build/package CI is linked in the PR. Q07 **Pending** Muse review. Q08 **Not applicable — no release in this task**; hosted migration and runtime UAT **Not tested**. F5 **OPEN**; official T1B-01/T1B-02 **Not tested**. No additional owner policy decision is outstanding; the next gate is independent exact-head review, followed by the owner's merge/release decision.
