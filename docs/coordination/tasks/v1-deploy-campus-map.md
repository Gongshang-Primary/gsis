# Restore Deploy's campus map

- Status: locally verified, awaiting branch CI and exact-commit review.
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

## Verification

The build now points just the active Layout drawing fetch at the already served `/deploy/campus-base.svg`. It uses GET with credentials omitted. The current application still renders its authenticated version projection over that drawing. The gateway, assets, configuration, Deploy owner, retired Layout reference fetch and flag-gated commands are unchanged.

- `TZ=Asia/Singapore npm run build` passed with zero tracked generated drift. `node tests/v1-product-v09-frontend-parity.mjs` passed all nine built release labels, source/asset queries and unchanged legacy sources.
- `node tests/v1-product-deploy-campus-map-browser.mjs` passed with the locked Chromium 151 path supplied through `GSIS_BROWSER_EXECUTABLE`. The real built browser loaded the same SVG bytes without an Authorization or Cookie header, displayed the seeded saved class overlay, and applied native zoom and Fit. The anonymous Deploy sync request was denied. Layout sent no owner change and the saved D1 document was unchanged.
- `node tests/v1-product-operation-probe.mjs` passed with the same local settings. The sentinel still returned 404. The probe parsed 127 scripts and retained the other 25 known missing-handler entries and 15 unresolved dynamic sites. It no longer needed the active Deploy campus-map allowance.
- Syntax and `git diff --check` passed. Required branch and PR CI, review and hosted UAT are pending.

These checks use synthetic local Worker/D1 fixtures. Hosted runtime UAT and T1B-01/T1B-02 remain Not tested. F5 stays OPEN.
