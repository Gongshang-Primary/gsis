# Calendar Q validation

Calendar's focused checks pass. The wider project suite retains 13 inherited failures; this is not an all-green suite release.

| Check | Result |
| --- | --- |
| Final focused Calendar programs | 19/19 passed on final runtime code |
| New Q backend/status cases | 11/11 passed |
| New Q browser transport/recovery cases | 17/17 passed |
| Independent adversarial status probes | 22/22 passed |
| Independent projection parity cases | 250/250 passed |
| P/Q package integrity regressions | 14/14 passed |
| Packaged Calendar config, assets and authentication boundaries | Passed |
| Non-Git preview recovery and rebuilt artifact checks | 8/8 commands passed |
| Separate LORD suite | 38/38 programs passed; production LORD code unchanged |
| Full root suite, initial invocation | 836/854 programs passed |
| Full root suite plus corrected affected checks | 841/854 programs passed; 13 inherited failures remain |

The full `npm test` invocation returned a nonzero exit status. It encountered five integration failures while labels and package test paths were being finalized: `calendar605`, `calendar606-inherited`, `pages096-packaged-worker`, `paid097-bundles`, and `release098h-suite-routing`. All five were corrected and rerun successfully. Calendar606's four obsolete per-column read assertions were updated for adjacent-column coalescing while retaining exact field, row, identity and zero-write checks. The other integration fixes concern finalized labels, current package paths and guide routing. The 841/854 figure combines the original full run with these affected reruns; it is not the result of a second full-suite invocation. The LORD runner was executed separately because the root failure prevents the chained command from reaching it.

The 13 remaining failures are the same inherited baseline issues: four missing historical inputs, three old size/performance thresholds, and six superseded policy or storage expectations. Their tests and relevant Roster/shared/backend runtime files are byte-identical between P and Q. Prior baseline evidence, current failure signatures and source parity are retained with the review evidence. See `docs/v098q/FULL_SUITE_FAILURE_CLASSIFICATION.md` for individual cases and limits; later assertions inside a stopped failing script are not counted as verified.

## What the checks establish

The browser tests execute the real app with controlled clocks and AbortSignal-aware transport. They reproduce a 49-second batch, lost/truncated replies, final-result recovery, bounded no-progress retries, local Stop waiting, access revocation and delayed final refresh. Backend tests cover active claims, saved settlement, exact completion, compact error counts, corrupt/mismatched evidence, fresh authority checks and read-only status side effects.

The supplied-session simulation retains 20 prior creates, 30 historical upgrade errors, 30 actionable events and one uncertain receipt. Finishing that run and then explicitly starting another produces exactly 60 new committed inserts with 60 unique provider identities. The uncertain receipt and its source row remain byte-for-byte unchanged. Automatic response recovery does not create the second run.

With 1,295 synthetic rows, five creates use 77 native reads and 23 flushes versus P's 83 and 43. Five updates use 63 reads and 3 flushes versus 69 and 23. Locks, read cells, source writes and provider calls are unchanged. The modeled 5.5-second batch reduction is synthetic and omits some service latencies; it is not a live performance guarantee.

## Reproduction and release gates

Use Node matching package.json and `TZ=Asia/Singapore`. Commands and logs are retained under `verification/v098q` in the review archive. The recovered-source check rebuilds both Calendar artifacts without Git history and verifies their contents against the package. It reuses the locked installed dependencies; a new dependency installation was not tested.

After the clean source is committed and tagged, the final packager verifies that tag, the P-to-Q diff, canonical frontend inventory, backend bytes, source hashes and unchanged component boundaries. The committed archives must pass `npm run test:release` and the eight-command recovery check before delivery. Those archive checks are release gates separate from these pre-commit test results.

No live school records, provider events or production deployments were changed by verification. The optional Calendar jobs Worker's 35-second deadline remains unchanged. A post-installation run is still needed to establish actual Google throughput and the current school's sync outcome.
