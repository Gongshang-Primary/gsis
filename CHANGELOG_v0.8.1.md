# GSiS v0.8.1

Baseline: v0.8.00a, commit 4f9ba7ba3cdff57e91fde9fcd6fff8e9a4a53b29. This full package integrates that frontend patch and queued items 050 to 052. The user authorised review, implementation and commit on 20 October 2026.

## Independent daily work

Publish, notification and allocation use the selected relief date. New clients send daily source/publication tokens; older clients keep safe global-revision checks. Expensive context and allocation preparation runs outside the final shared writer lock. A fresh-state merge rechecks dependencies and preserves other users' records, receipts and delivery updates. The underlying store remains one JSON document; this is not physical database partitioning.

Pending browser commands belong to their user and affected dates. A pending tomorrow command does not disable today's independent notification. Original immutable request IDs remain available for uncertain retries. Publication errors show the actual message rather than always claiming allocation changed.

The notification Worker starts notification work independently of slow allocation. Scheduler bookkeeping alone does not invalidate a reviewed daily plan. Weekly workload limits and shared policy remain server checked. Started-period and future-notification policies remain unchanged.

## Fewer remote waits

Evening scheduling sends one authenticated Calendar batch for today and tomorrow instead of two serial requests. Pure Notify no longer calls Calendar; the Daily Notify page still checks publication eligibility. Existing scoped Contacts reads and local immutable timetable reuse remain.

Compression was evaluated on synthetic bulk JSON. It substantially reduced bytes, but that experiment does not measure network or Apps Script latency. A new gzip/base64 transport protocol was not introduced: fewer remote calls and shorter lock ownership address demonstrated waits without a compatibility migration. Existing compressed Stapler storage remains.

## Compact planning messages

The user chose compact inline names for the existing approved WhatsApp template. Planning messages retain all distinct absent staff and qualifiers while removing the repeated period lists. Counts and coverage remain accurate. Exact vertical bullets remain queued for a revised approved template. Notification timing and absence-change fingerprints are retained.

## Installation

Update Calendar backend, Deploy backend, Roster frontend, then the separate notification Worker. Retain existing URLs, secrets, stores, R2 binding, cron and flags. Contacts and the other frontends are included in the full suite but need no functional redeployment for these changes when already on v0.8.0.

See VALIDATION.md for executed checks and limits. No live service was deployed, no school timetable was published and no staff message was sent during preparation.
