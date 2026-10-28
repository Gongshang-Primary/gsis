# GSiS Suite v0.9.3 validation

25 October 2026. All nine frontends, six Apps Script backends and the scheduled Roster Worker are aligned to 0.9.3. No production deployment, setting change, timetable publication or provider send was performed.

## Release gates

The initial complete run executed 681 current GSiS programs excluding the package check: 673 passed and eight failed. The failures were retained in the verification records. After all fixes and generated-source synchronization, the final complete run passed all 681 programs with zero failures. The separate package gate brings the current GSiS total to 682.

LORD passed all 33 programs at 0.9.3. The build parsed 162 Apps Script files as ES2020. Installation parity covers all 23 declared members and is checked again after the source commit.

## Findings and corrections

- Independent review found that a locally restored allocation draft could save before its current authority check. Filters and local drafting remain usable; outgoing commands now wait for verification, including restored drafts and failed checks.
- Calendar cache layers could extend source freshness if a conditional reply restarted the age. Proofs now retain actual source-read time, and stale/missing/future/uncacheable conditional certificates cannot certify old dates.
- A multi-year Venues manifest could exceed the My bookings reader's 366-day limit. Its default range is now bounded; direct My bookings entry passes in Chromium.
- Existing cleanup could clear retained legacy row/parts publications after publishing another year. All retained commits are protected; real purge/delete tests prove retained snapshots remain readable. More than 200 retained publications is rejected before writes.
- Assign Relief now observes known baseline/suspended identity changes immediately. Its compact preload status distinguishes the latest active allocation revision from an older confirmed display. Local edits survive refresh.
- Full-run frontend failures exposed an optional cache-method call in revocation handling, a brief asynchronous date-selection busy-state gap, and interception of the existing retained-form conflict recovery path. These are corrected and have focused passing regressions.
- Legacy test expectations were updated for the explicit verification message and the Calendar window contract. The batch browser fixture used a crashing single-process GPU launch; it now uses the same disabled-GPU launch pattern as the other browser checks and passes its unchanged behavior assertions.
- Final notification review found three more gaps. Returning teachers now receive newly assigned relief while attendance-only restoration stays silent. Server-created emergency notices may pass the automatic quiet window when their durable creation provenance proves the after-publication/before-14:00 rule. Pending removal corrections and detail rows survive unrelated attendance updates, while already-sent corrections stay suppressed. The targeted publication and emergency suites include these regressions.

## Evidence and limits

The warm allocation fixture performs zero model loads and zero quota preparations while retaining one fresh operations read. Current permissions, absences, assignments, suspended plans, weekly accounting and allocator state remain outside the immutable baseline cache.

The fixed 104-teacher/eight-retained-plan STAPLER fixture reduces decompressions from nine to one, compressions from three to two and hashed characters from 18.24M to 7.79M. Local commit timing improved from 1555 ms to 575 ms in the observed run, but machine load varies. Counts are deterministic; these figures do not establish school production latency or prove the reported timeout is gone. Lost acknowledgements, exact receipt replay, retained confirmation bytes and corruption/fence cases are tested.

Real Chromium checks exercise IndexedDB across reload, interactive cached filters during a held probe, no blur, stale generation rejection, local edits during verification, current authority gates, and changed-reference refresh. Calendar tests cover actual canonical write hooks, source-semantic revisions, five-minute expiry, manual/direct edits, cache outage, lost acknowledgements and newer-writer protection. Cooldown tests cover shared write spacing, Retry-After, durable deadlines, daily/permission classification, stable event identity, wipe claims and clock skew.

A scan of 1174 tracked/current non-test text files found no recognizable Google API, Meta, GitHub, Telegram, private-key or JWT credential candidates after excluding embedded-base64 substring false positives. This does not prove absence of every possible credential. Current complete source and incremental history after the documented source baseline are packaged; older history that may contain retired settings is excluded.

The architecture component topology is retained from the earlier inspected architecture; its historical source provenance is labeled as such. Current behavior and setup changes are described in README section 6a and the 0.9.3 release notes. No new live architecture verification is claimed.

## Closing verification

`GSIS_TEST_WORKERS=4 GSIS_TEST_TIMEOUT=90 python3 scripts/verify-release.py --skip-package` passed all 681 programs after the final rebuild. `python3 lord-suite/tests/run_all_checks.py` passed all 33 programs. No missing dependency was counted as a pass. Seven explicitly historical programs and nine helpers retain the established exclusions.

Independent correctness and code-quality rechecks closed every reproduced material finding. The final notification recheck passed 13 targeted-publication and 11 emergency-absence cases. The full run also passed their generated-source compatibility checks.

The final build and `scripts/verify-full-package.py` validate generated-source equality, all component version labels, complete assets, documentation links and SHA256 metadata. `scripts/package-suite.py` requires a clean committed source tree, a v0.9.3 tag identifying HEAD and deployment metadata for that exact commit before producing the deliverable. The package itself records that commit; embedding its own final commit here would change the commit.

Use the deployment checks in README for real school sign-in, delivery and morning throughput. Local success does not verify production bindings, provider approval or actual user latency.
