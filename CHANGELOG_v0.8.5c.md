# GSiS v0.8.5c

Baseline: v0.8.5, commit `e70af17c870595dc11a60e86ae46ae81ae8767b0`.
Scope: Roster frontend and standalone Roster backend only.

## 100: Validated subjects for consecutive relief blocks

System Config previously accepted arbitrary typed subjects for Same relief teacher for consecutive periods. Replace that input with a native dropdown suitable for mobile and desktop. Populate it from the active baseline and immutable confirmed suspension snapshots for today or later. Use the allocator's canonical subject codes and exclude absence markers, annotation-only labels, draft-only additions and stale or removed confirmations.

Validate again against current server data during Save changes. A forged request, stale subject or custom value cannot change the configuration. Existing unavailable rules remain visible with replacement or removal guidance. PAL remains the default three-period rule, but is selectable only when present in the valid timetable subjects. An empty list does not invent PAL.

Selection and period edits remain local until Save changes. The existing Admin write permission, SMC view-only access, request receipts and concurrency checks remain in place. Existing allocation behaviour and manual assignments are unchanged. A dedicated subject catalogue keeps unrelated subject settings on their existing contract.

User authorised patch v0.8.5c and commit on 21 October 2026. See VALIDATION.md and INSTALL.txt.


## 101: Ongoing custom notifications with on/off controls

Recorded: 21 October 2026, Singapore time.
Status: Included in the authorised integrated v0.8.5c patch.

Custom notification rules apply across school dates while enabled. Remove the one-date selector and show an accessible On/Off control beside each rule. Existing undeleted rules default to On regardless of their former origin date. Switching Off retains text and level, period, class and teaching-group filters; editing a paused rule does not re-enable it. Keep in-progress form text when another rule is toggled. Preserve existing publication/acknowledgement behaviour, immutable past snapshots and pending-request retry identity. Protect active and paused policies from historical pruning and include all rules in day conflict tokens and cache invalidation.

## 102: Assign Relief defaults to the next school day after 2 pm

Recorded: 21 October 2026, Singapore time.
Status: Included in the authorised integrated v0.8.5c patch.

From 14:00 Singapore time, opening Assign Relief without an explicitly chosen date defaults to the next verified school day. Use Calendar school-day data, including holidays and school closures. Preserve manual date choices, recoverable work and pending saves. Do not change an already open allocation page as time passes. If Calendar cannot confirm the next day, show retry and explicit date-selection recovery rather than guessing or loading another day's allocations.

The user requested that 0.8.5a, 0.8.5b and 0.8.5c be integrated into one next commit. Only the resulting v0.8.5c Roster frontend and standalone Roster backend are packaged. Other components remain v0.8.5; no intermediate a/b deployment is needed.
