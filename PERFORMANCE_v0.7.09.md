# GSiS v0.7.09 speed and reliability

This release changes publication eligibility and notification payload contracts. It retains the v0.7.08 local timetable cache, coalesced reads, compact projections and signing-key request sharing. It does not claim new production latency measurements.

Roster still reuses loaded immutable timetable models for names, cells, filtering and display. Live availability, staff authority, accounting and write revisions remain separately verified. A cached blank cell does not establish current eligibility.

Publication uses the existing authoritative operation boundary. Exact retry receipts prevent a lost response from duplicating a committed publication; unchanged published content retains its existing suppression. Notification preparation checks the applicable date again, alongside recipient and publication freshness. Requester identity remains distinct from the delivery recipient, and absent-teacher contact details come from Contacts.

The four revised contract definitions are generated into the matching Worker. Exact body, language, category and positional fields remain required before dispatch. Pending, mismatched or incomplete contracts fail visibly rather than falling back to unrelated wording. An uncertain prepared send remains subject to reconciliation, not blind retry.

The existing script locks and global Roster revision still serialize affected writes. Concurrent edits can require a refresh. This build does not promise instant remote saves or unlimited simultaneous writers. See PERFORMANCE_v0.7.08.md for the earlier measured local results, and VALIDATION.md and RELEASE_SUMMARY.json for this build's executed regression evidence and review limits.
