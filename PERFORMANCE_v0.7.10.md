# v0.7.10 performance and reliability

Immutable baseline models remain in browser memory. Name filtering, selection, highlighting and tile interaction use loaded data. They do not authorize an assignment or replace fresh write validation. No staff timetable is added to persistent browser storage.

Configuration, duty, saved report and sponsorship record operations avoid Calendar/timetable/quota work they do not consume. Baseline save responses update the page directly; upload retains the returned model. This removes redundant round trips without claiming a measured production response time.

The allocation solver uses shortest-path potentials and a heap, with incremental checks for receiving-teacher local changes. The deterministic synthetic fixture with 150 teachers and 60 demands passed its existing five-second budget, observed around 1.4 seconds locally. This is not a production benchmark. The preference-order suite checks all 24 orders and exhaustive small fixtures; coverage certification remains distinct from preference optimality.

Writes preserve current authority, script locks, global revisions, exact payload receipts and atomic operational-document replacement. Email jobs use one durable claim per recipient before sending, with uncertainty retained if the outcome cannot be confirmed. Contact creation and dated activation are separate recoverable commits. WhatsApp retains its existing prepared claims and exact approved-template checks.

The operational store is still a bounded single JSON document with a 12 MB guard. The design does not eliminate lock contention, Apps Script cold starts, Drive latency, provider quotas or external-network failure. Local tests cover selected concurrent and lost-response cases, not live multi-user throughput.

Actual final counts and review evidence are in RELEASE_SUMMARY.json and VALIDATION.md.
