# Muse review — PR #222: open Venues notification targets in the correct module

- Reviewer: Muse, replacing Claude until Claude returns, per the owner's 16 Nov directive (source 12b06eb).
- PR: #222, branch `codex/v1-venues-deep-links`, OPEN, MERGEABLE.
- Exact head reviewed: `8fd61b04a9d53d2149c973790ec2b7949f40e761`.
- Base (merge-base of the head against origin/main at review time): `184b8d0a52fe215c7d122a247e89e9b0289a44a8`.
- Verdict: **APPROVED at the exact head.**

## What it fixes

Venue notifications already generate `/venues/b/<bookingId>` and `/venues/r/<transferId>`. The frontend still parsed root paths, so following either link opened Book without requesting its target. One guarded builder adaptation now gives the copied v1 frontend the existing module prefix; the native owner/manager dialogs and server authorization stay in charge.

## Scope verified

- Diff is exactly the three paths in the task record `docs/coordination/tasks/v1-venues-deep-links.md`: the task record, `scripts/v1/build-web.mjs`, `tests/v1-product-venues-deep-links.mjs`. 178 insertions, 0 deletions.
- `git merge-tree --write-tree --name-only origin/main 8fd61b0` is clean (no conflicts). Merge-tree is also clean with the physical-register head `54562e0`.
- `git diff --check` clean. Secrets scan of the diff clean.
- No backend, legacy frontend, gateway, permissions, provider, database, configuration or dependency change. No deployment. No live data change.

## Design read

- `scripts/v1/build-web.mjs` (one `replaceOnce` in the Venues transform): the copied frontend's deep-link parser regex changes from `/^\/(b|r)\/([A-Za-z0-9_-]+)$/` to `/^\/venues\/(b|r)\/([A-Za-z0-9_-]+)$/`, matching the generated notification links. The ID pattern `[A-Za-z0-9_-]+` is unchanged — anchored, single-segment, no path traversal. The native owner/manager dialogs and server authorization are untouched; a link only opens the dialog, and the server still decides what the reader may see.

## CI verified at the exact head

- Node/LORD run 44412987710: head_sha verified `8fd61b0`, completed success, all four shards and full-suite green.
- Isolated product run 44412985384: head_sha verified `8fd61b0`, completed success.
- PR-triggered product run 44415498614: head_sha verified `8fd61b0`, completed success.

## Local checks run (TZ=Asia/Singapore, Playwright chromium-1234)

Worktree at the exact head; `npm ci` at root and inside `v1/` first.

- `node tests/v1-product-venues-deep-links.mjs` — PASS (three groups: formatter-generated links open ordinary-owner and manager dialogs; reload/query suffix work; outsider, missing and foreign records fail without data/control leakage; malformed paths do not fetch a target; legacy root paths remain the launcher).
- `node tests/v1-product-venues.mjs` — PASS (unchanged).
- `node tests/v1-product-venues-navigation.mjs` — PASS (unchanged).
- `node tests/v1-product-venues-notifications.mjs` — PASS (unchanged).
- `node tests/v1-product-venues-receipts.mjs` — PASS (unchanged).
- `npm run build` — PASS, no tracked drift.
- `node scripts/v1/build.mjs` — PASS.
- `node scripts/v1/verify-build.mjs` — PASS.

## Findings

None. No findings.

## Notes

- N1 (negative control, builder-stated): the pre-change actual local nine-Worker/D1 browser proof showed both generated links opening Book, no dialog and no targeted read; direct owner reads returned 200/exact record and outsiders returned 403. The passing state is re-verified locally above.
- N2 (relocation, builder-stated): the focused browser pass was on `d87e826`; the final head only relocates the independent builder replacement to avoid a textual conflict with the physical-register branch. Complete before/after web outputs are byte-identical (Venues app SHA-256 `74884f3c…`), and the test is unchanged. I re-ran the test, the build and verify-build on the final head locally, so the relocation is covered here.
- N3 (limits, as stated): no browser commands, changed Venue records, new operation receipts or external requests. Source unavailability remains explicit. Product providers stay disabled; formatter capture uses a separately injected local transport with synthetic authority/contact responses. This does not prove notification admission or provider delivery. Larger booking-slot/adoption work is separate. Hosted UAT remains Not tested. F5 remains OPEN. No merge or deployment by this review.

## Quality gates

- Q01: Pass. Coordinator-authorised bounded Venues repair; exact scope in the task record.
- Q02: Pass. Existing notification links and server authorization reused; no new data source or access path.
- Q03: Pass. Outsider/missing/foreign records fail without leakage; server authorization untouched.
- Q04: Pass. Malformed paths do not fetch a target; legacy root paths remain the launcher; no new operation receipts.
- Q05: Pass. Bounded build-web adaptation only; no new workflow.
- Q06: Pass. Local verification above; exact-head Node/LORD CI green and product CI green (two runs).
- Q07: Pass. This exact-head review.
- Q08: No deployment authorised by this task and none performed.

## Release notes

No release label change. No deployment. Rollback is a reviewed builder-line revert; no stored data changes.
