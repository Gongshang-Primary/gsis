# Q full-suite failure classification

The initial Q Node run completed with **836/854 programs passing and 18 failures**, then exited unsuccessfully. Five Q integration failures subsequently passed fresh targeted reruns. Combined evidence is therefore **841/854 passing programs, with the same 13 inherited checks still unpassed**. This is not a second clean full-suite run and must not be described as all green. The chained LORD phase did not run after the Node failure; its separate result belongs to the release validation summary.

This classification independently inspected the completed `full-suite.log`, the five targeted rerun logs, P's recorded classification and raw O comparison evidence. No production code or live data was changed for classification. Prior evidence was copied verbatim to `inherited/` with SHA-256 provenance; copying does not constitute a fresh O/P execution.

## Five Q integration failures resolved separately

| Initial failed program | Cause | Fresh rerun evidence |
| --- | --- | --- |
| `calendar605.cjs` | The full run reached its version assertion while Q labels were being updated; frontend/package labels were temporarily mixed. | `calendar605-root-rerun.log`: passed with the final matched Calendar labels. |
| `calendar606-inherited.cjs` | Four native-read assertions assumed one range per column or the previous projection grouping. Q intentionally combines adjacent requested columns. | `calendar606-root-rerun.log`: all 63 underlying I/O checks passed after assertions were updated to require the same selected columns, with fewer service calls. |
| `pages096-packaged-worker.cjs` | Assumed the current release had a full-suite `Updated_Deployments.zip`; Q is a Calendar-only pair. | `pages-package-final-root.log`: current declared Calendar deployment scope passed. |
| `paid097-bundles.cjs` | Same obsolete full-suite artifact-path assumption. | `worker-bundles-final-root.log`: declared packaged components, imports, labels and authentication/recovery boundaries passed. |
| `release098h-suite-routing.cjs` | Current entry-point/setup links were not yet aligned with the Q component patch. | `routing-final-root.log`: Q entry point, matched Calendar pair, other production P and preparation O passed. |

These are integration and fixture corrections, not inherited P failures. Their initial failures remain visible in the original log. Runtime scope was not expanded to make the package tests pass.

## Thirteen inherited failures

Every signature below matches P's retained evidence, which previously reproduced it on clean O. All 13 test files are byte-identical to P. All 212 tracked files across `backend/`, `shared/`, `roster-update/`, `notification-worker/` and `operations-worker/` are also identical to P; the hashes are in `inherited/P-to-Q-source-parity.json`.

| Failed program | Observed Q signature | Classification and execution limit |
| --- | --- | --- |
| `release084-absence-browser.cjs` | Cannot resolve `v0.8.3:roster-update/public/roster.css`. | Missing historical comparison tag; benchmark cannot complete. |
| `roster717-inbox-performance.cjs` | Cannot resolve `v0.7.16:shared/roster-inbox.js`. | Missing historical comparison tag; benchmark cannot complete. |
| `roster718-absence-performance-browser.cjs` | Cannot resolve `v0.7.17:roster-update/public/roster.css`. | Missing historical comparison tag; benchmark cannot complete. |
| `stapler718a-relief-import.cjs` | Historical commit `32d2c2d17621319ba1d57aea34046229544f5513` lacks `shared/roster-stapler.js`. | Missing historical source path; comparison cannot start. |
| `roster-draft-cell-save-speed.cjs` | Measured response is 3,073 bytes against the old less-than-3,000-byte bound. | Identical inherited size discrepancy. Earlier one-read/write/lock checks pass; later scenarios stop at the bound. |
| `roster080-batch-backend.cjs` | Imports the previous fixture and fails at the same 3,073-byte bound. | Its own batch scenarios do not execute. |
| `roster719-performance.cjs` | Imports the same failing fixture and reports 3,073 bytes. | Its own performance scenarios do not execute. |
| `roster081-day-ownership-browser.cjs` | Times out clicking disabled Auto-allocate for already-started duties. | Earlier fixture expects allocation after relevant lessons started; M retains protection of started duties. Later scenarios remain unexecuted. |
| `roster084a-relief-pool.cjs` | 14/15 pass; confirmed suspension is expected to ignore missing main-pool R (`true !== false`). | Obsolete suspension bypass expectation; K reinstated R/cap/business-rule checks. |
| `roster701-r17-integration.cjs` | Missing expected `/outside/` exception from a manual optimisation action. | Old manual-action time gate conflicts with M's anytime actions on unstarted duties. Later cases stop. |
| `stapler718c-import-policy.cjs` | Expects `capViolation:false` after suspension; receives true. | Old suspended-day cap bypass conflicts with K. Saving/confirmation succeeds before the failing eligibility assertion. |
| `stapler718c-persistence.cjs` | Same `true !== false` cap assertion after signed save/confirm/reload. | Same inherited policy expectation; this failure does not establish plan loss or baseline-dependent confirmation. Later cases stop. |
| `suite703-calendar-reliability.cjs` | Expects three Advanced Sheets API reads; receives zero. | L restored native SpreadsheetApp, retained by P/Q. The frontend scenario precedes the old API-count assertion; subsequent backend cases are not claimed as passing. |

The exact previous assertions, reproduction commands and per-case limitations are retained in `inherited/P-FULL_SUITE_FAILURE_CLASSIFICATION.md` and the thirteen `baseline-O-*.log` files. Later K/M/native-storage policy evidence is included separately. These failures remain explicit limitations; they are not silently counted as successes or removed from the runtime test selection.

## Current focused coverage

The release owner's final focused run records **19/19 programs passed** in `final-focused/results.json`, including current Calendar concurrency, source isolation, native storage, provider cooldown, publication, metadata, jobs and source retry. Q's dedicated frontend program has 17 cases, and the final backend status/native-cost program has 11. Independent review also records 22 adversarial status cases and 250 projection-parity cases. These targeted results supplement the broad run rather than replacing its initial outcome.

No newly introduced runtime failure remains unclassified in the completed Q log. The final deployment/archive validation and separate LORD run are documented by the release owner. Local tests do not demonstrate live Google throughput or a deployed-school acceptance run.
