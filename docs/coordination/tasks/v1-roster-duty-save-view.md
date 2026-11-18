# Roster SMC duty saves return the accepted view

- Model: Codex. Coordinator: ChatGPT v1. Independent reviewer: Muse, exact head.
- Status: claimed, before implementation.
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

Repository ownership, systematic reproduction, simplicity and verification principles are applied; optional skill catalog inspected, no skill package executed. No tests run or implementation claimed at this claim checkpoint. Q01 scope is established; Q02–Q07 implementation/evidence/review remain pending; Q08 deployment is out of scope. F5 remains OPEN. Hosted/runtime UAT and official T1B-01/T1B-02 remain Not tested.
