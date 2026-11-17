# v1.05: combine approved Deploy fixes and deploy

Model: Codex. Updated 17 November 2026 19:38:33 SGT.

- Status: owner-authorised integration/release claim; no v1.05 deployment yet.
- Owner instruction: “combine and deplay. approve through to the gate where i need to login to git outside of this chat”. This authorises the bounded combination, release merge and protected full deployment up to the external GitHub required-reviewer gate. Preserve that gate; do not bypass it.
- Builder/coordinator: Codex / ChatGPT. Product reviewer: Muse at the two original exact heads. No claim that Muse reviewed an unseen integration head. The owner's current instruction authorises the mechanical script combination and routine label packaging through the deployment gate, subject to the checks below.
- Base: main `13aac2adf40f4c018989ffe25629c69d753637ce`, the owner-authorised merge of #203 at `8ef3cd319ff070afcd3bcc951f162e9c05e5e4ff`.
- Integration branch: existing `codex/v1-deploy-planning-eligibility` / PR #204, starting at Muse-approved `3802373188482a7af1f6555bca57c9ad6ba35dfb`.
- Exact new hand-edit scope: this task; `docs/coordination/tasks/v1-deploy-planning-eligibility.md`; `scripts/v1/build-web.mjs`; `v1/release.mjs`; existing `tests/v1-product-roster-tables.mjs` under the fixture clarification below. Other product differences must come unchanged from the two reviewed PR heads. No new product behaviour, test scenario, dependency, workflow, migration or settings change. The existing fixture-only browser fallback correction is bounded below.

## Integration and version

Merge the accepted claim/main into #204 without squashing. Resolve only the known builder product conflict: the existing Deploy inclusion must contain `deploy-ui.js`, `deploy-loads-ui.js` and `deploy-ui-tables.js`, all browser modules in that order. Stop for any other product conflict. Preserve both approved product changes. Keep the approved #204 task evidence and append this owner's authorisation/integration evidence if its task record conflicts with the older claimed-only copy on main.

The only other application edit is `RELEASE_LABEL` from `v1.04` to `v1.05`. Source predecessor remains deployed v1.04 `06d71e5852076903f708abda264c4e8682d815d8`. #205 and queued Teachers visual changes are separate, unmerged work and are outside this release request about the two approved PRs.

## Verification and release sequence

Run `TZ=Asia/Singapore` canonical build/no production-generated drift; actual built browser/native Loads, eligibility and table fixtures; Membership/role-Membership, duplicate Contacts and save recovery regressions; existing release-label/frontend parity checks; v1 build, nine dry-runs/local migration upgrade, scope and whitespace. Use the locked CI Chromium browser. Required full Node/LORD and product/package CI must pass at the final integration/label head before merging #204. Verify original source-head ancestry and compare product paths: only the one combined inclusion and release label may be hand-edited beyond the reviewed product trees.

After the owner-authorised release merge, compare the entire final main product tree to the tested candidate and verify source/label/build configuration before dispatch. Record actual candidate CI and main tree evidence, rather than claiming an unrun main suite. The protected workflow builds that locked main source using its existing owner-supplied isolated configuration.

Take fresh full private exports of all eight existing owner D1 databases, Contacts last, using the established private helper path and existing credentials. Verify local SQLite import/integrity, foreign keys, schema and migration ledgers. Keep SQL, signed links, staff records and credential values out of Git/chat. Preserve all R2 objects. Separate exports are not cross-D1 atomic recovery or a hosted restore test.

Use the existing main-only `v1-deploy.yml`, confirmation `DEPLOY ISOLATED V1`, provider upload **false**, environment `gsis-v1-owner-approved`. Full deployment remains the owner default. Preserve resource identities, existing secret values, provider/scheduler/Google activation states and retention deletion settings. No provider sends, live staff edits, permission publication, prune, Google backup activation or configuration change is authorised as a test. Inspect any partial failure before retrying.

Proceed until the platform requires the owner's external GitHub login/reviewer approval. Give the exact run link and platform action; deployment authorisation has already been provided. Do not ask for it again. If the workflow can proceed under existing approval, follow it to completion and verify public GET-only routes/assets and nine live source/label/settings inventories without live staff edits.

The Memberships publication mechanism is merged; do not claim the owner's data entry or current Membership facts were verified. F5 stays OPEN. T1B-01/T1B-02, hosted authenticated Run B/UAT, N-1 latency and hosted restore remain Not tested unless separately executed. Rollback must preserve stable IDs, saved records, immutable publications, frontiers, audit and receipts. No new runtime approval rule or migration is introduced.

## Claim and handoff

Publish only this task record first via the expected-head, non-force claim exception. Incorporate the accepted claim into the existing #204 branch, then perform the bounded integration. Every commit/PR description must contain Model: Codex. Post exact candidate and merge SHAs, checks, backup metadata and protected-run state in the PR/task evidence. Owner merge/deploy authorisation is task-specific; this does not authorise unrelated PRs or weaken platform controls.


## Claim clarification: installed browser fallback

Model: Codex. Coordinator-authorised 17 November 2026 20:08:31 SGT. Before editing the existing `tests/v1-product-roster-tables.mjs`, include that exact path in this release claim. At integration head `5aadad09dd0c6a65d3c5891223569be416ac5891`, Node/LORD run44076928898 passed1229/1229 and40/40 LORD per shard. Product run44076936138 passed127/128; only this unchanged fixture hit its45-second program cap, without stdout or a failing assertion. The unchanged fixture also passes locally on locked Chromium151 in12.534 seconds. These results do not prove the internal CI hang cause.

Source inspection proves a portability mismatch: the Node workflow sets explicit browser overrides to Playwright's installed Chromium, while product CI installs that browser but this fixture instead falls back to `/usr/bin/chromium`. Change only that fallback expression to `chromium.executablePath()` when both existing overrides are absent. Keep both override precedences, every fixture action/assertion and the45-second cap unchanged. No test skip, forced click, timeout increase, workflow change or product edit is authorised by this clarification. Verify the fallback with both override variables absent and the existing locked browser cache, then rerun required full CI at the new exact head. Retain the original failed run and the unproven CI-hang limitation in handoff evidence.

This is a necessary release-test portability correction under the owner's existing combine/deploy-through-gate instruction. Source ownership stays with the same Codex release builder. Incorporate this accepted task-only claim into #204, retaining all approved/integration evidence if the task append conflicts. The new hand-edit inventory is the four original files plus this one existing fixture. No fresh provider, live-data, credential or runtime authority is added.
