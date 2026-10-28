# GSiS v0.8.1c validation

Scope: Deploy backend and Roster frontend over the installed v0.8.1b patch. The separate notification Worker retains version 0.8.1b. Other components remain at their declared versions.

## Five coding skills

Ponytail keeps implementation inside existing modules without new production dependencies. Pstack traces recipient comparison and dispatch to their shared boundaries. Thermonuclear provides independent correctness and structural reviews. Vercel covers authorization, concurrency, retries and maintainability. Superpowers provides failing regressions before fixes and verification before completion.

## Checks

The full regression invocation passed 446 of 455 scripts. Nine checks required follow-up: the archive did not yet exist at its first check; one storage test read a generated file during regeneration; two diagnostics exposed a stale canonical build label; and five older fixtures assumed ungrounded recipient flags, unnotified restorations or duplicate sends. The build label and fixtures were corrected without removing their functional assertions. All nine passed the final scoped run, together with 20 related regressions: 29/29. All 455 current scripts are verified across these runs. The original full invocation is not labelled all-green.

Against the captured operational revision 204 for 21 October 2026, canonical eligibility produces 38 substantive recipients instead of 58 stored rows. It excludes the reported unchanged teacher, all 17 comma-spacing-only cases and the three never-notified restorations. The in-memory source document remains byte-equivalent. This is a local check of a previously captured snapshot, not a fresh production status read.

The unchanged-card comparison preserves stored imported identities and source details. Display equality and provenance-based relief accounting remain separate concerns. Nine focused Stapler checks cover genuine moves, transfers, restores and imported identity; the 600-card accounting check avoids repeated comparison maps. Independent review measured 6.51 ms locally after the correction, compared with 745 ms for the draft implementation, not a production latency claim.

Review fixes cover repeated A-to-B-to-A notifications, private acknowledgement evidence, duplicate legacy queue entries, expired unsent requests, legacy two-part fingerprints, inherited acknowledgement across equivalent assignment IDs, hidden false pending acknowledgements, and provenance-based transfer accounting. Both independent reviews closed with no unresolved material findings after exact reproduction rechecks. Historical derived acknowledgement evidence persists through later changed publications without recording a new teacher action.

Evidence: verification/81c-npm-test.log, verification/81c-final-scoped.log and .json, verification/81c-final-sync.log, and verification/81c-captured-snapshot-check.json. The final Apps Script ES2020 gate passed for all 68 source files. The two-component archive passed exact membership, source parity and hash checks.

New changelog item 060 (reusable private links until normal expiry) is queued for a later implementation and is not claimed as fixed by these tests.

## Reproduction

Install the declared dependencies with npm ci. Run npm run build, npm test and npm run test:release. Browser tests accept ROSTER_TEST_CHROMIUM and GSIS_BROWSER_EXECUTABLE; both point to /tmp/chromium in this workspace. Local Chromium version is 153.0.8010.0. The suite supplies Singapore time for its fixtures.

The component verifier checks exact archive members, hashes, assembled Deploy backend parity, every Roster frontend file, declared component versions, vendor assets and public signed-link routes. Final packaging occurs after commit so PATCH.json identifies committed source.

## Limits

No live deployment, production record update, provider template edit or WhatsApp send was performed. Local tests do not establish actual Meta delivery or production latency. An authorised live affected-recipient test, signed-link check and acknowledgement remain installation acceptance checks. Uncertain prior send attempts require reconciliation before retry.
