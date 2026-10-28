# Performance and reliability v0.6.05

Ponytail reuse: existing converter/JSZip, existing Google identity and signed bridge, current Contacts authority, timed lock wrapper, native date inputs, native print, shared workload/table/KaTeX modules. No new package dependency or additional GSiS Apps Script project.

Parse and generate XLSX once per upload in the browser. Read a small register and one parsed model for a view, with teacher switching and search local. Mutations validate before the lock, reject stale revisions and commit visibility last. Same-request retry reuses written immutable files and durable receipts. The global script lock serialises Roster mutation with existing Deploy writes; split storage/locking only if measured contention warrants it. Small reads do not acquire a write lock.

Roster views poll once per minute while visible and not saving. Upload has a 55-second gateway timeout; an uncertain response retains the same request payload for Retry. No midnight trigger or background workbook reconversion. A timeout does not imply the backend stopped; use the original retry.

Workload planned provision is built once per analysis. Specialist views reuse it. Numerical alignment uses the shared table enhancement lifecycle. Calendar core and API logic are unchanged from the supplied package.

Synthetic checks prove computation, request and retry behavior, not school-network latency, Apps Script quotas or screen pixel fit. See VALIDATION.md for results and remaining live checks.
