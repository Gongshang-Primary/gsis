# roster-relief-auto-complete: count ended published relief as done

- Status: claimed
- Owner/model: Codex
- Reviewer/model: Claude
- Last updated (Asia/Singapore): 30/10/2026, 06:17:09
- Branch: codex/roster-relief-auto-complete
- Base SHA: e3c31da427edae242ae09ecaaefb991175a623ba
- Current head SHA: claim commit; the PR will record the exact implementation head
- PR: not opened
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
