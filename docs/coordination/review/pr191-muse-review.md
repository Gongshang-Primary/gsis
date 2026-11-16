# Review: PR #191 — Label the next release v1.01 across all viewports

- Reviewer: Muse (owner, 16 Nov: Muse replaces Claude for v1 exact-head review until Claude returns; source `claude/zealous-archimedes-4i2lv1` at `12b06eb`).
- Verdict: **APPROVED at the exact head**.
- Exact head: `8627746695a9a3fc60c74cc566cbf2df52fa5532`.
- Base / accepted claim: `67dff5202e3321237b8c5b17deed6f36888a3a6b`.
- CI run: [43810465334](https://github.com/helper-gsps/gsis/actions/runs/43810465334), green, all 5 jobs (4 regression shards + full-suite), at the exact head. Product/package CI [43811117828](https://github.com/helper-gsps/gsis/actions/runs/43811117828) green at the exact head (114/114 product programs; artifact `gsis-v1-8627746695a9a3fc60c74cc566cbf2df52fa5532`, ID 14201296289, SHA-256 `0e5d085d96f818a75a17ca36539574e18853d22e54143f6c76e541eafde5db3b`).
- PR: https://github.com/helper-gsps/gsis/pull/191 (Codex, branch `codex/v1-release-label`).
- Task record: `docs/coordination/tasks/v1-release-label.md` (in the PR; reviewer line already names Muse).

## What it does

One v1-owned release constant, `RELEASE_LABEL = "v1.01"` (`v1/release.mjs`), supplies the release label to home, the Global Admin Toolbox and all nine application viewports. The existing DOM-location release normalizer replaces the source build label in current chrome text only, fills explicit empty `data-gsis-release` markers, adds small visible header labels for LORD, OVERLORD and STARLORD, and appends the label to initial document titles; view-specific runtime titles (for example Venues) remain intact. The product manifest records the label beside its exact source SHA, and all nine Worker configurations carry the same display label and existing SHA. API, Calendar transport, schemas, cache query strings, historical content and v0.9 source remain unchanged. No behaviour, authentication, provider configuration or hosted data change. Deployment remains held for the separately authorised Memberships editing/publish-back prerequisite, review, final CI and fresh backups; this PR does not activate deployment.

## Checks run (local worktree at the exact head, TZ=Asia/Singapore, Playwright chromium-1234)

- `npm ci` (repo root and `v1/`): exit 0.
- New test `tests/v1-product-release-label.mjs`: exit 0. "PASS v1.01: built home, Toolbox and nine application labels/titles; desktop/narrow browser; exact build SHA and all Worker labels; real local Workers/D1".
- Updated test `tests/v1-product-v09-frontend-parity.mjs`: exit 0. "PASS all nine built v1 release labels, future-letter source labels, unchanged asset query versions/scripts/history and legacy sources".
- `npm run build`: exit 0, no generated drift (`git status` clean after build).
- `node scripts/v1/build.mjs`: exit 0.
- `node scripts/v1/verify-build.mjs`: exit 0. "PASS real Wrangler LOCAL upgrade from deployed 0001: additive migrations applied once, all five upgrade tables present; no cloud credentials or operations".
- Merge-tree against current main: clean, no conflicts.
- Scope: the diff against the base is exactly the 8 claimed paths. `git diff --check` clean.
- Secrets scan of the diff: none.
- Read the full diff of all six code paths: `v1/release.mjs`, `scripts/v1/build-web.mjs` (normalizer extension and overlay processing), `scripts/v1/build.mjs` (manifest and Worker vars), `v1/web/overlays/index.html` and `v1/web/overlays/admin/index.html` (empty marker elements only), and the parity test updates. The normalizer still patches only original text bytes in chrome locations and throws when a release marker is non-empty or a required LORD-family header anchor is missing; it never touches inline scripts, URLs, attributes, comments or historical text.
- Note on the duplicate product run: a second product CI run ([43811771561](https://github.com/helper-gsps/gsis/actions/runs/43811771561)) at the same unchanged head finished its first attempt 113/114 on the already-documented Roster quiet-mode timing race (minor F1 in `docs/coordination/review/pr185-muse-review.md`, `tests/v1-product-roster-native-quiet.mjs` line 24) and passed 114/114 on attempt 2. The failure remains recorded in the PR body; the race is fixed separately by PR #193 and is not a product regression of this change.

## Findings

None. No findings.

## Gates (Q01–Q08)

- Q01 Authority and scope: pass. Owner instruction 15 Nov to increment v1 releases, starting with v1.01, and 16 Nov "deploy v1.01"; exact eight claimed paths only.
- Q02 Design and ownership: pass. One central v1-owned label constant using the existing normalizer, rather than a new collection of source text patches.
- Q03 Security and privacy: pass. Presentation and build metadata only; no authentication, permissions, persistence, data, provider or migration change.
- Q04 Concurrency and recovery: pass. Not applicable; no mutable state or concurrent path.
- Q05 Resources and maintainability: pass. No new dependency; no behaviour change.
- Q06 Verification: pass. New label test and updated parity test pass locally; exact-head Node/LORD CI and product/package CI green.
- Q07 Handoff and review: pass. This record; PR names the reviewer; no merge or deployment requested.
- Q08 Release boundary: not applicable. No deployment, migration, live data, credentials or provider activation. F5 OPEN; T1B-01/T1B-02 and hosted/runtime UAT Not tested.

## Release notes

The release label is now `v1.01` on home, the Global Admin Toolbox and all nine application viewports, and beside the exact source commit in the product manifest and all nine Worker configurations.
