# roster-my-relief-r-percent: annual figures in My Relief Duties

- Status: implementing
- Owner/model: Codex
- Reviewer/model: Claude
- Last updated (Asia/Singapore): 31 October 2026
- Branch: codex/roster-my-relief-r-percent
- Base SHA: d736467cb2392d6ab62d764a9ae34b01d23873dd (rows 10 and 11 predecessor)
- User-authorised scope: queue row 12; show own relief count for the year and accumulated annual R percentage.
- Files/domains: shared/roster-operations.js, roster-update/public/roster-operations-ui.js, generated copies, regressions.

## Decisions
Only the authenticated teacher's figures are returned. Show completed relief, published commitments, their total, and recorded annual entitlement separately. Published annual utilisation is (completed + published committed) divided by recorded entitlement. Unpublished draft allocations remain private and excluded from this teacher-facing projection. The allocator's formula and ranking remain unchanged. Missing/unverified quota history or zero entitlement shows unavailable with a reason; reads never create quota history or query Deploy.

## Verification
Pending Linux build and full suite. No local pass claimed, no live writes, messages, merge or deployment.

## Handoff
Task remains on its own branch until the controller opens the PR. Claude reviews the exact final head.
