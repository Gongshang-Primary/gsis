# lord-return-assertions-before-submit: move two return-form assertions before the submit click

- Status: draft PR #103 opened 7 Nov 2026, head f3f0e67, CI run 42359057289 green; task-record commit moves the head, PR body to be updated to the new head after its CI is green.
- Owner/model: Muse
- Reviewer/model: Codex
- Last updated (Asia/Singapore): 7 Nov 2026
- Branch: muse/lord-return-assertions-before-submit
- Base SHA: 37a9306
- Current head SHA (or PR head; avoid self-referential commit hashes):
- PR: #103
- User-authorised scope: test-only. Move the two return-form assertions in `lord-suite/tests/booking-remarks-return-browser.cjs` (no per-trolley selection checkbox; no return accordion) to before the submit click, so they check the rendered return form instead of the success screen. Follow-up to Codex's nonblocking suggestion on PR #98, approved by the owner 7 Nov 2026.
- Files/domains owned (include generated outputs): `lord-suite/tests/booking-remarks-return-browser.cjs`, `CHANGELOG.md`, this task record.
- Out of scope: no LORD product code, no other test files, no backend change, no live data or deployment.
- Acceptance checks: the test passes; a negative control (reintroduced checkbox/accordion) fails; `npm run build` leaves no diff; LORD suite passes; full CI green at the exact head; draft PR naming Codex as reviewer at that head.

## Decisions and changes

Codex's nonblocking suggestion on PR #98 (reviewed at head 35a4f5a, merged as 999c1a4): the two assertions check for absent return checkboxes/accordions after successful submission, when the form has already been replaced by the success screen, so they cannot detect a regression in return-form rendering. Deliberately NOT applied before the #98 merge (it would have moved the approved head). Applied here, after the merge.

## Verification
Exact command, tested commit, outcome and evidence. Explicitly list checks not run.

- `TZ=Asia/Singapore NODE_NO_WARNINGS=1 node lord-suite/tests/booking-remarks-return-browser.cjs` (with `LORD_TEST_CHROMIUM` set): PASS, `{"status":"passed",...}`.
- Negative control: temporarily reintroduced the checkbox (`<input class="return-trolley-selected">`) and accordion (`<details data-trolley-phase="return">`) in `returnTrolleyHtml` (`lord-suite/Source/lord/assets/app.js`): the test FAILED at line 86, `AssertionError: no per-trolley selection checkbox, 1 !== 0`. Product file reverted immediately after (git checkout); the final diff touches only the test file, CHANGELOG.md and this task record.
- `TZ=Asia/Singapore npm run build`: PASS (18 production components), no diff.
- `TZ=Asia/Singapore python3 lord-suite/tests/run_all_checks.py`: LORD suite 40/40 passed, 0 failed.
- Not run: full Node suite locally (CI is the gate); live services/data, staging, deployment.

## Review
Reviewer/model, reviewed SHA, findings, resolution. Advisory review is not human approval.

## Deployment
Not deployed unless supported by explicit environment/version/time evidence. State staging and production separately.

## Handoff
Remaining work, blocker, next action, ownership transfer if any. No secrets or private school data.
