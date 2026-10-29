# school-absences-intake-read: count tests and lighter review-list polling

- Status: review
- Owner/model: Claude
- Reviewer/model: Codex
- Last updated (Asia/Singapore): 28 Oct 2026 21:03
- Branch: claude/school-absences-intake-read
- Base SHA: be642c9be31e3d0acfabdc7ca3868b4015992ed3
- Current head SHA (or PR head; avoid self-referential commit hashes): pending
- PR: pending
- User-authorised scope: Song Wee, 29 Oct 2026: "add all suggested fixes": update the 4 school-absences request-count tests for the intake read added in fc0abb9, and poll the all-dates review list every 60 s instead of 15 s.
- Files/domains owned (include generated outputs): roster-update/public/roster-operations-ui.js (intake refresh only); tests/roster0811-school-absences-browser.cjs, tests/roster0811-school-absences-ui.cjs, tests/roster090-school-absence-pagination.cjs, tests/roster702-operations-ui.cjs.
- Out of scope: backend, absence policy, D1 import (PR #2).
- Acceptance checks: the four tests pass and assert the intake read separately; Manage school-wide absences polls pending reports at most every 60 s; Assign Relief and own-report pages keep 15 s.

## Decisions and changes
- `roster-operations-ui.js`: on Manage school-wide absences, the all-dates review list re-checks pending reports every 60 s; Assign Relief and own-report pages keep 15 s.
- The four existing tests exclude the all-dates intake read from their range-read counts and let it bypass held/failing read mocks (they no longer count it): `roster090-school-absence-pagination.cjs`, `roster0811-school-absences-browser.cjs`, `roster0811-school-absences-ui.cjs`, `roster702-operations-ui.cjs`.

## Verification
- TZ=Asia/Singapore, Chromium at /tmp/chromium: the four tests above PASS; intake UI tests `paid097-receipts(.cjs, -browser.cjs)`, `roster093b-peer-ui.cjs`, `roster098a-intake-flush(.cjs, -browser.cjs)`, `roster098d-choice-browser.cjs` PASS.
- Not run: full suite on this head; live deployment.

## Review
Codex reviewed fbc8d50: the tests filtered the intake read out rather than testing it; mocks returned the wrong shape so the list might never render or poll.
Fix (next commit): new `tests/roster099a-intake-polling.cjs` with a realistic pending intake response and a controllable clock asserts: one undated intake read; the list renders with the pending report; next check scheduled at 60 s with no request before it fires; rescheduled at 60 s; Manage reported absences uses 15 s; a timer from the left page sends no school-wide request. The four existing tests still pass.

## Deployment
Not deployed. Frontend-only; needs a Roster Pages upload after merge.

## Handoff
Next: Codex reviews the PR head; owner merges and deploys.
