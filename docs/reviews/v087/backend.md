# v0.8.7 Roster backend review

## Implemented

- Signed-in acknowledgements validate the authenticated teacher and exact published notice instead of the whole Roster revision. Another teacher's acknowledgement or unrelated save no longer causes a revision conflict. Existing domain validation still rejects superseded and foreign notices.
- `acknowledgementStatus` returns only the current teacher's notice metadata; SMC/Admin privileges do not expand this endpoint. It does not load timetable source models, reconcile allocations, or build the full duties view.
- Compact acknowledgement responses and `receiptStatus` include the original accepted notice identity, accepted revision/time, and the current notice. An older durable receipt cannot acknowledge a newer publication. Exact request retries do not write again; a repeated notice with a new request does not create another acknowledgement or change its original timestamp.
- Absence save preparation, source/model reads and reconciliation run outside the allocation writer lock. Under the lock, the adapter reads current state, checks the immutable-source manifests, dependencies, minute/date and receipt, merges, then commits attendance and allocation consequences together. New independent reports retain the existing stale-revision tolerance; edits retain conflict protection. No-baseline reports still save and resolve against a later timetable.
- Added transport-store read overlay and service-dispatch interception hooks. No transport lock is acquired by the operational adapter.
- Added pending/ready timetable-cache commit hooks around the durable operations write, and the restricted Statistics dispatch hook.
- Daily employment mail now requires a configured HTTPS Roster origin before claiming a job. It accepts the authenticated service's origin when the script property is absent, and supplies that origin to the Daily Notify link renderer.

## API contract

`acknowledgementStatus` input: `{ operation, date? }`. Output: `{ date, today, revision, checkedAt, notice }`, where notice is null or `{ id, date, publishedAt, status, acknowledgedAt, snapshotIds, publicationRevision }`.

`acknowledge` input: `{ operation, date, timetableNoticeId, snapshotIds: [], compact: true, requestId, revision? }`. The whole-document revision is not the acknowledgement precondition. Output adds `{ acknowledgementOnly: true, requestId, acceptedAt, acceptedRevision, acceptedNoticeId, savedIds, acknowledged: { timetableNoticeId, snapshotIds, acknowledgedAt }, replayed? }` to the status fields. `acceptedNoticeId` always refers to the submitted notice; `notice` can be a newer current publication when recovering an old receipt.

`receiptStatus` input remains `{ operation: 'receiptStatus', command: originalCommand }`. An accepted acknowledgement receipt exposes these fields at the top level, with `accepted: true`, `confirmation: 'accepted'` and `currentRevision`. No receipt means unconfirmed, not a failed or cancelled original request. A superseded acknowledgement returns HTTP 409 and requires reviewing the new notice.

## Verification

Host simulations passed:

- `node tests/roster087-scoped-ack.cjs`: 6 focused checks covering current-user scope, no model/context loads, simultaneous old-revision acknowledgements, duplicate/replay timestamps, foreign/superseded notices, durable uncertain-response recovery, and old receipt versus a new publication.
- `node tests/roster096-absence-adapter.cjs`: parallel stale new reports, unlocked preparation, locked duplicate protection, lost-response replay, protected edits, no-baseline storage and later timetable resolution.
- `node tests/roster081-day-transactions.cjs`: 18 checks including 1/10/30 simulated concurrent notification requests, source-manifest revalidation, proposal rebuild, same-day conflicts and uncertain commit replay.
- `node tests/roster710-mail.cjs`: durable claim/send boundaries, uncertainty protection, recipient refresh, configured-origin readiness and authenticated service origin.
- `node tests/release084-report-backend.cjs`: compressed baseline and suspended report transport and mutation compatibility.
- `node tests/roster702-backend.cjs`: read-only projections, diagnostics, historical reads and signed service boundaries.

## Limits and integration review

No production records, WhatsApp messages or emails were changed. These tests establish invariants, not live Apps Script/Drive latency. The operations document remains one atomic attendance/allocation authority. The retained dependency fingerprint is conservative and can rebuild an absence proposal when other planning data changes; retries remain bounded and preserve the same request ID. Editable absence records retain their existing global revision guard. Further row-scoped conflict relaxation requires a separately reviewed domain dependency map.

The transport-store module must keep primary cancellation/business intent authoritative when overlaying independent delivery state. The cache module must leave its marker pending if the durable write or ready-marker update is uncertain. The coordinator owns build inclusion, shared Statistics tracking, Worker read classification, UI receipt integration and full combined release verification.
