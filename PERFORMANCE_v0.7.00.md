# Performance and reliability v0.7.00

Ponytail and Pstack review reuse the existing parser, Drive storage, Contacts journal, signed gateway, Calendar date API and Excel writer. No runtime package dependency is added. A separate scheduled Worker is necessary because Pages requests alone cannot deliver queued notifications when no user is browsing.

## Loading

The authority batch reads the same three Contacts ranges in one Sheets API call instead of three. The deterministic regression keeps the same authority result and verifies immediate revocation and pending-save rejection. This is a call-count reduction, not a measured production latency claim.

The browser prepares the current or next upcoming immutable model on initial profile load without waiting for Calendar. It keeps at most eight models by immutable ID and advertises those IDs on subsequent reads. A model acknowledgement avoids retransferring an unchanged parsed timetable across dates. The server still reads fresh authority and register state; the cache is never an access grant. Sign-out and account changes clear it.

Concurrent reads share an in-flight request. Minute freshness checks request profile metadata, with model reload when revision, account, capability or active selection changes. Check availability obtains fresh operational results and uses every period regardless of viewer preferences. PDF and Excel use the loaded projection without a per-person network call.

## Operational consistency

One JSON document keeps absence, cover, publication, audit, request receipts and notification intent together. The existing script lock serializes writes. This is deliberately a school-sized store, capped at 12 MB, with Admin past-range pruning. Move to year partitions if retained history approaches that bound. It is not an unbounded database or a claim of high-throughput concurrency.

R comes from the published Deploy snapshot for the effective date. Assigned relief is deduplicated by date and period within the same Monday-to-Sunday week. Missing published input stays unknown. Candidate availability uses actual timetable occupancy and current operational state; pending approval is not confirmed cover.

Notifications use durable claims and recipient-specific intent. Provider timeouts become uncertain rather than causing repeat sends. Delivery callbacks can reconcile an accepted send. Sending remains disabled until account setup, approved templates and the scheduled worker are configured. Live Meta delivery has not been tested in this build.

## Verification limits

Regression checks exercise real domain, storage-adapter, gateway and DOM code with isolated fixtures. PDF/Excel checks inspect the actual projections and OOXML output. They do not measure the school network, production Apps Script service latency, school-device pixel fit, printer pagination or desktop Excel rendering. The available local Chromium binary failed to launch; no browser screenshot acceptance is claimed.
