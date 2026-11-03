# roster-import-step141-bridge-timeout: attempt 3 (3-4 Nov) stopped at preparation step 141 of 143

- Status: implemented; use PR #69 for the current exact-head full-suite status. Blocks the next cutover attempt.
- Owner/model: Codex
- Reviewer/model: Claude
- Last updated (Asia/Singapore): 4 Nov 2026
- Branch: `codex/roster-import-step-budget`
- PR: https://github.com/helper-gsps/gsis/pull/69
- Base SHA: `72017db6b07f05fe8130492663ab84ce60e1935d`
- User-authorised scope: diagnose step 141; bound preparation steps; reconcile late checkpoints; distinguish bridge failures; restore setup progress and build/age display.
- Files/domains owned: Roster import preparation, Worker bridge/import runner, shared edge setup, their tests and canonical generated outputs.
- Out of scope: deployment, live data, freezes, activation, policy changes and other pending PRs.
- Acceptance: deterministic bounded parts; verified late-step adoption; idempotent retries; accurate errors/setup display; `TZ=Asia/Singapore npm run build` then `TZ=Asia/Singapore npm test` including LORD; draft PR for Claude at the exact head.

## Evidence
- Build v0.9.9i. Freeze 21:15:22 (revision 328). Import reference e8cbe838-db63-4ca2-b6d6-6ae6d4e20b33, session ab0d91fc2edcae20aa9162a246f9765ccdd90724dc31cc42f444264ee6f24e78.
- Preparation (D1 gsis_roster_import_preparation.result_json): step 95/120 at 22:40 ("Freeze parts", stepElapsedMs about 16 s); 120/134 at 23:26 ("Prepare stapler"); 141/143 ("Freeze parts") then job `attention`, `ROSTER_BRIDGE_ERROR`, 23:46:35. No parts or rows written.
- Owner retry 02:21:42 resumed at 141 and failed again 02:23:18 with the same code.
- Apps Script Executions (owner screenshot): the step-141 doPost started 02:22:07, **duration 69.972 s, status Completed**. Other doPosts 3-16 s. So Google finished the step, but after the Worker's bridge wait; the Worker recorded ROSTER_BRIDGE_ERROR. Snapshot checks "Current" at 21:3x, 22:40, 23:3x.
- Quiet mode on throughout (allocation paused). Freeze cancelled 02:24:42, job `stopped ROSTER_IMPORT_FREEZE_CANCELLED`. Checkpoint retained (Drive 18XZ2BGboW-PjVf8gwAKDxP__mNripWlT, digest 652fb2e0…).

## Questions to answer with code references
1. What does step 141 ("Freeze parts", near the end) do that takes 70 s when other freeze-parts steps take about 16 s? Size of that part (bytes, records)? Is it the largest operations/history part?
2. What is the Worker's bridge timeout for preparation steps, and does a late Completed on Google leave Google's checkpoint ahead of D1's? Prove retry is idempotent (retry repeated the same 70 s work, so it is, but confirm no duplicate Drive files).
3. Why did the job wait for an Admin after one bridge error, instead of retrying with backoff like other timeouts?

## Fix
1. Updated by Claude's 4 November review: the 25 s target is withdrawn. Keep every call below 60 s on the 16M slow-Drive fixture, including interruptions. Total preparation must be no more than 25% slower than v0.9.9i on the same input. Persist each job's prepared plan and payload ranges instead of rebuilding it on later steps.
2. On a bridge timeout, check Google's checkpoint for that ordinal before failing; if Google completed it, accept the result (same digest) and continue.
3. Report the real cause in the job error (timeout vs Google error) and the step's bytes/records.
4. Tests: an oversized part is split and finishes under budget; a late-completed step is adopted, not repeated; retry after a timeout produces no duplicate parts.
5. Small: edge-setup.html shows "v0.9.4" (stale label) and the freeze minutes do not refresh; show the build label and live freeze age; show preparation step from D1 after reload.

## Next attempt
Only after this is merged, reviewed and deployed. Start with quiet mode on (D1 expires_at extended by Claude with owner approval) and the 21:15 health check.

## Investigation at main 72017db

