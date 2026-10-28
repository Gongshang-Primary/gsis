# GSiS v0.9.6 cron design

The user approved trimming cron after reviewing a design that keeps timetable storage in D1 and private R2, checks for due work before loading Roster state, and retains on-demand access. The release builds on v0.9.5a and includes its STAPLER fixes.

## Goal

An idle scheduled invocation must not load, clone or serialize the full Roster store, download timetable packages, or rewrite unchanged audit exports. Work that is due must retain the existing domain validation, authorisation, claims, receipts and optimistic concurrency checks.

## Approach

Use small primary D1 queries at the start of each job, immediately before that job executes. Do not take one global work snapshot for the whole tick: earlier producers may create work for later consumers. Keep D1 authoritative and R2 private. Use existing immutable timetable objects and source guards. Preserve all feature flags and the Google-backed fallback.

Keep timetable background work bounded by the existing small job/stage limit. Avoid building a download response when preparing a stored package. An empty queue is not a reason to fetch both timetable packages. Keep refresh on relevant writes and demand; retain date rollover correctness.

Audit exports need durable per-date source markers so unchanged data is not written again. A successful R2 write must precede the corresponding completion marker. A source change or failure must remain eligible for retry.

## Constraints

Preserve 05:30 morning summary, configured SMC summary times, allocation cycles, 06:29/06:30 alerts, acknowledgement windows, daily reports, retries and lease expiry. Preserve SMC/manual decisions. Do not remove Deploy authority or handoffs. Do not change school data, live settings or deployments. Do not expose private timetable data through Venues. Avoid new infrastructure, dependencies or public configuration switches.

## Limits

This release removes unnecessary idle work. It cannot certify that active allocation, compression or reference refresh fits the free plan's 10 ms CPU allowance without production CPU measurements. Local duration measurements are not Cloudflare CPU measurements.

## Acceptance

Tests must prove idle work avoids broad reads and R2 transfers, due work still reaches existing handlers, retries and expired leases remain eligible, same-tick producer work remains visible, and concurrent changes cannot be acknowledged as completed by an older worker. Existing operational regression tests and package parity checks must pass or have named, evidenced limitations.

## Added scope: systematic R2 cleanup

The user requested systematic culling during implementation. A scope question received no answer. Use the conservative default: generated timetable cache parts only, after 30 days of object age and at least 24 hours of quarantine. Preserve raw baseline/STAPLER models, uploads, receipt objects, audit exports and WhatsApp media.

Run cleanup through a separate daily Cron Trigger `15 18 * * *` (02:15 Singapore), with no normal allocation/delivery work in that invocation. Keep the existing minute trigger. List at most 50 objects and delete at most 10 per daily run. Persist the cursor and daily lease so work proceeds over multiple days and duplicate invocations do not overlap.

Before quarantining a key, atomically verify that no current manifest references it. Retain a permanent D1 tombstone. Cache writers must choose a new object key when the usual content key is tombstoned; manifest promotion must atomically reject tombstoned parts. This closes the race between object deletion and a concurrent cache build. Recheck references before deletion and keep failures eligible for retry. Do not run cleanup against production during development.
