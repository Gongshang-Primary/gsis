# roster-inactive-teacher: inactive Contacts staff unavailable in Roster

- Status: claimed; resuming after Row D1 is ready for review.
- Owner/model: Codex.
- Reviewer/model: Claude, exact final verified head.
- Last updated (Asia/Singapore): 31 October 2026.
- Branch: codex/roster-inactive-teacher.
- Base: Row D1 head `58847a890d274da866e1da5932088315bb7a6d82`; retain existing PR #30 claim ancestry.
- PR: #30; stacked on Row D1 until its owner merge.
- Authorisation: owner directs continuation after Row D1 without waiting for Claude; #19 cleanup, then #30, then #29.
- Scope: Contacts inactive status must exclude staff from allocation, choices, roles and notification delivery. Owner option 1B removes only not-yet-started duties and refills only those freed demands, including inactive staff's manual/peer cover.
- Preserve: started and past duties, other staff's manual/peer arrangements, published originals until normal republication, all receipts and the D1 backup/switch-back invariants.
- Owned files: shared Roster allocation/operations; Apps Script and D1 context adapters; directory freshness; Roster picker/notification boundaries; relevant tests and generated outputs.
- Out of scope: Row C, weekly R/FAJT work in #29, authority changes, activation, deployment, live records and messages.

## Plan
1. Reuse the earlier canonical Row I implementation, preserving current D1 code.
2. Include D1 future-date reconciliation and Contacts freshness within five minutes; missing eligibility/context fails safely without allocating from stale information.
3. Route repair through ordinary guarded commits so it is mirrored and blocked during release quiescence.
4. Verify owner 1B behavior, historical preservation, notification rejection, idempotence, reference/clock races and backup round-trip metadata.
5. Rebuild all components before tests; mark PR ready only once full Node and LORD are green. Owner merges.

## Coordination
The latest explicit continuation instruction supersedes the older queue pause and open-PR count for these sequenced, separately reviewed rows. The Row D1 implementation stays frozen for Claude's exact-head review. Claim is published on the task branch because direct main claim updates were rejected by automatic approval review earlier in this session.

## Verification
Pending implementation. No deployment or live authority change.
