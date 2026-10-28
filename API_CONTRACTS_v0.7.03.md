# GSiS v0.7.03 service contracts

Existing authenticated Contacts, Deploy, Layout and Calendar interfaces and write protocol 500 remain. Roster keeps `/api/operations`. Mutations authenticate current school identity and validate authority against current state under the existing script lock. Request IDs retain exact-retry idempotence. A rejected or stale operation cannot partially consume quota.

`shared/roster-operations.js` owns domain transitions. `shared/roster-allocation.js` owns quota, eligibility, solver, health and deterministic fairness state. `backend/RosterOperations.gs` supplies authenticated projections and atomic persistence. Browser-provided eligibility is never authoritative.

## Calendar date batch

The authenticated Calendar action `rosterDates` accepts `{dates:["YYYY-MM-DD",...]}` with 1 to 62 unique valid dates. It returns `{dates:[...]}` in request order. A released date uses the existing `rosterDate` projection. An unavailable, archived or ambiguously configured year returns `{date,code:"YEAR_UNAVAILABLE"}` for that date. The backend reads the fresh release list once and each released year once.

The Roster Worker verifies response membership, cardinality and field types before forwarding authoritative Calendar context. Multi-date reads use one 12-second Calendar deadline followed by the existing 25-second Deploy deadline. Malformed results fail closed. There is no fallback to separate per-date requests. Single-date and private notification service contracts remain compatible. The notification service cannot use the staff-only batch action.

The matching Calendar backend must be installed before the new Roster Worker. No schema migration or new backend URL is required.

## Roster read projections

`candidates` accepts the existing mutual-arrangement purpose plus `byPeriod:true` and the affected demand IDs. It returns `candidatesByPeriod`, scoped to the current actor, absence date and valid demands. Each candidate includes only staff ID, name, availability, reasons and external status. See API_ROSTER_OPERATIONS_v0.7.03.md.

Immutable timetable bytes may be omitted when the browser advertises an already held model ID. The browser retains up to eight models, clears them on session-owner changes and refreshes dated Calendar context after 60 seconds. Availability and write decisions still use current server state.

## Retained publication and private access

Publication checks the daily allocation revision atomically. Stale publication refreshes the assignment comparison. Drafts never enter teacher projections. Published cancellations remove the overlay while retaining acknowledgement history.

Private external capabilities remain recipient, purpose and date scoped, HMAC signed and expiring. Values travel in URL fragments and authorised POST headers, not query strings. Responses contain only the recipient's timetable and permitted arrangements. Explicit request response and acknowledgement remain the only private mutations.

Signed notification operations, durable leases and exact approved-template checks retain the v0.7.02 contracts. Sending and automation remain disabled. The public privacy page does not grant API access or establish recipient permission.
