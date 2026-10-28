# v0.9.7 validation record

Prepared 26 October 2026 against corrected v0.9.6 source commit `7a8b2fb13a265bc8c4724b0e8a3cd602ecaf2f8b`. The final source commit and tag are recorded by the suite packager, not guessed here. No live deployment, migration, restore, provider message or production cleanup was performed.

## Results

| Check | Result |
| --- | --- |
| Broad Node regression run and targeted final rechecks | 743 passing scripts; four blocked by missing historical source context |
| Initial broad run | 745 scripts; identified regressions/harness issues were corrected and rechecked |
| Final targeted run | 30/30 passed, including every new v0.9.7 feature suite, packaged Worker checks and corrected failures |
| LORD release programs | 34/34 passed, including browser checks |
| Apps Script syntax | 193 `.gs` files parse as ES2020; syntax regression guard passes |
| Installation package | Explicit inventory, hashes, canonical-source parity, matching component labels and offline guide links verified |
| Shipped Workers | Actual Roster/Deploy ZIP entry points and both standalone Worker files parse/import without local dependencies; config/authentication/recovery boundaries exercised |
| Visual checks | Receipt controls at 390/1280 widths; offline manual and architecture render without page errors |
| Independent code review | Critical findings fixed and independently rechecked; no outstanding blockers in reviewed source |

[Per-script results](validation-results.json) preserve passing and blocked statuses. Browser runs used the available `/tmp/chromium` executable. No browser dependency was silently treated as a pass.

Four comparison tests remain blocked:

- `release084-absence-browser.cjs`: required tag `v0.8.3` is absent.
- `roster717-inbox-performance.cjs`: required tag `v0.7.16` is absent.
- `roster718-absence-performance-browser.cjs`: required tag `v0.7.17` is absent.
- `stapler718a-relief-import.cjs`: the expected upstream snapshot does not contain `shared/roster-stapler.js` in the imported history.

These are not passing checks. No tags or historical source files were fabricated to satisfy them. Current absence, inbox, STAPLER, cache, gateway and browser regressions run separately in the passing set.

## What the new checks establish

- Private signed delegation preserves identity/origin, strips caller-supplied role/service elevation, verifies active D1 scopes before capture and fails closed on missing service bindings. A lost delegated reply does not fall back to another writer. Request retries retain domain idempotency.
- Health requires current administrator authority, rejects SMC-only access and invalid freshness configuration, exposes allowlisted safe metadata, and stays read-only during recovery. Idle summaries cannot overwrite queued-job outcomes or evict failure history.
- Durable background work coalesces generations, fences leases, bounds wake/handler failures, parks exhausted work and retains uncertain provider outcomes. Attempted proposal/instruction failures cannot masquerade as success and bypass the retry cap.
- Recovery blocks actual gateway/scheduler/queue/cache cleanup routes before effects. Checkpoint capture verifies a native bookmark; retention includes equal-timestamp insertion cases. Restore is an operator procedure, not an automated application action.
- Cache repair is bounded, cannot promote over changed sources, and keeps authority/privacy boundaries. Signed Worker and legacy Venues sources expose only the explicit occupancy fields plus bounded staff names. Browser rendering escapes names. SMC drafts, contacts, medical evidence and unrelated details remain excluded.
- Completed-receipt preferences are user-scoped, bounded and payload-free. Pending/review states stay visible; storage failures degrade to a visible memory-only mode. Dismissal does not invoke a backend withdrawal.

The paid idle-scheduler fixture returns only 18 compact metadata rows (about 0.9 KB) with zero full Roster loads, R2 operations, external calls or Queue wakes. This demonstrates local control flow; it is not a production CPU or billing guarantee.

## Scope of confidence

Local tests use real JavaScript/SQLite logic with controlled Cloudflare/provider adapters; they do not certify the live account's bindings, active scopes, API credentials, OAuth clients, Queue consumer, timetable data, provider delivery or peak-hour CPU. Run the controlled acceptance steps in [DEPLOYMENT.md](DEPLOYMENT.md) after installation. Native recovery must be rehearsed with isolated resources and test destinations before relying on a live restore.
