# v0.8.8 release verification

Date: 22 October 2026. Baseline: v0.8.7 (`86a0d59c13b05d81a7548cec581fcc14fd5520d3`).

## Scope and review

Queued items 132–138 are implemented or explicitly qualified in the changelog. The release retains the existing data owners, publication/absence semantics, manual allocation protection, exact save retries and approved WhatsApp template. It does not deploy live code, send messages, clear historical outcomes or establish production throughput.

Independent correctness and quality reviews found two concrete concurrency defects during development. Both were fixed and independently reproduced after the repair:

* A newer SMC manual-send intent could be suppressed by a concurrent Admin queue cancellation. Reconciliation now allows only a strictly newer same-notice manual intent to supersede an older unprepared maintenance cancellation. Prepared/accepted attempts and genuine domain cancellation remain protected; cancellation history is retained.
* Delivery review could remain disabled after navigation while an action completed. Settlement now reconciles with the current same-owner view, retains the exact request on uncertainty and ignores late responses after an owner change.

No confirmed blocker remained in the reviewed source. The audit watermark was also checked with an adversarial exporter interleaving: an older settlement cannot regress a newer canonical export and watermark.

## Verification evidence

The full regression run exercised 582 current scripts, with 576 passing on the first integrated run. Six failures were diagnosed and corrected: four stale component-version expectations, a source assertion for the deliberately changed audit lock release, and a package built before the latest source changes. Version metadata and the release bump script now agree; the lock assertion reflects conditional release while the behavioral test verifies the lock order.

A subsequent targeted run passed 20 scripts, including all new v0.8.8 regressions, the two review-finding regressions added after the full run started, the corrected version/lock checks, and existing notification-store/maintenance checks. Chromium covered Report Absence, allocation batches, Daily Notify, Inbox media/drafts and Statistics exports. Package verification is run again against the final archive, including exact source parity and all 12 members. Apps Script parsing checks all 104 `.gs` files with the supported syntax gate.

## Measured local results

* The synthetic 100-recipient, nine-batch transport fixture uses 10 Apps Script calls instead of 28: 64% fewer calls. It tests bounded concurrency, cooldown and ambiguous handoff handling. Mock-service elapsed time is not a production delivery benchmark.
* A synthetic Daily Notify refresh of 150 teachers and 2,100 period rows improved median rendering from 124.9 ms to 23.9 ms while retaining focus. This measures DOM work, not server or mobile-network latency.

## Remaining operational limits

Live p50/p95 under a representative morning load remains unmeasured. A batch arriving after the audit priority precheck can still wait for an export already holding UserLock. Inbox still shares Roster ScriptLock. Operations persistence still replaces a whole Drive JSON document. These are documented follow-up measurement targets, not claims of full SQL isolation or physical cell writes.

The user's earlier cleanup logs retain 75 uncertain WhatsApp outcomes. This release does not resolve their provider outcomes. The historical save reference still needs its receipt/execution evidence. Neither is erased or represented as a successful delivery/save by this commit.
