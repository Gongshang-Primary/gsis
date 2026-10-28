# GSiS v0.5.03 performance and reliability

The v0.5.02 recovery work reduced flushes and service calls, but left directory availability dependent on a Pending journal. Further reports show that this was unacceptable and that saving could still fail in production. The code also retained native spreadsheet lookups between durable API writes. This release removes those avoidable commit boundaries. Apps Script execution logs were not available, so a particular Google operation is not identified as the proven cause of the reported timeout.

## Viewing during a pending save

Viewing does not acquire the writer lock or wait for recovery. New save journals include a verified source copy of Contacts, roles and validation options before mutation. A cold browser can read this prior complete source while a writer is active. Applied requests no longer select the old view, even if the response was lost before the pending property was cleared.

Legacy requests have no guaranteed before-image. Identifiable affected Staff IDs are omitted while the remaining directory stays available. A suitable existing Contacts backup is a fallback for a damaged legacy journal. If neither a verified copy nor a suitable backup is usable for a damaged legacy journal, the result is an explicitly unavailable empty contact view while sign-in remains available. The response explains the selected source through viewState; it does not silently claim that a legacy or backup view is current. Pending source reads do not change the journal or access records.

The read path checks its source marker around assembly and can repeat a read when the publication or save state changes. The access table remains current and separate from the saved display copy. A previously valid Admin cannot retain access through the snapshot after revocation.

## Durable API boundaries

These are the intended service boundaries for an ordinary Contacts save with Sheets API v4 enabled. Structural creation or expansion, if needed, completes before the first durable API request. Counts are operation structure, not production latency measurements.

| Path | Durable API writes | Contents |
| --- | ---: | --- |
| New save | 2 | Original journal and prior source copy; then all changed contact ranges, stable IDs and Applied |
| Existing pending recovery | 1 | Recovery audit, all changed contact ranges, stable IDs and Applied |
| Directory viewing while pending | 0 | Read only; no writer lock or recovery |

All sheet metadata, dimensions, capacity checks and native fallback ranges are prepared before those writes. The final Contacts commit is a single Sheets API values.batchUpdate and does not use the shared helper's 100-range split. This prevents an Applied marker from being sent in a later split request after some contact ranges have already committed.

Native fallback has different boundaries. It retains a separate durable Staff ID stage before field changes, then writes contact values and marks Applied last. It does not claim API atomicity. After an API error, the backend does not switch to native writes or silently replay the mutation.

New before-images add journal storage and a bounded preparation cost in exchange for continued viewing during an interruption. Payload size, source snapshot integrity and conflicts are checked before completion. No full source migration, backup deletion or formula recalculation is required to recover an existing addition.

## Confirmation and recovery

Receipts still check the stored request and digest. Current Admin recovery uses the original payload and actor. Busy writers return a structured response; the browser checks confirmation before replay, and bounded receipt polling resolves late Applied results. A conflict preserves the saved request for review.

The browser keeps viewing available during Pending state and disables contact mutation controls according to the backend's editable/viewState metadata. Refresh updates directory data without discarding local drafts or an immutable unconfirmed request. Recovery is an explicit Admin action inside the workspace.

The design follows [Apps Script guidance on batching service calls](https://developers.google.com/apps-script/guides/support/best-practices) and [Sheets API request limits and atomicity](https://developers.google.com/workspace/sheets/api/limits). Atomicity of one API request does not remove the journal, current access checks, writer lock or optimistic conflict checks across separate requests.

## Verification limits

Synthetic tests exercise busy writers, cold staff reads, saved and legacy source paths, partial writes, lost replies after Applied, stable IDs, corrupted saved metadata, current authority and local draft retention. Actual Chromium exercises the real backend code through a synthetic host, including recovery and a subsequent ordinary Admin update. All names and contact values in this evidence are synthetic.

The prepared commit and save integration tests verify the two-write and one-write budgets above, zero native spreadsheet access or API source reads after the first durable write, and more than 100 ranges in one final API request. The 140 functional regression scripts, 59 Apps Script syntax checks and final integrated Chromium run passed. No production speed percentage or service-level promise is inferred. Installation, Google permissions and quotas, real network delays, Apps Script cold starts and completion of any original live pending request require verification in the school deployment.
