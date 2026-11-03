# roster-import-step141-bridge-timeout: attempt 3 (3-4 Nov) stopped at preparation step 141 of 143

- Status: claimed by Codex (lane R). Blocks the next cutover attempt.
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
