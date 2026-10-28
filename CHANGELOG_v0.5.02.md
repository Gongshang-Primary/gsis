# GSiS v0.5.02

The reported Contacts Admin was correctly authorised. A durable new contact save remained Pending after a service timeout, and sign in correctly fenced the unfinished transaction. Live inspection found the original payload intact, no completed new record, legacy formula template rows, and the same pending save after a recovery attempt. Execution logs were unavailable, so the exact slow Google operation is not proven.

Contacts now loads Admin data and save inputs through one fresh batch, avoids routine SpreadsheetApp flushes with Sheets API v4 enabled, and reserves new identities in one batch. Contact patches and the Applied marker share the final bounded write batch. Only the edited record's computed name and appointment level are replaced with application values. Existing phone formatting, unrelated rows, history tabs, HR catalogues and assignment data are preserved.

Save receipts remain available while directory reads are fenced. They verify the original journal payload and digest, permit the original editor to confirm a save, and permit a current Admin with the reviewed digest to confirm another editor's recovery. A busy writer returns promptly. Recovery and ordinary retries check confirmation before replaying the same request. Lost replies and late confirmations refresh both the editable Data page and Contacts directory.

Structured recovery errors reach the user immediately instead of repeating the same blocked read. The recovery table has a distinct export title and stays contained in the mobile sign-in card. The saved request, digest, original actor, optimistic conflicts and current Admin checks remain authoritative. No request is discarded or marked complete merely because it timed out.

prepareContactsPerformance502() is a read-only API readiness check that works with a pending journal. recoverContactsSave502() is an editor alternative to the reviewed Recovery action; its executing school account must be a current Contacts Admin and there must be one intact recoverable request. It reuses the same save logic and writer lock. Current Admin recovery of an older DIY journal uses its original Staff ID without guessing or rebinding the original Google subject.

All v0.5.01 Contacts columns, sort precedence, compact widths, mobile defaults and typography remain. Deploy and Layout retain their existing functionality, data ownership and protocol 500. The complete suite is packaged with matching v0.5.02 release labels.

Validation results and call budgets are in VALIDATION.md and PERFORMANCE_v0.5.02.md. Installation and the original live recovery remain required; this release commit does not publish Apps Script or Cloudflare deployments.
