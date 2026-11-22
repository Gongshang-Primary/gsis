# v1 Deploy: fix recovery browser test fixture after #260 and #247

- Task ID: `v1-deploy-recovery-test-fixture`
- Model: `Antigravity`
- Branch: `antigravity/v1-deploy-recovery-test-fixture`
- Status: **Ready for Muse review**
- Coordinator / Merger: `GPT` (ChatGPT)
- Reviewer: `Muse` at the exact head
- Base: `d6e05597` (`origin/main`)

## Files Claimed
- `docs/coordination/tasks/v1-deploy-recovery-test-fixture.md`
- `tests/v1-product-deploy-save-recovery-browser.mjs`

## Scope
1. Persisted a real synthetic teacher (`Tan <Escaped> Teacher`) in Contacts (with `acceptContacts`) and a real synthetic class (`1Gc`) in `activeVersion` before opening native `#247` Review in `tests/v1-product-deploy-save-recovery-browser.mjs`, instead of mutating only the in-memory browser copy.
2. Kept the readable label, HTML-escaping, `Assigned`/`Not assigned` assertions, fresh saved-value lookup, explicit `Unavailable teacher` fallback check for genuinely missing IDs, and the `#245` Scenario 1 pre-dispatch refusal assertion.

## Verification (`TZ=Asia/Singapore`)
- `TZ=Asia/Singapore GSIS_BROWSER_EXECUTABLE=/usr/bin/chromium node tests/v1-product-deploy-save-recovery-browser.mjs` — PASS (all 17 groups)
- `TZ=Asia/Singapore node tests/deploy-save-review-labels.cjs` — PASS
- `TZ=Asia/Singapore npm run build && git diff --exit-code -- roster-update/ public/ shared/` — PASS (zero v0.9 drift)
- `TZ=Asia/Singapore node scripts/v1/build.mjs && TZ=Asia/Singapore node scripts/v1/verify-build.mjs` — PASS
- `git diff --check` — PASS
