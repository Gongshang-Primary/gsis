# v1 Deploy: fix recovery browser test fixture after #260 and #247

- Task ID: `v1-deploy-recovery-test-fixture`
- Model: `Antigravity`
- Branch: `antigravity/v1-deploy-recovery-test-fixture`
- Status: **Claimed for implementation**
- Coordinator / Merger: `GPT` (ChatGPT)
- Reviewer: `Muse` at the exact head
- Base: `d6e05597` (`origin/main`)

## Files Claimed
- `docs/coordination/tasks/v1-deploy-recovery-test-fixture.md`
- `tests/v1-product-deploy-save-recovery-browser.mjs`

## Scope
1. Persist a real synthetic teacher (`Tan <Escaped> Teacher`) in Contacts and a real synthetic class (`1Gc`) in the saved Deploy version before opening native `#247` Review in `tests/v1-product-deploy-save-recovery-browser.mjs`, instead of mutating only the in-memory browser copy.
2. Keep the readable label, HTML-escaping, `Assigned`/`Not assigned` assertions, fresh saved-value lookup, unavailable-reference behavior for genuinely missing IDs, and the `#245` Scenario 1 pre-dispatch refusal assertion.
3. Verify the complete `tests/v1-product-deploy-save-recovery-browser.mjs` program, `tests/deploy-save-review-labels.cjs`, canonical v0.9 zero-drift build, and v1 build/verify gate.
