# Layout timed timetable request ordering

- Status: implemented and verified locally on 21 November 2026 SGT. Exact-head CI and Muse review follow.
- Model: Codex. Coordinator: ChatGPT. Exact-head reviewer: Muse.
- Branch: `codex/v1-layout-timed-read-ordering`.
- Base: `a2fbeae380b91fdf3fbd1c1c82175a7bb4235a21`.
- Scope: this task record, `v1/web/shared/layout-editor.js` and `tests/v1-product-layout-timed-timetable-browser.mjs`. Open PRs #182, #245, #247 and #254 have no path overlap.

The owner asked to address the date request race discovered after [#252](https://github.com/Gongshang-Primary/gsis/pull/252). The browser checks the security epoch but applies either response in arrival order. A deferred two-request source harness rendered 24 November, then 23 November, with 24 November still selected.

Keep the result and error from the latest submitted year/date request. Clear protected state on account change, including an outstanding request and its status. Exercise the real built browser and local Worker when response completions are reversed. Preserve the existing untimed layout and timed source data.

The Pstack Fix Root Causes skill guides reproduction and boundary verification. Test with synthetic data only. No schema, authority, provider, live-data or deployment changes are in scope.

Use one sequence for timed reads. Starting a load clears the previous result and gives the new request a sequence. Only that request can update the result or error. Protected-state clearing invalidates outstanding timed requests. The startup path checks its original security epoch before starting the timed load.

## Verification

- Baseline built-browser regression failed on the old 23 November reply replacing the already rendered 24 November reply. Both responses came from the real local Worker; only their delivery order was controlled.
- With the fix, `TZ=Asia/Singapore GSIS_BROWSER_EXECUTABLE=/usr/bin/chromium node tests/v1-product-layout-timed-timetable-browser.mjs` passed. Coverage includes reversed successes, stale and current errors, uncovered dates, and late success/failure after protected-state clearing.
- `node tests/v1-product-layout-timed-source.mjs` passed. Canonical `npm run build` had zero legacy drift. `node scripts/v1/build.mjs`, `node scripts/v1/verify-build.mjs` and `git diff --check` passed, including nine local Worker dry runs and the local migration upgrade.
- The changed product artifact is the Layout browser module in the web bundle. Hosted UAT is not tested. Rollback can revert this UI change without changing stored data.
