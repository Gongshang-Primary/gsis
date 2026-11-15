# v1-deploy-draft-status: UAT019 saved draft venue controls

- Status: merged [PR161](https://github.com/helper-gsps/gsis/pull/161) at reviewed head `1f4121a6b54de6f9973934992fea395fdc3cab81` as `706d9c8c274211c880d27e41711db49e721e3c6c`; not deployed by this merge task.
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

Applied the already selected Pstack root-cause skill (`skill://plugins_6a85a87df50c8191bd7f010bb7b17794/principle-fix-root-causes/SKILL.md`): reproduce behaviour, fix the compatibility boundary and test negative cases. No new skill/dependency installation.

Claim accepted on main at `7b5f1eb2a9c12b9d27ffd9dab4de694f8885aefd`, then re-read. The implementation adds one anchored v1-only builder replacement: `planning` becomes `draft` in the venue-clear predicate, with every other conjunct unchanged. Production `public/app.js` and backend contracts are untouched.

Red: the actual built mobile-width browser, backed by local Workers/D1, failed `A native v1 saved draft must offer clear-assignment preview to Admin` (false versus true). Green: six groups cover draft eligibility, preview/cancel with zero writes, queue-only then actual saved clear preserving identities, published and previously published versions, a non-Admin editor, and read-only Admin impersonation. Fixture setup corrections (operation ID slug, packed-toolbar locator, about:blank storage initialization) preceded the final result and were not product failures. Only the new test was formatted with cached Prettier 3.6.2; no dependency was added.

Commands already passed with `TZ=Asia/Singapore` and browser `/usr/bin/chromium`:
- `node tests/v1-product-deploy-draft-status.mjs` — six groups.
- `node tests/release089-clear-venues-ui.cjs` and `node tests/v1-product-table-deploy-settings.mjs` — unchanged regressions.
- `for f in tests/v1-core-*.mjs tests/v1-contacts-*.mjs; do node "$f" || exit; done` — 12 programs, 56 cases.
- `npm run build` — canonical build, no tracked generated drift.
- Both runner `--list` commands — new program discovered; 74 product and 1,173 full Node programs. The first auxiliary discovery assertion expected a `tests/` prefix; corrected to the runners' actual basename lists without changing either runner.
- Syntax and `git diff --check` — passed.

Exact committed-head commands to record in the PR: `node scripts/v1/test.mjs`; `npm test` (Node plus LORD); existing full-suite and isolated-product CI. Use `LORD_TEST_CHROMIUM`, `ROSTER_TEST_CHROMIUM` and `GSIS_BROWSER_EXECUTABLE` as `/usr/bin/chromium` locally. The PR records actual exit codes, counts, omissions, head SHA and run URLs; a planned command here is not a pass. Build/test output stays in ignored delivery paths, not this four-file diff.

Q01–Q05 Pass: bounded accepted claim, unchanged authoritative state/permission/commit contracts, built-browser negatives, no new dependencies or runtime work. Q06: focused/build/discovery pass above; full exact-head results are authoritative in the PR, pending until supplied. Q07 Pending Claude. Q08 Not applicable to deployment. Rollback restores the prior v1 builder; there is no data/schema change. F5 remains OPEN. Official T1B-01/T1B-02 and unperformed runtime UAT remain Not tested.

## 15 November 2026 — owner-authorised integration

The owner instructed Codex to merge applicable PRs one by one in logical order. Claude's approval and exact-head CI were rechecked before this merge; its tree matches the automatic merge of both parents without hand edits. This closes the implementation/documentation claim represented by this PR. Later UAT findings remain in their own queue and claims; merging is not hosted acceptance. The merge inventory and remaining gates are in `docs/coordination/tasks/v1-merge-records-20261115.md`. No deployment or live-data operation occurred. F5 OPEN; official T1B-01/T1B-02 and unperformed runtime UAT Not tested.
