# lord-return-assertions-before-submit: move two return-form assertions before the submit click

- Status: claimed
- Owner/model: Muse
- Reviewer/model: Codex
- Last updated (Asia/Singapore): 7 Nov 2026
- Branch: muse/lord-return-assertions-before-submit
- Base SHA: 37a9306
- Current head SHA (or PR head; avoid self-referential commit hashes):
- PR:
- User-authorised scope: test-only. Move the two return-form assertions in `lord-suite/tests/booking-remarks-return-browser.cjs` (no per-trolley selection checkbox; no return accordion) to before the submit click, so they check the rendered return form instead of the success screen. Follow-up to Codex's nonblocking suggestion on PR #98, approved by the owner 7 Nov 2026.
- Files/domains owned (include generated outputs): `lord-suite/tests/booking-remarks-return-browser.cjs`, `CHANGELOG.md`, this task record.
- Out of scope: no LORD product code, no other test files, no backend change, no live data or deployment.
- Acceptance checks: the test passes; a negative control (reintroduced checkbox/accordion) fails; `npm run build` leaves no diff; LORD suite passes; full CI green at the exact head; draft PR naming Codex as reviewer at that head.

## Decisions and changes

Codex's nonblocking suggestion on PR #98 (reviewed at head 35a4f5a, merged as 999c1a4): the two assertions check for absent return checkboxes/accordions after successful submission, when the form has already been replaced by the success screen, so they cannot detect a regression in return-form rendering. Deliberately NOT applied before the #98 merge (it would have moved the approved head). Applied here, after the merge.

## Verification
Exact command, tested commit, outcome and evidence. Explicitly list checks not run.

## Review
Reviewer/model, reviewed SHA, findings, resolution. Advisory review is not human approval.

## Deployment
Not deployed unless supported by explicit environment/version/time evidence. State staging and production separately.

## Handoff
Remaining work, blocker, next action, ownership transfer if any. No secrets or private school data.
