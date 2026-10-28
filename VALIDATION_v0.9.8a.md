# GSiS v0.9.8a validation

15 focused test files passed. This is a scoped regression run, not a repeat of the full v0.9.8 suite.

The new DOM and Chromium tests first failed against the original frontend because selection controls were absent. They now pass with the new controls. Verified eligible-date/role filtering, visible selection on collapsed cards, keyboard focus, mobile 390px and desktop 1280px layouts, escaped names and IDs, required reason and acknowledgement, frozen selections, sequential requests, duplicate-submit prevention and unchanged saved absences.

Partial failure checks verify that confirmed withdrawals are not repeated, a lost response retries the exact same request ID and payload, a definitive conflict stops the remaining rows, and page/date/account/authority changes stop unsent work. Reauthentication permits confirmation of the uncertain row without silently continuing the old batch. The merged report list is not newly truncated by the frontend.

Existing intake, pipeline, Worker routing, review receipt and peer UI tests also pass. The bundled recovery entry tests still verify the Google record route, pending attendance blocks, queue preservation and pause controls.

Package checks verify only the declared Roster frontend is shipped, its Worker is self-contained, authentication remains required, version labels match, archive hashes match source and SOURCE.patch matches the working tree. The source patch is checked against the declared v0.9.7 source base. Roster Apps Script and the notification Worker require no deployment for this patch.

Relevant commands:

node tests/roster098a-intake-flush.cjs

ROSTER_TEST_CHROMIUM=/tmp/chromium node tests/roster098a-intake-flush-browser.cjs

python3 scripts/verify-component-patch.py

node tests/paid097-bundles.cjs

Detailed results are in docs/v098a/validation-results.json within SOURCE.patch.

All records and network responses used in these tests were synthetic. No production deployment, live queue purge, live withdrawal, allocation or notification was performed. The tests do not establish that the production 503 error has been resolved. This patch adds controls for explicit withdrawal of eligible received reports; it does not add missing absence records.
