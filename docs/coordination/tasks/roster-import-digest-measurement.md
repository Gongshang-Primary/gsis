# roster-import-digest-measurement

- Status: measurement complete; isolated draft review
- Owner/model: Codex
- Reviewer/model: Claude
- Last updated (Asia/Singapore): 4 November 2026 03:20
- Branch: `codex/roster-import-digest-measurement`
- Base SHA: `e2bfe2c3283d56ac97868b360211fb049a30b461`
- User-authorised scope: compare retained preparation metadata for sessions `388d395a…`, `0cafa306…` and `ab0d91fc…`; report coverage, digest changes, payload sizes and dates.
- Files/domains owned: `scripts/compare-roster-import-checkpoints.cjs`, `tests/roster-import-checkpoint-comparison.cjs` and this record. Append the Step 0 result to `roster-import-step141-bridge-timeout.md` after the #69 suite handoff.
- Out of scope: product code, generated bundles, D1/Drive/Google writes, freeze, restart, activation and deployment. #69's working tree remains untouched.
- Acceptance: reproduce comparisons from local checkpoint JSON, match logical object identity rather than global part number, distinguish incomplete coverage from source additions, test shifted part numbers and changed digests, retain no private payload in Git, and open a separate draft PR.
- Claim publication: automatic approval review rejected the documentation-only `main` update because this work requires a separate draft PR. The claim and measurement therefore remain on this branch; `main` was not advanced.

## Evidence

Read the two named Drive checkpoints and the retained completed 2 November checkpoint. A later retained checkpoint for `0cafa306…` exists and will be measured separately without replacing the requested baseline silently.

## Step 0 measurement results

Measurement date: 4 November 2026. Parent task: [roster-import-step141-bridge-timeout](roster-import-step141-bridge-timeout.md), Step 0. These results are separate from #69's code and suite handoff. No D1, Drive or Google write, freeze, restart, activation or provider message was performed.

### Retained inputs

All times below are Asia/Singapore. Source-file creation time is a reproducible proxy for session time, not a claim about the exact moment the snapshot was captured. Checkpoint completion time is its stored `timing.finishedAt`.

| Session | Source file created | Checkpoint completed | Stored ordinal / displayed steps completed | Parts / bytes | State |
| --- | --- | --- | --- | --- | --- |
| `388d395a…` | 2 Nov 01:21:19.562 | 2 Nov 03:01:35.828 | 185 / 186 | 233 / 23,422,741 | ready |
| `0cafa306…`, named checkpoint | 3 Nov 03:28:06.235 | 3 Nov 04:23:19.872 | 80 / 81 | 78 / 2,411,657 | objects |
| `ab0d91fc…` | 3 Nov 21:17:16.169 | 3 Nov 23:45:16.252 | 140 / 141 | 140 / 5,239,393 | objects |

| Session | Checkpoint Drive file | Checkpoint SHA-256 |
| --- | --- | --- |
| `388d395a…` | `1p4Oa1sLiuxCEGxofrJLCBlXcgNzAXgx1` | `16dfaef470ee868594ea8fd502d0a289ffe048f4cac64b214e36b68542e884bb` |
| `0cafa306…`, named | `1gdjHr3nJs88485qjIRQHMIbB9C_RhE7u` | `ab5400e040ae24b18a03aee853576ef04802b2abf00a99c5cf10344c9eae8416` |
| `ab0d91fc…` | `18XZ2BGboW-PjVf8gwAKDxP__mNripWlT` | `652fb2e0c82eecb817da0fc2f9a96f676090c462ae59508c72f83d9937add910` |

Fresh read-only downloads matched all three checkpoint hashes above. The 1,000-file folder listing contained all 78 named `0cafa306…` parts, all 140 `ab0d91fc…` parts and 217 of the 233 `388d395a…` parts. Direct metadata reads confirmed the remaining 16 old parts. All stored sizes matched the checkpoint. Part-file references also matched the checkpoint digests and byte lengths. This verifies retained metadata and files' existence and size; payload files were not downloaded or rehashed.

### Pairwise part comparison

Match object parts by `(job.kind, job.id, transport kind, segment index)`. Global `part-xxxxx` numbers are allocation positions and can move when a new job appears. Record chunks are positional within their scope; neither later checkpoint has reached them, so no record-chunk comparison is possible here.

“Changed bytes before/after” means the sum of complete serialized payload lengths for changed, matched parts. It is not a byte-level diff. Added parts and incomplete coverage are separate.

| Older to newer | Source-file interval | Compared | Identical | Changed | Changed bytes before | Changed bytes after | Net bytes |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: |
| `388d395a…` to `0cafa306…` named | 26 h 6 min 46.673 s | 78 | 74 | 4, 5.13% | 108,093 | 311,048 | +202,955 |
| `0cafa306…` named to `ab0d91fc…` | 17 h 49 min 9.934 s | 78 | 70 | 8, 10.26% | 313,066 | 455,672 | +142,606 |
| `388d395a…` to `ab0d91fc…` | 43 h 55 min 56.607 s | 136 | 114 | 22, 16.18% | 114,872 | 460,433 | +345,561 |

The corresponding checkpoint-completion intervals are 25 h 21 min 44.044 s, 19 h 21 min 56.380 s and 44 h 43 min 40.424 s.

### What changed

The primary comparison, `0cafa306…` named to `ab0d91fc…`, changes four audit objects, each represented by a `segment` and an `object` assembly part. All are in logical scope `roster`, collection `allocationAuditExports`. The stored object-part scope is blank because these objects are transferred out of band; the logical scope follows their catalogue path.

