# roster-relief-auto-complete: count ended published relief as done

- Status: merged in PR #12; deployment not established
- Owner/model: Codex
- Reviewer/model: Claude
- Last updated (Asia/Singapore): 2026-10-30T06:36:21.634407+08:00
- Branch: codex/roster-relief-auto-complete
- Base SHA: e3c31da427edae242ae09ecaaefb991175a623ba
- Current head SHA: b0664ce461274e950e5e0fbb13808de1b4f12903, reviewed by Claude
- PR: https://github.com/helper-gsps/gsis/pull/12
- User-authorised scope: Song Wee approved all logged items on 30 October 2026 and instructed Codex to execute docs/coordination/plans/2026-11-codex-queue.md top to bottom, one task at a time. This is row 1. Full suite before a merge request; Claude reviews each exact head.
- Files/domains owned: shared/roster-allocation.js accounting; shared/roster-operations.js correction/completion consumers if needed; backend/Relief.gs personal completion; roster-update/public/edge-roster.js matching read; roster-calculations.js explanatory text; focused tests and generated backends/browser/Worker bundles.
- Out of scope: quota formula, allocation scoring/priorities, zero-quota display policy, authority/configuration changes, live records, notifications and deployment.
- Acceptance checks: ended published duties count as completed; future/unended duties remain committed; cancelled/removed/no-relief/not-done corrections are excluded; SMC corrections win; no double counting or change to total spent; Google and edge personal results agree; retain the 18 October 2026 zero-start rule.

## Background and required behaviour

My Calculations shows zero completed relief because only an explicit completed status is counted. The confirmCompleted operation exists but has no frontend control. A published relief duty must count as completed after its period ends unless cancelled, removed, no-relief or corrected as not done. Use the existing periodEnded time rules and current accounting-year boundary.

SMC corrections use correctRelief and must override derived completion, including corrected dates, teachers and completion status. Completion is an accounting classification, not permission to rewrite published records, replay notifications or change protected manual/peer choices. A counted duty moves from committed to completed once, preserving spent and annual utilisation. Keep the existing unavailable percentage when no quota exists.

## Coordination

GitHub checked before claim: main e3c31da427edae242ae09ecaaefb991175a623ba; no open PRs. Prior Roster PRs including #8, #10 and #11 are merged. Historical task files that still say review do not create new implementation ownership. This bounded claim replaces this task's proposed status only. No other queue row is claimed.

## Implementation and verification plan

Trace accounted/annual/balances and personal calculations in Google and edge, reproduce zero completion with a failing behavioural fixture, then add the smallest shared classification and reuse it at the real consumers. Cover time boundaries, explicit corrections, excluded rows, imported history, total-spent stability and runtime parity.

Run relevant checks with TZ=Asia/Singapore, regenerate canonical bundles, then run the full npm test suite. Record every failure, distinguish inherited failures using unchanged-main evidence, and list any checks not run. Do not treat missing historical inputs as passes.

## Review

Pending Claude review of the exact published head. Model review is advisory under the shared GitHub identity. The owner decides merge and release.

## Deployment and rollback

Not deployed. Google remains authoritative; ROSTER_EDGE_AUTHORITY is unchanged. Rollback uses the previous matched source/bundles and retains stored relief, corrections, receipts and provider uncertainty.

## Handoff

Next: implement and verify row 1, open its own PR naming Claude and its exact head. Continue to row 2 only after this Roster task is integrated or explicitly handed off under the owner's sequencing rule.

## 30 October implementation decisions

