# v1-roster-unblock: Job 3 after reviewed Contacts and operation probe

- Status: claimed; reproduction and implementation pending.
- Owner/model: Codex; v1 coordinator ChatGPT.
- Reviewer/model: Claude, independent exact-head review.
- Last updated (Asia/Singapore): 16 November 2026, 06:15.
- Branch: `codex/v1-roster-unblock`.
- Base SHA: `71a7c5c040350b46d8332e5ba2e3b44665aebe5f` (refreshed main after #180, #178, #176). The implementation branch starts from this claim's accepted main commit.
- Current head: task-only claim; no implementation or PR yet.
- User-authorised scope: Job 3 in the standing owner prompt, explicitly resumed after the 16 November recheck: F01/F02 Stapler lock; H02/B04/B05 baseline mapping; B08/G01/G02 estimated allocation and visible labels in the same PR; G03 empty current-duty read. Update the merge inventory. One claim and one implementation PR; no later job.
- Overlap: fetched main/all remote heads and actual open PRs after integration; none open. Earlier active #176/#178/#180 task status text is superseded by the exact merges below. Existing v0.9 claims are untouched.

## Exact file allowlist

- `v1/services/roster/service.mjs`
- `v1/services/roster/context.mjs`
- `v1/services/roster/allocation-snapshot.mjs`
- `v1/services/roster/capacity.mjs`
- `v1/services/roster/capacity-notifications.mjs`
- `v1/services/roster/exports.mjs`
- `v1/services/roster/ledger.mjs`
- `v1/services/roster/repository.mjs`
- `v1/services/deploy/service.mjs`
- `v1/services/deploy/roster-workload.mjs`
- `v1/allocator/index.mjs`
- `v1/web/shared/client.js`
- `v1/web/shared/roster-import.js`
- `v1/web/shared/roster-capacity.js`
- `v1/web/shared/roster-continuity.js`
- `v1/web/shared/roster-unblock.js`
- `tests/v1-product-roster-locks.mjs`
- `tests/v1-product-roster-locks-browser.mjs`
- `tests/v1-product-roster-baseline-mapping.mjs`
- `tests/v1-product-roster-baseline-browser.mjs`
- `tests/v1-product-roster-estimated.mjs`
- `tests/v1-product-roster-estimated-browser.mjs`
- `tests/v1-product/roster-unblock-fixtures.mjs`
- `tests/v1-product-operation-probe.mjs`
- `tests/v1-product/operation-probe-allowlist.json`
- `tests/v1-product-roster-service.mjs`
- `tests/v1-product-allocator.mjs`
- `v1/web/parity.json`
- `docs/v1/roster/ROSTER_UNBLOCK_2026-11-16.md`
- `docs/coordination/tasks/v1-roster-unblock.md`
- `docs/coordination/tasks/v1-merge-records-20261115.md`
- `docs/coordination/tasks/v1-merge-records-20261116.md`
- `docs/coordination/tasks/v1-operation-probe.md`
- `docs/coordination/tasks/v1-contacts-direct-authority.md`

Only files actually needed will change. No wildcard ownership. The Deploy service portion is limited to a versioned read projection of saved workload and its existing source-revision/pin checks for the Roster estimate; it must not publish, infer authority, or change editing business rules. Roster owns timetable mapping, dated leases and allocations; Contacts owns permanent identity and accepted role evidence; Venues owns room identity. The allocator change only permits explicitly labelled estimated workload under the approved rule. The existing browser transport, Roster modules, readable exports and focused tests carry the same distinction. No new build text patches are authorised in this claim.

## Merge inventory checkpoint

Owner ordered merge commits, no hand edits, stopping on moved head or conflict. Claude approved all three exact heads in [the recheck](../review/v1-pr176-178-180-claude-recheck.md) on main `2e77d3c8598fc1edb053e62280fb6cf7c92f167e`. Exact-head required full CI was green before each integration, and #176/#178 product CI was green. Completed in the requested order:

| PR | Reviewed head | Merge commit | Automatic/result tree |
| --- | --- | --- | --- |
| #180 | `fc256d771b44121e7375f620c7ec859ee8a66590` | `750ba8cbd5e4be80b03e15a925f471f0edd753f7` | `34cd814ade0927ce319d32271e8b39822d89bf6b` |
| #178 | `530a7add936a168184becaaacb82a24deaf5da18` | `439e9d973320b689bec0d25fdc683be2e5b899a0` | `0484c174e79656c75b3c43dd9e4e7a1233f59dd2` |
| #176 | `de4d2834bbd6391db4a0df291c941770b3d9233f` | `71a7c5c040350b46d8332e5ba2e3b44665aebe5f` | `51105524b76f80b6528c3aaa7e2e14bbac47122d` |

Every second parent equals its reviewed head; every resulting tree equals `git merge-tree --write-tree` on its parents. No conflict, moved head, squash, history rewrite or hand edit occurred. The existing inventory and three closed task records will be updated on this branch. These merges do not close any hosted finding.

## Requirements and plan

Read root/v1 AGENTS, README, workflow, lanes, status, owner directives, deployments, engineering skill policy/Rust principles/quality gates; PR159 queue and PR162 Run B; first and follow-up trace ledgers including Section 0a; #176/#178 original reviews and latest exact-head recheck. The two 15 November owner directives remain controlling: strict identity/authority/revision checks and estimated saved-data allocation without automatic publication.

1. Reproduce F01/F02 with the actual built browser transport and local nine-Worker/D1 product. Reuse the existing dated owner lease, preserve sponsorship/permission, fencing, expiry, stale response and operation identities. Do not revive omitted legacy controls.
2. Preserve source labels and multiple canonical rooms; exact unambiguous teacher/name-bridge matching, unresolved identity selection, retained mapping draft on failure/cancel and original-operation recovery. No guessed identity, fabricated venue, role inference or default authority record.
3. Distinguish an absent publication from an outage or corrupt/stale evidence. Use current saved data with explicit source revisions; mark all affected screens/exports estimated in this same PR. Never record an estimate as verified historical R or silently auto-publish it. Retain actor/school/capability/payload/revision/idempotency guards and current accepted EO/SMC/School Leader evidence requirements. Preserve verified-publication behaviour.
4. Return an honest empty current-duty projection for an empty school; outages and invalid identity still fail.
5. Remove only fixed F01/F02 probe allowances in the same PR; retain all unrelated allowances, runtime pins and negative controls. Record any disproved row and skip it. Update parity only for workflows actually driven.

## Acceptance and verification

Use synthetic identities/fixtures only, `TZ=Asia/Singapore`. Each touched operation needs real built-browser plus local Worker/D1 evidence, including negative permissions/isolation/revision/changed-intent tests, competing editors, lease expiry/restart, multi-room occupancy, duplicate/ambiguous names, cancelled/failed import retention, unknown receipts, estimated/verified transition, provider/source failure, and automatic-publication blocking. Required canonical build without tracked drift, runner discovery, unchanged Core/Contacts and relevant Roster regressions, full product suite and full required Node/LORD exact-head CI. Record actual commands, SHA, outcomes and failures; no helper-only closure or weakened test bounds. Applicable Q01-Q08 evidence belongs in the final handoff.

Skill used: Pstack `principle-fix-root-causes`, cloud package `c12/principle-fix-root-causes` (read this session): reproduce the real boundary failure before changing its owner, then prove the observable behaviour. No copied skill code or claim to execute other skills.

## Out of scope and release gates

No merge of the new implementation PR, deployment, hosted reads/writes, migration, schema/database changes, provider sends/activation, credentials, infrastructure, v0.9 changes, build/CI/runner changes, general validation Job 4, publication Job 5, other missing handlers, removals or UI redesign. No live-data access is needed for reproduction. Stop affected work if it requires weaker security, conflicting owner policy, another PR's owned file or an allowlist expansion.

Deployment remains explicitly NOT authorised: owner must confirm C-1 Memberships and C-2 Contacts D1 backup immediately before deployment. F5 OPEN; official T1B-01/T1B-02 and hosted/runtime UAT Not tested. Green CI is not hosted proof.

## Handoff

Next: publish this task-only claim via expected-head main update, start the implementation branch from the accepted claim, update the merge inventory, then reproduce/fix the four ordered Job 3 parts. No implementation test has run yet.
