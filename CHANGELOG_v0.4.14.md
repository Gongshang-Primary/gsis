# GSiS v0.4.14

Authorized 30 September 2026: invoke the Sheets API in Apps Script and commit the queued changelog.

- Q91: IP Deploy shows only unit numbers when a venue picker is closed. Open options/search retain room names; exports use the displayed unit number.
- Q92: Tables start in Compact, including tables shown later and dialogs. Compact remains at the right of page actions. Manual width adjustments survive ordinary refreshes; pressing Compact resets them.
- Q93: Larger rendered equations, vertical-bar metric dividers and explicit active-teacher N, including FAJT. Workload formulas and eligibility are unchanged.
- Q94: Workload and Summary have a separate sortable/filterable Load status column: at load, overload, under load. Existing colours, thresholds and neutral pending states remain.
- Q95: Partial-text and status filters for the teacher ledger, with clear/no-results states and filtered visible-column export. Filtering does not alter school-wide totals or quotas.
- Q96: Shared Sheets API v4 adapter batches disjoint Deploy field/projection writes and Contacts dirty-cell saves/catalogue projection. Selected bounded reads use batchGet. RAW preserves literal text and IDs. Existing journals, conflict checks and recovery stay authoritative.
- One consolidated `.gs` file is supplied for each existing backend project, plus the Sheets-service manifest and a read-only `prepareSheetsAPI414()` check. This does not merge Contacts and Deploy into one endpoint.

Deploy protocol 414. No reseeding, permissions migration, publication, session clearing or 3D geometry change. The specialist capacity-sharing rule remains unresolved where previously flagged; its formula has not been changed.
