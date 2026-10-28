# GSiS v0.8.1b validation

Scope: cumulative Roster patch over v0.8.1, including the v0.8.1a changes. Only Deploy backend, Roster frontend and the separate notification Worker are deployment components in this package. Calendar, Contacts, Deploy frontend and Layout retain version 0.8.1.

## Five coding skills

Ponytail was used to keep changes within existing modules and avoid new production dependencies. Pstack was used to trace the template and publication boundaries to their shared causes. Thermonuclear supplied independent correctness and structural reviews. Vercel covered authorization, retries, concurrency and maintainability. Superpowers supplied reproduction and verification before completion.

Both independent review passes finished without unresolved material findings. Review fixes covered generic Inbox values containing a URL followed by prose, URL validation for Unicode line separators, safe Inbox diagnostic persistence, generated subject-family IDs, and unpublished instructions leaking into published reminders or private timetable history. Standard build commands now use the component patch builder and verifier.

## Checks

The consolidated run passed 445 of 451 current scripts. All six failing scripts passed after corrections, together with three related checks in a final 9/9 scoped run. All 451 current scripts are verified across those runs; the original full invocation is not labelled all-green.

The six corrections covered an outdated advance-notification expectation, a loading-state test race after asynchronous draft flushing, isolated subject-catalogue fixtures in two context/concurrency tests, and stale canonical diagnostic version labels affecting two diagnostic tests. The final scoped run also passed the strengthened real subject-catalogue test, existing Roster performance checks and package verification. No failed checks were excluded from the suite.

Evidence logs are verification/081b-full-suite-verified.log, verification/081b-final-scoped.log and verification/081b-final-build.log.

New focused coverage exercises all 21 automatic template contracts and all template dispatch paths; whitespace and Unicode paragraph separators; byte-preserving signed URLs; bounded provider diagnostics; permanent and transient retry classification; Inbox diagnostic persistence through real backend writes; capability-bound timetable acknowledgement including cancellation and restoration; exact subject and teaching-group matching; default Tamil No Relief Required; published instruction isolation; and the acknowledgement and settings interfaces in Chromium.

The Apps Script ES2020 syntax gate validates all 67 source files. The component verifier checks the exact archive members, archive hashes, source parity for the assembled Deploy backend and notification Worker, every Roster frontend file, bundled vendor assets and public private-link assets. The final committed archive is rebuilt after commit so its provenance identifies the committed source.

## Reproduction

Install the declared development dependencies with `npm ci`. Run `npm run build`, then `npm test` and `npm run test:release`. Browser tests accept `ROSTER_TEST_CHROMIUM` and `GSIS_BROWSER_EXECUTABLE`; both pointed to `/tmp/chromium` in this workspace. The suite sets Singapore time for its fixtures.

Earlier partial runs were stopped after exposing missing local development dependencies/browser configuration and Calendar tests that incorrectly assumed every component shared the patch version. Dependencies and browser settings were restored. Calendar fixtures now read explicit component versions without changing their functional assertions or the unchanged application versions. Those partial runs are not counted as full successful runs.

## Limits

Local verification does not establish live Meta delivery or production latency. No live deployment, provider template edit, school timetable publication or staff notification was performed. Existing signed-link expiry invalidates access while retaining audit history. A hostname-wide access policy, if configured separately, remains an installation check described in INSTALL.txt.
