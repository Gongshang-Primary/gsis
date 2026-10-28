# Timetable export contract repair

The O live preparation report found that a downloaded snapshot could not be imported without editing its JSON. The native exporter returned the documented manifest, parts and final check, but the general Apps Script response serializer then added `data.timing`. The export page copied this transport diagnostic into each portable object. The preparation Worker correctly refused those extra fields.

P removes only the top-level `timing` property from the three exporter response objects before assembling the download. It does not edit native timetable strings, source keys, hashes, byte lengths, confirmation evidence or any other field. The Worker retains the exact field checks, privacy checks and independent projection verification. An upload containing `timing` or an unrelated extra field still fails validation.

## Compatibility and installation

Install the matched P Roster frontend and backend through the existing deployment process. Download a fresh snapshot from **System Health → Prepare timetable migration**, then import that untouched JSON file into the existing O preparation Worker.

The schema remains version 1 with the O preparation protocol release `0.9.8o`. The production Roster component version is P. These labels describe separate contracts. The verified O preparation Worker, its existing imported snapshot and exact request receipts do not need replacement for this export repair. No new binding, database, bucket, secret or authority flag is required.

Google remains production authority. The preparation service still does not accept absences, select live Calendar parity, verify current staff mappings or refresh itself when Google sources change.

## Diagnostic build correction

The request path used a stale literal diagnostic label while editor checks used a newer literal. `rosterDiagnosticBuild_()` now derives the label from the actual compiled backend version. Request diagnostics, cached-history output, the published-deployment check and the read-only access check use that one helper.

Useful diagnostics remain available in the existing response/log channel. They are excluded from the portable timetable file. This fixes the misleading build marker without hiding errors or disabling monitoring.

The reported older Contacts bridge version describes the remote deployed Contacts endpoint. A source label change cannot prove which remote endpoint is live. The full-suite installation supplies the current Contacts code; after deployment, compare the reported component version with the installed package. No live Contacts update or verification was performed by these local tests.

## Test evidence

`tests/roster098p-export-contract.cjs` exercises the native preparation handler, the actual `out_` response serializer, the actual browser export script in JSDOM, and the unchanged preparation Worker validators. Storage and browser transport are simulated; the portable contract itself is produced by production code.

- Before the fix: the diagnostic-wrapped export failed with `UNSUPPORTED_SCHEMA`; the single diagnostic-build-source assertion also failed. Two controls passed.
- After the fix: all four cases pass. The test also covers responses without diagnostics, preservation of every source field and native byte, a timetable value named `timing`, and refusal of unexpected uploaded fields.
- Retained exporter tests: 14/14 pass.
- Retained export UI tests: 3/3 pass; routing tests: 2/2 pass.
- Retained diagnostic programs `roster607-diagnostics.cjs`, `roster608-diagnostic-detail.cjs` and `roster702-backend.cjs` pass. Their fixture build expectations now follow the runtime version. The published-version-mismatch test still simulates an old remote diagnostic build and refuses it.

The first diagnostic test setup lacked the existing backend-role fixture and was corrected before recording the intended failing assertions. That setup error was not a product failure. Red/green evidence is retained under `verification/v098p/export-contract-*.log` during release verification.

No live timetable import, absence submission, source mutation or production deployment was performed by this fix.
