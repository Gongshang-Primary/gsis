# Revision P validation

Validated on 28 October 2026, using Node 24.22.1, Python 3 and Chromium `/tmp/chromium`, with `TZ=Asia/Singapore`. These are local synthetic tests, not a deployed-school acceptance run.

## Result and limits

The two P functional changes, current component metadata, independent fault checks and pruned-source rebuild pass. The broad repository run is **not wholly green**. No production code was changed to satisfy an obsolete test expectation.

`TZ=Asia/Singapore npm test` completed the Node runner with **831/852 programs passing and 21 failures**, then exited 1; its chained LORD phase did not run. Targeted reruns resolved eight of those failures: five isolated backend fixtures now load the actual new diagnostic helper, and three browser programs pass when given the available Chromium path. The resulting evidence is **839 passing programs across the initial run and targeted reruns, with 13 inherited checks still failing**. This is not a second clean full-suite run. Nine isolated fixtures in total were updated; some were fixed before their initial full-run execution.

The separate `python3 lord-suite/tests/run_all_checks.py` passes **38/38 programs**. The initial full log, failed attempts, corrected reruns and O comparisons are retained in the review archive's `Validation/` directory.

## The thirteen inherited checks

Every listed failure was reproduced on the clean O baseline. See `Validation/FULL_SUITE_FAILURE_CLASSIFICATION.md` and its raw evidence for exact assertions and which later scenarios did not execute.

| Category | Programs | Interpretation |
| --- | --- | --- |
| Missing historical input | `release084-absence-browser`, `roster717-inbox-performance`, `roster718-absence-performance-browser`, `stapler718a-relief-import` | Original comparison tags or a historical source path are absent. These historical comparisons cannot complete. |
| Existing response-size bound | `roster-draft-cell-save-speed`, `roster080-batch-backend`, `roster719-performance` | O and P both measure 3,073 bytes against an old less-than-3,000-byte bound. The latter two import that failing fixture before their own scenarios run. |
| Earlier policy expectations | `roster081-day-ownership-browser`, `roster084a-relief-pool`, `roster701-r17-integration`, `stapler718c-import-policy`, `stapler718c-persistence` | They expect allocation after all relevant lessons started, old suspended-day R/cap bypasses, or the old manual-action time gate. Current K/M rule suites retain the later approved policies and pass. |
| Retired storage API expectation | `suite703-calendar-reliability` | Expects three Advanced Sheets reads; O and P use the approved L native SpreadsheetApp path and report zero API reads. Current native-storage tests pass. |

The runner also explicitly retains thirteen historical exclusions: seven pre-existing superseded suites and six past-release inventory tests replaced by the P inventory/package gate. They are listed with reasons at the start of the full log; they are not counted among the 852 selected programs. Their source remains available for review.

## Focused and independent verification

| Check | Result |
| --- | --- |
| Actual native exporter → production diagnostic serializer → browser download → unchanged strict O importer | 4/4; native bytes/hashes retained; unexpected fields still rejected |
| Export/authentication/diagnostic fixture aggregate | 13/13 programs; integrity program covers 25 cases |
| Retained native exporter and UI/routing | 14/14 exporter, 3/3 UI, 2/2 routing |
| Calendar P throughput/checkpoints | 11/11; 505 creates, 500 Unicode errors, interrupted chunk/head/source/completion writes, capacity refusal, mixed failures and real cooldown handling |
| Calendar cooldown, concurrency, O isolation | 13/13, 9/9, 9/9 |
| Calendar core, I/O, native storage, publication | 38/38, 63/63, 9/9, 15/15 |
| Independent Calendar fault probes | 3/3 plus 4/4 consultant checks; 400 errors recovered exactly after interrupted completion, without provider replay |
| Existing Roster recovery Worker | 8/8; gateway and scheduled-job regressions pass |
| Preparation Worker source and compiled bundle | 11/11 each; existing O bundle parity check passes |
| Full-suite packaging protections | 9/9; missing/tampered/unsafe/rehashed-incomplete inventories refused |
| Source generation | 242 Apps Script files parse as ES2020 in the full checkout; frontend/Worker generation succeeds |
| Offline setup guide | Desktop and mobile Chromium checks pass; no horizontal overflow or remote script dependency |
| Pruned source rebuild | 8/8 commands; all 18 reconstructed components match captured runtime contents; local locked dependencies reused |

Final archive recovery also exposed a verifier-only issue: rebuilt frontend ZIP timestamps differ although their complete file contents match. The corrected verifier retains exact archive bytes against the trusted Git checkout and compares complete safe entry inventories and bytes for a non-Git recovered build. A regression verifies that changed content, missing/duplicate/unsafe entries and altered backend bytes remain refused. The failed check and successful correction are retained; production code did not change.

The benchmark removes 100 minutes of imposed waiting across 101 healthy batches and replaces it with 100 seconds. Its simulated elapsed time is 302.5 seconds including a follow-up incremental update. Network, real Sheets service, Apps Script startup and live lock latency are excluded. This is not a promised live completion time.

## Reproduction and archive verification

Use `docs/v098p/SOURCE_REVIEW.md` for source recovery, dependencies and the second-opinion prompt. Key commands are:

```sh
TZ=Asia/Singapore npm test
TZ=Asia/Singapore python3 lord-suite/tests/run_all_checks.py
TZ=Asia/Singapore node tests/roster098p-export-contract.cjs
TZ=Asia/Singapore node tests/calendar098p-throughput-checkpoints.cjs
python3 tests/release098p-packaging.py
python3 scripts/build-release.py
node scripts/build-timetable-prep-worker.cjs --check
```

For the three explicit-browser reruns, set `ROSTER_TEST_CHROMIUM=/tmp/chromium` or the equivalent installed path. The final committed archives are checked with `scripts/verify-098p-suite.py` against the trusted checkout, then rebuilt from the pruned archive using the supplied `Validation/lean-recovery-check.py`. The archive manifests record the commit and every included hash; the source index accounts for omitted tracked files. Local dependencies are reused in recovery; a fresh dependency download is not part of this proof.

Production remains separate: no deployment, live Calendar sync, provider notification, absence submission, authority cutover, credential change or live-history deletion occurred. Existing uncertain Calendar save receipts remain unresolved. O cannot read an active P chunked Calendar checkpoint: finish or preserve/reconcile that run before pre-P rollback. The preparation Worker remains on the compatible O release, with dated parity, current identity mapping, freshness and all-writer ownership still required before handover.