- `backend/RosterEdgeMigration.gs:rosterEdgeExportManifestV2_` handles "Freeze parts": read and verify the work-file header, range-read each selected payload, check its SHA-256, create or recover its immutable Drive part, read it back, append the part metadata/file reference, then save a new immutable ordinal checkpoint. At the tail of preparation this is normally the records work file, but the recorded phase/ordinal alone does not identify its collection or part.
- The old batch target is 524,288 bytes and the loop time target is 60,000 ms. Both checks are conditional on bytes already processed, so the first part bypasses them. `shared/roster-import.js:prepareRecords` likewise lets one oversized row exceed the 196,608-byte target, up to the 1,900,000-byte part limit. A first oversized row therefore stays one expensive transfer.
- Exact incident bytes, record count and whether the part is the largest history item are **not in the repository evidence**. No live checkpoint, D1 row or school data was read. The new result/error metadata records bytes, record count, ordinal and part ID for the next occurrence.
- `roster-update/public/edge-roster.js:signedBridge` at the base allows **135,000 ms** for `edgeExportManifest`, 55,000 ms for ordinary bridge calls. A 69.972-second Apps Script execution does not by itself prove this timer expired. "Completed" can include a caught error returned in an `ok:false` envelope. The base assigns `ROSTER_BRIDGE_ERROR` to such an envelope when no specific code was supplied. The missing envelope/status prevents a firmer incident diagnosis.
- Google's immutable checkpoint is written before its response reaches D1. Google can therefore be one ordinal ahead after acknowledgement loss. The seven-minute preparation lease prevents competing writes, but the old Worker did not perform read-only reconciliation while it waited.
- `roster-update/public/edge-roster-import-runner.js:drainRosterImports` chooses `attention` for non-408/non-429 HTTP 4xx errors, independently of the generic bridge code. 5xx and transport errors wait and retry. The incident record lacks that status; the exact attention transition cannot be proven from its code alone.

## Implemented changes

- Split an oversized logical record into existing bounded segment payloads plus a new `record` assembly part. Each transfer is at most 262,157 UTF-8 bytes. Reassembly checks all segment receipts, byte lengths and SHA-256 before inserting the original row. Natural keys, row counts, scope digests and source values remain unchanged.
- Freeze at most one part per call. Preserve deterministic ordering, offsets, manifests and digests. Keep the verified work header in the private checkpoint to avoid three repeat Drive calls per part. Legacy checkpoints retain their prior header-read path.
- Superseding the single-part work uploads: prepare and compress each complete job once, retain its indexed compressed payloads in an immutable work file, and read only the selected ranges on later calls. Scope hashes are calculated from cached record payloads in a separate bounded step. Natural keys, source values and final digests remain unchanged.
- Add Admin-only, freeze-allowed `edgeExportCheckpoint`. It reads an existing ordinal and never captures or creates parts. Recovery verifies source binding, ordinal, predecessor reference and input digest before D1 accepts the checkpoint under the existing lease. Cancellation and restart checks still fence adoption.
- Distinguish `ROSTER_BRIDGE_TIMEOUT`, `ROSTER_BRIDGE_NETWORK`, `ROSTER_GOOGLE_TIMEOUT`, `ROSTER_GOOGLE_ERROR` and unreadable responses. Preserve failure phase, ordinal, bytes and record count. A Google timeout remains retryable even when the legacy error envelope uses status 400.
- After timeout, reconcile immediately and on subsequent wakes while retaining the original preparation lease. Do not repeat a live step. Non-import bridge error behavior remains unchanged.
- Generate setup labels from `gsisBuildLabel`; update freeze age locally each second; restore the saved preparation step on status/reload.
- At the authenticated response boundary, log exactly one safe preparation diagnostic containing validated code, zero-based ordinal, allowlisted phase, bytes, records and elapsed milliseconds. Do this for both thrown errors and terminal `preparationFailed` results. Do not log raw errors, stack traces, staff records, private file identifiers or request payloads. Return the same fields with a fixed safe message; the D1 runner preserves them and the validated code.

## Verification and remaining gates

