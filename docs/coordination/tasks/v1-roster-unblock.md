# v1-roster-unblock: Job 3 after reviewed Contacts and operation probe

- Status: merged by owner direction as PR181 at `1754c535738adb1cad8dd328f45dd60ea6580f03`; exact head `8b15cb2d3c79717828ab66a8359e30522f82b901`. Not deployed. Historical pending statements below are superseded by the integration note.
- Owner/model: Codex; v1 coordinator ChatGPT.
- Reviewer/model: Claude, independent exact-head review.
- Last updated (Asia/Singapore): 16 November 2026, 06:15.
- Branch: `codex/v1-roster-unblock`.
- Base SHA: `71a7c5c040350b46d8332e5ba2e3b44665aebe5f` (refreshed main after #180, #178, #176). The implementation branch starts from this claim's accepted main commit.
- Initial implementation/test head: `c89b362d676c1af3ee165a84d172011bc88962bf`; superseding code changes, final branch head and CI are identified by [PR181](https://github.com/helper-gsps/gsis/pull/181). Earlier verification/review does not cover a later head.
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

Owner directed “merge all available first” on 16 November. #181 was the only open PR; exact-head CI was green (product 104/104, Node 1205/1205, LORD 40/40 per shard, canonical build and nine Worker dry runs). Merge/result tree `41757cc2e03977b740137a6edb0da5bfc0cde1cd` equals the automatic merge tree. No published Claude verdict covering that exact head was found; this is an owner-directed merge, not a claimed Claude approval. Owner requires a separate [workload-snapshot correction](v1-roster-workload-snapshot.md) because Roster's held Deploy source pins must not block ordinary Deploy writes. That task supersedes this task's planning-pin design; no other Job 3 behavior is retired.

Subsequently, Claude published [approval of the same #181 head](../review/v1-pr181-claude-review.md) on main at `7198f193ff6936b8f8b5b84737eb1310a9b429df`, with 104/104 product evidence. Review C-1 requires appropriate saved-version date ranges before hosted estimated use; C-2 requires baseline export before rollback after a multi-room save. The merge-time evidence above is historical, not a claim that the later review was absent indefinitely.

Claim accepted on main at `a1606c2af30ebbab3b5ceee5ab671694bc8a48c6`; branch begins there. [Implementation handoff](../../v1/roster/ROSTER_UNBLOCK_2026-11-16.md) records reproduction, ownership, visible changes, test commands, limitations and rollback. Merge records are updated on this branch; all three reviewed integrations are already on main.

F01/F02, H02/B04/B05 and B08/G01/G02 have implementation and local browser/Worker/D1 evidence. G03's claimed empty-school failure is disproved by the actual home request and was not changed. The probe removes only F01/F02; unrelated missing operations and all negative controls remain. No later job or overlapping implementation PR was started. Pre-publication refresh found no open PRs and main still at the claim commit.

Focused local flows and unchanged Roster service regression passed. Canonical build passed with no tracked drift; both unchanged runners discover all six new programs (104 product / 1,205 Node). Full reruns and exact-head CI are pending at this documentation checkpoint; the PR records their actual outcomes, including failures. The final code inventory is a subset of the 34 explicit allowed paths. Product code remains entirely under `v1/`; there are no build, workflow, schema, generated-output or v0.9 changes.

| Gate | Evidence/status at handoff preparation |
| --- | --- |
| Q01 | Pass: explicit Job 3 authority, accepted claim, exact allowlist, fresh main/open-PR check and mechanical merge inventory. |
| Q02 | Pass for builder inspection: Roster leases/mappings/allocations, Contacts identity/authority, Venues room IDs and Deploy saved-workload projection retain separate owners. Claude review pending. |
| Q03 | Pass for focused local checks: capability, current accepted authority, foreign-room/school, stale revision and changed-intent guards; no role inference or secret changes. Full regression outcome in PR. |
| Q04 | Local evidence: competing tabs, fencing/expiry, same-operation reload/restart recovery, exact saved-revision pins; no cross-D1 atomicity claim. New source-pin/corrupt-pointer assertions are included in the full rerun. |
| Q05 | Pass for builder inspection: existing bounds retained, 120-second lease, maximum eight mapping drafts, maximum 32 rooms per source label, one saved-version estimate, no new dependencies/build patches. |
| Q06 | Pending full local/CI results in PR. Focused browser and owner tests, discovery and clean canonical build are recorded in the handoff. |
| Q07 | Pending Claude exact-head review of the single bounded implementation PR. Every commit is attributed `Model: Codex`. |
| Q08 | Not applicable to deployment: no authority granted. C-1/C-2 remain release gates; runtime UAT and T1B-01/T1B-02 Not tested; F5 OPEN. |
