# Venues backend implementation review

The pure domain is `shared/venues.js`, mirrored byte-for-byte into `venues-backend/Domain.gs`. `venues-backend/Code.gs` owns authentication, short writer transactions, the per-table Sheets codec and setup/recovery. Source transport and delivery jobs are separate files owned by the transport implementation.

## Transaction guarantees

Each accepted command resolves active Contacts identity before the Venues writer lock, then reloads durable state, verifies the actor snapshot key, checks current grants and record revisions, validates source readiness and occupancy where needed, and commits state, receipt, audit and notification intent in one Advanced Sheets batch. All source/provider IO is outside the lock. Read operations do not write replay nonces; signed mutation nonces and idempotency receipts are durable tables.

Metadata is separated into stable per-key records. Ordinary booking writes update small revision/commit records without rewriting occupancy chunks. Changed-table row comparisons emit only changed contiguous spans, clear removed tails and append capacity where needed. UTF8 transaction payloads are bounded at 8 MB. Each cell holds at most 40,000 characters. The deliberate operational ceiling is full authoritative table reads under one school-wide lock; partition retained history by school year if that becomes too slow.

`VENUES_COMMIT_PENDING` is one fixed recovery marker, not per-request accumulating properties. It is written before the batch. On ambiguous response, the exact durable commit token proves success; otherwise admission remains blocked. `venuesRecoverCommit(expectedToken,evidence)` is an operator-only function requiring explicit evidence; no request endpoint invokes it and no age rule clears ambiguity.

The Roster bridge uses durable `sourceBegin`, `sourceComplete` and `sourceStatus`. Begin acknowledges `{revision,pendingToken,status:'pending'}`. Complete acknowledges its new revision and cleared matching token. A stale token cannot clear a newer pending write. Activation compares source epoch, committed fence keys and policy revision, validates the original source-check timestamp within 60 seconds, then atomically activates the generation and displaces conflicting bookings with audit/outbox intent. Waivers are scoped to exact generation, venue, date and interval.

## Domain scope

Implemented: all six approval-policy cells; separate audited self approval; whole-selection booking admission or explicit available-only skipping; pending holds; half-open intervals, gaps, buffers and physical overlap groups; covered-date/hours checks; independent admin/room-owner grants and last-active-admin protection; admin-only alias edits; closures and displacement; occurrence and explicit bulk-note amendment; cancellation; separately attributed room-owner responses; ad hoc owner transfers; timetable waiver/beneficiary transfers; source generation revalidation; scoped dashboards; pending/displaced/delivery management; booking utilisation; per-channel manual delivery review.

`bootstrap` exposes a minimal active staff selector only to managers. Every public venue is whitelisted. Recipient addresses, private source maps and delivery provider data remain server-side. Owner dashboard policy and audit scope derives from fresh grants. Transfer acceptance gives cancellation authority to the current owner, not the historical requester.

## Verification

Fresh local checks on 25 October 2026:

- `node tests/venues-domain.cjs`: 24 behavioural scenarios, including six policy cells within one scenario.
- `node tests/venues-backend.cjs`: the same domain scenarios plus 13 persistence/authentication scenarios using an in-memory Advanced Sheets API fake.
- `node tests/venues-jobs.cjs`: transport-owned source, notifications and real-domain activation integration checks passed.
- Apps Script source syntax compiled with Node `new Function`; no service deployment or live message send occurred.

Persistence tests prove one-batch booking/audit/receipt/outbox commit, accepted-timeout recovery, definite-rejection retry, unresolved ambiguity fencing, signed-service isolation, durable source fence reload, chunk integrity, mutation replay rejection, zero mutation on signed reads, one-row append after 40 history records, and unchanged 100 KB occupancy metadata during a reservation counter digit-width change.

## Operator entrypoints

`setupVenues()`, `venuesHealthCheck()`, `syncVenuesSources()`, `venuesRunJobs()`, `venuesPruneReceipts()`, and `venuesRecoverCommit(expectedToken,evidence)`. Setup creates fixed tables and snapshot folder if absent, bootstraps the configured initial administrators only when no admin grant exists, and idempotently installs the minute trigger. The deployable manifest enables Sheets v4 and Drive v3.

Tables: VenuesMeta, VenuePolicy, AdminGrant, RoomOwnerGrant, BookingSeries, BookingOccurrence, TransferRequest, ApprovalDecision, Closure, TimetableWaiver, NotificationOutbox, AuditEvent, RequestReceipt, TransportNonce, StaffSnapshot.

No claim of cross-project or cross-provider atomicity is made. Live Apps Script deployment, permissions, quotas, source endpoint configuration and provider templates remain deployment acceptance checks.

Independent review follow-up: pending approval notices now include active room managers or active administrator fallback; the final usable admin check also requires an active Contacts identity. Administrators can deactivate a departed staff member's existing grant without permitting reactivation. Direct red-to-green regressions cover each case.

Quality follow-up: `admin` returns all scoped closures, including future and inactive records, and `saveClosure` returns the changed closure row. `bookings {id}` and `bookings {transferId}` provide explicitly authorized record reads independent of date and mine filters. Regression checks cover future closure visibility, mutation deltas, scoped room ownership, participant access, revoked grants and unrelated-user denial.

Latency follow-up: warm signed reads now perform two full state loads rather than three, and warm booking performs two rather than four. The first load supplies a Contacts snapshot and source-readiness observation; reuse is allowed only after a live Contacts manifest matches. The final load remains under the decision lock and rechecks Contacts key, current grants, source fence and source timestamp. Background jobs and setup keep their original refresh path. Load-count tests run real Code/Sources adapters over fake Sheets; race tests inject a new pending source fence, grant revocation and Contacts deactivation between the two loads. They all pass. These are service-call counts, not claimed production latency measurements; cold source refresh and changed Contacts still require their reconciliation work.
