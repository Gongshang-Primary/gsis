# Restore Deploy's campus map

- Status: claimed after baseline reproduction.
- Owner/model: Codex, with Muse reviewing the final commit.
- Updated: 19 November 2026, 06:26 SGT.
- Branch: `codex/v1-deploy-campus-map`.
- Base: `6835ed30677c7919fa63a58db8bb7dcd7d8c8daa`, checked against GitHub main.
- Scope: the active Campus map portion of F12 in [the operation follow-up ledger](../../v1/V09_V1_TRACE_LEDGER_FOLLOWUP_2026-11-15.md).

## Exact paths

1. This task record.
2. `scripts/v1/build-web.mjs`, only the campus SVG fetch in `updateDeploy`.
3. `tests/v1-product-deploy-campus-map-browser.mjs`.
4. `tests/v1-product/operation-probe-allowlist.json`, only the Deploy `/campus-map` object.

The coordinator confirmed that the Deploy build hunk and allowance object are disjoint from the concurrent department, Venues, Calendar, F07 Roster and v0.9 PR #182 changes. Layout reference PDF and queued commands are separate F12 entries and stay open. This branch follows the branch-only claim practice after the direct-main claim was rejected. Staging and production deployment are outside the scope.

## Baseline reproduction

On the exact base, locked Chromium drove the built Deploy viewport against isolated native Workers and synthetic D1. Clicking Layout requested `POST /api/deploy/campus-map`, which returned HTTP 404. The panel displayed its load error and rendered zero SVG nodes. In the same build, an anonymous `GET /deploy/campus-base.svg` returned HTTP 200 with `image/svg+xml`, and its 489,638 bytes matched `public/campus-base.svg` exactly. SHA-256 `b6a62fa9d2d912ae43f6a3ecb58dbd2d0ac0042ec2cf3a894c6e7ec17c6b24d9`. Both source copies use Git blob `fdf14f5243ef850cc946f415eefe891a73350b08`. The v1 gateway already serves the geometry as a static asset. Version allocations are read through the protected Deploy owner and added by the existing browser renderer.

## Acceptance

Change the v1 loader to read the existing same-origin SVG and keep the native overlay, map controls, workbook/PDF actions, data owner, and protected data boundary. Verify the built viewport opens a map with a synthetic saved classroom overlay, the static bytes are unchanged, sign-in still protects the Deploy document, and opening Layout writes no data. Run the operation probe, frontend parity and canonical build checks. Record any CI or runtime validation still pending. Rollback restores the previous reviewed v1 frontend.
