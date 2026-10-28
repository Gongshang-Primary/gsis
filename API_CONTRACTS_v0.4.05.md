# GSiS v0.4.05 API contracts

Deploy mutations require protocol **405**. Signed envelopes, current school-role checks, version scopes, exact-payload receipts, atomic journals, publication isolation and existing Admin gates remain.

## IP operations

All new UI operations use `change` / `saveDraft` with the existing `versionId`, `requestId`, `issuedAt`, `clientId` and edits array.

- `removeTG`: `groupId`, `expected` containing the TG definition and its teaching-assignment values. Reject stale or nonexistent TGs with 409. Remove only that group and assignments targeting it; never remove teachers or a form class.
- `moveClassBlock`: `formRef`, `form`, `venue`, `expected` containing current venue and attached TG IDs. Only starts from an unassigned class; rejects a class that has moved meanwhile. Moves that class and its attached TGs.
- `moveVenueGroup`: `from`, `venue`, `expected` containing source form classes and TG IDs. Moves all classes/TGs at that assigned venue and their assignment venue references. Destination groups merge without collapsing records. Blank destination separates classes using each TG's stable anchor.
- `addTG`: optional `anchorRef` identifies the master class independently of whole-level teaching context. Validate that the anchor exists and still occupies the selected venue.

Venue `forms` supports multiple classes; when present it is authoritative, while `form` mirrors its first entry for compatibility. Legacy single-form data needs no migration. Public campus allocations, class search and both 2D maps expose all classes in shared venues. Class rename/delete preserves unrelated venue members; class deletion remains subject to assignment/TG reference checks.

Structural expected-state checks reject intervening edits. Existing ordinary teacher-cell edits retain latest-server conflict reports. Receipts permit an identical successful save retry without a second mutation.

## Transport

Deploy change gateway: 60 seconds; browser per-attempt transport: 65 seconds; outer JSON request: 70 seconds. Writes are never automatically retried. Existing long reads use their 45/50-second budgets and a 106-second outer allowance. Layout reads use two full 28-second attempts with a 400ms pause; the contradictory 30-second outer deadline is removed. Layout rename remains a single attempt with existing resume semantics.

Gateways return a safe `diagnosticId` and `code` on transport/parsing failures. Logs include only category, route/action and upstream HTTP status, not teacher payloads or secrets. Reads tell the user to refresh; uncertain writes retain exact-save recovery instructions. Access failures do not retry.

Compact changes DOM layout only and does not call write APIs. Teacher records and published snapshots are unaffected by this release until the user makes an authorized edit/publication.