- Shared reliefCompleted classifies already-accounted records. Published duties move to completed only after periodEnded; explicit SMC completionStatus wins, including in-progress. Drafts remain committed. Stored assignments, publication and provider history are not rewritten.
- Annual and weekly balance consumers use that shared classification. Google and edge personal calculations use the same function with the trusted Singapore clock and retained daily publication timings, avoiding a new timetable read. Missing same-day end timing stays committed.
- The existing zero-start metadata, entitlement rules and zero-quota unavailable percentage are retained.
- Coordination ruling: automatic approval review rejected the documentation-only expected-head update on main. Main remains unchanged. The owner-authorised row-1 claim was published on codex/roster-relief-auto-complete instead. This PR carries the claim and implementation; no other row is claimed or implemented.
- The isolated local checkout verifies the exact upstream main tree and uses a local claim checkpoint for tests. The remote implementation commit will descend from the published claim 3fde317e03e97a894438272311fa7ff5ce60c6fa; the final source tree is compared by SHA.

## Verification in progress

The first four behavioural tests failed on unchanged product code, then passed after the change. A fifth uses the real correctRelief operation to reverse and transfer completion. All five pass. Existing personal calculations, R17 core/integration and suspended-day domain checks pass. npm run build passes, including all 18 components and the 85-file Apps Script ES2020 syntax gate. Full-suite results will be recorded before requesting merge.

Browser setup initially failed while unpacking the existing Chromium runtime. The binary and support files were unpacked without changing their content; the personal-calculations browser check passes. The initial suite run retains its environmental failures; a fresh full run uses the recovered browser. No application workaround was introduced.

## Final verification and review handoff

Full npm test ran with TZ=Asia/Singapore and the recovered Chromium: **871/874 Node programs passed**, exit 1. The three failures are package.cjs (missing historical Q commit) and roster098o-preparation-package.cjs / roster098o-timetable-export.cjs (expired capture-window fixtures). All three were reproduced at unchanged main e3c31da. Failed programs do not cover assertions after their failure. This is not an all-green suite.

The separate LORD stage passes **38/38 programs**, with LORD_TEST_CHROMIUM also set. It was run separately because the Node stage prevents npm test from reaching it. All five new regression cases fail on unchanged main and pass here. Existing personal calculations, real SMC correction, R17 core/integration, suspended-day rules and personal calculations browser checks pass. The generated build and 85-file Apps Script syntax gate pass; the independent canonical runtime comparison covers all 18 production components. git diff --check passes.

[Exact command results, all program outcomes, code blob identities and failure classification](../review/roster-relief-auto-complete-tests.json). The final PR description supplies the exact remote head. Immutable code blobs were compared with local Git hashes before publishing; the final tree is checked against the local verified tree.

Author self-review checked the complete canonical diff, read-only counting, explicit correction precedence, spent/weekly-used stability, no new I/O and unchanged authority. Claude independent model review remains pending and must cover the exact published head. Model review remains advisory under the shared GitHub identity. No merge is requested before that review.

Staging, real sign-in, production latency, live data validation and provider delivery were not run. No production configuration, record, notification or authority changed. No data migration is required; rollback is the prior matched source and generated bundles.

Next queue row: roster-assigned-by-label. It remains unclaimed while this Roster task is open, following WORKFLOW.md’s serial Roster ownership rule and the owner’s one-at-a-time instruction. The owner has already authorised the remaining queue; no renewed implementation permission is needed.

## Main advanced during verification

Before publishing, GitHub main advanced from e3c31da to 8fb6bf28af1e34f842516c91f548fad30e482790. The complete comparison contains only the November queue update and new approved deploy-queued-writes task. Both documents are preserved byte-for-byte. No product source, tests, runtime or configuration changed, so the completed full-suite and generated-parity evidence still binds the product source. No new full-suite run is claimed after this documentation-only integration. The final commit retains the published claim and this actual main as parents; no force-push or main update is performed.

## 30 October 2026 integration evidence

Claude reviewed exact head b0664ce461274e950e5e0fbb13808de1b4f12903 with no blocking finding in PR #12 comment 6510216878. Owner merged #12 as 50c5283c3d4c6ad39f31273541cb78d0b35bd4f1 at 06:44 Singapore time. GitHub merge status and tree were checked at the start of the next task. This closes the serial implementation claim. Merge does not establish deployment.
