# Muse review — PR #215: keep saved SMC duty lists visible

- Reviewer: Muse, replacing Claude until Claude returns, per the owner's 16 Nov directive (source 12b06eb).
- PR: #215, branch `codex/v1-roster-duty-save-view`, OPEN, MERGEABLE.
- Exact head reviewed: `cacc043bd641a840ffc11c50f5cccba2b8232961`.
- Base: `bd77b27deab417afce859cd80465d7c608ae0ab2` (merge-base of the head against origin/main at review time; the #211 review record).
- Verdict: **APPROVED at the exact head.**

## What it fixes

Saving an SMC duty list committed its records but immediately removed the list from the page, because the owner returned only saved IDs. Roster now returns the complete accepted duty view in the same immutable operation receipt. The native editor stays usable after create, edit, delete and exact retry.

## Scope verified

- Diff is exactly the three paths in the task record `docs/coordination/tasks/v1-roster-duty-save-view.md`: the task record, `tests/v1-product-roster-duty-save-browser.mjs`, `v1/services/roster/service.mjs`. 234 insertions, 0 deletions.
- `git merge-tree --write-tree --name-only origin/main cacc043` is clean (no conflicts).
- `git diff --check` clean. Secrets scan of the diff clean.
- Changed deploy component: Roster Worker only. No migration, build/frontend patch, v0.9 change or provider change. No deployment. No live data change.

## Design read

- `v1/services/roster/service.mjs` (`operations`): a new `setDutySMC` branch, placed alongside the existing `saveTypes` and stapler-writes branches, reads the accepted duty view from the committed snapshot — `Operations.read(structuredClone(next), c, { operation: "dutyRoster", date: range.from })` — and merges it into the receipt as `{ ...view, ...result }`, so existing receipt fields win on any key conflict and the exact snapshot is frozen in the receipt rather than reread after commit. A replay therefore returns the same view, not a newer plan. `range` is in scope at that point in `operations` (defined at the top of the function). No notification outbox entry is created by this path. The v0.9 appearance and policy are preserved.

## CI verified at the exact head

- Node/LORD run 44408734642: head_sha verified `cacc043`, completed success, all four shards and the required full-suite check green.
- Manual product run 44408754047: head_sha verified `cacc043`, completed success, 134/134 programs.
- PR-triggered product run 44411138382: head_sha verified `cacc043`, completed success, 134/134 programs.

## Local checks run (TZ=Asia/Singapore, Playwright chromium-1234)

Worktree at the exact head; `npm ci` at root and inside `v1/` first.

- `node tests/v1-product-roster-duty-save-browser.mjs` — PASS (5/5 groups: create/edit/delete/reload, retained history, immutable original receipt replay after later edits, stale revisions, changed operation intent, non-SMC denial, native retry after a response is lost after commit).
- `node tests/v1-product-roster-service.mjs` — PASS (15 groups, unchanged).
- `npm run build` — PASS, no tracked drift.
- `node scripts/v1/build.mjs` — PASS.
- `node scripts/v1/verify-build.mjs` — PASS.

## Findings

None. No findings.

## Notes

- N1 (negative control, builder-stated): the baseline reproduced with the actual built browser, gateway, Core/Contacts/Roster Workers and persistent local D1 — the list and current-day membership committed while its immediate displayed row count was zero. The passing state is re-verified locally above.
- N2 (fixture history, disclosed in the PR body): an initial authorization fixture lacked accepted Contacts identity and correctly failed closed with 503; the synthetic fixture was corrected to an accepted ordinary account and then proved 403 without writes. Both failures are recorded in the task record.
- N3 (limits, as stated): pre-fix sparse immutable receipts are not rewritten. The new test covers browser reload and lost-response recovery, not process restart or future/multi-day duty membership policy. Hosted/runtime UAT and official T1B-01/T1B-02 remain Not tested; F5 remains OPEN. No merge or deployment by this review.

## Quality gates

- Q01: Pass. Bounded display correction; exact scope in the task record.
- Q02: Pass. Existing Roster operation/receipt mechanism reused; no new data source or access path.
- Q03: Pass. Non-SMC denial exercised; no authority-policy change.
- Q04: Pass. Immutable receipt replay, stale revisions and lost-response retry exercised.
- Q05: Pass. Bounded Roster Worker only; no new workflow.
- Q06: Pass. Local verification above; exact-head Node/LORD CI green and product CI green (two runs).
- Q07: Pass. This exact-head review.
- Q08: No deployment authorised by this task and none performed.

## Release notes

No release label change. No deployment. Rollback reverts the Roster response enrichment while preserving saved records and receipts.
