# GSiS v0.9.1b verification

25 October 2026, Singapore time. Baseline: v0.9.1a, commit 306be4b2cfd76dbb6a4555b07703707f5ac0b1da. Local testing uses simulated Google/provider services and Chromium. No live deployment, settings change, source publication or provider message was performed.

## Completed LORD checks

The final integrated LORD suite passed 33 programs with zero failures. Its recorded source hashes match the final runtime source. Tests cover Remarks spaces, cursor/selection, draft restoration and save/reopen; the three return actions at 360/390/1366/1920px; quantity discrepancy protection; combined booking load and older-backend fallback; date/generation races; queue admission and uncertain checkpoints; actionable warnings; STARLORD stalled-body recovery; and durable photo evidence retries.

The photo suite passed 28 cases, including uncertain Drive creation, concurrent identical retries, changed actor/content, custody conflicts, replay after archival, and bounded manifest maintenance. Independent review corrected false success for another submission's photos and readiness checks for read-only folders or Drive v2. Readiness now requires the Drive v3 methods and folder write capability. No live Google upload was performed.

Independent review found and corrected two false-all-clear cases: an unrelated successful retry could hide an earlier failed enqueue or another failed task. The final correction retains bounded unresolved categories and safe task-local diagnostics. All 15 fixed warning categories occupy 3,060 bytes in the test fixture. No new Script Properties were introduced for diagnostics.

The booking performance fixture for 20 entries drops full property snapshots from 42 to 3, retaining 40 queued tasks, 41 durable property writes, one atomic Sheets commit and one write lock. This is a service-call count, not a measured Apps Script or network speed claim.

## Roster and package gates

The combined Roster/LORD component packaging regression and existing LORD-only regression pass. They check exact component scope, canonical backend derivation, forbidden Layout/aSc exclusions, runtime parity, tag/bundle provenance and tamper rejection. LORD backend packages include the photo upgrade guide and services fragment, verified against the source; missing or tampered support files fail verification. The complete GSiS run covered 650 programs: 648 passed initially. One unchanged performance subprocess hit its 25-second timeout during concurrent load and passed in isolation. The notification-source parity gate required regeneration after the Roster version update; it and the related Worker diagnostic gate then passed. All 650 programs therefore have passing results across the full run and targeted reruns, not a claimed zero-failure initial run. The syntax gate parsed 140 Apps Script sources.

Roster regressions cover source/primary checksum binding, prepared proof validation, legacy rename preparation, baseline period mismatch, 12 MB source limits, multi-step transport fallback, role redaction and fresh publication markers. Chromium exercised multipart hydration and IndexedDB generation/account protection. Actual Worker/R2 simulation confirmed fresh-manifest checks with byte-identical package reuse.

Report Absence checks cover immediate menu dismissal, field alignment at desktop and phone widths, draft preservation, warm IndexedDB reuse without a model request, cache-only misses without network fallthrough, account/source changes, and invalidation during delayed disk restoration. Independent review found and fixed a deselection race; source invalidation now expires report authority, and forced final-submit callbacks cannot bypass that guard.

The private timetable browser checks hold stylesheet loading while confirming that exactly one signed view request has already started. They cover maroon pending and persistent green success, mismatched receipts, publication conflicts, expired/unauthorised links, failure before DOM readiness, and mutual-request retries. No production page-load timing claim is made.

The final integrated run passed all **158 related GSiS programs**, with zero failures. It includes the two new Report Absence and private acknowledgement browser programs, bringing distinct tested programs across the full and targeted runs to 652. The final setup check also passed all 17 cases and verified byte-identical LORD source/template trees.

## Limits

STARLORD's stalled response-body bug is locally reproduced; live incident logs were not inspected. Google cold starts, school morning contention, browser radio conditions, quotas and provider delivery remain unmeasured. Existing provider transport ambiguity is retained; no end-to-end exactly-once delivery claim is made.

The package must be rebuilt and byte-verified after the final commit/tag. PATCH.json records that exact commit. Product backlog and Venues design remain separate artifacts and are not represented as delivered runtime features.
