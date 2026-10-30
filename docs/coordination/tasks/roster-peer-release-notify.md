# roster-peer-release-notify: tell both peers when a released arrangement is communicated

- Status: implementing
- Owner/model: Codex
- Reviewer/model: Claude
- Last updated (Asia/Singapore): 31 October 2026
- Branch: codex/roster-peer-release-notify
- Base SHA: 66c271cb4d3ab1adbe798e299b1e88f0cdab472e (row 10 predecessor)
- User-authorised scope: queue row 11; released peer arrangements notify both peers.
- Files/domains: shared/roster-operations.js, generated copies, regression tests.

## Decisions
Preserve the explicit Notify action. Saving or publishing a draft does not send new messages. When Notify communicates released peer duties, queue a notice for both the requester and covering colleague. Reuse the approved mutual_override template. Capture exact released demand IDs, deduplicate each recipient, and revalidate the released arrangement immediately before dispatch. Preserve accepted/uncertain provider outcomes.

## Verification
Pending Linux build/full suite. No live notification, merge or deployment. No local test result is claimed.

## Handoff
Controller opens a PR when a slot is available; Claude reviews the exact tested head. Row 10 dependency remains isolated.

