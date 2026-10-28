# v0.9.6 validation

## Packaging repair, 26 October 2026

The new actual-ZIP test `tests/pages096-packaged-worker.cjs` failed against the original component archive because both Roster and Deploy `_worker.js` files retained sibling imports. The component builder had bypassed the bundler already used by the full-release builder; its verifier incorrectly required raw source equality. Both now use that established bundler.

The corrected archive passes bundled source parity, standalone module loading without a sibling resolver, `/api/config` version/client ID and secret exclusion, static asset delegation and unauthenticated API rejection for both applications. Only `_worker.js` differs within each frontend archive. All other frontend assets, the Apps Script backend and notification Worker are byte-identical to the original v0.9.6 package. Independent packaging review found no blocker.

These checks validate the package repair locally. The supplied Cloudflare screenshots contain failure status but no error message. A successful live deployment and the exact remote rejection are therefore unverified. The original 31-script runtime results below are retained from the initial release; application source behavior was not changed in this packaging repair. No new full-suite result is claimed.

## Final verification

31 of 31 final targeted test scripts passed after runtime regeneration. These include all eight new v0.9.6 regression scripts, D1 store/setup and Roster operations, Deploy handoffs, timetable storage, notification adapters/pacing/batching, independent dispatch lanes, peer delivery/workflow, absence intake, SMC summary timing and the inherited v0.9.5a STAPLER picker/eligibility checks.

The new focused checks cover:

* Exact-key and indexed work probes with 10,000 retained records, plus dispatch indexes with 14,000 completed records.
* Handled notification failures, uncertain sends and peer mail remaining idle; retry, normalization, escalation and lease recovery remaining eligible.
* Scheduler clock windows, custom summary times, 05:30, 06:29/06:30, reminders, already completed slots and paused authority.
* Audit additions, edits, deletions, bounded backlogs, concurrent upload/source changes, and unchanged-head scan suppression.
* Empty timetable jobs, missed enqueue repair, daily rollover, changed-date hydration, stage limits, duplicate workers, newer jobs, replaced leases and source changes during promotion.
* MK/appointment eligibility invalidation, retired-part replacement and promotion fencing.
* R2 protected references across all authorities/stages, age and quarantine rules, cursor continuation, daily lease, deletion failure/retry, disabled authority, malformed manifests and both writer/deletion race orderings.
* The separate daily cleanup trigger does not run the normal allocation and notification jobs; the minute trigger does not run cleanup.

The R2 cleanup test passes 10 of 10 cases. Its bounded daily run stays within the tested D1 binding-call limit, counting a batch as one call. This does not measure CPU time.

Canonical generation succeeded. All 187 Apps Script files parsed successfully. Notification source/bundle parity and identical copyable Worker text passed. `git diff --check` passed.

## Actual scheduled-handler comparison

The integration fixture invokes the actual scheduled Worker against real SQLite, with automation, WhatsApp, durable ingress and Deploy enabled. It includes 2.53 MB of historical audit data, two years of Calendar references, handled failed/uncertain notices and handled uncertain peer mail.

| Measure | Supplied v0.9.5a behavior | v0.9.6 repeat idle tick |
| --- | ---: | ---: |
| Full Roster loads | 9 | 0 |
| Returned D1 rows | 20,765 | 25 |
| Returned D1 data | About 25.95 MB | About 3.8 KB |
| R2 writes | 2 | 0 |
| R2 reads / external calls | Fixture-dependent before fix | 0 |
| Logged failures | 1 | 0 |

The v0.9.6 fixture also verifies that business authority and revision heads do not change on an idle tick. The final test fails against the earlier implementation and passes against this release. Returned-byte counts are local fixture measurements, not Cloudflare CPU or billed D1 rows-read measurements.

## Wider regression run

113 existing affected scripts were selected. 109 passed on the first run. The generated-bundle parity failure passed after rebuilding, leaving 110 passing scripts and three unavailable historical fixtures:

* `release084-absence-browser.cjs` requires Git tag `v0.8.3`.
* `roster717-inbox-performance.cjs` requires Git tag `v0.7.16`.
* `roster718-absence-performance-browser.cjs` requires Git tag `v0.7.17`.

These scripts stop before checking current product behavior. No substitute historical source was invented. A clean complete `npm test` run is not claimed. The 31-script final run above covers the completed change after the final fixes.

## Review and limits

Independent source review found no blocking issue in the reviewed cron, dispatch, timetable concurrency and R2 cleanup paths. A separate comparison of the notification preflight with the transport domain covered 1,152 failed/uncertain combinations without a false-negative skip.

Handled failed/uncertain records can still be examined inside D1 through indexed alert lookups. Live peer requests still trigger Contacts reconciliation. The release does not claim constant D1 rows-read for every possible history, or that every active job fits the free plan's 10 ms CPU allowance. Cache rebuilding is bounded by stages, not individual parts. First-use index construction and due reference refresh remain real work.

No live school system, staff record or R2 object was changed. Production deployment, production CPU measurements and live workflow checks remain outstanding.

Superpowers, pstack, Ponytail, Vercel and available Improve/gstack guidance informed implementation and review. Thermonuclear was not exposed in either available skill catalog.
