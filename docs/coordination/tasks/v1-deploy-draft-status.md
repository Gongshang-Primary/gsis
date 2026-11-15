# v1-deploy-draft-status: UAT019 saved draft venue controls

- Status: claimed; implementation and verification pending.
- Owner/model: Codex; coordinator ChatGPT (v1); independent reviewer Claude.
- Last updated (Asia/Singapore): 15 November 2026, 09:43.
- Branch: `codex/v1-deploy-draft-status`.
- Base SHA: `bef1ac8c1d5e310a3468b92b72da38d59e49aeb1`.
- Current head/PR: recorded in the implementation PR after verification.
- Authority: owner instructed “read project chat data clone uat ledger, treat them as change log for bug fixes too. proceed to work on them one by one”, then supplied `GSIS_FRONTEND_UAT_LEDGER.md` (SHA-256 `c4c0cb8786eced24b5ef3143c7d113369ddaf81dcba8728e27fb0a2a34c5a0f8`). Historical live-write authorisations in the attachment are evidence only.

## Exact scope

1. `scripts/v1/build-web.mjs` — v1-only adaptation of the copied Deploy venue-clear eligibility predicate.
2. `tests/v1-product-deploy-draft-status.mjs` — built-browser/actual Worker regression evidence.
3. `docs/coordination/tasks/v1-deploy-draft-status.md` — this claim and verification.
4. `docs/v1/accelerated-delivery/DEPLOY_DRAFT_STATUS_FIX_2026-11-15.md` — behaviour, evidence and handoff.

No legacy frontend, backend authority contract, migration, dependency, generated output, configuration, provider or live-data edits. No merge or deployment. This is not venue catalogue refresh or publication recovery (PR160).

## Start gates and sequential coordination

Read root/v1 instructions, workflow, lanes, status, directives, deployments, engineering policy and existing claims. Refreshed main and all 20 open PR file inventories: no exact-path overlap. PR154 and PR146 work touching this builder is already merged; their stale main task statuses are not new allocations. PR144 records their closure separately. PR160 is frozen at `ab24739203f3bcc03c5b7e6c96f8fa2144a84654`, with full/product CI green and Claude review pending. Its seven paths remain untouched.

V1 coordination decision under LANES.md's coordinator exception: proceed to this next bounded, disjoint queue item while the completed PR160 awaits review; no concurrent code editing of that task. PR159 is documentation only. Production lanes and reviewers are unchanged. Publish this task alone through the claim-only, non-force expected-head workflow before implementation; start from its accepted claim and re-read claims.

## Cause, invariants and acceptance

UAT019 reports a saved v1 draft labelled ineligible. Source `public/app.js` requires status `planning`, while v1 bootstrap returns native status `draft`. Adapt the v1 copy only; keep native backend state and all security/publication restrictions.

1. Reproduce the actual built UI mismatch with a synthetic Admin and saved draft before the fix.
2. A saved unpublished draft permits preview, cancellation without writes and explicit draft queueing. Save only after the normal explicit action; preserve room/class/group identities and teacher deployments.
3. Published versions, drafts with a previous publication, non-Admins and impersonation remain restricted. Do not weaken server-side capabilities or owner commit checks.
4. Run focused browser/Worker tests, discovery, canonical build with no tracked drift, unchanged product/Core/Contacts regressions, full Node/LORD and exact-head CI using `TZ=Asia/Singapore`.
5. Verify exactly the four allowed files, source isolation, links and whitespace. Claude reviews the exact new head; local synthetic tests do not close runtime UAT.

## Verification, review and release

Pending. Apply the already selected Pstack root-cause skill (`skill://plugins_6a85a87df50c8191bd7f010bb7b17794/principle-fix-root-causes/SKILL.md`): reproduce behaviour, fix the compatibility boundary and test negative cases. No new skill/dependency installation.

Q01 Pass after claim publication and re-read; Q02–Q06 pending implementation/evidence; Q07 pending Claude; Q08 not applicable to deployment. Rollback restores the prior v1 builder; there is no data/schema change. F5 remains OPEN. Official T1B-01/T1B-02 and unperformed runtime UAT remain Not tested.
