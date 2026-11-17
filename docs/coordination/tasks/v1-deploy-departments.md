# v1 Deploy department add/save and related operations

- Model/owner: Codex. Coordinator: ChatGPT. Reviewer: Muse at the exact head, under the owner's current v1 reviewer handoff.
- Status: implemented and locally verified; required exact-head CI and Muse review are handed off through the PR.
- Updated: 17 November 2026, 12:38 SGT.
- Branch: `codex/v1-deploy-departments`.
- Starting main: `6e041e6b51b3dac2b03d3f27c6ad4cb682aa8f07`. Deployed v1.03 product source: `d3bba194f0dc162d38f0899dc4e0b6e5e1351fa2`; later main is claim documentation only.
- Owner request: "bug log: deploy: programme settings : dept unable to add / save department. bug fix and study operations related to this." This explicitly authorises the bounded fix and task-branch commits for review. It does not authorise merge, deployment, hosted data reads/writes or provider actions.

## Exact file scope

1. `docs/coordination/tasks/v1-deploy-departments.md`
2. `docs/v1/DEPLOY_DEPARTMENTS_UAT_2026-11-17.md`
3. `v1/services/deploy/model.mjs`
4. `v1/web/shared/deploy-ui.js`
5. `tests/v1-product-deploy-departments.mjs`
6. `tests/v1-product-deploy-departments-browser.mjs`
7. `v1/services/deploy/planning-fields.mjs`

All v0.9 sources are read-only references. No workflow/build text patches, shared v0.9 source, generated production bundle, migration, provider, Core permission, Contacts writer or release-label change. Narrow the changed subset after reproduction. If another path is necessary, extend this claim before editing it. The seventh path is a claim clarification published before its implementation: a v1-owned ES module for the existing field-patch wire format, because adding CommonJS exports to shared v0.9 source would cross this task's boundary.

## Reproduction and related-path clarification

On the accepted claim `319ed2085a7b4f7281f3751eb8326bce500d701c`, the new real built browser/Worker/D1 test adds a synthetic department, stages it and submits Save. The actual /change response is HTTP503/SERVICE_UNAVAILABLE, and the draft/original save remain retained. Independent read-only tracing confirms model.mjs imports the classic shared/fields.js script as a module even though it exports nothing, so patchPlanning throws before committing. Use the v1 module for that established wire contract and keep current revision/lease/authority/idempotency guards. This shared correction also covers setOrganisation's other kinds, setDuties and setAscExportSettings; exercise them with synthetic owner requests, without changing their policy or UI.

Related inspection found browser-only legacy committee defaults injected into otherwise empty v1 lists, which can produce patches against records absent from the server. The already claimed v1 UI module may prevent that implicit v0.9 initialization for v1-owned explicit lists, retaining actual saved definitions and legacy leadership data. Prove this through the same built browser/Worker/D1 path and disclose the visible absence of phantom committees. No catalogue retirement or loss of saved records is authorised.

## Coordination and intended contract

Main and all remote heads refreshed; open PR196 owns release evidence, PR197 owns the prior UAT ledger, PR199 owns selective-default policy and PR182 owns a v0.9 hotfix. None overlaps this exact six-path scope. One implementer owns this new v1 job. Existing docs-only PRs do not own its product files. Read AGENTS, v1 supplement, coordination workflow/lanes/status, owner directives, skill policy, R01–R12, Q01–Q08, current release evidence and relevant Deploy code before claiming. The actual v1.03 release result is already published in PR196 and the protected run; the main deployment index is awaiting that separate documentation PR.

Prove the reported failure against the real locally built browser, Worker and D1 with synthetic data. Trace Add department, rename, delete and department leadership/member assignment through the shared queue, original-operation receipts and saved planning version. Compare the v0.9 intended flow without changing it. Department identity and membership belong to the selected Deploy draft; settings and the main Dept screen must reflect the same saved list. Save/reload, discard, stable IDs, independent versions and immutable publications must remain correct. Keep existing current session/school/capability, lease, revision and operation-intent checks. No Apps Script fallback or direct database bypass.

## Acceptance and evidence

Record a failing synthetic reproduction before product changes, the concrete root cause and adjacent operation findings in the dated v1 bug ledger. Then prove add/save/reload, rename preserving assignments, removal preserving unrelated groups, and applicable deputy/TL/member behavior. Exercise the actual UI save wire payload through the real Worker/D1 path, including revision conflict, wrong authority/school and exact-retry behavior where affected. Inspect related department Excel export/import without silently broadening its contract. Use existing operation recovery and bounded payloads. List visible changes for the owner in the PR; preserve the v0.9 look.

