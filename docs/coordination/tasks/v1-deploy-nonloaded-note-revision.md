# Deploy notes for a version that is not loaded

- Status: claimed on 18 November 2026 SGT
- Model: Codex
- Reviewer: Muse
- Branch: `codex/v1-deploy-nonloaded-note-revision`
- Implementation base: `6b0b17165dd270578d0f3b673c15f56d554d50ff`
- Owner request: fix the consecutive version-note save conflict disclosed in Muse's exact-head review of #205 at `456f264796ea24ed03a51df9fe3eb96f9edf1cd5`.
- Exact scope: this task record, `v1/services/deploy/service.mjs`, `v1/web/shared/client.js`, and `tests/v1-product-deploy-note-revision-browser.mjs`. No overlapping open PR at claim.

With A loaded, save B's note, Refresh, and save B's note again. The Versions list already returns B's current revision, but the client caches only A's. It also receives no B note text from the list. Keep the list note and revision together, capture each version's revision using the existing monotonic client cache, and surface the observed revision on the existing current-note read after a confirmed save.

Exercise the real built browser and local Deploy Worker/D1 with synthetic data. Verify the second save after Refresh, another save without Refresh, a genuine concurrent edit that retains the draft and protects the saved note, and the unchanged receipt recovery and Duplicate regressions. Keep the owner's revision, expected-note, role, lease and operation guards and existing recovery request identities.

Skill used: Fix Root Causes from Pstack. Trace the sync response, browser revision cache, and the owner write. Reproduce before changing product source.

No merge, deployment, live data or setting changes as part of this task.
