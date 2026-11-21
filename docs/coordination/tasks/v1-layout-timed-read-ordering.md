# Layout timed timetable request ordering

- Status: claimed on 21 November 2026 SGT.
- Model: Codex. Coordinator: ChatGPT. Exact-head reviewer: Muse.
- Branch: `codex/v1-layout-timed-read-ordering`.
- Base: `a2fbeae380b91fdf3fbd1c1c82175a7bb4235a21`.
- Scope: this task record, `v1/web/shared/layout-editor.js` and `tests/v1-product-layout-timed-timetable-browser.mjs`. Open PRs #182, #245, #247 and #254 have no path overlap.

The owner asked to address the date request race discovered after [#252](https://github.com/Gongshang-Primary/gsis/pull/252). The browser checks the security epoch but applies either response in arrival order. A deferred two-request source harness rendered 24 November, then 23 November, with 24 November still selected.

Keep the result and error from the latest submitted year/date request. Clear protected state on account change, including an outstanding request and its status. Exercise the real built browser and local Worker when response completions are reversed. Preserve the existing untimed layout and timed source data.

The Pstack Fix Root Causes skill guides reproduction and boundary verification. Test with synthetic data only. No schema, authority, provider, live-data or deployment changes are in scope.
