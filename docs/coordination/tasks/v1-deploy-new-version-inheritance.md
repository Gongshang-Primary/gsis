# PAR-03: port approved normal New planning inheritance

- Status: claimed; implementation and current-head verification pending.
- Owner/model: Codex; v1 coordinator: ChatGPT/Codex.
- Reviewer/model: Muse at the new exact head. Review is advisory.
- Updated (Asia/Singapore): 19 November 2026, 06:02 SGT.
- Branch: `codex/v1-deploy-new-version-inheritance-port`.
- Base: `bd77b27deab417afce859cd80465d7c608ae0ab2` (current main verified before claim).
- Approved source: `codex/v1-deploy-new-version-inheritance` at [`0bc58d5561f41c6d5d26fa7a1fb6b2d3ad4763b8`](https://github.com/helper-gsps/gsis/commit/0bc58d5561f41c6d5d26fa7a1fb6b2d3ad4763b8).
- Source review: [Muse's exact-head approval](../review/pr-new-version-inheritance-muse-review.md), present on the base. That approval and earlier CI do not certify this new head.
- PR: not opened. Required exact-head Node/LORD CI must pass before the draft PR for Muse.

## Authority and coordination

The coordinator explicitly authorised the bounded port, local checks, task-branch commits and push, relevant CI and a draft PR after required Node/LORD success. This is a fresh branch; the approved source branch remains unchanged. The current session directs a branch-only claim before implementation, replacing the default direct-main claim step for this task. No main claim update, merge or deployment is authorised.

Main, current open PR files and the source branch were refreshed before claiming. PR #182 is v0.9 work and has no overlap with the four paths below. The separately assigned layout/Teachers port owns only its own UI/table paths. The department-move port shares `model.mjs` but owns a disjoint import and `setOrganisation` guard; this port owns only `newPlanningVersion` beside `fixedGroupSlots`. Coordinate any unexpected overlap rather than replacing current files with old branch copies. Preserve the merged #207 TTb-name derivation and #210 Versions-note projection.

## Exact file allowlist

1. `docs/coordination/tasks/v1-deploy-new-version-inheritance.md`
2. `v1/services/deploy/model.mjs`
3. `v1/services/deploy/service.mjs`
4. `tests/v1-product-deploy-new-version-inheritance.mjs`

No shared builder, browser overlay, layout/department implementation, Contacts writer, v0.9 source, configuration, dependency, migration, generated output or live-data change.

## Implementation contract

Port the approved PAR-03 behaviour from the [original source task](https://github.com/helper-gsps/gsis/blob/0bc58d5561f41c6d5d26fa7a1fb6b2d3ad4763b8/docs/coordination/tasks/v1-deploy-new-version-inheritance.md), rooted in the [v0.9 frontend parity audit](v1-deploy-v09-frontend-parity-audit.md) and final v0.9.9y `backend/Code.gs` normal-New policy.

Normal New with `sourceVersionId` and without Duplicate copies the selected saved definitions/settings, stable class/TG/organisation IDs and venue placements/uses. It clears personal teaching/leadership/duty/activity assignments, teacher drafts/notes, saved reporting and the specified per-version transient state, then uses the existing current Contacts refresh. The source remains byte-for-byte unchanged. This introduces no Contacts inclusion/exclusion policy or authority inference.

Preserve source precedence `copyFrom || sourceId || sourceVersionId`, historical full-copy semantics of `copyFrom`/`sourceId`, Duplicate behaviour, Duplicate without a source, and first creation without a source. Missing, deleted or foreign sources fail through existing checks. Preserve current capability/school/admission checks, exact operation intent, committed replay before source reads, atomic owning-D1 creation and all existing bounds. No cross-D1 atomicity claim.

## Verification plan

Use `TZ=Asia/Singapore`; browser checks use the locked Playwright Chromium executable. Keep the existing 45-second program limit.

- Canonical `npm run build` before tests; verify no tracked generated drift.
- Reuse the approved five-group actual browser/Worker/D1 regression, first against the current baseline to reproduce the defect and then against the port. It exercises definitions and cleared assignment families, source independence, alias/Duplicate/no-source compatibility, negative authorization/source cases and response-loss/restart replay.
- Unchanged relevant checks: Duplicate Contacts, Duplicate selection (#205), planning eligibility, Deploy storage/workbooks, TTb modifiers (#207), and nonloaded note revisions (#210). Record actual commands, failures and omissions; do not transfer earlier passes to the new head.
- Check both existing runners discover the test, exact four-path scope, syntax and whitespace.
- Push only the task branch. Require exact-head Node/LORD CI before opening the draft PR; product CI and Muse's updated-head review remain required before readiness.

## Quality gates and limits

Q01: authorised bounded port and overlap check recorded. Q02-Q05: preserve reviewed ownership, policy, security, recovery and resource contracts; current integration verification pending. Q06: pending current-head checks. Q07: pending new-head PR/review. Q08: no deployment authorised.

Skill: Pstack [Prove It Works](skill://plugins_6a85a87df50c8191bd7f010bb7b17794/principle-prove-it-works/SKILL.md) read and applied to direct built-artifact, owner-state and exact-head verification; no skill code copied into the repository.

Hosted/authenticated UAT remains **Not tested**. Official T1B-01/T1B-02 remain **Not tested** and F5 remains **OPEN**. The inherited publication fixture is not proof of an R2 or hosted publication. No hosted reads/writes, provider sends, migration, infrastructure or live-configuration operation.

Rollback is a source revert; it does not delete or rewrite planning versions already created. Later handoff must provide exact branch/head/PR, tested commands, remaining CI/review gates and these limitations.
