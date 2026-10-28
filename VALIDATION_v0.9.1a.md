# GSiS v0.9.1a verification

25 October 2026, Singapore time. Baseline: `664462ff520cdb8d7f4f1c2accc0db405009f0a2` (`v0.9.1`). No live deployment, settings change or provider send was performed.

## Completed gates

* The final integrated `python3 scripts/verify-release.py --skip-package` run passed all 647 current GSiS programs with no failures, timeouts or unavailable dependencies. Seven explicitly historical programs remain excluded by the existing runner.
* `python3 lord-suite/tests/run_all_checks.py` passed all 27 LORD programs, including 108 static checks, rendered browser checks and the 22 new property-policy fault cases. Recorded hashes match the final runtime source.
* The Apps Script syntax gate passed all 139 current `.gs` files as ES2020. Generated first-time templates match the canonical LORD source.
* The new component-package regression passed exact four-component scope, frontend/backend source parity, committed provenance, incremental source recovery and rejection of stale source. The release package gate checks each emitted file and SHA256 against the committed source.
* Independent correctness and quality reviews checked the final integrated source. Findings were corrected before final tests: uncertain edit replay, unreadable receipts, per-value WhatsApp checkpoint overflow, current-consent lookup order, active-send diagnostic classification and malformed completed-task retention.

## Behaviour exercised

Direct custom Class / TG / Activity and Subject typing; explicit catalogue selection with duplicate labels; stable ID and reference-generation checks; historical values; mobile touch and keyboard controls; drafts and refresh; validation and literal Sheet strings; create/readback/edit, audit, email content and exact retry.

Property tests cover recent versus expired receipts, pending/completed/leased/malformed/uncertain work, safe interrupted pruning, stale snapshots and renewed leases, byte and value limits, preservation of configuration and unknown keys, exact replay under capacity pressure, queue drainage, durable uncertain-edit protection and no repeated WhatsApp send after accepted-message checkpoint failure. Independent admin and teacher fault reproductions also verified zero sends when the pre-send intent cannot fit.

## Property cost measurement

Thirty booking creates per version used an in-memory Google-services fixture with 85,691 property bytes, 132 recent receipts and 104 task records, including 20 completed records. VM startup was excluded. The actual production functions were exercised against the v0.9.1 and v0.9.1a source.

| Measure per create | v0.9.1 | v0.9.1a |
| --- | ---: | ---: |
| Full property snapshots | 3 | 4 |
| Property writes | 3 | 3 |
| Sheet batch commits | 1 | 1 |
| Local median elapsed time | 7.67 ms | 9.91 ms |
| Local p95 elapsed time | 15.45 ms | 16.02 ms |

The extra snapshot checks capacity before the authoritative commit. Pruning ran once and inspected 246 keys in this fixture, deleting none because all work was still retained. These local timings do not measure Apps Script RPC latency, school traffic or provider delivery and are not a production performance claim.

## Limits and release provenance

Real Google quotas, network latency, user devices, installed settings and message delivery were not exercised. Provider transport ambiguity and email/Telegram acknowledgements retain existing delivery semantics; this patch does not guarantee end-to-end exactly-once delivery. Use the installation acceptance checks on a test installation.

The final commit and tag are recorded by the package in `PATCH.json`; `SOURCE.patch` and the incremental bundle recover the change over v0.9.1. The package is rebuilt and verified after committing. No remote push is included.