Run `TZ=Asia/Singapore` canonical build with no tracked drift, focused real browser/Worker/D1 regressions, required Node/LORD and full product/package checks. Runner discovery already includes new v1-product programs; do not edit a workflow to obtain a pass. CI and local synthetic behavior are not hosted UAT. F5 OPEN; official T1B-01/T1B-02, authenticated hosted runtime UAT and unperformed recovery checks remain Not tested.

## Method and handoff

Apply the read `pstack-plugin:principle-fix-root-causes` skill: reproduce, trace the owning save boundary, inspect the same failure pattern and fix its cause. Writing follows the read unslop skill. No third-party skill text/code is copied. Existing project Q gates control review. Q01 scope is claimed; Q02–Q06 depend on evidence; Q07 requires the new exact-head draft PR and Muse review; Q08 has no deployment authorisation for this change. Synthetic data only, no real staff names/numbers/operation IDs. Owner decides merge and selective deployment separately.

## Implementation and verification handoff

Accepted initial claim `319ed20`; scope clarification `7f9e94c` was published before adding the ES-module port. The initial new browser regression failed on the real built Worker/D1 path with HTTP503 and the original draft retained. The final code imports the v1 field module, checks encoded patch preconditions before reconstruction, maps malformed reconstruction to a validation result and checks known permanent staff references in all department selection arrays. A small v1 UI hook suppresses browser-only legacy committee seeding; no build-web text patch or shared v0.9 edit is needed. The existing transport encoding and operation/lease/revision/authority framework are reused. The bounded copy is deliberate to avoid changing a classic v0.9 script's module semantics; parity with the real client encoder is tested.

Visible changes: Programme Settings department edits and related shared saves can be confirmed; saved IDs and memberships survive reload/rename; removing a department keeps its teachers; empty v1 committee lists stay empty until explicitly edited. No new screen, permission, allocation rule, provider, migration or release label. The additional Deputy/TL checks reject unknown IDs while preserving known staff and optional blanks. The v0.9 reference and related-path analysis are in [the dated bug ledger](../../v1/DEPLOY_DEPARTMENTS_UAT_2026-11-17.md).

Commands use TZ=Asia/Singapore and the installed Chromium through GSIS_BROWSER_EXECUTABLE. `npm run build` passed without tracked production drift. The new actual-built browser/Worker/D1 test passes Add/Cancel/Save/reload, stable rename, Head/multiple Deputies, removal/Unassigned and committee persistence. The companion real Worker/D1 program passes all five organisation kinds, complete department leadership/member fields, canonical known-ID Excel export/preview/apply, original save/import receipt replay, changed intent, stale/malformed/security rejection, version isolation, duties and aSc settings. Its codec parity cases use the actual classic browser encoder, escaped keys, 125 object properties and a 505-record chunked order. Both new programs stay within the existing runner's 45-second bound.

Named existing regressions passed: v1-product-table-deploy-settings, v1-product-deploy-workbooks, v1-product-deploy-fortnight-browser, v1-product-deploy-save-recovery-browser, v1-product-deploy-internal-links, v1-product-deploy-internal-links-browser and v1-product-v09-frontend-parity. The Fortnight/recovery regressions retain their documented synthetic transport scope; the new department tests supply actual Worker/D1 proof. Build and local migration verification are completed through existing scripts; exact final-head Node/LORD and product/package CI results will be linked from the PR, not claimed before they finish. No full local application-suite rerun is claimed in place of those required CI runs.

Internal Codex review found encoded metadata could repeat child references before the reconstructed value reached ordinary validation. Harden the v1 decoder with unique sibling keys, typed metadata, finite bounded chunk counts, maximum depth 19, 5,000 keys per collection and 100,000 decoded nodes. Check those limits during decoding, then apply the existing plain-value depth/key boundary. The actual owner tests reject duplicate orders, excessive chunks/depth, encoded prototype keys, malformed entries and unknown member IDs without changing saved D1 data. This internal review is not Muse's independent approval. The port preserves the valid client wire format, not malformed encodings that the canonical encoder never produces.

The read Cloudflare Wrangler skill was applied to local validation using the project's pinned CLI and generated example configurations, without remote uploads. An initial dry run could not create its default log directory outside the writable workspace. The same existing verifier uses a private /tmp XDG configuration/log directory instead; no project/configuration/dependency change or sandbox bypass was needed. No skill added a release permission.

Q01 scope/authority and Q02 ownership are supported by the accepted claim and version-owned unchanged contract. Q03–Q06 use the new real-boundary tests and relevant regressions; required exact-head CI stays pending until its actual results. Q07 requires Muse's independent exact-head review and remains pending. Q08 deployment is not authorised for this bug task. No hosted UAT, live records, migration or provider action. Retain version choices, membership/leadership fields, publication history and operation receipts on separately approved recovery; a code rollback does not undo accepted saves.
