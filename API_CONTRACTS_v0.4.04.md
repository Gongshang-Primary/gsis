# GSiS v0.4.04 API contracts

Authenticated requests retain the signed-envelope and school-identity checks. Deploy mutations require **protocol 404**, rejecting older clients with an update/reload message. Install the matching suite together. Public Layout and the Contacts `active` export retain their existing entry points.

## Saves

`change` / `saveDraft` accepts the existing stable field edits, `requestId`, `issuedAt`, `clientId` and `versionId`. The 24-hour retry acceptance window, exact-payload receipt checks, editing leases and expected-value checks remain. PLT and other planning patches reject stale values on the same field; supported legacy field actions retain latest-server-save conflict reporting.

New optional fields: `returnDelta: true`, `since` (loaded version revision), `authority` (loaded roles), `auditPaged: true`. A successful acknowledgement can include `delta` only when `since` matches the immediately preceding revision. A changed authority returns a resync hint. Other baselines use the existing authorized delta endpoint. Receipt recovery never applies a second mutation. A display failure after acknowledgement remains **Saved · refresh needed**.

Version notes use the independent `saveVersionNote` operation with `expected`, `notes`, original save ID and timestamp. `versionNote` reads only current indexed note metadata for conflict review. Notes do not publish a version or replace unrelated fields.

## Audit

`auditPage` is Admin-only and version-scoped. `{versionId, cursor?}` returns at most 40 summaries, `total` and an opaque continuation cursor. New summaries carry an event row and audit epoch. `{versionId, detailId, row, epoch}` reads the selected event's before/after values. New appends preserve an existing page window; clearing the log invalidates its old epoch. Old stores have a compatible paged response until indexed by maintenance or a successful save.

Audit is excluded from new-client baseline/delta payloads when `auditPaged` is true. Only Admin sees the Audit page or may purge; direct KP purge requests are denied. Purge applies only to the selected version and does not remove save receipts or the frozen published snapshot.

## Access and publication

Basic teachers cannot call Deploy bootstrap, sync, delta, access, version-note, receipt or mutation routes. Their published projection remains available through Contacts. Admin or KP may edit unpublished deployment data. Existing stricter Admin gates for publication, Membership/master HR choices, Offload, version deletion and audit access remain. Contacts HR editing rights are unchanged.

Version summaries include `publication` (`Unpublished` / `Published`) and `publishedRevision` where that version supplies the in-force snapshot. The saved working commit and the frozen published commit are compared; an active ID alone is not proof that a working revision is published. Saving an edit retains the prior in-force Contacts/Layout snapshot until explicit Admin publication.

## Storage and rollout

Canonical `fields_*` data remain authoritative. `fastidx_*` mirrors editable values and canonical positions, excluding receipt and audit-detail leaves. Its updates are in the same durable transaction as canonical fields, `auditidx_*` and `deploy_save_receipts`. Readers validate the index marker before/after reading. Four flush boundaries remain. Array order metadata and large object-key lists support chunking.

Receipts are located by exact request ID and read as one row or bounded contiguous chunks. Legacy embedded receipts migrate without deletion. `preparePerformance404` upgrades missing indexes without publishing or changing business values; it is safe to rerun. `prepareLegacyRollback` exports external receipts alongside canonical data before reverting old code. Do not restore an old backend directly over new-format field data.

Contacts uses `CONTACTS_PENDING_V2` for pending staff/approval journals. On first use it checks legacy journals once under the writer lock. Pending intent is recorded before any journal/data mutation; Applied is flushed before the pointer clears. Unrelated reads and writes are fenced during recovery, including a second guard after a writer acquires its lock. Catalogue recovery retains its existing durable pointer. Do not manually clear these properties.

See `PERFORMANCE_v0.4.04.md` for the complete write-path inventory, measured costs and limits.
