# roster-inactive-teacher: inactive Contacts staff unavailable in Roster

- Status: implemented; full Node/LORD verification pending. Row D1 is ready for review in PR #33.
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
The earlier canonical Row I implementation is integrated onto Row D1. All 18 components rebuilt, 88 Apps Script files parsed, and 30 focused programs passed, including the 14M mirror round-trip with inactive repair metadata. The new D1 suite passed 21 cases covering freshness, concurrent refresh replies, transport races, clock boundaries, quiesce and normal mirrored commits. Domain, Google backend, gateway and UI checks retain started duties and published originals; peer-only reservations are also covered. The browser-only ad hoc check and full Node/LORD gate run in CI. No deployment or live authority change.

## Implementation decisions

- Eligibility is checked from Contacts at allocation, picker and final notification boundaries. Ad hoc engagement does not override inactive status. Existing identities remain available for historical display.
- Inactive repair removes only unstarted cover, clears its manual/peer reservation and refills only those freed demands. Published originals remain stored; replacement drafts require the normal publication step.
- Google and D1 record-only reads also discover repair work. Pending attendance or peer processing defers replacement without discarding the inactive-duty removal. Google uses its existing intake commit lock; D1 compares the transport revision in the same transaction as the Roster write.
- Contacts freshness is capped at five minutes. The D1 refresh updates components using revision checks so a delayed reply cannot replace newer Contacts or Calendar data.
- Normal D1 commits retain receipt identities and enter the existing mirror outbox. Release quiescence blocks repair writes. Inactive repair and alert metadata round-trip through the split Google backup.
- Configuration and rollback: no live setting, binding, authority flag or deployment changes. The owner controls deployment and can revert this source change; stored historical duties and publication snapshots remain retained.
