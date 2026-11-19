# Muse review — PR #217: restore Calendar year generation and Week 0

- Reviewer: Muse, replacing Claude until Claude returns, per the owner's 16 Nov directive (source 12b06eb).
- PR: #217, branch `codex/v1-calendar-year-structure`, OPEN, MERGEABLE, draft for review.
- Exact head reviewed: `18b214189a971ae4de540cf232b81b9b4c7417b2`.
- Base (branch-point/claim): `6835ed30677c7919fa63a58db8bb7dcd7d8c8daa` (merge-base of the head against origin/main at review time).
- Verdict: **APPROVED at the exact head.**

## What it fixes

B-CA01/H06: Calendar Year Setup previously generated week metadata starting on 1 January, filled deliberate gaps and saved no Calendar events. It now follows the native v0.9 boundaries: optional January Week 0, exactly ten complete Monday–Sunday weeks per term, four vacations and deliberately unfilled gaps. One guarded Calendar transaction materialises 44 ordinary Calendar event records and preserves independently created/imported content. Week 0 remains visible in Events, Weekly View and Excel; null Week 0 parity does not infer a school closure. Native progress reports the actual committed count. Google Calendar sync is separate and this operation queues no provider jobs.

## Scope verified

- Diff is exactly the five paths in the task record `docs/coordination/tasks/v1-calendar-year-structure.md`: the task record, `scripts/v1/build-web.mjs`, `tests/v1-product-calendar-year-structure-browser.mjs`, `tests/v1-product-calendar-year-structure.mjs`, `v1/services/calendar/service.mjs`. 455 insertions, 118 deletions.
- `git merge-tree --write-tree --name-only origin/main 18b2141` is clean (no conflicts).
- `git diff --check` clean. Secrets scan of the diff clean.
- No migration, deployment, live writes, provider activation, schema addition, historical-source edit or cross-database atomicity claim. No deployment. No live data change. PR #213 remains separate and is not included here.

## Design read

- `v1/services/calendar/service.mjs` (`structurePlan`, pure): Week 0 is generated only when 1 January precedes the first Monday of the year (1–3 January, Week 0 of Term 1); Monday 1 January 2024 correctly has no Week 0. Each term gets exactly ten complete Monday–Sunday weeks; a vacation that begins before its term's ten weeks fit is rejected (`INVALID_VACATIONS`). Four vacations are recorded as V records; gaps between terms and vacations are deliberately unfilled.
- Ownership and provenance (`structure`): a generation manifest (`yearStructureGenerator`, schemaVersion 1, up to 45 structure IDs, exactly 44 event entries) is verified against the original committed operation receipt before any regeneration. Imported or manually maintained term/vacation structure not owned by the generation is rejected intact (`GENERATION_CONTENT_CONFLICT`); generated-event markers not owned by the generation are rejected; independently edited owned event dates and deleted generated events block regeneration. Writes are upserts (`ON CONFLICT DO UPDATE`), preserving owned IDs, custom labels and unrelated fields. Regeneration preserves owned IDs, custom labels and unrelated fields; independently edited owned dates or imported/unowned term and vacation markers are rejected intact.
- Capacity: preflight and commit-time net-count guards against the existing 5,000-event / 2,000-metadata reader limits, including global metadata; the owner transaction checks the exact observed-vs-expected metadata and event sets, marker ownership and dispatch locks. The generation evidence JSON is bounded (1.5 MB).
- `dates()`: parity is null when Week is 0, so null Week 0 parity does not infer a school closure. `finish()` gains an `includeReceipt` flag so the generation receipt (with the manifest) is returned; replay of a committed operation returns the same receipt.
- `scripts/v1/build-web.mjs` (Calendar copied-source adaptations only): Week 0 numeric metadata survives (`week.Week ?? ''` instead of `|| ''`), Week 0 fallback labels, opening partial weekly row clamped to 1 January, progress/receipt text reporting the actual retained count, and session-epoch clearing. All adaptations use `replaceOnce` with error-on-missing-source guards.

## CI verified at the exact head

- Node/LORD run 44414375426: head_sha verified `18b2141`, completed success, all five jobs green.
- Product run 44414383064: head_sha verified `18b2141`, completed success.
- Initial-head runs 44413645494 and 44413714545 were superseded/cancelled and cover only `f24cab5`; no results are transferred from them.

## Local checks run (TZ=Asia/Singapore, Playwright chromium-1234)

Worktree at the exact head; `npm ci` at root and inside `v1/` first.

- `node tests/v1-product-calendar-year-structure.mjs` — PASS (actual D1/restart: native boundaries, stable receipt replay, changed-intent denial, invalid inputs, rollback, concurrent metadata rejection, source pins, dispatch locks, manual/imported ownership rejection, preservation of labels and independently edited dates, authority and preview denial; capacity negatives for both oversized cases and concurrent unrelated insertion).
- `node tests/v1-product-calendar-year-structure-browser.mjs` — PASS (native form → nine Workers → D1: deliberately lost committed response retries the same operation, one durable receipt; correct Events/Weekly/Excel Week 0, forty weeks and gaps after reload).
- `node tests/v1-product-calendar.mjs` — PASS (unchanged).
- `node tests/v1-product-calendar-pins.mjs` — PASS (unchanged).
- `node tests/v1-product-calendar-publication.mjs` — PASS (unchanged).
- `node tests/v1-product-calendar-provider.mjs` — PASS (unchanged).
- `node tests/v1-product-roster-service.mjs` — PASS (unchanged).
- `node tests/v1-product-roster-admin-settings.mjs` — PASS (unchanged).
- `npm run build` — PASS, no tracked drift.
- `node scripts/v1/build.mjs` — PASS.
- `node scripts/v1/verify-build.mjs` — PASS.

## Findings

None. No findings.

## Notes

- N1 (negative control, builder-stated): pre-fix native comparison — synthetic 2027 v0.9 produces 45 structure records / 44 events, 1–3 January Week 0 and the 22–26 November gap; prior v1 produced 46 records / zero events, incorrectly advanced weeks and filled that gap. The passing state is re-verified locally above. Final capacity scrutiny proved the first head could exceed the reader limits; the corrected head adds the preflight and commit-time net-count guards, and the capacity negatives pass locally.
- N2 (limits, as stated): existing years without verified generation ownership need a separately reviewed adoption/reconciliation path; this PR does not silently adopt or delete their data. Reverting code does not remove committed Calendar records; any data correction needs a separate reviewed recovery action. Hosted UAT remains Not tested. F5 remains OPEN. No merge or deployment by this review.

## Quality gates

- Q01: Pass. Owner-authorised v1 changelog work (B03/B-CA01/H06); exact scope in the task record.
- Q02: Pass. Existing Calendar operation/receipt mechanism reused; no new data source or access path.
- Q03: Pass. Authority, source pins, dispatch locks and preview denial exercised.
- Q04: Pass. Stable receipt replay, rollback, concurrent-metadata rejection and capacity guards exercised.
- Q05: Pass. Bounded Calendar Worker + copied-source adaptations only; no new workflow.
- Q06: Pass. Local verification above; exact-head Node/LORD CI green and product CI green.
- Q07: Pass. This exact-head review.
- Q08: No deployment authorised by this task and none performed.

## Release notes

No release label change. No deployment. Rollback is a reviewed code revert; committed Calendar records are not removed by reverting code.
