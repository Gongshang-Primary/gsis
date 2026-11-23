# Deploy Workload Settings view-first

- **Status** Locally verified on 23 November 2026, Asia/Singapore. Product CI and Muse review pending.
- **Builder** Codex
- **Reviewer** Muse at the exact head
- **Branch** `codex/v1-deploy-workload-settings-view`
- **Base before claim** `5119a9b97f6ae5e69acbf9cc588b056848a9f27f`
- **Owner request** Implement DEP-23-004 and investigate DEP-23-005 from the [pinned Workload Settings UAT log](https://github.com/Gongshang-Primary/gsis/blob/9fa9f2df5e8b2bfb2ff7fcb5fac9415441003fd0/docs/v1/DEPLOY_WORKLOAD_SETTINGS_UAT_2026-11-23.md).
- **Exact scope** This record, `v1/web/shared/deploy-ui-tables.js`, `v1/web/shared/deploy-workload-settings-ui.js`, `tests/v1-product-deploy-workload-settings-browser.mjs`, and the explicit browser module map in `tests/v1-product-table-deploy-settings.mjs`.

Open the selected version's Workload Settings as a compact view. Require a user Edit action to open the existing form. Cancel and Apply return to the view. Keep the current save queue, validation, capability and workbook paths. Show configured countable activities or an empty state for the selected version. Verify that the saved activities survive subject edits, and check for an authenticated read path before claiming hosted IMP evidence.

Exercise the built UI with local Workers and D1, including arrival and re-entry, version switching, Cancel, Apply and real save/reload. Check version-scoped activity presence, editor capability, and workbook availability. Activity authoring, permissions, hosted writes and deployment are outside the claim.

## Implementation

The accepted claim is `2f59e3580676cfca2f8c6b587d0af6a170589926`. The fixture scope update is `fad70c08910243433abcd77ba7749974476232a9`. The v1 view reads the existing Workload workbook's subject rows and the selected document's validated activity list. Arrival renders compact tables with an explicit **Edit** action for current Deploy editors. Where the selected document has an empty activity list, the view states that it has no configured countable activities.

**Edit** invokes the existing form. Cancel and Apply return to Workload Settings. Apply queues the validated change and the existing Save to online control commits it. The native editor retains the original activity records and No FTT values. The view supports its visible report and saved-version workbook exports. The editor retains the Workload workbook import preview and its existing server contract.

DEP-23-005 remains open for hosted verification. The hosted session endpoint returned HTTP 401 without a signed-in session. The Browser Control skill was consulted and its connected browser tools were unavailable. The displayed UAT version's activity presence, periods and participants remain unverified. Local fixtures prove that a saved IMP is displayed for its own version, survives subject settings saves, and is absent from a different version without an activity record.

## Verification

The baseline built-browser run failed on entry because the view marker was missing and the native form had opened. On the repaired source the focused test passed all five groups in 13.817 seconds. It exercised two synthetic versions, Excel export and the existing import preview, clean and dirty Cancel, Apply followed by real save/reload, preservation of IMP and No FTT, and denial of edits for a read-only account. The test explicitly selects the intended version after reload.

| Command | Result |
| --- | --- |
| `node tests/v1-product-deploy-workload-settings-browser.mjs` | Pass, five groups on built UI, real local Workers and D1. |
| `node tests/v1-product-table-deploy-settings.mjs` | Pass. Both intercepted-origin fixtures serve the new module, and the workbook dialog mock selects its adapter by table selector. Workbook validation and receipt recovery assertions still run. |
| `node tests/v1-product-deploy-compact-refresh-browser.mjs` | Pass. Compaction on entry, refresh and version load. |
| `node tests/v1-product-deploy-planning-save-controls-browser.mjs` | Pass, four groups. Ordinary saves, original-save recovery and read-only controls on the six planning pages. |
| `node tests/imp-nonteaching-ui.cjs` | Pass. Existing activity display, calculation and save preservation. |
| Canonical build, v1 build and `node scripts/v1/verify-build.mjs` | Pass. 18 canonical components with clean regeneration, all nine dry runs and the local migration upgrade. |
| Syntax checks, diff whitespace and product test discovery | Pass. |

Browser tests used `TZ=Asia/Singapore` and `GSIS_BROWSER_EXECUTABLE=/usr/bin/chromium`. Local runtime verification follows the scope above. Existing capability, workbook validation, owner save and receipt contracts remain authoritative. The code-only rollback reverts the two v1 frontend files. Muse reviews the exact head. Deployment is outside scope and hosted UAT is pending.
