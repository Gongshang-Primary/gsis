# v0.8.00a validation

Scope: item 049 against v0.8.0 commit 567ddeacf164cd3aedf1fbfdecdc964818eeb298. The clarified requirement is immediate saving when No relief instructions is clicked. All runtime changes belong to the Roster frontend deployment item. Only index.html and roster-operations-ui.js differ. The gateway Worker and its shared notification bundle remain byte-for-byte unchanged.

## Behavior verification

The new tests/absence080a-save-shortcut.cjs first failed against the original source: mouse activation sent zero mutations where one immediate save was required. It passes against the patch using real Chromium, the production UI/domain and synthetic staff/transport.

The check covers mouse, touch, Enter, Space, double click, busy/pending protection, preserved instruction text, a definitive validation rejection followed by the normal Submit retry, saved-record edits without another absence, and exact receipt recovery after a lost acknowledgement. The period review remains local. A separate reviewer also checked a fast-response double click without a held request; it preserved a single absence with No relief instructions selected.

Six adapted Node suites passed: absence718d-flow, roster-draft-absence-instructions-browser, roster704-report-load, roster712-absence-eligibility-browser, roster716-absence-fast-browser and roster718-absence-performance-browser. These retain coverage for written instructions through the bottom Submit button, cancellation, dates, roles, multiple teachers, full-shell loading, permission checks, multi-day saves and receipt recovery. Existing Python browser scenarios in roster701_browser.py were updated and syntax checked; that historical runner was not executed because Python Playwright is absent. The current Node Chromium suites exercise the affected flows.

## Review

Ponytail and Pstack guided the narrow change and reuse of the existing save operation. Superpowers guided the failing regression and verification. Thermonuclear correctness and structural reviewers independently inspected the same runtime diff with the Vercel contract, security and reliability lens. Both reported no material findings and independently executed the new Chromium regression successfully. There is no new dependency or backend contract.

## Release gates

The full npm test invocation completed with 427 of 429 scripts passing. Two failures were investigated:

1. roster702-notification-setup.mjs detected that an initially bumped gateway version label would require regenerating the otherwise unchanged notification bundle. That unnecessary label change was removed. The gateway is now identical to v0.8.0, and this test passes on rerun, including its signed diagnostics and dispatch contract checks.
2. package.cjs requires a newly built complete GSiS_v0.8.0_Deployment.zip with current source parity. That full-suite ZIP intentionally does not exist in this surgical patch checkout. No replacement full package was built. tests/hotfix080a-package.py is the applicable package gate for this release.

All 428 applicable executable regression scripts passed across the full invocation and the scoped rerun. The full npm invocation itself had a nonzero exit status; it is not reported as an entirely green run. Syntax and whitespace checks passed. The separate surgical package gate verifies the release commit/tag, checksums, complete frontend contents, exact changed-source diff, incremental Git history and preservation of all other deployment components. It runs after the source commit and packaging; its successful output is required before delivery.

Local tests use synthetic data. No production deployment, real absence or staff message was performed. These tests do not establish production latency or delivery success.
