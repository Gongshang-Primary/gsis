# Deploy relief quota explanations

- **Status** Claimed on 23 November 2026, 11:35 SGT
- **Builder** Codex
- **Reviewer** Muse at the exact head
- **Branch** `codex/v1-deploy-relief-quota-reasons`
- **Base before claim** `b952c7e402323c53c6ae3ad834a6c52552842378`
- **Owner requirement** R should calculate when the required inputs exist.
- **Exact scope** This task record, `scripts/v1/build-web.mjs` for module inclusion, `v1/web/shared/deploy-relief-ui.js` and `tests/v1-product-deploy-relief-quota-browser.mjs`.
- **Evidence** [DEP-23-002 and DEP-23-003 at the UAT log head](https://github.com/Gongshang-Primary/gsis/blob/16a61d3f2a057e128f9bf98c87822be76464aed1/docs/v1/DEPLOY_STATS_UAT_2026-11-23.md)

Expose the reason an individual relief quota is unavailable in Ledger and Stats, including missing accepted eligibility and pending or stale calculations. Preserve the saved quota, the complete-group Stats average and accepted Contacts and publication rules. The synthetic shared calculator returns numbers for sufficient inputs. The hosted cause remains unverified.

Use the built Deploy browser, real local Workers and D1 to show a missing prerequisite and then restore it. Verify numeric zero, a complete category average, pending and stale messages, consistent values with Relief Settings and read-only reporting. Exclude live data access, changes to eligibility policy, provider activity and deployment.
