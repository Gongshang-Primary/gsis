# GSiS v0.4.11 API contracts

Deploy protocol 411. Existing signatures, domain identity checks, current role authority, same-origin mutations, journals and per-field conflicts remain.

| Route / action | Contract |
| --- | --- |
| GET /api/recovery-status → recoveryStatus | Signed school identity; returns canRecover=false with no journal details to non-Admins. Admin-only review of current pending journal entries, saved field changes and additions. Runs before the full-directory recovery fence; does not return a partial contact directory or replay writes. |
| POST /api/recover-save → recoverSave | Only requestId and digest accepted. Current Admin permission is rechecked under the writer lock. Locates the original durable payload; validates digest, journal/pointer identity and current values; resumes that request with the original actor. No client-supplied replacement payload. |
| Recovery acknowledgement | saved=true with original requestId; duplicate=true for an already Applied request. Pending pointer is cleared only after durable completion. Recovery response contains no full-directory snapshot. |
| Recovery audit | contact_save_journal retains A:G unchanged except the existing Pending→Applied status. H:I record Recovery actor and Recovery started. A failed attempt remains Pending and records the attempting Admin. |
| Contacts recovery failure | CONTACTS_RECOVERY_REQUIRED, HTTP 503. Full directory/data reads remain fenced. The same code/message crosses the Contacts→Deploy boundary. A definitive pre-write block marks the new unsaved draft editable; a journaled original save remains protected. |
| Recovery conflict/integrity failure | No pending-marker clearing; no successful acknowledgement. Reopen review or investigate the preserved journal. |
| Transport | Recovery writes use the existing 75-second browser / 60-second gateway budget, no automatic mutation replay. Status is a bounded read. Generic Deploy failures distinguish timeout, HTTP, invalid response, configuration and interrupted connection with safe diagnostic references. |

Ordinary save receipts, same-ID retry semantics and staff cache invalidation remain. Recovery uses the original server journal, not persistent browser storage. Existing pending catalogue publications are not reclassified as Contacts saves.
