# GSiS v0.4.15 API contracts

Deploy frontend/backend writes use protocol 415. Existing save routes, HMAC envelopes, identities, actor checks, roles, request IDs, optimistic field comparisons and journal formats remain unchanged.

`backend/SheetsIO.gs` is embedded once in each combined backend. It uses the enabled advanced `Sheets` v4 service for bounded value reads and changed-range writes; it is not a new public route. `prepareSheetsAPI414()` is an editor-only read check in both projects.

- Deploy: `fieldApplyRows_` batches the same journaled field, projection, receipt and audit-index ranges. Sheet capacity is ensured first; the pending commit marker remains until all batches succeed. The final index marker is written afterward. Partial failure is recovered using the original journal.
- Contacts: `saveContactData_` collects dirty spans across edited rows after validation and stable identity reservation. Those spans are batched before the journal is marked Applied. Other callers of the dirty-row helper gain per-row batching. Catalogue projection batches across its changed sheets before advancing the publication revision.
- API writes use RAW. The Contacts helper removes only its own formula-escaping prefix before RAW writes; a formula-looking user string remains literal. Leading-zero strings, booleans, numbers and explicit blank clearing retain their types. Formula and formatting operations are not rewritten as blanket value updates.
- Read helpers restore omitted trailing rows/cells to the requested rectangle. Contacts uses formatted strings; field storage uses unformatted values. Multiple note-projection ranges are read together.
- The absent-service compatibility path uses the existing SpreadsheetApp methods. Once an API call is attempted, errors propagate to the existing recovery flow; no hidden write fallback or automatic append replay occurs.

## v0.4.15 additions

- Deploy `POST /api/acknowledgeNotices`: signed school identity with current Admin/SMC (stored KP) authority; `{versionId,eventIds}`. Each event must be a saved-value notice affecting that same editor in that version. Returns `{acknowledged,versionId,eventIds}`. Persistent private Script Property keys and a snapshot-cache epoch are updated. No deployment revision, assignment, audit or receipt is deleted. Repeating the same acknowledgement is safe; other editors/versions are rejected.
- Contacts bootstrap adds `signatureSettings: {subjects,revision}` and each directory contact’s `formalRole` from the published Membership catalogue’s Formal Role Name. Published assignment data still comes only from the existing deployment route.
- Contacts `POST /api/save-signature-settings`: current Admin only; `{subjects,expectedRevision}`. Validates the agreed full-name subject catalogue and performs one locked Script Property write. Identical selections are idempotent; stale differing selections return 409. SMC/Teacher cannot write this setting.
- PNG rendering and download are local to the signed-in user’s browser; no signature generation/write endpoint or additional personal fields are introduced.
- Specialist settings normalize legacy modifier pools to assignment-based pools. General workload ledger, quota/status and caps retain their existing definitions. Multiple subject targets do not share or subtract remaining capacity.

Existing edited-cell positioning, editable layout Excel export, Compact, table filtering and visible-order exports remain in place.
