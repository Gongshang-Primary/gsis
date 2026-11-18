# Muse review — PR #218: add the physical Venues register and guarded Excel import

- Reviewer: Muse, replacing Claude until Claude returns, per the owner's 16 Nov directive (source 12b06eb).
- PR: #218, branch `codex/v1-venues-physical-register`, OPEN, MERGEABLE.
- Exact head reviewed: `54562e06ad8bf354d9ed113482ad68c78cee8d6f`.
- Base (merge-base of the head against origin/main at review time): `360853c32ce5f0a07b5e385fea3647fea5c63b6e` (the accepted claim; the PR body's "Base: bd77b27d" is the deployed v1.06 label, not the branch point).
- Verdict: **APPROVED at the exact head.**

## What it fixes

Venues had no usable initial physical-room register, and its bulk import rejected unknown capacity or reset omitted room policy. This adds Admin Add/Edit and canonical Excel preview/confirm using the existing owner operations, with explicit identities and revision guards. Unknown capacity stays null; existing aliases, policy, bookings and occupancy are preserved.

## Scope verified

- Diff is exactly the eight paths in the task record `docs/coordination/tasks/v1-venues-physical-register.md`: the task record, `docs/v1/venues/PHYSICAL_REGISTER_HANDOFF.md`, `scripts/v1/build-web.mjs`, `tests/v1-product-venues-register-ui.mjs`, `tests/v1-product-venues-register.mjs`, `v1/services/venues/register.mjs`, `v1/services/venues/service.mjs`, `v1/web/shared/venues-register.js`. 554 insertions, 48 deletions (against the merge-base).
- The final commit changes only task/handoff evidence: the diff between the source/test head `ea270d2` and this head touches only the two documents.
- `git merge-tree --write-tree --name-only origin/main 54562e0` is clean (no conflicts). #216 overlaps only the builder file, with a separately assigned Deploy index injection that merges cleanly.
- `git diff --check` clean. Secrets scan of the diff clean.
- Only the Venues builder hunk changes. No original v0.9 source, shared client, permission, schema, migration, configuration, dependency or provider change. No deployment. No live data change.

## Design read

- `v1/services/venues/register.mjs` (new): `REGISTER_COLUMNS` — 18 columns (id, unit, name, shortName, capacity, capacityBasis, notes, revision, bookable, special, approvalMode, open, close, bufferMinutes, overlapGroup, features, aliases). `workbookRows` validates the workbook (schemaVersion 1, module `venues-register`, mode `editable`, school match, exactly the Rooms sheet, exact columns in order, at most 1000 rows) and splits features/aliases on newlines. `prepareRegisterImport` accepts one input only (workbook XOR venues); 1–1000 rows; only `REGISTER_COLUMNS` keys allowed (`FIELD_DENIED` 403 otherwise); distinct permanent IDs matching the ID pattern; revision must equal the current revision (`REVISION_CONFLICT` 409); merges defaults + old row + new row, so omission preserves existing fields and neither omission nor an absent row deletes data; unit is immutable for existing rooms (`IDENTITY_IMMUTABLE` 409); capacity may be null (unknown capacity stays null — the old code required a safe integer and rejected it with 400 `INVALID_VENUE`) or a whole number 0–100000; bookable/special must be booleans; approvalMode immediate/approval; open/close ordered HH:MM; buffer 0–120; features at most 30, aliases at most 100, no duplicates within a list; combined register at most 1000 rooms; unit uniqueness across the whole register (`DUPLICATE_UNIT` 409); alias uniqueness case-insensitive across the register (`AMBIGUOUS_ALIAS` 409). `registerProjection` returns a bounded editable projection only — owner IDs, grants and other server-owned fields stay server-owned and are never sent back for acceptance.
- `v1/services/venues/service.mjs`: `importVenues` now uses `prepareRegisterImport` and saves each room at revision + 1. A new transaction guard binds the validated snapshot to the same transaction for `importVenues` (and for `saveVenue` alias changes): the register's row count and revision sum must still match, so concurrent unit/alias changes cannot slip under the validation. New `registerPreview` operation (admin only): runs `prepareRegisterImport` with no writes and returns the projection plus created/updated counts. Admin read now includes the `register` projection.
- `v1/web/shared/venues-register.js` + the one build-web hunk wire Admin Add/Edit and canonical Excel preview/confirm into the Venues page.

## CI verified at the exact head

- Node/LORD run 44411351560: head_sha verified `54562e0`, completed success, all four shards and full-suite green.
- Isolated product run 44411370257: head_sha verified `54562e0`, completed **failure**, 134/135 programs. The sole failure was the unchanged `tests/v1-product-stapler-resize.mjs`, killed at the existing 45-second limit while its initial `page.evaluate` awaited `RosterStaplerUI.render`; no failed assertion identified a Venue change. Both new register programs and every Venues regression passed.
- PR-triggered product run 44413800684: head_sha verified `54562e0`, completed success at the same head.

## Local checks run (TZ=Asia/Singapore, Playwright chromium-1234)

Worktree at the exact head; `npm ci` at root and inside `v1/` first.

- `node tests/v1-product-venues-register.mjs` — PASS (preview has no writes; unknown capacity; sparse field preservation; invalid batches; school/capability/preview denials; stale/changed intent; duplicate units and ambiguous aliases under concurrency; pending source fence; actual Worker restart and one durable receipt).
- `node tests/v1-product-venues-register-ui.mjs` — PASS (Add/Edit, preview invalidation, XLSX export/import, no preconfirmation writes, lost-response/reload recovery, stale workbook, reader/preview denial, account clearing, narrow viewport).
- `node tests/v1-product-venues.mjs` — PASS (unchanged).
- `node tests/v1-product-roster-venues.mjs` — PASS (unchanged).
- `node tests/v1-product-deploy-venues.mjs` — PASS (unchanged).
- `node tests/v1-product-stapler-resize.mjs` — PASS (unchanged; the program that failed in the isolated product run passes locally at this exact head, confirming the CI failure was a timing flake, not an assertion failure).
- `npm run build` — PASS, no tracked drift.
- `node scripts/v1/build.mjs` — PASS.
- `node scripts/v1/verify-build.mjs` — PASS.

## Findings

None. No findings.

## Notes

- N1 (negative control, builder-stated): the baseline reproduced a missing admin register projection and HTTP 400 `INVALID_VENUE` for `capacity:null`, with no stored room. The passing state is re-verified locally above.
- N2 (fixture history, disclosed in the handoff): earlier failures are retained there — null projection normalization, a D1 test comparison/restart fixture, the native-read operation checker mismatch, and a transient reader-heading assertion. The final UI uses the existing native read wrapper; no operation allowlist or required assertion was weakened.
- N3 (limits, as stated): B-V01 as a whole is not closed — contextual Deploy/Roster empty-directory hints, booking slots, uncovered dates, timetable adoption/retained clashes and timed Layout display remain separately scoped. Physical register creation does not fabricate source readiness. Hosted/runtime UAT and official T1B-01/T1B-02 remain Not tested; F5 remains OPEN. No merge or deployment by this review.

## Quality gates

- Q01: Pass. Owner-authorised v1 changelog work; exact scope in the task record.
- Q02: Pass. Existing owner operations and Venues service reused; no new data source or access path.
- Q03: Pass. Admin-only preview/import, school match, capability and revision guards exercised.
- Q04: Pass. Preview-without-writes, stale/changed-intent, concurrency, restart and one-durable-receipt behaviour exercised.
- Q05: Pass. Bounded Venues service/UI only; no new workflow.
- Q06: Pass. Local verification above; exact-head Node/LORD CI green and product CI green on the PR-triggered run (the isolated product run's single failure is an unchanged-program timing flake, re-verified passing locally).
- Q07: Pass. This exact-head review.
- Q08: No deployment authorised by this task and none performed.

## Release notes

No release label change. No deployment. Rollback is a reviewed source revert preserving created stable room IDs, bookings, audit and receipt history; no data deletion or migration rollback is authorised.
