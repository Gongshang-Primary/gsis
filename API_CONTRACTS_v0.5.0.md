# GSiS v0.5.0 API contracts

Deploy write protocol is 500. Install the matching frontend/backend together. Older writers are rejected so they cannot leave the new range metadata stale. Existing authenticated routes, identities, permissions, optimistic validation, receipt recovery and publication semantics remain in force. Mobile No and Statutory Name remain Contacts-owned; Deploy profile fields are Basic Name, Role, EO Appt Level, Appointment Status, Employment Modifier, Subject Modifier and Active. Staff ID remains the join key.

Ordinary snapshots with `auditPaged:true` use an optional committed `viewIndex` projection. It retains layout and planning data while excluding Audit, receipt and author-history payloads before reconstruction. Privileged conflict notices are read from indexed event ranges and filtered through existing per-user acknowledgements. Teachers do not read notice ranges. Unpaged Admin reads and Audit detail keep the canonical path.

New publications atomically freeze canonical, view and `activeIndex` teaching-export stores. Unpublished edits cannot change published exports. Projection writes participate in the same durable journal and pending-commit marker as canonical updates. Readers check the version commit and global revision before/after a projection read. Missing old projections fall back to the existing full read; malformed/missing declared projections fail explicitly.

Editor-only `preparePerformance418()` builds projections for existing field stores, including the frozen publication. It preserves version revisions, publication commits, receipts and deltas. Its index update is journalled and recoverable, and a rerun is safe. Legacy chunk stores remain readable; use existing field-store migration if they also need this optimization.

Contacts bootstrap batches admin_users, roles and contacts on a cache miss, then reuses those values only within that signed request. Shared cached directory data never contains actor authority; admin_users is always read fresh. Existing 30-second directory TTL, mutation epochs, pending-save/recovery guards and response fences remain unchanged. Pure-read batches omit a flush only after recovery completed; writes and structural operations retain flush ordering.

Signature generation remains local canvas rendering with the unchanged supplied 1000×200 PNG and Outfit fonts. The guide and screenshots are static content; no Gmail, Outlook or Drive account API is introduced. Classes & TGs uses existing selected-version definitions with no additional fetch.


Version-owned `setFortnight` also accepts the boolean field `enabled`. Only explicit `true` activates the fortnight block; missing flags and `false` mean weekly repeat. Retained inactive counts remain stored and are exported as inactive. The existing optimistic draft queue, save validation and version duplication govern both the flag and counts. No weekly workload formula adds these split counts.

Span of Control continues to admit existing KP/SMC or Admin users for Assignment and View. Its snapshot, assignment choices and unassigned population exclude MK. Single reporting officers, self/cycle rejection and version-owned draft saves remain enforced. Visibility layers do not rewrite relationships. Existing excluded reporting links are retained for review.

Contacts `deployment` first checks its own `contacts_current_deployment` tab after signature/domain authorization. That tab contains current assignment/class/group/duty data only. A configured feed is authoritative: bounded marker/chunk reads, SHA-256/schema checks and a final marker check prevent partial or mismatched data from replacing it. An absent tab retains legacy published-Deploy compatibility. Neither path changes directory details or imports workloads. `verifyCurrentContactsDeployment()` provides an editor-only readiness/count check.

## Scoped settings transactions

A nonempty saveDraft containing only setFortnight and/or setReportingOfficer reads a settings projection: identity/notes, pending unit rename, reporting, fortnight, loads, workload, teachers/drafts, membership and field authors. Compressed row ranges are optional index metadata. A store without them safely reads the existing full editing projection for its first settings save, then records the ranges. Normal and note saves maintain those ranges. The journal stores index/projection/canonical mutations atomically; recovery and revision fences are unchanged.

The scoped document does not invent absent planning roots. Its persistence skips unrelated roots and retains their canonical values and order. It skips offload migrations and assignment/group/duty reconstruction only for these operations, which cannot modify those fields. Fortnight validation, current staff/RO choice checks, single RO, cycle checks, expected-value conflicts and publication isolation still apply. initReporting takes the full authoritative Contacts staff path and full planning path. Current actor authority remains fresh on every signed request.

Layout workbook export can preserve ambiguous or missing IDs in an appendix, without modifying source records. This exception applies only to export. Existing backend venue, save and publication validation remains unchanged. Workload formulas and teacher/specialist categories are unchanged; Info presentation is now three independent pages.
