# roster-inactive-teacher: inactive Contacts staff unavailable in Roster

- Status: implemented and integrated with current main; exact-head full Node/LORD verification pending.
- Owner/model: Codex.
- Reviewer/model: Claude, exact final verified head.
- Last updated (Asia/Singapore): 31 October 2026.
- Branch: codex/roster-inactive-teacher.
- Base: current main `8df5a92626beac50e5e92c90dbf98b8c50079c4e`, including merged PRs #33/#34 and v0.9.9e labels; retain existing PR #30 claim ancestry.
- PR: #30, retargeted to main after integration.
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

## Resumed verification, 31 October

The owner explicitly resumed PRs #30 and #29. This supersedes the R2 pause for these two branches. PR #30 integrates main `1284af8` and retains R2's packed capture, dated audit hydration, stored audit commits and diagnostics.

The prior full run, [41180019727](https://github.com/helper-gsps/gsis/actions/runs/41180019727), passed 909 of 913 Node programs and did not reach LORD. Four failures were investigated: the indexed-ranking comparison did not exclude its new `active` metadata; the mutual-grid fixture tried to activate an inactive contact; the Stapler fixture expected inactive SRE relief eligibility; and the ad hoc browser check exposed an actual duplicate-name regression. The first three retain their earlier coverage with the approved Contacts eligibility rule. The duplicate regression reproduced with the real read projection: its display-only ` (inactive)` suffix concealed an exact timetable identity when no mobile was entered. Matching now recognises that suffix without altering stored names. The regression failed before the fix and passes afterward. New inactive contacts still require activation in Contacts.

All 18 components are regenerated. Focused domain, D1, UI, packed-audit and production-size capture checks pass. The complete Node/LORD CI result for the final remote head remains the readiness gate. No historical or browser test is counted as passed locally when its runtime is unavailable.

## Preserved decisions

- Eligibility is checked from Contacts at allocation, picker and final notification boundaries. Ad hoc engagement does not override inactive status. Existing identities remain available for historical display.
- Inactive repair removes only unstarted cover, clears its manual/peer reservation and refills only those freed demands. Published originals remain stored; replacement drafts require the normal publication step.
- Google and D1 record-only reads also discover repair work. Pending attendance or peer processing defers replacement without discarding the inactive-duty removal. Google uses its existing intake commit lock; D1 compares the transport revision in the same transaction as the Roster write.
- Contacts freshness is capped at five minutes. The D1 refresh updates components using revision checks so a delayed reply cannot replace newer Contacts or Calendar data.
- Normal D1 commits retain receipt identities and enter the existing mirror outbox. Release quiescence blocks repair writes. Inactive repair and alert metadata round-trip through the split Google backup.
- Configuration and rollback: no live setting, binding, authority flag or deployment changes. The owner controls deployment and can revert this source change; stored historical duties and publication snapshots remain retained.

## Owner-authorised publication

The owner explicitly authorised pushing these changes to helper-gsps/gsis on the existing #30 and #29 branches. Current main v0.9.9e labels are retained. The new remote head and full CI result are recorded in the PR; it remains draft until the complete Node and LORD gate passes.
