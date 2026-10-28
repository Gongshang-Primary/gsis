# GSiS v0.5.02 performance and reliability

The reported Admin has active Admin access. The live Contacts journal contains an intact Pending addition; the record was not completed. Legacy formulas remain in the main sheet, including the two empty template rows. The old save and recovery paths alternate native writes, API reads and explicit SpreadsheetApp flushes. These are avoidable service boundaries and likely contributors to latency; without Apps Script execution logs, no particular operation is identified as the sole cause of the live timeout.

## Measured call budget

scripts/measure502.cjs compares the tagged v0.5.01 backend with the new backend using the same synthetic 184-row workbook. The test starts with an existing addition-only Pending journal, legacy Appointment Level headers, blank school alias, a current Admin and available template rows. Counts exclude initial journal creation and are not production timing measurements.

| Operation | v0.5.01 | v0.5.02 |
| --- | ---: | ---: |
| SpreadsheetApp flush calls | 10 | 0 |
| Sheets API batch reads | 5 | 4 |
| Sheets API batch writes | 1 | 3 |
| Native value writes | 4 | 0 |
| Journal ID searches | 2 | 0 |
| Fresh save source batches | 0 | 1 |

The three new API writes are recovery audit, identity reservation and contact fields with Applied last. Existing journal pointers identify exact rows, avoiding repeated ID searches. Admin, roles, Contacts and optional sys_fields share a fresh source read; the save response reuses the loaded catalogue. Admin Data loading also uses one fresh batch and no flush.

Ordinary API saves use no SpreadsheetApp flush when the journal and table have capacity. Explicit sheet creation or expansion still flushes the structural change. The native fallback flushes its buffered writes at journal, reservation and completion boundaries. Unrelated formulas and history are not migrated during a save.

## Confirmation and recovery

Receipts bypass the directory recovery fence without exposing partial contact data. An Applied receipt resolves a lost acknowledgement; a Pending receipt reports whether the script writer lock is busy. A mutation waits at most one second for that lock, while confirmation polls are bounded to three checks within fifteen seconds. No mutation is automatically replayed by the transport. Transient reads retain one bounded retry; durable recovery errors return immediately.

Contacts patches precede the Applied marker, including across bounded batches and native fallback writes. With Sheets API enabled, the final patches and marker share an API request. An interrupted reservation or partial patch retains Pending and the same original request; replay resumes the stable Staff ID and rejects conflicting values. A damaged payload cannot be confirmed or replayed. After a confirmed save, the frontend refreshes both the grid and directory profiles, including role groups and formal role labels.

The call budget follows Google's guidance to reduce service calls and batch spreadsheet operations: [Apps Script best practices](https://developers.google.com/apps-script/guides/support/best-practices). Google documents request atomicity and bounded processing in [Sheets API usage limits](https://developers.google.com/workspace/sheets/api/limits). Per-request atomicity does not replace the original journal, lock or conflict checks across separate requests.

## Limits of verification

Fault injection covers acknowledgements lost after Applied, reserved IDs, partially written dirty spans, active writers, stale edits, damaged payloads, permission revocation, multiple additions and expired or changed browser sessions. Synthetic Chromium checks exercise the real backend logic through a test host. No production speed percentage or latency target is claimed. Actual Apps Script cold starts, Google permissions/quotas, network response times and recovery of the original live request must be checked after installation.