- `TZ=Asia/Singapore npm run build`: passed; regenerated the canonical backends, Worker bundles and shared setup copies.
- New regressions passed for oversized UTF-8 records, deterministic manifests, exact row reassembly, duplicate-free retries, fetch/body/Google timeouts, late checkpoint adoption during the live lease, wrong-digest refusal, status reload, current labels and live freeze age.
- Existing resumable capture, lost-part/checkpoint acknowledgement, cancellation, activation recovery and server continuation checks were run. The PR conversation records the final full-suite result against the published head; focused checks alone are not that handoff.
- The preceding hosted run at `c71273a75e2191ac4443d9cfba390a5b1d4c8f3b` failed `roster099-preparation-worker.mjs`: its fake Google endpoint did not implement the newly required read-only `edgeExportCheckpoint`. The fixture now models that operation and distinguishes a missing checkpoint from a lost acknowledgement of a completed checkpoint. The corrected program passes.
- `tests/roster-import-safe-diagnostics.cjs` first failed because the old handled-error path logged its raw synthetic private message and stack. It now passes through the actual Apps Script response boundary and D1 import runner, verifies one bounded log line, rejects malformed metadata, checks terminal failure replies and retains the identical safe fields in D1. Existing authenticated failure-response tests also pass.
- The new freeze-step latency model passes under 25 seconds at 250 ms per Drive call plus 20 ms per KiB. This is a synthetic bound, **not live Google latency**.
- The revised 16.08M-character fixture completes in 108 calls and 4,784,661 simulated ms, versus v0.9.9i's 106 calls and 8,185,122 ms. It is 41.54% faster. Drive reads fall from 1,315 / 59,874,809 bytes to 634 / 59,012,201 bytes. Both normal and interrupted revised runs remain below 60 seconds per call, with a maximum of 59,888 ms. Full old/new and interrupted totals are in [the performance report](../review/roster-import-step141-performance.md).
- The retained 3–4 November source has two audit rows with the same record ID. Both unmodified implementations reject it with `EDGE_RECORD_ID`. No record was changed or deleted. A clearly marked offline storage-key projection gives approximately 3h 25m for the revised complete run versus 3h 32m for v0.9.9i. The larger retained-data simulation reaches 71.6 seconds in one call; the 60-second claim applies to the specified 16M fixture, not all live inputs.
- No deployment, live-data reads or writes, freeze, provider messages or authority change.

## Claim and review

The claim-only expected-head update to main was rejected by automatic approval review because it targeted the default branch. The task claim was instead published on the requested feature branch, without changing main. Branch parent claim commit: `912b609d91e57651cb0bcff7240b225bb2a32b8d`.

Reviewer: Claude, at the final PR head. No review or approval is claimed. Owner merges and decides any later deployment.

## Rollback

Before a new-format import starts, revert this PR's code and regenerate matched components. After a new `record` assembly part is prepared, keep a Worker that understands that part kind until the session is finished or explicitly restarted. Retain all source files, parts, checkpoints, receipts and archived evidence. Production authority remains Google.

## Handoff

Claude reviews the exact head named in PR #69's full-suite handoff. Main's `e2bfe2c` measurement instructions are retained below. Remaining cutover blockers include the duplicate audit storage keys, larger-input timing and Claude's review. The original incident envelope is still unavailable.

## Step 0 measurement (owner 4 Nov: "add"; Claude coordinator)
Read-only, before any incremental-import design. Purpose: decide whether "prepare early without freezing, then freeze and rebuild only changed parts" is worth building.
1. Compare per-part digests between retained preparation sessions 0cafa306… (3 Nov, checkpoint Drive 1gdjHr3nJs88485qjIRQHMIbB9C_RhE7u, reached ordinal 81) and ab0d91fc… (3-4 Nov, checkpoint Drive 18XZ2BGboW-PjVf8gwAKDxP__mNripWlT, ordinal 141). Also 388d395a… (2 Nov, finished, ordinal 186) if its parts are retained.
2. Report: parts compared, parts identical, parts changed, bytes changed, and which kinds/scopes/dates changed (expect today and the next few days only). Elapsed time between sessions.
3. Read only: no writes to D1, Drive or Google; no freeze; no restart of any session. If comparison needs a script, put it under scripts/ with a test, in the same PR or a separate draft PR.
Decision rule (owner to confirm): under about 30% of parts changed per day: design incremental preparation (prepare early, freeze, rebuild changed parts, full parity over all parts before activation). Otherwise: no incremental design; full import on a weekend window.

### Measured result, recorded after the first #69 suite handoff

The detailed record and offline comparison tool remain in [PR #70](https://github.com/helper-gsps/gsis/pull/70). Intervals below use source-file creation times. Changed bytes are complete payload lengths for changed matched parts, before and after; they are not a byte-level edit distance.

| Sessions | Interval | Compared | Identical | Changed | Changed bytes, before / after |
| --- | --- | ---: | ---: | ---: | ---: |
| `388d395a` to `0cafa306` | 26h 6m 46.673s | 78 | 74 | 4 | 108,093 / 311,048 |
| `0cafa306` to `ab0d91fc` | 17h 49m 9.934s | 78 | 70 | 8 | 313,066 / 455,672 |
| `388d395a` to `ab0d91fc` | 43h 55m 56.607s | 136 | 114 | 22 | 114,872 / 460,433 |

The primary comparison changes audit objects dated 2, 3, 4 and 6 November in logical scope `roster`, collection `allocationAuditExports`. Four new Stapler parts for 6 November add 113,822 bytes. Fourteen of the longest comparison's changed parts are assembly references whose segment IDs moved; their source content is unchanged. The completed session has 97 record parts totaling 18,642,731 bytes that neither later checkpoint reached. Whole-import churn therefore remains unknown. No D1, Drive or Google writes, freeze or session restart were used for the measurement.
