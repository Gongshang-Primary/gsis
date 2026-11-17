# Deploy frontend parity and Membership UAT ledger — 17 November 2026

Model: Codex. Times are Asia/Singapore (UTC+08:00). This is a changelog and initial investigation, not an implementation or completed UAT report. Owner's latest instruction: “do not commit code, maintain change log”; compare the screenshot with v0.9 and investigate only. Documentation publication does not authorise a fix, migration, deployment or publication of live planning data.

## References and evidence limits

- v1.02 released source: [`d5c8899aeb867448ad7399f9925f46ac11371380`](https://github.com/helper-gsps/gsis/commit/d5c8899aeb867448ad7399f9925f46ac11371380).
- v0.9.9y comparison source: [`d9d180ced16d32c836a94d67d9cff8d3030eb21d`](https://github.com/helper-gsps/gsis/commit/d9d180ced16d32c836a94d67d9cff8d3030eb21d). Relevant original frontend and planning code remain identical in the v1 source tree; the v1 build transforms their behaviour.
- Refreshed main before investigation: `ecc26a6d69eff5411468daaf5463d83496633cc3`. Open PR196 is release documentation; PR182 is v0.9 work. Their actual changed paths do not include this ledger/task.
- Evidence: owner-supplied side-by-side screenshot and read-only source/test/contract inspection. No authenticated frontend operation, hosted record read or write, database query, provider send, source edit or application test run was performed for this investigation. The screenshot's “No Contacts facts” is not proof that Contacts contains no records.
- The screenshot is described without copying account identifiers or staff data into this public repository. Exact original screenshot capture time is unknown; timestamps below identify when findings were recorded.

## Issue index

| ID | Recorded SGT | Area | Finding | Status |
| --- | --- | --- | --- | --- |
| ENV-17-001 | 2026-11-17 07:55 | Computer control | Environment advertises desktop support, but no browser/desktop interaction tool was exposed. This blocks the requested row-by-row frontend copy; it is an environment limitation, not an application defect. | Blocked; no rows copied or verified |
| DEP-17-001 | 2026-11-17 08:11 | HR Settings → HR Terms | v1 displays a read-only staff-facts report in place of v0.9's version-owned option catalogue editor. | OPEN — owner screenshot; source cause confirmed; fix deferred |
| DEP-17-002 | 2026-11-17 08:14 | Membership → Teachers | The owner's screenshot shows 59 Membership roles but Add teacher's Role picker contains only its blank prompt. Internal role/HR tag links must work within Deploy before publication. | OPEN — source cause confirmed; authorised implementation under verification |

## DEP-17-001 — HR Terms has a different function in v1

### Observed versus expected

The owner's screenshot shows v1.02 columns **Staff ID / TTb Name / Field / Value** with “No Contacts facts are available.” The v0.9 screen shows **Field / Choices — one per line**, containing fixed and editable catalogue lists. The owner requests investigation of this functional mismatch and defers code changes.

v0.9 HR Terms belongs to the selected planning version. It contains nine lists: Day of Birth, Month of birth, Role, EO Appt Level, Appointment Status, Employment Modifier, Subject Modifier, Active and MK Modifier. Day/month/Active are fixed; Role is derived from Membership. Other editable lists use the normal save flow. The EO appointment-level list supplies Membership's grade selector. EO employment yes/no in v1 must remain distinct from appointment grade.

Saving a draft persists that version's choices without replacing Contacts' current catalogue. Publication uses the immutable published document and its catalogue revision to update Contacts; other versions retain their own choices. Existing staff values outside the lists remain stored and flagged, and do not prevent publication. An explicitly empty list differs from an absent list. This screen must be usable without relying on populated staff-facts rows.

### Source trace at the pinned commits

| Layer | Evidence | Finding |
| --- | --- | --- |
| Original v0.9 screen | [public/app.js](https://github.com/helper-gsps/gsis/blob/d9d180ced16d32c836a94d67d9cff8d3030eb21d/public/app.js#L1595), `masterOptionsPage()` | Renders selected-version `masterOptions` as Field/Choices; queues `setMasterOptions`. `hrTermLists()` at line1323 supplies teacher choices; Membership at line1580 consumes EO appointment-level choices. |
| Original save | [backend/Planning.gs](https://github.com/helper-gsps/gsis/blob/d9d180ced16d32c836a94d67d9cff8d3030eb21d/backend/Planning.gs#L19), `applyPlanning_()` | Admin gate and expected-value conflict checks; updates version `masterOptions` and `hrTerms`. Fixed lists and Membership-derived Role are protected. |
| Original publication | [backend/Planning.gs](https://github.com/helper-gsps/gsis/blob/d9d180ced16d32c836a94d67d9cff8d3030eb21d/backend/Planning.gs#L43), `syncPublishedCatalogues_()` | Reads immutable published document, sends options/Membership with catalogue revision and verifies the result. Contacts applies its own journalled update; this is not a cross-database atomic transaction. |
| v1 build replacement | [scripts/v1/build-web.mjs](https://github.com/helper-gsps/gsis/blob/d5c8899aeb867448ad7399f9925f46ac11371380/scripts/v1/build-web.mjs#L802), `updateDeployContactsReports()` | Replaces `masterOptionsPage()` with a four-column `contactsFacts` report and read-only guidance. `updateDeploy()` invokes this transform. Adding Contacts staff facts would fill the report, not restore the missing catalogue editor. |
| v1 save prohibition | [v1/services/deploy/model.mjs](https://github.com/helper-gsps/gsis/blob/d5c8899aeb867448ad7399f9925f46ac11371380/v1/services/deploy/model.mjs#L722) | Rejects `setHRTerms`, `setMasterOptions` and the corresponding `patchPlanning` source as `REFERENCE_ONLY`/403. Restoring markup alone would leave saves rejected. |
| v1 read projection | [v1/services/deploy/model.mjs](https://github.com/helper-gsps/gsis/blob/d5c8899aeb867448ad7399f9925f46ac11371380/v1/services/deploy/model.mjs#L285), `mergeContacts()` | Builds `hrTerms`/`contactsFacts` from observed staff profile values. Observed values are not a complete configured catalogue. |
| v1 workbook | [v1/services/deploy/workbooks.mjs](https://github.com/helper-gsps/gsis/blob/d5c8899aeb867448ad7399f9925f46ac11371380/v1/services/deploy/workbooks.mjs#L88) | HR Terms schema/export is Staff ID/TTb Name/Field/Value; import is explicitly rejected at line413. |
| Existing v1 tests | [browser regression](https://github.com/helper-gsps/gsis/blob/d5c8899aeb867448ad7399f9925f46ac11371380/tests/v1-product-contacts-projection-browser.mjs#L611), [workbook regression](https://github.com/helper-gsps/gsis/blob/d5c8899aeb867448ad7399f9925f46ac11371380/tests/v1-product-deploy-workbooks.mjs#L221) | Tests expect the four-column report, no HR Terms editors, and rejected import. Green historical CI therefore does not establish v0.9 HR Terms parity. These tests were inspected, not rerun here. |

### Earlier policy and current disposition

The [accelerated implementation specification](accelerated-delivery/GSIS_V1_ACCELERATED_IMPLEMENTATION_SPEC_2026-11-13.md), lines216/552/574 at the pinned v1 source, expressly makes HR Terms a reference-only export. [The Memberships contract](contacts/MEMBERSHIPS_PUBLISH_BACK.md) also retains that restriction. This is a mismatch between the owner's expected v0.9 workflow and the earlier v1 design; it is not merely missing CSS or missing staff data. The later Membership matrix work restored Membership independently and left HR Terms as a report.

Recommended future scope, subject to a separate build instruction: restore version-owned HR Terms configuration in a v1-owned UI module, support its native draft/save and catalogue publication contracts, align Excel export/import, and replace the now-conflicting report-only tests and documentation. Preserve current identity/capability, school, revision, operation identity, payload and authority checks. Catalogue definitions must not grant permissions by themselves; retain v1's explicit, audited SMC/EO/School Leader publication path. Do not copy the old v0.9 rejection of ordinary out-of-catalogue staff values: the 15 November owner rule requires retaining and flagging them.

### Future acceptance checklist — all Not tested

1. HR Terms displays a version's configured lists with zero teachers and zero Contacts facts.
2. Edit an allowed list, Save to online, reload, and retain exactly the saved choices; Cancel or failed save retains the appropriate stored value and recoverable draft.
3. Switch between two versions with different catalogues and prove their independence. Explicit empty and absent lists remain distinct.
4. Membership role changes update the derived Role list; EO appointment choices feed the grade selector while explicit EO yes/no remains separate.
5. Fixed-list constraints and current capability checks remain enforced; unauthorized, stale and changed-intent requests are rejected without losing the draft.
6. Existing out-of-list staff values survive, show warnings and do not block publication.
7. Draft saves leave Contacts choices unchanged; explicit publication updates intended catalogues with revision/operation recovery, truthful partial-outcome reporting and no duplicate effects on retry.
8. Canonical Excel export/import round-trips the catalogue with school/version/revision metadata; stale or foreign imports fail safely. Legacy report exports must not silently be treated as replacement catalogues.

No implementation, fix verification or closure is claimed. F5 remains OPEN; official T1B-01/T1B-02 and unperformed runtime UAT remain Not tested.

## Changelog discipline

Append further owner discoveries with stable IDs and Singapore recording timestamps. Keep environment blockers, screenshot observations, source-confirmed causes and executed runtime results distinct. No application changes are included in this ledger update. Skill methods: manual source/dependency tracing and independent read-only comparison; no named skill package was executed for this investigation.

## DEP-17-002 and implementation follow-up — 17 November, 08:28 SGT

The owner subsequently instructed “fix and review deploy internal linkages taking reference from v0.9 where necessary”, including these recent changelogs. That authorises a separate implementation; this PR remains documentation-only.

Source cause: `applyRoleMemberships()` updates teacher grade/groups but did not populate the choice list consumed by Teachers. Bootstrap supplied observed Contacts `hrTerms`; `hrTermLists()` used that separate source. An empty school could therefore save a complete role matrix while offering no selectable Role. It was not necessary to publish or add a teacher to Contacts to establish this internal choice link.

The implementation branch is `codex/v1-deploy-internal-links`, current head [`ae849721c87717068a6c0acb0c531555a4c5b084`](https://github.com/helper-gsps/gsis/commit/ae849721c87717068a6c0acb0c531555a4c5b084). [The task](../coordination/tasks/v1-deploy-internal-links.md) is on main; the [link map](https://github.com/helper-gsps/gsis/blob/ae849721c87717068a6c0acb0c531555a4c5b084/docs/v1/contacts/DEPLOY_INTERNAL_LINKS.md) records the exact consumers and limits. No merge or deployment is claimed.

- DEP-17-002: a real built-browser/Worker/local-D1 regression first failed on the empty Role picker. It now passes for saved roles before any teachers exist, role-grade preview, existing teacher-grid Role save/reload and the current Appointment Status/Employment Modifier/Subject Modifier/Active selectors.
- DEP-17-001: the internal HR Terms editor and canonical catalogue export/import are implemented on that branch. Version isolation, explicit empty lists, native save/reload and stale/foreign/fixed-field checks pass locally. The external Contacts catalogue overwrite portion of the v0.9 workflow remains separate; this item is therefore not closed as complete v0.9 parity.
- Additional review found mixed queued HR/role edits, stale grid grade previews, teacher import grade checks and Contacts-only single-field saves. Those are addressed in the same internal-link implementation. The first full run exposed freezing of an unconfigured legacy choice fallback; the follow-up commit fixes it and its focused regressions pass. Full CI at the current head is pending.
- Accepted Contacts authority is unchanged by draft/catalogue edits. EO yes/no remains distinct from grade. Wider employment-field editors and the external catalogue lifecycle are not silently added. School data and the owner's 59 actual role rows were not read or copied by these synthetic tests.

Both product findings remain OPEN pending independent review and hosted verification. The computer-control blocker and unperformed row-by-row copy remain unchanged. No production code, live record or environment setting is changed by this ledger commit.
