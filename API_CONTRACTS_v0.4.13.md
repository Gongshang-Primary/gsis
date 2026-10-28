# GSiS v0.4.13 API contracts

Deploy protocol 413. No new backend route, field, membership change or data migration.

- Layout Excel export consumes the same captured, authorized snapshot as the displayed SVG. Deploy uses the selected version/current draft; public Layout uses its loaded active deployment. The template loads lazily from same-origin static assets. Export makes no backend read or write. Changing versions during template loading cannot mix snapshots.
- Worksheet content is literal cell text, including formula-looking labels. Room IDs, names and allocations remain editable. Unknown geometry is listed on the same sheet; ambiguous mapping never silently overwrites another venue. Spreadsheet edits are independent of GSiS.
- IP cell positioning changes presentation/focus only. Existing queue, save, receipt, conflict, permission, recovery and same-origin behavior remains unchanged.
- Matching Deploy frontend/backend protocol 413 is required for writes. `prepareContactsPerformance413()` calls the existing v0.4.10 preparation routine. Earlier aliases remain available.

The v0.4.12 table-export and Workload-rendering contracts continue unchanged.
