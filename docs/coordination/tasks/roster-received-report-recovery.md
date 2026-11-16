# Recover received D1 absence reports

- Model: Codex
- Status: claimed; implementation in progress
- Date (Asia/Singapore): 2026-11-16
- Branch: codex/roster-absence-clash-confirm (existing hotfix PR #182)
- Base for this bounded extension: e143d89068012b61925858489435d75a3c1c355b
- Owner request: received absence reports do not reach Assign Relief; urgent v0.9 hotfix. The owner has waived Claude review for v0.9 hotfixes. Owner merges and deploys.
- Scope: D1 intake wake/recovery in roster-update/public/_worker.js, Roster intake display refresh if needed, synthetic regression tests, generated Worker bundles/parity references and hotfix handoff notes. No Google Apps Script changes, v1 work, live reads, settings changes, deployment or row deletion.

## Evidence and bounded repair

The owner reports retained receipts still showing “Received; sending to the school register”. System Health shows a received-report idle result with zero counters, a separate allocation failure with pending captures, and stale completion times for several minute-lane jobs. These observations do not identify a single live configuration or runtime failure.

Synthetic reproduction: capture and drain on the same D1 database with different Apps Script URLs leave the receipt queued with zero attempts while the drain reports idle. The durable namespace includes that URL even in D1 mode. Also, a successfully queued notification wake suppresses the existing local attempt, and intake-list checks do not resume work. Thus a stalled or differently scoped background consumer can strand otherwise valid D1 receipts indefinitely. Canonical and packaged local drain tests with matching context pass.

Keep namespace boundaries, authority checks, leases and immutable request IDs. Add a bounded D1-local attempt independent of notification wake acceptance, and resume retained work on authorized receipt-list checks. A receipt remains “received”, never “saved”, until D1 confirms its application. Refresh a clean Assign Relief view after observed receipt progress without discarding edits.

## Acceptance and safety

- Synthetic accepted-but-unconsumed wake reproduces the old failure and applies through the capture Worker after the fix.
- Existing backlog resumes through an authorized status check even when another Worker sees an idle namespace.
- Concurrent recovery and scheduled drain do not duplicate attendance or notifications; active claims, backoff and current permission checks remain enforced.
- A clean Assign Relief view reflects applied receipts; unsaved work is retained.
- No namespace broadening, provider calls, live rows/settings changes or Google fallback edits.
- Canonical build clean after regeneration; full v0.9 local suite and exact-head full CI. Record actual results and owner deploy files before handoff.
