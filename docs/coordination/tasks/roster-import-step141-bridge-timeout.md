# roster-import-step141-bridge-timeout: attempt 3 (3-4 Nov) stopped at preparation step 141 of 143

- Status: implementing; local regression checks passing, full-suite verification in progress. Blocks the next cutover attempt.
- Owner/model: Codex
- Reviewer/model: Claude
- Last updated (Asia/Singapore): 4 Nov 2026
- Branch: `codex/roster-import-step-budget`
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
1. Bound every preparation step under 25 s: split large parts (by bytes or record count) so no single step exceeds the budget; record the split in the manifest and keep digests stable.
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
- Add Admin-only, freeze-allowed `edgeExportCheckpoint`. It reads an existing ordinal and never captures or creates parts. Recovery verifies source binding, ordinal, predecessor reference and input digest before D1 accepts the checkpoint under the existing lease. Cancellation and restart checks still fence adoption.
- Distinguish `ROSTER_BRIDGE_TIMEOUT`, `ROSTER_BRIDGE_NETWORK`, `ROSTER_GOOGLE_TIMEOUT`, `ROSTER_GOOGLE_ERROR` and unreadable responses. Preserve failure phase, ordinal, bytes and record count. A Google timeout remains retryable even when the legacy error envelope uses status 400.
- After timeout, reconcile immediately and on subsequent wakes while retaining the original preparation lease. Do not repeat a live step. Non-import bridge error behavior remains unchanged.
- Generate setup labels from `gsisBuildLabel`; update freeze age locally each second; restore the saved preparation step on status/reload.

## Verification and remaining gates

- `TZ=Asia/Singapore npm run build`: passed; regenerated the canonical backends, Worker bundles and shared setup copies.
- New regressions passed for oversized UTF-8 records, deterministic manifests, exact row reassembly, duplicate-free retries, fetch/body/Google timeouts, late checkpoint adoption during the live lease, wrong-digest refusal, status reload, current labels and live freeze age.
- Existing resumable capture, lost-part/checkpoint acknowledgement, cancellation, activation recovery and server continuation checks were run. Final full-suite results will be recorded before handoff.
- The new freeze-step latency model passes under 25 seconds at 250 ms per Drive call plus 20 ms per KiB. This is a synthetic bound, **not live Google latency**.
- The existing pessimistic 16.08M-character fixture still takes up to 97,021 ms per call and 112,147 ms with interruptions under its five-second-per-Drive-call model. It completes 179 preparation steps and 149 parts without duplicate files. **The requested under-25-second bound for every preparation phase is not established.** Snapshot capture, whole-source record preparation, large object preparation and an arbitrarily slow external Drive call remain outside that guarantee. Do not treat this draft as clearance for the next cutover.
- No deployment, live-data reads or writes, freeze, provider messages or authority change.

## Claim and review

The claim-only expected-head update to main was rejected by automatic approval review because it targeted the default branch. The task claim was instead published on the requested feature branch, without changing main. Branch parent claim commit: `912b609d91e57651cb0bcff7240b225bb2a32b8d`.

Reviewer: Claude, at the final PR head. No review or approval is claimed. Owner merges and decides any later deployment.

## Rollback

Before a new-format import starts, revert this PR's code and regenerate matched components. After a new `record` assembly part is prepared, keep a Worker that understands that part kind until the session is finished or explicitly restarted. Retain all source files, parts, checkpoints, receipts and archived evidence. Production authority remains Google.

## Handoff

Complete full-suite verification and attach the exact head. Remaining cutover blockers are the all-phase timing requirement, exact incident metadata/envelope evidence and Claude's review.