| Audit date | Part IDs | Bytes before, both parts | Bytes after, both parts | Net bytes |
| --- | --- | ---: | ---: | ---: |
| 2 Nov 2026 | `part-00030`, `part-00031` | 176,592 | 176,728 | +136 |
| 3 Nov 2026 | `part-00032`, `part-00033` | 134,456 | 227,128 | +92,672 |
| 4 Nov 2026 | `part-00034`, `part-00035` | 1,585 | 50,411 | +48,826 |
| 6 Nov 2026 | `part-00036`, `part-00037` | 433 | 1,405 | +972 |

The older `388d395a…` to named `0cafa306…` comparison changes only the audit objects dated 2 and 3 November. Across the longest interval, 64 of 68 common source objects are unchanged; four audit objects change, dated 2, 3, 4 and 6 November. All four baseline model digests are unchanged in every comparison, in logical scope `roster-register`. Every common Stapler source-object digest is also unchanged.

`ab0d91fc…` has two genuinely new Stapler jobs, `2026-11-06/draft` and `2026-11-06/confirmedPlan`, absent from both earlier catalogues. Their four parts, `part-00108` through `part-00111`, total **113,822 bytes**. They are additions, not changes to matched parts.

The longest interval's 22 changed transport parts include **14 assembly-only changes** for otherwise identical Stapler archive objects. Adding the two new Stapler jobs shifts later segment IDs by four positions. Their assembly JSON digests change because they refer to those new IDs; their source digests and segment payload digests remain identical. The dated recovery archives involved are 28, 29 and 30 October; the other archive job IDs are undated UUIDs, so their dates cannot be inferred from the checkpoint. These are not evidence that October source content changed.

### Coverage limits and decision

The named `0cafa306…` checkpoint freezes 39 complete objects. `ab0d91fc…` freezes 70. Of its 62 unmatched parts, 58 belong to 29 jobs that already exist in the earlier catalogue but had not been prepared; four are the genuine additions above. The 58 incomplete-coverage parts total 2,571,308 bytes. Do not count them as changed or added source data.

The completed `388d395a…` session has **97 record parts totaling 18,642,731 bytes**, including 96 `roster` parts and one `roster-register` part. Neither later checkpoint has any record parts or scope digests. These cover 13,438 Roster records and 21 register records in the completed manifest and are entirely unmeasured across sessions. Absence, allocation, receipt and other operational-record churn cannot be inferred from the object comparison.

The observed object-part rates are below 30%, but this does **not** establish the proposed whole-import decision rule. Object reuse looks promising. The evidence is insufficient to choose incremental import over a full weekend import, because most of the old payload bytes are in unmatched record parts. No incremental design or cutover approval follows from this measurement.

### Later retained checkpoint for the same 3 November session

Drive also retains `0cafa306…` checkpoint `00081`, file `1UZhXt6HrzodImWjBeDjpyUTlDhi08ezZ`, SHA-256 `de8c3e74c77438368af334f338fba7d6168af1ea4bc3117624c062912946692e`. It completed at 3 Nov 04:24:24.735, 64.863 seconds after the named checkpoint. Stored ordinal 81 means 82 completed steps. It has 80 parts, 2,517,344 bytes and 40 complete objects.

Compared with `ab0d91fc…`, that later checkpoint gives **80 compared, 72 identical, 8 changed, 10.00%**. Changed-byte totals stay **313,066 to 455,672**, net **+142,606**, and the same four audit dates change. This does not fill the missing record coverage. No session was resumed to obtain it.

### Reproduction

Download the named checkpoint files read only into a private working directory. Run:

```sh
node scripts/compare-roster-import-checkpoints.cjs old-ready.json named-81.json named-141.json
```

Optionally place source-file metadata in a local JSON array of `{id, createdTime}` and prepend `--inventory metadata.json` to include source-file intervals. The command reads local files and writes JSON to stdout. It has no Google, D1 or network client. It emits object IDs, dates, digests and counts, never the checkpoint actor or record payload. The tested format is the retained pre-#69 v2 checkpoint format; unsupported part kinds fail closed. Keep downloaded checkpoints outside Git.

## Verification

The focused comparison test passes, including shifted global IDs, unchanged source with changed assembly metadata, payload-size accounting, missing preparation, genuine additions, record-coverage gaps, duplicate IDs, invalid references, an unchanged input file after CLI execution and redacted malformed-input errors.

`TZ=Asia/Singapore npm run build` passed for all 18 components without generated-file differences. `TZ=Asia/Singapore node tests/roster-import-checkpoint-comparison.cjs` passed. An independent offline Python calculation reproduced all three comparison counts and changed-byte totals. `TZ=Asia/Singapore python3 lord-suite/tests/run_all_checks.py` passed 39/39 programs.

The full local Node run selects 952 programs, including the new comparison test. Its `package.cjs` check fails because this reduced local clone does not contain historical commit `2efd6e003fa9ee3846cf590d07902a22309861ff`. Do not count that as a pass. The unchanged hosted workflow fetches full Git history and runs all Node/LORD checks; its exact-head result is required for review and will be reported in the PR handoff. Six optional historical performance comparisons remain excluded by the unchanged runner.

## Handoff

Claude reviews the measurement and exact PR head. Owner merges. #69's files are unchanged while its suite handoff remains pending. After that handoff, append or link this result from the parent task's Step 0 section. The PR conversation carries the same numerical summary for Claude now. No production changes.
