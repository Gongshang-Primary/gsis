# Deploy relief quota explanations

- **Status** Local browser verification passed on 23 November 2026. Product CI and Muse review are pending.
- **Builder** Codex
- **Reviewer** Muse at the exact head
- **Branch** `codex/v1-deploy-relief-quota-reasons`
- **Base before claim** `b952c7e402323c53c6ae3ad834a6c52552842378`
- **Owner requirement** R should calculate when the required inputs exist.
- **Exact scope** This task record, `scripts/v1/build-web.mjs` for module inclusion, `v1/web/shared/deploy-relief-ui.js` and `tests/v1-product-deploy-relief-quota-browser.mjs`.
- **Evidence** [DEP-23-002 and DEP-23-003 at the UAT log head](https://github.com/Gongshang-Primary/gsis/blob/16a61d3f2a057e128f9bf98c87822be76464aed1/docs/v1/DEPLOY_STATS_UAT_2026-11-23.md)

Expose the reason an individual relief quota is unavailable in Ledger and Stats, including missing accepted eligibility and pending or stale calculations. Preserve the saved quota, the complete-group Stats average and accepted Contacts and publication rules. The synthetic shared calculator returns numbers for sufficient inputs. The hosted cause remains unverified.

Use the built Deploy browser, real local Workers and D1 to show a missing prerequisite and then restore it. Verify numeric zero, a complete category average, pending and stale messages, consistent values with Relief Settings and read-only reporting. Exclude live data access, changes to eligibility policy, provider activity and deployment.

## Diagnosis and change

The accepted claim is `d0ff8f5d6e8386295af04a4beaf4318402cc321e`. A synthetic saved version with two active teachers returned R = 47 for the teacher with accepted EO evidence and an unavailable quota for the teacher without it. Ledger displayed the numeric result and `Unavailable`; Stats withheld the category average. The regression first failed on that built source because Ledger offered no explanation.

Ledger and Stats now identify the unavailable quotas in the selected version and show the calculation reason from Deploy. They also identify which accepted activity, EO or school-section evidence is missing when the projection carries those reasons. A pending calculation asks the planner to save. A stale result asks them to refresh once any pending changes are saved. The list covers the version, including applicable rows outside the current table filter.

On the same fixture, accepting the missing EO evidence through Contacts produced R = 0 for the second teacher and a complete group average of 23.5. Ledger and Relief Settings displayed the zero. This change reads the existing calculation and evidence. The browser does not compute R or grant eligibility. The accepted Contacts basis, publication rules, group-average rule and workbook results are unchanged.

## Verification

All commands ran with `TZ=Asia/Singapore`. The browser programs used local Chromium and isolated Workers/D1.

| Check | Result |
| --- | --- |
| `node tests/v1-product-deploy-relief-quota-browser.mjs` | Pass. Reproduced the missing explanation at baseline. Verified the blocked and complete cases in Ledger, Stats and Relief Settings, pending and stale instructions, no browser errors and identical saved version data after the report reads. |
| `node tests/v1-product-deploy-workload-planning-browser.mjs` | Pass, four groups. Planning eligibility, workbook basis and accepted relief/publication boundaries. |
| `node tests/v1-product-deploy-saved-teacher-membership.mjs` | Pass, five groups. Adjacent historical-version and Contacts candidate separation regression for #212. |
| Canonical build, v1 build and v1 build verification | Pass. All 18 canonical components regenerated with no tracked drift. All nine isolated Wrangler dry runs and the local migration upgrade passed. |
| Syntax, diff whitespace and product test discovery | Pass. |

The combined Duty and relief browser checks passed on a clean integration of both branches. A follow-up test set pending and stale together. The first relief implementation offered Refresh even though the native refresh path leaves queued edits in place. The test now verifies that Save takes precedence, and the built browser passes all three flag combinations.

The hosted version and returned prerequisite that caused the owner's screenshot remain unverified. Hosted reproduction needs the same saved version/revision and its actual Deploy result. No live records were read or changed. The rollback removes the v1 report module and its script inclusion. No migration or data rollback is required.
