# GSiS v0.4.10 API contracts

Deploy write protocol is **410**. HTTP conflict status remains 409. Payload schemas, stored role tokens, field store, journals, receipts and publication rules remain compatible.

## Contacts

- `saveData` / frontend `save-data` retains `{requestId, changes, additions}`. The browser freezes the serialized body for every uncertain retry. Only definitive pre-journal validation/conflict failures may mark a draft editable. No automatic write replay.
- `saveReceipt` / `save-receipt` remains an actor-owned lookup. Edit Info performs at most three probes within a 15-second overall confirmation window; a missing receipt is not proof a write failed. Retries retain the original request ID.
- The Contacts gateway allows 60 seconds for mutations, 25 seconds for ordinary reads, and 8 seconds for receipt probes. The browser allows 75 seconds for mutation requests, 28 seconds for ordinary reads, and 12 seconds for receipt requests; the confirmation loop further bounds its own probes. Session identity work happens before the gateway backend deadline.
- Gateway failures provide `code` and a random `diagnosticId`: timeout, upstream HTTP, invalid response, connection or configuration. No contact payload or raw upstream exception is logged. Responses include safe backend timing metadata. A generic transport failure never marks a draft safe to discard.
- `prepareContactsPerformance410()` is an editor-only maintenance function, not an exposed web action. It uses the writer lock and existing recovery guards to establish the Contacts backup. New edits to existing rows require that backup. Pure additions retain their append-only behavior; already journaled retries remain recoverable.
- Signed authority-only `deploySnapshot` reads current `admin_users` without scanning contact data or waiting for unrelated data transactions. It requires boolean `authorityOnly: true`; role data is never cached. Full-data reads remain fenced.
- Directory/staff caches use a 30-second TTL, bounded chunks and optional fallback. Data and catalogue epochs invalidate them. Manual Sheet edits may take up to 30 seconds to appear in cached reads.
- SMC is a Sys Admin display label for the existing stored `KP` role. The `kp` frontend operation and `setKP` backend operation are unchanged. No existing grant or membership is migrated.

## Deploy

- `auditPage` remains Admin-only, with 40 indexed summaries per page and explicit per-event detail reads. Cursor epoch/row checks remain; a pending write or changed commit marker rejects the read. Standard indexed list calls perform one initial and one final index check.
- Workbook opening, index reads, Audit list/detail and Contacts callback work have separate safe phase timings. Nested inclusive phases must not be added to compute total latency.
- Audit client state belongs to the selected version and authenticated session. Same-event requests share an in-flight/completed result within the loaded list; explicit Refresh replaces that list. Cached text never enters browser persistence.
- Published `active` export still requires a signed, current school identity. Its existing school-wide access does not require a second Contacts role callback. Private version reads and writes continue to use fresh authority.
- Explicit Save/Refresh semantics remain. Idle push/polling is not re-enabled.
