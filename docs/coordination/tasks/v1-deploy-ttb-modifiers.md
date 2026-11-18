# Deploy TTb Name follows the selected version's modifiers

Model: Codex. Claimed and locally verified on 18 November 2026 SGT. Reviewer: Muse.

- Branch: `codex/v1-deploy-ttb-modifiers`. Base: `8c2ece8f6cabdb1956b4775c01a1364fd898a2ed`.
- Owner requested a quick fix for PE missing from TTb Name. This is the same stale-name defect as DEP-17-004, previously requested for employment modifiers.
- Exact scope: this task, `v1/web/shared/ttb-name.mjs`, `v1/contacts/direct-fields.mjs`, `v1/web/shared/deploy-eligibility.mjs`, `v1/web/shared/deploy-ui.js`, `v1/services/deploy/model.mjs`, `v1/services/contacts/service.mjs`, and `tests/v1-product-deploy-ttb-modifiers-browser.mjs`.
- The other open PRs and already reviewed follow-up branches retain their current heads. The edits to Deploy's UI and model use separate hunks from those branches.

Deploy derives the current name from the selected version's effective Basic Name and modifier fields. The current formatter's ordering, visibility, aliases, kept suffix and length limit apply. Draft values are visible immediately, and saved values drive the reloaded name and export. Keep the stored Basic Name and the stable Staff ID. A read must not rewrite stored rows, earlier publications or Contacts. Existing authority and accepted workload inputs govern their separate decisions.

Use an actual built browser with synthetic Workers and D1. Cover the bare stale label with saved PE, an edit before and after Save, explicit clears, repeated tags in the existing Basic Name, retained name suffix, and exported names. The broader atomic TTb namespace work remains tracked in the Contacts lifecycle design.

The browser and the Deploy Worker share the existing formatter. The Contacts projection supplies only effective name suffix and retained name presentation for this calculation. A name already formatted in a profile with no name draft remains available as a fallback. The change affects the web assets, Deploy Worker and Contacts projection, with no schema change.

- The new browser test failed at the original PE heading at claim `980cbb1`. With the fix, all four groups passed in 13.417 seconds under the existing 45-second limit using installed Chromium and `TZ=Asia/Singapore`. Both actual UI saves, both reloads and canonical Teachers exports agreed. Contacts rows, stable Staff IDs and stored Basic Names passed the isolation checks. The fixture intercepted the Google bootstrap asset and made no provider calls.
- `node tests/v1-contacts-direct-fields.mjs`, `node tests/v1-contacts-direct-compatibility.mjs`, `node tests/v1-contacts-catalogues.mjs` and `node tests/v1-product-deploy-workbooks.mjs` passed. The unchanged workbook regression also checks the old projection fallback.
- `npm run build` passed without generated drift. `node scripts/v1/build.mjs` built nine Workers and 374 artifacts. `node scripts/v1/verify-build.mjs` passed nine dry runs and local migration upgrade verification.
- Full CI and Muse review are pending at the pushed commit. Hosted UAT remains Not tested.
