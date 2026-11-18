# Muse review — PR #220: restore the Deploy Layout campus map

- Reviewer: Muse, replacing Claude until Claude returns, per the owner's 16 Nov directive (source 12b06eb).
- PR: #220, branch `codex/v1-deploy-campus-map`, OPEN, MERGEABLE.
- Exact head reviewed: `42a77be7fdd0a0e85d49fc086f2d2b8ac4260825`.
- Base (merge-base of the head against origin/main at review time): `6835ed30677c7919fa63a58db8bb7dcd7d8c8daa`.
- Verdict: **APPROVED at the exact head.**

## What it fixes

Deploy Layout now loads the campus drawing already bundled with v1. Previously the Layout button called a missing API and showed a load error. The existing renderer now overlays the saved classes and rooms on the same SVG. This closes the active `/campus-map` part of F12.

## Scope verified

- Diff is exactly the four paths in the task record `docs/coordination/tasks/v1-deploy-campus-map.md`: the task record, `scripts/v1/build-web.mjs`, `tests/v1-product-deploy-campus-map-browser.mjs`, `tests/v1-product/operation-probe-allowlist.json`. 81 insertions, 9 deletions.
- `git merge-tree --write-tree --name-only origin/main 42a77be` is clean (no conflicts).
- `git diff --check` clean. Secrets scan of the diff clean.
- No migration, deployment, live data change or provider change. No deployment by this review.

## Design read

- `scripts/v1/build-web.mjs` (one `replaceOnce` in `updateDeploy`): the copied Deploy campus-map loader previously did `fetch('/api/campus-map', {method:'POST', ...})` against a route that does not exist; it now does `fetch('/deploy/campus-base.svg', {credentials:'omit', signal: AbortSignal.timeout(30000)})`. The static file already returned HTTP 200 without a session before this change, so no new exposure is created; the fetch carries no credentials (verified in the test: no authorization or cookie header). The saved version projection is still protected by the Deploy owner — the overlay data (classes and rooms) comes from the protected projection, not the SVG fetch. The renderer overlays the saved classes and rooms on the same SVG.
- `tests/v1-product/operation-probe-allowlist.json`: removes the F12 `/campus-map` known-gap entry, since the loader no longer fetches the absent route.

## CI verified at the exact head

- Node/LORD run 44411990484: head_sha verified `42a77be`, completed success, all four shards and the aggregate green.
- Product run 44414023302: head_sha verified `42a77be`, completed success. (The PR body said product CI was pending at writing time; it has since completed green at the same head.)

## Local checks run (TZ=Asia/Singapore, Playwright chromium-1234)

Worktree at the exact head; `npm ci` at root and inside `v1/` first.

- `node tests/v1-product-deploy-campus-map-browser.mjs` — PASS (built Workers, synthetic D1: static SVG available without a session, bytes identical to `public/campus-base.svg`, no authorization or cookie header on the fetch, no retired `/campus-map` API call, seeded saved class overlay renders, native zoom 125%/Fit, denied anonymous Deploy sync, zero Deploy writes, saved version unchanged, no page errors).
- `node tests/v1-product-operation-probe.mjs` — PASS (unchanged, 408 operations, 128 parsed scripts; the removed allowlist entry is no longer needed).
- `node tests/v1-product-v09-frontend-parity.mjs` — PASS (unchanged, nine-app frontend parity).
- `npm run build` — PASS, no tracked drift.
- `node scripts/v1/build.mjs` — PASS.
- `node scripts/v1/verify-build.mjs` — PASS.

## Findings

None. No findings.

## Notes

- N1: the static SVG was already public (HTTP 200 without a session) before this change; this repair only reads it with credentials omitted. The protected saved version projection is unchanged. F12's other allowances stay open. Hosted UAT remains Not tested. No merge or deployment by this review.

## Quality gates

- Q01: Pass. Coordinator-authorised bounded Deploy Layout repair; exact scope in the task record.
- Q02: Pass. Existing bundled static asset and protected projection reused; no new data source or access path.
- Q03: Pass. No credentials on the fetch; anonymous Deploy sync still denied; saved version unchanged.
- Q04: Pass. Zero Deploy writes; display preserves the saved version; no page errors.
- Q05: Pass. Bounded Deploy build-web adaptation only; no new workflow.
- Q06: Pass. Local verification above; exact-head Node/LORD CI green and product CI green.
- Q07: Pass. This exact-head review.
- Q08: No deployment authorised by this task and none performed.

## Release notes

No release label change. No deployment. Rollback is a reviewed code revert; the static SVG and saved versions are untouched.
