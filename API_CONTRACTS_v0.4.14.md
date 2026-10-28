# GSiS v0.4.14 API contracts

Deploy frontend/backend writes use protocol 414. Existing routes, HMAC envelopes, identities, actor checks, roles, request IDs, optimistic field comparisons and journal formats remain unchanged.

`backend/SheetsIO.gs` is embedded once in each combined backend. It uses the enabled advanced `Sheets` v4 service for bounded value reads and changed-range writes; it is not a new public route. `prepareSheetsAPI414()` is an editor-only read check in both projects.

- Deploy: `fieldApplyRows_` batches the same journaled field, projection, receipt and audit-index ranges. Sheet capacity is ensured first; the pending commit marker remains until all batches succeed. The final index marker is written afterward. Partial failure is recovered using the original journal.
- Contacts: `saveContactData_` collects dirty spans across edited rows after validation and stable identity reservation. Those spans are batched before the journal is marked Applied. Other callers of the dirty-row helper gain per-row batching. Catalogue projection batches across its changed sheets before advancing the publication revision.
- API writes use RAW. The Contacts helper removes only its own formula-escaping prefix before RAW writes; a formula-looking user string remains literal. Leading-zero strings, booleans, numbers and explicit blank clearing retain their types. Formula and formatting operations are not rewritten as blanket value updates.
- Read helpers restore omitted trailing rows/cells to the requested rectangle. Contacts uses formatted strings; field storage uses unformatted values. Multiple note-projection ranges are read together.
- The absent-service compatibility path uses the existing SpreadsheetApp methods. Once an API call is attempted, errors propagate to the existing recovery flow; no hidden write fallback or automatic append replay occurs.

Workload/venue/filter/Compact changes are frontend-only. Actual assignments, school standard, quotas, rounding, specialist pools and capacity-sharing rules are unchanged. Q90's edited-cell restoration and the editable layout Excel export remain in place. Table exports use visible columns and displayed filtered row order.
