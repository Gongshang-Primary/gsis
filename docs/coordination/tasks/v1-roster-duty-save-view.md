# Roster SMC duty saves return the accepted view

- Model: Codex. Coordinator: ChatGPT v1. Independent reviewer: Muse, exact head.
- Status: implemented; focused checks passed; exact-head full CI and independent review pending.
- Updated: 18 November 2026, Asia/Singapore.
- Branch: `codex/v1-roster-duty-save-view`.
- Base: `bd77b27deab417afce859cd80465d7c608ae0ab2`.
- Authority: continue the owner-requested v1 bug queue and repair the confirmed SMC duty-save display defect. The coordinator explicitly directs a three-path claim published on this task branch before product edits; no main claim push. No merge, deployment, live reads/writes, provider send, migration or v0.9 change.

## Scope and evidence

Read current root/v1 instructions, workflow, lanes, status, owner directives, deployments and engineering policy; refreshed all remote heads and actual open PR files. Only v0.9 draft #182 is open at `57ab791db80c28f647f1ec03aee73e67cc981b90`; its files do not overlap this claim. The queued v1 absence-clash task owns only its task record and is outside this implementation. Muse is the owner-appointed reviewer for the current v1 batch.

The earlier actual built-browser/Workers/D1 reproduction is recorded in `v1-roster-absence-clash-confirm.md`, under “Separate SMC duty-save finding”: a duty list commits but disappears from the current page until reload. Current main retains the cause: the copied duty UI replaces its complete view with the mutation response; the shared mutation returns only saved IDs; the v1 owner enriches settings/types/Stapler responses but not `setDutySMC`.

Exact three-path allowlist:

1. `docs/coordination/tasks/v1-roster-duty-save-view.md`
2. `v1/services/roster/service.mjs`
3. `tests/v1-product-roster-duty-save-browser.mjs`

## Contract

Return the existing complete duty-roster view for the accepted `setDutySMC` mutation, together with its owner revision and immutable operation receipt. Reuse the established owner response pattern and existing view constructor. Do not introduce a second write, browser-side authority, new data model, build patch or changed duty policy. Roster owns lists/memberships; Contacts owns accepted SMC/EO/School Leader facts; Core owns current access.

Preserve original-operation identity and exact retry results, stale-revision/capability checks, history, other lists and existing notification behavior. A replay must not replace its accepted view with a newer read. Future/multi-day membership concerns are not established by the display defect; investigate any new counterexample separately rather than silently widening this scope.

## Verification plan

First demonstrate the failing immediate display using synthetic data through the actual built browser, gateway, owner Workers and D1. Verify create, edit and delete responses/display/reload, original-operation replay and a lost response after commit, current authority and stale-revision denial, and no notification jobs. Retain meaningful assertions and record fixture limitations.

Use `TZ=Asia/Singapore`. Run canonical build/no tracked drift, the focused browser test, relevant unchanged Roster regression, runner discovery and exact-head full Node/LORD and product CI. Record actual commands, failures, omissions and tested head. Publish a draft PR only after required full Node/LORD CI is green; Muse reviews its exact head. Visible change: a successfully saved duty list remains visible immediately, and subsequent edits use its accepted view.

Repository ownership, systematic reproduction, simplicity and verification principles are applied; optional skill catalog inspected, no skill package executed. At the claim checkpoint no product edit or test result was claimed. The implementation and evidence below supersede that checkpoint. Q01 scope, Q02 ownership/security, Q03 correctness/recovery, Q04 bounded implementation, Q05 local evidence and Q06 build/discovery are satisfied within the stated limits. Q07 exact-head CI and independent review remain pending; Q08 deployment is out of scope. F5 remains OPEN. Hosted/runtime UAT and official T1B-01/T1B-02 remain Not tested.


## Implementation and verification

The only product change is eight lines in the Roster owner: after `setDutySMC`, construct the existing `dutyRoster` view from a clone of the accepted next state and retain it in the same atomic commit receipt. The owner applies the accepted revision to the final response. Exact retries therefore return their original accepted snapshot, even after a later edit. No frontend/build patch, policy change, second write, database schema or provider action is added.

The regression drives the built browser through the gateway and real local Core, Contacts and Roster Workers with persistent local D1. All names, identities and operation identifiers are synthetic. It verifies five groups:

1. Create commits both the list and current-day membership; the saved list remains visible immediately and controls remain usable.
2. Edit and reload show the accepted revision; replaying the original create returns its immutable original view without another write.
3. Stale revision, changed intent on a reused operation ID and an ordinary staff account with accepted SMC=false are rejected without duty writes.
4. A response deliberately lost after the Worker commits recovers through the native exact retry, with the same response and unchanged durable records.
5. Delete updates the view immediately, retained history survives reload, current-day membership is removed and no notification outbox entry is created.

Commands and actual outcomes on this branch's implementation tree:

- `TZ=Asia/Singapore npm run build` — PASS before and after implementation; all 18 components regenerated with no tracked generated drift.
- `TZ=Asia/Singapore node tests/v1-product-roster-duty-save-browser.mjs` — initial environment failure: the locked Playwright headless-shell binary was absent locally, before browser assertions. Subsequent local runs explicitly used installed `/usr/bin/chromium`; CI installs the locked browser.
- `TZ=Asia/Singapore GSIS_BROWSER_EXECUTABLE=/usr/bin/chromium node tests/v1-product-roster-duty-save-browser.mjs` against unchanged base product — FAIL as intended: durable list and membership existed, but immediate displayed row count was 0 instead of 1.
- First post-fix run — the create/edit/replay groups passed; the authorization fixture was incomplete and returned fail-closed `AUTHORITY_UNAVAILABLE`/503 instead of the intended 403. Corrected the synthetic ordinary account to link accepted Contacts records with explicit SMC=false; no product change was needed.
- The same focused command with the complete fixture — PASS, all five groups. All local Workers and browser processes disposed.
- `node --check tests/v1-product-roster-duty-save-browser.mjs` and `git diff --check` — PASS.
- `node tests/run.cjs --list` — PASS; the new test is discovered among 1,235 programs, including 134 `v1-product-` programs.

The source tree is frozen for one implementation commit and its exact-head CI. The unchanged Roster service regression and full Node/LORD/product suites are delegated to that CI run; they have not been claimed as locally run for this task. The PR will state the resulting tested commit SHA, run URLs and outcomes without a follow-up product edit.

Limitations: this fixes responses for new saves; immutable sparse receipts written before this fix are not rewritten. The new test verifies browser reload and lost-response recovery, not process restart, future/multi-day duty membership policy or hosted behavior. Hosted/runtime UAT and official T1B-01/T1B-02 remain **Not tested**; F5 remains **OPEN**. No migration, deployment, provider send, Drive activation or live access occurred. Rollback is the single Roster response enrichment; existing saved records and receipts remain intact.
