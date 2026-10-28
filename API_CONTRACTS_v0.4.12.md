# GSiS v0.4.12 API contracts

Deploy protocol 412. No new backend route, spreadsheet field, membership change, data migration or workload formula is introduced.

- Column visibility, table snapshots and Excel generation run locally in the browser. Export reads the current authorized rendered values, including unsaved draft values; it does not query hidden backend fields or issue write requests.
- Exported columns follow displayed order; rows follow the current filtered/sorted result. Audit exports its loaded rows only. Grouped headers are flattened and merged values repeated into the corresponding rows for a rectangular workbook.
- Literal strings are OOXML inline strings, never executable Excel formulas. Numeric values use numeric cells where appropriate; phone numbers and identifiers remain text. No workbook import or synchronization contract is added.
- Deploy/Contacts save, receipt, conflict, permission, same-origin and recovery contracts from `API_CONTRACTS_v0.4.11.md` remain. Matching Deploy frontend/backend protocol 412 is required for writes.
- `prepareContactsPerformance412()` calls the existing v0.4.10 preparation routine. Earlier preparation entry points remain compatible; existing backups are reused.

KaTeX 0.18.9 is bundled locally with its fonts and license. The renderer uses escaped plain-text fallbacks and non-trusted rendering; no runtime external math service is called. Missing or invalid workload values remain unavailable/conflicted rather than being coerced to zero.
