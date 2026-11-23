# Review: PR #284 — Log Deploy Stats and Ledger relief quota availability (Muse, exact head 16a61d3f)

Project: v1 documentation (UAT log). Reviewer: Muse, at the exact head SHA, under the owner's 16 Nov 2026 directive (source commit 12b06eb): Muse reviews v1 PRs at the exact head, replacing Claude until Claude returns; no code, merges or coordination. GPT merges.

## Verdict

**APPROVED at exact head `16a61d3f2a057e128f9bf98c87822be76464aed1`.**

## PR

- #284, `codex/v1-deploy-stats-uat-20261123`, "Model: Codex / Log Deploy Stats and Ledger relief quota availability".
- State at review: OPEN, not a draft, MERGEABLE/CLEAN. Base `016e0367` (the Stats parity log claim commit).
- Docs only: DEP-23-002 (Stats shows unavailable relief averages alongside planning figures) and DEP-23-003 (calculate individual R when the required inputs are present), from the owner's v1.10 screenshots.

## CI at the exact head

- Verify GSiS queue changes at the head: `full-suite` pass, `scope` pass, regression shards **skipped** by design under #280's scope rule (one file under `docs/v1/`).
- No "Isolated v1 product" run: product CI has no automatic docs-only trigger. This PR changes documentation only.

## Scope

Diff against the merge-base (`016e0367`): **1 file, 39 insertions, 0 deletions** — `docs/v1/DEPLOY_STATS_UAT_2026-11-23.md` (new).

- `git merge-tree --write-tree --name-only origin/main 16a61d3f` returns a clean tree (`1d2fb537…`). No conflicts.
- `git diff --check` clean. No secrets (documentation only).

## Content verification (read and re-run, not trusted)

- **Renderer identity verified at source and built-asset level.** `workloadReference` (2,831 chars), `reliefResultData` (263 chars) and `renderWorkloadStats` (508 chars) are byte-identical between the v0.9.9y source (`d9d180c`, `public/workload-ui.js` / `public/relief-ui.js`) and the built v1.10 Deploy asset (`product/web/assets/deploy/app.js` in release artifact 14758464741, downloaded and unpacked for this check). The log's identity claim is therefore verified.
- **Averaging rule verified by reading.** In `workloadReference`, the `stat` helper takes each row's quota (`relief.byTeacher[id]?.quota ?? null`) and returns `'Unavailable'` when the category is empty or any value is not finite; otherwise it returns the arithmetic mean. That is exactly the log's probe table: quotas 2 and 4 average 3, quotas 0 and 4 average 2 (0 is finite and included), and a null quota, an omitted quota row, an empty category, or a pending/stale projection each produce `Unavailable`. The on-screen hint states the same rule.
- **Calculator behaviour verified by running it.** A local probe of the deployed source's shared calculator (`shared/relief.js`, `analyse`) with synthetic inputs: complete inputs return a numeric quota; a valid zero cap returns quota 0; incomplete individual workload returns null with reason `'Workload data is incomplete.'`; incomplete schoolwide teaching demand returns null with `'Teaching demand is incomplete.'`; ineligible staff returns null with `'Not eligible for relief.'`. The log's stated R = 20 for its complete fixture is fixture-dependent (settings and inputs); the behaviour classes — numeric R, valid zero, null plus the specific reason per blocker — are verified here.
- **Accepted-evidence calculation verified.** In `v1/services/deploy/model.mjs`, `calculate` builds the source from the version's planning view, then sets `teacherDrafts: {}` (draft teacher overrides cleared) and requires `teachingEligibility.state === "eligible"` for relief eligibility, before running `Relief.analyse`. That matches the log's description of the Deploy Worker calculation.
- **#259 test claim verified — after reading the right test.** The log says the #259 browser test covers restored planning pools with a server-sourced quota still unavailable. The #259 test is `tests/v1-product-deploy-workload-planning-browser.mjs` (not the planning-eligibility test): it asserts "planning Workload restores full-time/specialist pools", "Ledger R stays server-sourced and unavailable", and "Stats and Ledger share the planning basis without inventing R". The claim is accurate.
- **Open items are stated as open.** The log says the screenshot alone leaves the actual hosted reason open, that a matching hosted v0.9 Stats screenshot was unavailable, and that hosted records and matched-version numeric parity were outside the investigation. Nothing here is claimed beyond its evidence.

## Findings

None.

## Quality gates

- Q01 (scope): one documentation file inside the task's stated scope. Pass.
- Q02–Q04: no implementation change. Not applicable.
- Q05: queue CI green at the exact head. Pass.
- Q06: renderer identity verified at source and built-asset level; calculator behaviour verified by running it; no build is affected by a docs-only change. Pass.
- Q07: records verified against live state as listed above. Pass.
- Q08: this exact-head review. Pass.
- F5 remains OPEN. This PR is a UAT log; it does not close it. The repair (PR #286) is a separate PR.

## Release notes

Docs only. No deployment, migration or live-data effect. GPT to merge.
