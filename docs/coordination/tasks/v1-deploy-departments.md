# v1 Deploy department add/save and related operations

- Model/owner: Codex. Coordinator: ChatGPT. Reviewer: Muse at the exact head, under the owner's current v1 reviewer handoff.
- Status: claimed; reproduction and implementation pending.
- Updated: 17 November 2026, 12:21 SGT.
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

All v0.9 sources are read-only references. No workflow/build text patches, shared v0.9 source, generated production bundle, migration, provider, Core permission, Contacts writer or release-label change. Narrow the changed subset after reproduction. If another path is necessary, extend this claim before editing it.

## Coordination and intended contract

Main and all remote heads refreshed; open PR196 owns release evidence, PR197 owns the prior UAT ledger, PR199 owns selective-default policy and PR182 owns a v0.9 hotfix. None overlaps this exact six-path scope. One implementer owns this new v1 job. Existing docs-only PRs do not own its product files. Read AGENTS, v1 supplement, coordination workflow/lanes/status, owner directives, skill policy, R01–R12, Q01–Q08, current release evidence and relevant Deploy code before claiming. The actual v1.03 release result is already published in PR196 and the protected run; the main deployment index is awaiting that separate documentation PR.

Prove the reported failure against the real locally built browser, Worker and D1 with synthetic data. Trace Add department, rename, delete and department leadership/member assignment through the shared queue, original-operation receipts and saved planning version. Compare the v0.9 intended flow without changing it. Department identity and membership belong to the selected Deploy draft; settings and the main Dept screen must reflect the same saved list. Save/reload, discard, stable IDs, independent versions and immutable publications must remain correct. Keep existing current session/school/capability, lease, revision and operation-intent checks. No Apps Script fallback or direct database bypass.

## Acceptance and evidence

Record a failing synthetic reproduction before product changes, the concrete root cause and adjacent operation findings in the dated v1 bug ledger. Then prove add/save/reload, rename preserving assignments, removal preserving unrelated groups, and applicable deputy/TL/member behavior. Exercise the actual UI save wire payload through the real Worker/D1 path, including revision conflict, wrong authority/school and exact-retry behavior where affected. Inspect related department Excel export/import without silently broadening its contract. Use existing operation recovery and bounded payloads. List visible changes for the owner in the PR; preserve the v0.9 look.

Run `TZ=Asia/Singapore` canonical build with no tracked drift, focused real browser/Worker/D1 regressions, required Node/LORD and full product/package checks. Runner discovery already includes new v1-product programs; do not edit a workflow to obtain a pass. CI and local synthetic behavior are not hosted UAT. F5 OPEN; official T1B-01/T1B-02, authenticated hosted runtime UAT and unperformed recovery checks remain Not tested.

## Method and handoff

Apply the read `pstack-plugin:principle-fix-root-causes` skill: reproduce, trace the owning save boundary, inspect the same failure pattern and fix its cause. Writing follows the read unslop skill. No third-party skill text/code is copied. Existing project Q gates control review. Q01 scope is claimed; Q02–Q06 depend on evidence; Q07 requires the new exact-head draft PR and Muse review; Q08 has no deployment authorisation for this change. Synthetic data only, no real staff names/numbers/operation IDs. Owner decides merge and selective deployment separately.
