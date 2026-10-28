# GSiS v0.7.01 service contracts

Existing authenticated Contacts, Deploy, Layout and Calendar interfaces and write protocol 500 remain. Roster keeps `/api/operations`; all writes authenticate current school identity, validate authority and run against current state under the existing script lock. Request IDs retain exact-retry idempotence. A rejected or stale operation cannot partially consume quota.

`shared/roster-operations.js` owns domain transitions; `shared/roster-allocation.js` owns quota, eligibility, solver, health and deterministic fairness state. `backend/RosterOperations.gs` supplies authenticated projections and atomic persistence. No browser-provided eligibility decision is trusted.

New/expanded domains: historical weekly entitlements, correction revisions, protected manual and peer allocations, combinations, Recess Regression, publication snapshots, per-revision acknowledgements, custom instruction versions, incoming-message receipts, notification attempt leases and service alerts.

Publication checks the daily allocation revision atomically. If stale, the UI refreshes and shows previous versus latest assignments; there is no extra acceptance button. Drafts never enter teacher projections. Published cancellations remove only the overlay and retain acknowledgement/history.

Private external capabilities are recipient, purpose and date scoped, HMAC signed and expiring. Capability values travel in URL fragments and authorised POST headers, not query strings. Responses contain only the recipient's timetable and permitted arrangements. Explicit request response and acknowledgement are the only private mutations.

See `API_ROSTER_OPERATIONS_v0.7.01.md` and the template registry for precise operation contracts.
