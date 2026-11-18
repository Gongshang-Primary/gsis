# Deploy notes for a version that is not loaded

- Status: locally verified on 18 November 2026 SGT
- Model: Codex
- Reviewer: Muse
- Branch: `codex/v1-deploy-nonloaded-note-revision`
- Implementation base: `6b0b17165dd270578d0f3b673c15f56d554d50ff`
- Owner request: fix the consecutive version-note save conflict disclosed in Muse's exact-head review of #205 at `456f264796ea24ed03a51df9fe3eb96f9edf1cd5`.
- Exact scope: this task record, `v1/services/deploy/service.mjs`, `v1/web/shared/client.js`, and `tests/v1-product-deploy-note-revision-browser.mjs`. No overlapping open PR at claim.

With A loaded, save B's note, Refresh, and save B's note again. The Versions list already returns B's current revision, but the client caches only A's. It also receives no B note text from the list. Keep the list note and revision together, capture each version's revision using the existing monotonic client cache, and surface the observed revision on the existing current-note read after a confirmed save.

Exercise the real built browser and local Deploy Worker/D1 with synthetic data. Verify the second save after Refresh, another save without Refresh, a genuine concurrent edit that retains the draft and protects the saved note, and the unchanged receipt recovery and Duplicate regressions. Keep the owner's revision, expected-note, role, lease and operation guards and existing recovery request identities.

Skill used: Fix Root Causes from Pstack. Trace the sync response, browser revision cache, and the owner write. Reproduce before changing product source.

## Implementation and evidence

- The existing school-scoped version list projects the saved note and its revision from the same row, up to the existing 200-version limit. The current-note response includes the revision from its loaded document. The browser adds each valid Deploy version entry to the existing monotonic cache after response and session checks. No additional request or database write is needed.
- A new real-browser regression reproduced the original defect on the claim source. After the first save and Refresh, the second request sent revision 0 even though the side version had committed revision 1, and the local Worker returned `409 REVISION_CONFLICT` (`/tmp/gsis-nonloaded-note-red.log`).
- With the fix, `node tests/v1-product-deploy-note-revision-browser.mjs` passed three groups in 12.490 seconds. Both notes saved with A still loaded, a third save worked without Refresh, and a competing editor's note remained saved while the attempted overwrite retained its original draft and conflict receipt. A's stored document was identical.
- Unchanged local regressions `v1-product-deploy-save-recovery-browser.mjs` (15 groups), `v1-product-deploy-duplicate-selection-browser.mjs` (10 groups), and `v1-product-deploy-duplicate-contacts.mjs` passed. Browser checks used locked Chromium and `TZ=Asia/Singapore`.
- `npm run build` regenerated all 18 components without tracked drift. `node scripts/v1/build.mjs` and `node scripts/v1/verify-build.mjs` passed, including nine local dry runs and a local migration upgrade check. Maximum-size lists and delayed-response ordering were reviewed in source and were not separate browser cases.

Exact-head CI and Muse review are pending. No merge, deployment, live data or setting changes as part of this task. Hosted UAT remains Not tested.
