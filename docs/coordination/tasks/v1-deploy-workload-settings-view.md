# Deploy Workload Settings view-first

- **Status** Claimed on 23 November 2026, Asia/Singapore
- **Builder** Codex
- **Reviewer** Muse at the exact head
- **Branch** `codex/v1-deploy-workload-settings-view`
- **Base before claim** `5119a9b97f6ae5e69acbf9cc588b056848a9f27f`
- **Owner request** Implement DEP-23-004 and investigate DEP-23-005 from the [pinned Workload Settings UAT log](https://github.com/Gongshang-Primary/gsis/blob/9fa9f2df5e8b2bfb2ff7fcb5fac9415441003fd0/docs/v1/DEPLOY_WORKLOAD_SETTINGS_UAT_2026-11-23.md).
- **Exact scope** This record, `v1/web/shared/deploy-ui-tables.js`, `v1/web/shared/deploy-workload-settings-ui.js`, and `tests/v1-product-deploy-workload-settings-browser.mjs`.

Open the selected version's Workload Settings as a compact view. Require a user Edit action to open the existing form. Cancel and Apply return to the view. Keep the current save queue, validation, capability and workbook paths. Show configured countable activities or an empty state for the selected version. Verify that the saved activities survive subject edits, and check for an authenticated read path before claiming hosted IMP evidence.

Exercise the built UI with local Workers and D1, including arrival and re-entry, version switching, Cancel, Apply and real save/reload. Check version-scoped activity presence, editor capability, and workbook availability. This task does not author activity data, change product permissions, deploy, or write to hosted records.
