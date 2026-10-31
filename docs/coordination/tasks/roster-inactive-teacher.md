# roster-inactive-teacher: inactive Contacts staff unavailable in Roster

- Status: claimed
- Owner/model: Codex
- Reviewer/model: Claude, exact completed head
- Last updated (Asia/Singapore): 31 October 2026
- Branch: codex/roster-inactive-teacher
- Base SHA: 0fba1076fd06abb7e74a5d3429673ace42daf44f
- PR: pending
- User-authorised scope: queue row I, owner 1B, then row C. The owner's latest order pauses overlapping #29 implementation while this task proceeds.
- Files/domains owned: shared Roster allocation/operations, Contacts directory freshness, Roster pickers and notification recipient filtering, related backend/UI adapters, regression tests, generated copies and required verification workflow.
- Out of scope: quota checkpoint/FAJT work in #29, D1 authority, deployment, live school records and messages.
- Acceptance checks: exclude inactive staff from new choices, allocation, roles and notifications; preserve historical records; remove only unstarted duties then refill automatically while preserving others' manual/peer duties; published changes require normal publication; clear unfilled warning; reactivation restores choices; directory freshness within five minutes; full build and test suite.

## Plan
1. Reproduce inactive staff leaks and trace directory caches and every assignment path.
2. Add regression tests, fix the shared boundaries and reconcile future duties through the existing allocation/publication flow.
3. Regenerate canonical outputs, run focused and full checks, and open a PR for Claude's exact-head review.

## Verification
No implementation or test result yet. The prior local #29 folder is preserved. Direct Git lacks credentials, so the GitHub connector supplies the exact current source; a read-only CI source artifact may bootstrap the complete checkout.

## Deployment
Not deployed. Google remains authoritative.
