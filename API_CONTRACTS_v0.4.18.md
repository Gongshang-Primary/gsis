# GSiS v0.4.18 API contracts

Deploy write protocol stays 415. Existing authenticated routes, identities, permissions, optimistic validation, receipt recovery and publication semantics remain in force. Mobile No and Statutory Name remain Contacts-owned; Deploy profile fields are Basic Name, Role, EO Appt Level, Appointment Status, Employment Modifier, Subject Modifier and Active. Staff ID remains the join key.

Ordinary snapshots with `auditPaged:true` use an optional committed `viewIndex` projection. It retains layout and planning data while excluding Audit, receipt and author-history payloads before reconstruction. Privileged conflict notices are read from indexed event ranges and filtered through existing per-user acknowledgements. Teachers do not read notice ranges. Unpaged Admin reads and Audit detail keep the canonical path.

New publications atomically freeze canonical, view and `activeIndex` teaching-export stores. Unpublished edits cannot change published exports. Projection writes participate in the same durable journal and pending-commit marker as canonical updates. Readers check the version commit and global revision before/after a projection read. Missing old projections fall back to the existing full read; malformed/missing declared projections fail explicitly.

Editor-only `preparePerformance418()` builds projections for existing field stores, including the frozen publication. It preserves version revisions, publication commits, receipts and deltas. Its index update is journalled and recoverable, and a rerun is safe. Legacy chunk stores remain readable; use existing field-store migration if they also need this optimization.

Contacts bootstrap batches admin_users, roles and contacts on a cache miss, then reuses those values only within that signed request. Shared cached directory data never contains actor authority; admin_users is always read fresh. Existing 30-second directory TTL, mutation epochs, pending-save/recovery guards and response fences remain unchanged. Pure-read batches omit a flush only after recovery completed; writes and structural operations retain flush ordering.

Signature generation remains local canvas rendering with the unchanged supplied 1000×200 PNG and Outfit fonts. The guide and screenshots are static content; no Gmail, Outlook or Drive account API is introduced. Classes & TGs uses existing selected-version definitions with no additional fetch.
