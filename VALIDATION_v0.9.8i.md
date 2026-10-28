# Revision I validation

Revision 0.9.8i, baseline H commit `69e0d74c569dfd7afb44f9e6bdd42968cc0382bf`. Local integration and independent review are complete with the inherited limits below. No single green full-suite run, live deployment or message delivery is claimed.

## Measured I evidence

| Gate | Result | Evidence and limits |
|---|---|---|
| Suspended ordinary workload and cumulative R | Passed | 16 new domain cases plus ten existing domain suites. The existing ordinary suspended exemption and cumulative R accounting required no operations-source edit. UT hard automatic cap, manual override and zero-R exclusions remain. |
| FORM source blocks | Passed | Configured FORM=2: actual effective pairs, genuine solos, partial absence, source identity, separate source pairs and protected SMC/peer choices. Default PAL=3 and other-subject policy retained. |
| Baseline comparison | Passed | Real Chromium: label/default on, persistent user off, edit/undo/redo/save/confirm/refresh, replaced/missing baseline and standalone no-baseline plan. Plan and confirmation retained. |
| Plaintext audit export | Passed locally | Source and packaged Worker tests cover dedicated bounded lane, backlog, verbose off, notification priority, contention, failure/retry, source preservation and safe status. Existing critical jobs retain their lanes. No live export performed. |
| Rehearsal local behaviour and security | Passed locally | Source plus setup 10/10; bundled Worker 9/9. Real local SQLite executes the shipped schema, with mocked R2 and Google signing-key transport. Auth/origin/schema boundaries, receipts/replay, stale edits, gzip/object pointers, timetable reconciliation and unsupported native import refusal covered. |
| Rehearsal live Cloudflare storage | Not performed | Cloudflare sign-in required. Wrangler/Miniflare unavailable. No remote resources, private bucket setting, actual D1/R2 persistence or school Google sign-in verified. |
| Final complete Node gate | 810 passed, 8 failed / 818 | Frozen runtime, three workers, 90-second per-program budget. Raw full-run results retained separately. All nine I-named programs passed in this run. |
| Post-gate fixture rerun / aggregate | 811 passed, 7 inherited failures / 818 | One current-release guide-routing fixture corrected to derive filenames from `gsisRelease`; exact isolated rerun passed. No runtime or guide changed after the frozen run. This aggregate is not a single full run. |
| Complete LORD gate | 38/38 passed | All recorded source hashes still match. |
| Syntax and generated parity | Passed | Canonical mirrors and both Worker bundles synchronized. 218 `.gs` files parse as ES2020. All 454 frozen runtime fingerprints still match after the Node gate. |
| Independent review | No open material findings | Separate domain/comparison, audit, rehearsal correctness/security and branch quality reviews. Timetable reconciliation, success-code projection and canonical archive tamper issues corrected and covered. |
| Matched production / separate rehearsal packages | Passed before commit | All 17 I labels, source/assets parity, Pages smoke routes, hashes, sibling manifest and no rehearsal nesting verified. Source-parity verifier rejects repaired archive hashes with changed content. |
| Final committed archives / fresh recovery | Post-commit receipt | Final source/tag identity, fresh clone/fsck, tracked-file equality, seven recovery checks and archive hashes are measured after commit in the external `RELEASE_VERIFICATION.json`. The pre-commit check does not claim these later checks passed. |

## Commands and recorded results

Final complete Node gate:

```sh
ROSTER_TEST_CHROMIUM=/tmp/chromium GSIS_TEST_WORKERS=3 GSIS_TEST_TIMEOUT=90 python3 scripts/verify-release.py --skip-package
```

Environment: Node v24.22.1, Chromium `/tmp/chromium`, installed declared development dependencies including esbuild, jsdom and Playwright. Exit was nonzero because the eight failures remain in the raw report. `verification/98i-node-results.json` and `98i-node-summary.json` retain 810 passes and eight failures. All 818 program identities are unique.

The guide-routing fixture still expected H filenames after the README correctly linked I. Only that fixture was changed to derive filenames from `package.json.gsisRelease`; all historical, file-existence and infrastructure assertions remain. Independent scoped review found no weakened assertions. Exact rerun `node tests/release098h-suite-routing.cjs` exited 0. `98i-post-gate-reruns.json` records its output, reason and timestamp; `98i-node-aggregate-results.json` replaces only that measured result. The complete release archive includes these raw and aggregate records.

An earlier preparation run had 816 programs: 801 passed and 15 nonpasses. Its raw records are retained as `98i-initial-node-results.json` and `98i-initial-node-summary.json`. In addition to inherited cases, it exposed two archive-not-built checks, current metadata fixtures, two successful-result projection regressions and browser/calendar harness failures during concurrent preparation. The projection code was corrected, generated runtime frozen and the complete gate rerun. No initial failure is silently called a pass.

Other executed gates:

```sh
python3 lord-suite/tests/run_all_checks.py
python3 scripts/build-release.py --sync-only
python3 scripts/verify-component-patch.py
node tests/suite098i-separate-package.cjs
node tests/release098h-component-patch.cjs
node tests/release098h-metadata.cjs
```

LORD completed 38/38. Generation passed syntax and parity. The package tests exercised real temporary builds, canonical tamper rejection, unchanged prior output on rejection, separate archives and full-history clone/fsck. Final release packaging repeats manifest/source verification after the tag; its exact source commit belongs in `PATCH.json` and the external receipt rather than a self-referential committed document.

## Seven inherited limits retained in I

| Program | I measured failure |
|---|---|
| `release084-absence-browser.cjs` | Historical v0.8.3 Git object is absent. |
| `roster717-inbox-performance.cjs` | Historical v0.7.16 Git object is absent. |
| `roster718-absence-performance-browser.cjs` | Historical v0.7.17 Git object is absent. |
| `stapler718a-relief-import.cjs` | Required historical Stapler path is absent at `32d2c2d17621319ba1d57aea34046229544f5513`. |
| `roster-draft-cell-save-speed.cjs` | 3,073 response bytes against the unchanged 3,000-byte threshold. |
| `roster080-batch-backend.cjs` | Imports the same response-size benchmark. |
| `roster719-performance.cjs` | Imports the same response-size benchmark. |

These match the [H validation](VALIDATION_v0.9.8h.md), which reproduced the same failures on G. Their I raw outputs were independently inspected. Missing history is not reconstructed or invented, and no performance threshold was relaxed. The release is not an entirely green test suite.

## Release and deployment boundary

Expected tag is `v0.9.8i`. `PATCH.json` records the actual packaging commit and committed source state. The complete release's `RELEASE_VERIFICATION.json` records final source/tag identity, component hashes and fresh recovery evidence. It must be checked before installation.

Google remains the production authority, with the existing URLs, configuration, receipts, logs and history. Production installation updates the existing Roster backend, notification Worker and Roster frontend, and adds only the documented audit-only cron `2-57/5 * * * *`; it does not switch storage authority. The other 14 matched components are optional version/shared-helper parity updates for an existing H installation.

The separate rehearsal package uses dedicated D1/private R2 and synthetic data. It has no production activation endpoint, Google write capability, live scheduler or provider credentials. It does not import a raw school operational document or implement the final production handover or live 30-day cache. Local substitutions do not establish live Cloudflare persistence or provider delivery.

Cloudflare sign-in blocked remote provisioning during preparation. No production deployment, cloud configuration change, school record mutation or real notification was performed. The user confirmed that the 28–30 October Stapler plans were restored after H; I preparation does not newly verify or repeat that live recovery.
