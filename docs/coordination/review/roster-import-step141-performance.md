# Import preparation performance, 4 November 2026

Model: Codex. Reviewer: Claude. PR #69. Baseline: v0.9.9i at `e2bfe2c3283d56ac97868b360211fb049a30b461`. The previous submitted implementation is `f02b2bab787525d1c5c234fee09e89081fc21286`.

## Same-fixture comparison

The fixture has 16,080,000 operations characters, 12 models and 16 audit archives. Every preparation call is included, including capture and finalization. Exporting the finished parts for test verification is excluded from these timings and read counts. MB means 1,000,000 bytes.

| Implementation | Calls | Summed simulated time | Drive reads | Bytes read | Largest call |
| --- | ---: | ---: | ---: | ---: | ---: |
| v0.9.9i | 106 | 8,185,122 ms, 136.4 min | 1,315 | 59,874,809 | 96,998 ms |
| Previous #69 head | 300 | 16,105,054 ms, 268.4 min | 2,210 | 1,553,928,037 | 75,069 ms |
| Revised cache | 108 | 4,784,661 ms, 79.7 min | 634 | 59,012,201 | 59,888 ms |

The previous head was 96.76% slower than v0.9.9i. The revised cache is 41.54% faster. Its summed time is below the 125% ceiling of 10,231,402.5 ms.

The model charges 5,000 ms per Drive call, 1,000 ms per MiB transferred and 300 ms per MiB hashed, compressed or decompressed. Snapshot reads also contribute to elapsed time but are reported separately from Drive read counts. These are simulated costs, not measured Google request latency.

The interruption run kills each newly encountered upload after its bytes are stored, reloads the VM and retries the same ordinal. Every completed part and the final manifest must match the uninterrupted run.

| Implementation | Attempted calls | Committed calls | Simulated time | Bytes read | Largest call |
| --- | ---: | ---: | ---: | ---: | ---: |
| v0.9.9i, interrupted | 359 | 180 | 21,607,582 ms | 144,559,190 | 112,124 ms |
| Revised cache, interrupted | 363 | 182 | 13,628,095 ms | 71,541,873 | 59,888 ms |

The revised interruption run is 36.93% faster. Both revised runs meet the new 60-second per-call bound on this fixture. The previous 25-second bound was withdrawn by Claude in the review of `f02b2ba`.

## What changed

Each object or records job is prepared once. Its immutable work file contains a part index and separately compressed part payloads. Later calls read only the indexed ranges. They verify the compressed chunk, decompress that bounded payload, calculate its transport digest and verify its immutable readback. Two small parts may share a call within the time and byte limits.

Scope hashes are calculated from the completed cached record payloads in a separate bounded step. That step does not reread the packed source or reopen stored Stapler plans. A retained upload intent lets retries recover the cached job without repeating its source read, compression or planning. Checkpoint retries still search and verify the exact completed ordinal before doing work.

The existing tests retain their assertions for source identity, exact manifest and payload parity, no duplicate uploads, cancellation and private-file boundaries. The packed-plan test distinguishes original plan inflation from bounded cache decompression; its original limit on opening stored plans remains, and freeze steps now require zero stored-plan inflations.

## Last night's retained data

The read-only inputs are the 3–4 November session `ab0d91fc…`: a 20,228,544-byte packed source and 70 source objects. All downloaded input hashes match the retained checkpoint. Their decoded object payloads total 53,596,757 bytes. Raw inputs remain outside Git.

The unmodified source cannot complete either import implementation. Two of its 3,634 audit rows share an ID, and both versions reject it with `EDGE_RECORD_ID` during record preparation. No source record was changed or deleted.

The following is therefore a **conditional projection**, not a successful replay of the original input. In an offline copy only, the two audit rows receive distinct storage keys while their payloads stay unchanged. No production validation was bypassed or altered. The projection also verifies all retained compressed-plan digest proofs using the string encoding demonstrated by those proofs.

| Conditional complete replay | Calls | Simulated time | Drive reads | Bytes read | Largest call |
| --- | ---: | ---: | ---: | ---: | ---: |
| v0.9.9i | 204 | 16,180,839 ms | 2,428 | 934,602,886 | 110,303 ms |
| Revised cache | 218 | 10,605,484 ms | 1,267 | 944,817,579 | 71,592 ms |

The revised summed time is 34.46% lower on this larger input. The 60-second gate is proven for the specified 16M fixture; this larger-input simulation reaches 71.6 seconds. It is not a claim that all live calls finish within 60 seconds.

## Wall-time projection

The last saved checkpoint records 15,475 ms for a simple freeze step, approximately the requested 16-second reference. Its timing excludes the final checkpoint upload. The model therefore fits fixed IO latency to that step before adding checkpoint costs.

The source file was created at 3 November 21:17:16.169 SGT. Checkpoint 140 completed at 23:45:16.252: 8,880,083 ms for the observed prefix. The remaining difference from modeled active work is fitted as scheduling, transport and other unmodeled time per call. The projection assumes that pacing continues and that no new failure, queue backlog or provider slowdown occurs.

| Conditional complete run | Active backend time | Total projected wall time | Change from old |
| --- | ---: | ---: | ---: |
| v0.9.9i | 69.4 min | 212.0 min, about 3h 32m | baseline |
| Revised cache | 52.2 min | 204.7 min, about 3h 25m | 3.47% faster |

This is within 25% of the comparable complete v0.9.9i run. The observed roughly 2.5 hours and “141 of 143” describe an unfinished prefix. The old replay needs 204 calls to finish this data; 143 was a changing progress estimate, not a measured total. Multiplying every call by 16 seconds alone would give 54.4 and 58.1 minutes and would omit the substantial pacing seen last night.

There is no verified successful completion time for the original snapshot until the duplicate audit storage-key issue is resolved. This PR makes no live data repair, freeze, restart, activation or deployment.

## Reproduction and evidence

Machine-readable totals, projection inputs and canonical source hashes are in `roster-import-step141-performance.json`.

```sh
TZ=Asia/Singapore node scripts/measure-roster-preparation.cjs e2bfe2c working
TZ=Asia/Singapore node scripts/measure-roster-preparation.cjs --interruptions e2bfe2c working
TZ=Asia/Singapore node tests/roster099-resumable-budget.cjs
TZ=Asia/Singapore node tests/roster-import-time-projection.cjs
```

For an authorized private input directory, the optional `--captured <directory> <checkpoint.json>` mode replays retained data. Without `--audit-key-projection`, the original snapshot fails with `EDGE_RECORD_ID`. The explicit counterfactual flag changes only the offline storage-key projection. Add `--source-created-at 2026-11-03T13:17:16.169Z` to reproduce the wall-time estimate.

The full exact-head Node/LORD result is recorded in PR #69. A green test suite is not a deployment or a live timing measurement.
