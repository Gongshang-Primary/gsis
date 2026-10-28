# GSiS v0.8.9 release verification

The runtime code and generated gCodes are committed at `982e247d40418e9b60098056f7df0e766caac3c7`. The final release commit adds the guides and this verification evidence. No live deployment, staff message, Calendar publication or bulk school-data change was performed.

## Results

- All **597 current non-package test programs passed** in the final full regression. No dependency failures or timeouts remain. Seven explicitly superseded historical programs remain outside the current release gate; their names are recorded in `test-summary.json`.
- The separate package program passed: **598 passing test programs in total**. The full-package validator also passed directly. It checks the exact 13-file installation manifest, hashes, runtime/source parity, versions, offline documents, bundled assets and complete Worker modules.
- The generated Apps Script syntax gate passed for 108 `.gs` files using the ES2020 parser. The test also rejects the known logical-assignment compatibility regression.
- Two independent reviewers examined correctness and structural quality against v0.8.8. No evidenced release-blocking finding remains.
- Archify validation, delivery, artifact and browser gates passed with zero diagnostics. Its 23 source references pin the runtime checkpoint. Manual desktop, mobile, zoom-equivalent, search, anchors, reduced-motion and runtime-error checks passed. Light/dark architecture and mobile/manual captures were inspected. Internal captures are excluded from deliverables.

## Material fixes found during review

1. A new date range could expose a new baseline with an old suspended generation when the second download stage failed. The client now fences incompatible date ranges before exposing the baseline.
2. An unrelated operational revision could reject a valid suspension update. Validation now follows actual content identities instead of the global revision.
3. A corrupt immutable IndexedDB row could prevent the same content key from healing. Invalid rows are removed and a valid retry can restore them.
4. A recovered absence save waited for a full records refresh before confirming success. It now shows the confirmed receipt first. The optional refresh cannot replace a newer page, date, identity or draft.
5. Worker read claims had no bounded retention cleanup. Cron now removes at most 100 claims per tick that expired more than 24 hours ago, even while durable webhook ingress is disabled.

Each fix has focused regression coverage in addition to the final suite. Older UI fixtures were updated for the shipped `Save to online` and `Venues` controls, and to distinguish the operational poll from the new elapsed-seconds counter. Missing generated gCodes were restored by the normal release build.

## Speed and concurrency evidence

`roster-cache-performance.json` records a local headless Chromium fixture with 200 synthetic teachers, 31 dates, two tabs and 30 concurrent requests. The final run measured cold p50/p95 of 103.4/128.1 ms and warm p50/p95 of 0/0.1 ms. The cold fixture used two origin requests and 50,856 compressed payload bytes. Warm reads used no origin request. Unchanged checks transferred zero timetable payload bytes and performed zero extra decodes or payload rewrites. These are fixture timings, not school-device or production latency claims.

Concurrency cases verify 30 independently authorised viewers share one cold origin preparation, and 30 distinct absence reports retain 30 records and receipts under overlapping preparation and reversed commit order. Duplicate webhook ingestion, consumer overlap, restart, uncertain provider outcomes, stale Calendar settlement, strict venue-clear conflicts and exact-request retries also pass. The tests do not prove end-to-end production throughput or every backend lock timing.

## Installation requirements and remaining scope

The full package contains five frontend ZIPs, four gCodes, one complete Worker text module and three documents. Use the maintainer guide for dashboard-only installation. New D1/R2 features require their documented bindings, schema, flags and lifecycle rules. Calendar background continuation is optional. No Wrangler command is required by the guide.

Google stores remain authoritative. IndexedDB and R2 are read copies; neither authorises a write. Roster still physically replaces its operational Drive JSON, and Inbox settlement still uses the Roster ScriptLock. The work reduces unrelated reads and provider work within locks; it does not claim cross-service SQL transactions or removal of all serial writes.

Durable Objects/WebSocket push remain future work; this release uses bounded version/cursor checks and durable D1 jobs. Birthday-event generation remains queued until its unresolved eligibility/publication scope is settled. The prepared live 2027 venue clear has not been run; the new frontend action is available after installation. An operator must verify installed permissions, a controlled provider send and representative morning load before claiming production delivery or speed.
