# roster-d1-import-progress-total: truthful preparation totals

- Status: locally implemented and focused-verified; fresh review and remote full CI pending
- Owner/model: Codex
- Reviewer/model: fresh whole-branch review, then Claude exact published head
- Last updated (Asia/Singapore): 1 November 2026 12:00, compatibility correction after parent review
- Branch: codex/import-progress-total
- Base SHA: 55265848fef13255bcb6920f246306c191fb4907, exact local tree mirror of GitHub main 84a71b50a7aa60f0f5d546cba651c4a3cc44ed3e
- PR: none
- User-authorised scope: task 5, import preparation total must describe real remaining work. Latest owner assignment allocates open work to Codex and allows multiple held PRs, overriding older serial claim defaults for this isolated preparation.
- Files/domains owned: backend/RosterEdgeMigration.gs response metadata, shared/roster-import.js public progress metadata, shared/edge-setup.js display, relevant tests and canonical generated copies.
- Out of scope: import behavior, source/checkpoint bytes, identities, digests, transfer chunks, limits, timing budgets, requests, live data, flags, deployment, merging or publishing.
- Acceptance checks: stable exact work-item total from the captured catalogue; completed count advances only after a whole item's parts are saved; poll/checkpoint ordinal remains independent; UI and D1 preserve the explicit unit and saved-part count; packed capture retains zero initial decompressions.

## Decisions and changes

The old reply adds completed poll calls to a guess about future calls. Batch uploads stop on bytes or elapsed time and unseen objects have unknown part counts. An exact call total would require work the exporter deliberately postpones.

Add counters for actual work items: the frozen source, each captured object including all its parts, the complete record set, and the verified manifest. The catalogue fixes `workTotal` at object count plus three after capture; `workDone` advances after each item finishes. Existing `step`, `done`, `total` and checkpoint ordinals retain their original formula and resumable call sequence for compatibility. New setup uses only `workDone` and `workTotal` when `progressUnit: work-items` is present; `preparedParts` reports saved parts separately. Older replies without the explicit unit display their step without claiming an exact final total.

## Verification

All commands below used `TZ=Asia/Singapore`. The initial `npm run build` passed before any tests; the final build passed and rebuilt all 18 components. The generated `backend/Code.gs`, both root backends, both bundled Workers and both setup/store copies are committed with the canonical change.

Red/green: the original exporter table and packed fixture failed because the explicit unit was missing; D1 progress failed because it dropped that unit; UI failed because it rendered the estimated total as exact. Parent review found that reusing legacy `done/total` could make old UI or old Worker versions reject a reply once ordinal exceeded work total. A captured old reader reproduced that rejection before repair. The final implementation adds separate `workDone/workTotal` and restores the original legacy formula. The UI regression executes the real exporter reply in the setup flow with the exact captured old progress reader, and separately through the old Worker's public-field projection into new UI; both continue and confirm import. The old reader fixture was compared verbatim to the base source.

The UI also checks an ordinal greater than work total, its advancing elapsed clock without extra requests, the old-response fallback, and invalid unit/count refusal. D1 verifies separate work counters, saved parts and unit retention, metadata validation, replay and existing lease/restart boundaries.

Eighteen focused programs passed, each invoked as `node tests/<file>`:

- `roster099-import-progress.cjs`, `roster099-packed-capture.cjs`, `roster099-packed-audit.mjs`, `roster099-resumable-budget.cjs`.
- `roster099-resumable-freeze.cjs`, `roster099-export-resumable.cjs`, `roster099-chunked-import.cjs`, `roster099-import-staging.cjs`, `roster099-import-objects.cjs`.
- `roster099-preparation-control.cjs`, `roster099-preparation-worker.mjs`, `roster099-import-worker.mjs`.
- `roster099-import-failure-response.cjs`, `roster099-import-failure-reason.cjs`, `roster099-import-failure-ui.cjs`, `edge094-setup.cjs`, `apps-script-syntax.cjs`, `release099-metadata.cjs`.

Production-shaped packed capture retained 1,459,908 source bytes from 1,459,453 packed bytes, zero capture decompressions, 26,680 ms simulated capture and 90,219 ms maximum simulated call. Its 57 captured plan references produce a stable 60-item total across 118 calls including capture, with completion only at the manifest. The 16.08M operations fixture passed 105 steps, 149 parts and 179 simulated interruptions, at 96,998 ms maximum uninterrupted and 112,124 ms resumed call cost. These costs are simulated, not live measurements.

A temporary comparison ran the production-shaped fixture against the base exporter and changed exporter, with both fixture caches warm and VM objects normalized for comparison. All 294 files, including source, work, part and checkpoint bytes, the final manifest digest, checkpoint ordinal/reference, call sequence, decompression counts and simulated budgets matched exactly. An initial comparison harness exposed fixture-cache clock and cross-VM prototype differences; the corrected comparison checks raw file hashes and serialized metadata. No product repair was needed.

`scripts/verify-099-suite.py`'s `verify_runtime` ran against `installation_files` packed in memory and passed canonical parity for all 18 components, including frontend inventories and freshly bundled Workers. `git diff --check` passed.

`npm run test:lord` failed at `lord-suite/tests/gsis098h-background-ui.cjs` because Chromium is not installed. The preceding fourteen programs passed; the runner stopped there. No browser test is counted as passing. Full `npm test` was not repeated locally under the parent task's instruction: browser installation and historical Git object `2efd6e003fa9ee3846cf590d07902a22309861ff` are unavailable. The parent task owns exact-head GitHub full Node and LORD CI before opening a PR. Existing npm proxy and Node module-type warnings remain unchanged.

## Review and rollback

Fresh whole-branch review remains pending with the parent task; Claude reviews the exact published head. Older UI accepts new backend replies because the legacy counters are unchanged. An older Worker may drop all new work metadata; new UI then shows the legacy step without its estimated final total and continues the same import. Updated components show accurate work-item counts when the metadata reaches setup. Rollback restores previous code; retained source/checkpoint bytes and import identities remain compatible because reporting changes no import files.

## Deployment and handoff

Not deployed or published. No settings, authority, messages or live school records changed. Product merges remain held until Monday 2 November 2026 08:00 SGT. The Sunday cutover uses current main. Parent task publishes in priority order after fresh whole-branch review and full remote CI.


## Held-stack integration

Rebased onto peer-mail health local debf45f / remote521dedec (after inactive1B and weeklyR3B), retaining F and every prior held product change. Generated conflicts were resolved by rebuilding canonical sources. Legacy step/done/total semantics remain exact; additive workDone/workTotal supply the truthful new UI. Actual setup flows prove both old UI with new backend and new UI with an old Worker projection continue to import. Claude reviews the final published head and owner merges only after the hold.


## Refresh claim, 6 November 2026

Model: Codex. Refresh only truthful import progress onto main 69efd3ab9f0dbbb31f1a3bc7da9c86b3dc2ea348. Exclude the old held stack's inactive-teacher, weekly-R and peer-mail changes. Preserve current checkpoint input digests, reduced-step diagnostics, resumable budgets and request fences. Add response-only work counters and current UI compatibility tests. No retained import bytes or behavior changes. Full CI and Claude exact-head review required; owner merges.

Current refresh validation: fixed totals and current record-scopes stage, legacy/new UI combinations, malformed metadata refusal, D1 projection, production-shaped packed fixture and preparation Worker pass. Current budget fixture stays below 60 seconds per simulated call. Byte comparison against current main covers source/work/parts/checkpoints, manifest and call sequence. Historical measurements above are retained only as old evidence.
