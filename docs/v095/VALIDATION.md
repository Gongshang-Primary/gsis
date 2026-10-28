# GSiS v0.9.5 verification

Verified locally on 26 October 2026 (Singapore). No production deployment, migration, real notification send or live account setting change was performed.

| Gate | Result |
| --- | --- |
| Root regression programs | 722 passed in the final merged result; no unresolved failures, dependencies or timeouts |
| LORD suite | 34 programs passed, including real browser administrator recovery and OVERLORD desktop/mobile layout checks |
| Apps Script syntax | 179 `.gs` files parse as ES2020; unsupported logical assignment regression rejected |
| Documentation | Archify showcase finalize passed; Drawio structural check passed; manual passed desktop/mobile browser checks |
| Installation package | 31 declared installation/document files; inventory and source-parity gate runs before and after committing |

## Evidence and commands

`python3 scripts/verify-release.py --skip-package` ran the complete root collection with a 90-second test timeout and four workers. Initial results remain in `verification/95-node-results.json` and `95-node-summary.json`. The first pass identified a missing candidate artifact, a legacy cursor compatibility regression, an unset browser executable, a generated Worker mismatch during integration, and a real occupancy cache-key regression. None is counted as a passing first-run result.

After fixes and regeneration, the affected source, browser, cache and packaging integration programs were rerun. `verification/95-final-reruns.json` contains their output. `95-final-summary.json` combines the unchanged successful programs with those final reruns: 722 passed, zero unresolved. The browser programs used the installed Chromium executable. The separate package gate is `python3 scripts/verify-full-package.py` (also exposed as `node tests/package.cjs`).

`LORD_TEST_CHROMIUM=/tmp/chromium python3 lord-suite/tests/run_all_checks.py` passed 34 programs. Its command results and tested source hashes are in `lord-suite/tests/all_checks_results.json`.

`docs/v095/documentation-verification.json` records the actual renderer, structural and real-browser checks. The architecture's `v095-source-evidence.json` is a hash snapshot of inspected local working source, not an invented hosted repository or future commit identity. The retained v094 operator-page receipt is historical; no new live cutover was performed.

## Changed boundaries checked

1. LORD role recovery is authenticated by the signed session and backend identity lookup. A failed lookup is not cached as a confirmed non-admin result. Booking writes still validate the acting administrator and selected teacher. Recipient and creator identities remain separate.
2. OVERLORD grants no longer depend on individual WhatsApp consent; historical data is preserved. UI cleanup does not acknowledge or clear warnings.
3. Roster management displays selectable periods and their timings. Opening a cached entry performs no mutation; reason-only edits preserve exact original clock boundaries. Changed period timings require review before save.
4. Signed Deploy/Venues and LORD sources use the current physical register while preserving frozen publication data. Apps Script and Worker paths enforce signatures. Safe error codes survive the actual response envelope.
5. Room edits verify the shared workbook, live administrator grant and register revision. Only changed metadata cells join the audit and receipt in one Sheets batch. Interrupted saves recover by receipt; a known receipt can be confirmed when Deploy is unavailable.
6. Multiple room owners save together with room revision checks. The operation preserves other grants, room policy and product-administrator boundaries.
7. Current occupancy content is stable when a future publication is added. Live room metadata edits invalidate room reads without rewriting an identical occupancy piece. An unchanged subsequent refresh performs no room snapshot read.
8. Actual Layout and Deploy display paths use current room metadata; geometry, unit identities and allocations remain intact. Clearing a short name does not revive a stale short name.

## Limits and production acceptance

Local checks do not establish production credentials, actual Google/Cloudflare latency, account quota headroom or message delivery. Confirm Deploy `LANDMARK_SHEET_ID` and Venues `VENUES_SPREADSHEET_ID` refer to the same corrected workbook, deploy the matching source adapters, then run `syncVenuesSources()` and `syncLORDGSiSReferences()`.

Apps Script locking serializes viewport writers in the Venues project. It cannot lock a simultaneous human edit in Google Sheets; avoid direct Sheet changes while saving the same register through the viewport. Unit identities are deliberately fixed in the metadata editor to preserve bookings and timetable references.

An unchanged physical register uses bounded caches: ordinary Worker Deploy metadata may lag by up to 30 seconds and the Layout gateway by up to 45 seconds. Source verification for booking refresh reads fresh authority. No benchmark claim is made for the live school installation.
