# roster-inactive-teacher: inactive Contacts staff unavailable in Roster

- Status: merged (#38 at d23672c as 05ff0f1)
- Owner/model: Codex.
- Reviewer/model: Claude, exact final verified head.
- Last updated (Asia/Singapore): 1 November 2026.
- Branch: codex/roster-inactive-teacher.
- Base: main `84a71b50a7aa60f0f5d546cba651c4a3cc44ed3e`, including F (#37) and Contacts (#36). The completed change is rebased onto this cutover baseline; the earlier remote head is retained separately before the leased branch update.
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

## 1 November cutover hold and rebase

The owner explicitly requested rebasing this existing PR on main 84a71b5, full exact-head Node/LORD verification, reopening and marking ready. Product changes wait until Monday 2 November 2026, 08:00 SGT; Sunday 1 November 19:00 cutover uses current main unchanged. Label: `hold until after cutover`. Claude reviews the exact head; the owner merges. Multiple separately held PRs are authorised by this latest order, superseding the earlier one-open-lane-R PR limit. No product merge, deployment, live data or settings changes are performed here.

A real Git rebase replays the previously completed canonical change onto an exact local mirror of main. All product hunks merge cleanly; the changelog preserves both the inactive feature and F entries. Generated outputs are rebuilt. The owner's explicit rebase request authorises a lease-checked replacement of this feature branch after preserving f7e0022; main is never forced or updated. Full CI at the new remote head remains the readiness gate.

Rebase verification: all 50 changed paths from the preserved PR are retained. Build regenerated all 18 components. The 24 inactive/transport/mirror programs pass, as do all seven F freeze programs and the Contacts filter regression (32 focused programs total). The full local npm test was started after build; Chromium installation is unavailable here and historical Git inputs are incomplete, so only exact-head GitHub Node/LORD CI can supply the final green gate. No test was dropped or weakened during this rebase.

## Advisory review corrections, 1 November

Three Important issues in the earlier feature were reproduced and fixed before publication. Retained Daily Employment email claims now exclude inactive Contacts recipients at both Google and D1 provider boundaries. A slow Calendar refresh cannot renew the Contacts timestamp; each component uses its own conservative fetch time and keeps the existing concurrent-refresh CAS. Google inactive repair carries its trusted prepared clock into the final commit check across read-only views, removal-only/deferred cleanup, ordinary mutations, attendance, scheduler and private peer reply paths. Crossing a minute/period start rejects the stale write and keeps the started duty exact. New synthetic regressions exercise actual SQLite dispatch, the signed reference path and the real Google commit preparation; each failed before its fix. No provider message was sent.

Post-review checks: fresh build passes for all 18 components; all 37 affected programs pass after the fixes (the legacy mail fixture now explicitly represents an active recipient; every claim, uncertain-result and address-change assertion remains). The earlier large backup round-trip also passed. Full exact-head Node/LORD CI and Claude review remain pending.


## Scope refresh claim, 6 November 2026

Model: Codex. Current base main 69efd3ab9f0dbbb31f1a3bc7da9c86b3dc2ea348. Refresh active-only admission, pickers, peer authority and final notification/email checks. Ad hoc activation does not override inactive Contacts status. Preserve historical identities and every existing duty and publication; do not install the old automatic removal/refill or read-triggered repair. The newer allocation-rules task prohibits moving protected/manual/peer/published/started duties, so the old option 1B repair remains held for policy reconciliation. This PR's current scope is eligibility and delivery only. Build/full CI and Claude exact-head review required; owner merges.
