# Roster v0.7.01 operations

## Domain surface

Retain the v0.7.00 operation names for existing clients. Add explicit operations for automatic accounting/optimisation, manual Undo, combinations, custom instructions, day export, publication acknowledgement/history and Recess Regression. Allowed operation sets and their payload validation are in `backend/RosterOperations.gs` and `shared/roster-operations.js`; tests provide executable payload examples. Do not invent parallel endpoints or bypass current Contacts authority.

Recess Regression uses `saveRecess` and `deleteRecess`, level selections, two inclusive dates and validated per-level numbered periods. Stable activation/class/date/period identifiers prevent duplicates. Calendar and authoritative class catalogues determine school days/classes. Ordinary assignment/publication/withdrawal rules apply; existing recess duty may be repurposed for zero additional R, additional supervision costs one R per period.

## Notification service

Signed service operations: `scheduledRoster`, `claimNotifications`, `prepareNotification`, `notificationResult`, `notificationDelivery`, `inboundMessage`, `inboundReplyResult`, `externalDuties`, `externalRespond`, `externalAcknowledge`.

A claim is a durable lease, not proof of sending. `prepareNotification` rechecks live recipient authority, publication version, current acknowledgement, quiet window, expiry and approved template routing immediately before dispatch. Unprepared expiry refunds the attempted claim; prepared expiry is uncertain and cannot be blindly resent.

`notificationResult` and delivery callbacks correlate business notification, claim and provider message IDs. Confirmed failures have three attempts maximum. Positive delivery cannot be downgraded by stale callbacks. Pending/disabled contracts stay blocked without consuming send attempts. Backend failure to confirm a result is ambiguous, not a safe reason to send again.

## Instruction semantics

All matching custom rules are retained separately by stable rule/version and assignment period. OR applies within selected levels, AND across different filter types. Teaching groups use IDs. Published instruction snapshots never mutate in place. Rules removed or changed after publication produce a new publication revision when SMC publishes. Acknowledgement suppresses reminders, not an otherwise-due supplemental instruction. Reassignment invalidates outgoing queued instructions.

## Storage and permissions

The existing single-document store remains transactional under the script lock and revision checks, with a 12 MB guard. Read projections are scoped and indexed; storage writes replace the document. Preserve append-only factual corrections and historical publications. Custom urgent messages are accessible only to their eligible recipient set; ordinary allocation alerts use the day's duty-SMC list.
