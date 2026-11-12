# Active-staff authority readiness — Package C, simplified after C1

Model: Codex. 13 November 2026 SGT. **Design only; no query, report, store or cutover implemented.** ChatGPT selects Claude's C1 recommendation, as requested by the owner: one bounded consistent read inside the Contacts owner, then a cutover epoch recheck. This supersedes the manifest/page/cursor protocol in the original PR134 design at `b0abd003fceb59b4a8dd21904049f177b53c935a`. Review/owner source: `docs/coordination/review/pr134-claude-review.md` at `afae51b4037fc14447a1d70a046b76321fd96be3`. C must be scoped against this simpler design before any implementation begins.

The school has roughly 150 staff according to C1. Cross-service per-person fetching, manifests, root/page digests, ordinals, cursor validation and a pagination state machine are unnecessary at that scale. Pagination is deferred unless a measured directory exceeds one bounded owner read; that would require a separately reviewed extension, not an automatic fallback.

## Ownership and population

Contacts owns staff, accepted active status, the three authority records and their dependencies. The [EO plan](EO_AUTHORITY_READINESS_PLAN.md) governs classification. Either Admin or Contacts Power User may invoke the same-school read; neither role can bypass isolation, input validation or coverage checks. [Acceptance](AUTHORITY_ACCEPTANCE_DESIGN.md) remains audited and disallows self-acceptance, with no separate Admin approval or notifications.

Every active staff member, including provisional and unlinked entries, must be checked. Inactive entries may appear in a separate informational section; blank authority records on them do not block. Active=false must be accepted and effective at evaluation time. Unknown, malformed, expired or otherwise unverified active status cannot silently exclude a person. Do not substitute date-scoped Roster activation for Contacts employment status. No default or bulk false values are written.

Current `v1/contacts/accepted-facts.mjs` is an injected per-person reader, not an owner-side database or directory enumeration service. No authoritative v1 Contacts store exists in this repository. This design proposes an interface for the future owner, not a query against current production.

## One consistent owner read

Proposed versioned operation: `readAuthorityReadiness({schemaVersion:1, schoolId, requestId})`, accepted only through a trusted authenticated service boundary. The caller cannot provide the staff list or policy classifications.

The owner reads all directory IDs and their active/authority records, dependency revisions and the population/authority epochs **from the same consistent snapshot**. A single joined/aggregated database query or an actual supported read-transaction snapshot may supply this result; independent SELECTs without snapshot consistency do not satisfy the contract. Specify and test the chosen storage API when a store is scoped. Query execution must not write, repair or increment content revisions.

Minimum internal result: schemaVersion, schoolId, requestId, source identity, read time, populationEpoch, authorityEpoch, dependencyEpoch, complete directory count, explicit completion indicator, and each permanent Staff ID's active-status record, SMC/EO/School Leader records, field/source/dependency revisions and intervals. The owning query must distinguish no record from a failed join; it cannot infer false. Include inactive identities/statuses to prove exclusion and detect unknown status, while avoiding unrelated personal fields. Minimal dependency data must suffice to validate meaning and MKE+SMC consistency.

Initial proposed bounds: at most 512 staff, 1 MiB serialized response, 8 MiB evaluator state, one in-flight owner read and a 2-second read deadline. These cover the stated school size with headroom and need measurement against the future real store. Fetch at most cap+1 or obtain an authoritative count in the same snapshot; exceeding a cap is incomplete, never a truncated success. A failed read returns incomplete. No automatic retry loop or background scan job; a manual retry starts a new evaluation. Late results from abandoned requests cannot replace a newer report.

The owner-side evaluator chooses one server `evaluatedAt` after obtaining the snapshot, then validates every staff member's active status and every active person's three authority records at that instant. Explicit accepted false is complete. Missing/pending/rejected/superseded-only is missing accepted authority; future/expired/revoked accepted records remain distinct noncurrent evidence and block active-person readiness. Malformed or ambiguous records, duplicate Staff IDs, incomplete dependencies or MKE+SMC inconsistency block or make coverage incomplete as appropriate. No name/tag inference.

Use the existing field/interval validation rules where applicable, but do not call the per-person T1B reader hundreds of times. An owner-side read/evaluation does not fill its 128-stream cache at all. Test more than 128 people to prove coverage, not merely cache resets. A future service adapter still needs owner-authenticated source and freshness evidence; bypassing a cache does not establish durable freshness.

## Epoch and time rechecks

Contacts atomically advances populationEpoch on active-population additions, removals and reactivations, authorityEpoch on relevant accepted authority changes/revocations, and dependencyEpoch on interpretation changes. Equal final counts/values cannot hide an intervening change. A restored source also needs an attested generation/anti-rollback mechanism before service resumes. Observations alone do not advance these epochs.

After evaluation, recheck current epochs at the owner. A change during the read/evaluation invalidates the result and requires a fresh complete read. Before cutover, perform the same epoch comparison against the report and reject changed, expired or unavailable evidence. No manifest, pagination or per-person cursor state is involved.

A ready report expires no later than the earliest relevant active-status/authority interval transition, including a scheduled reactivation on an inactive person, or five minutes after evaluation. Time-based transitions can invalidate readiness even without a content-epoch change. A report lifetime is not an audit-retention policy. Cutover checks server time as well as epochs.

| Result | Meaning |
| --- | --- |
| Ready | Complete owner snapshot, known effective statuses, all active records complete/consistent, final epochs unchanged; report carries school, request/report ID, epochs, evaluatedAt, validUntil and counts |
| Blocked | Complete coverage but active staff have missing/noncurrent/inconsistent authority; report includes restricted issue rows and counts |
| Incomplete | Read failure, over-limit/truncation, malformed identity/coverage, unknown status, inconsistent snapshot, changed/unavailable epoch or expired evidence; partial counts never imply zero blockers |

Reactivation before the read is included as active. Reactivation during evaluation invalidates it at recheck. Reactivation after report generation invalidates it before cutover; a reactivated person's Contacts-derived access with incomplete records is denied with AUTHORITY_EVIDENCE_MISSING until acceptance is complete. Completing records permits capability evaluation, not an automatic grant. Independent Core Admin access remains independent; the global gate does not add a per-request Admin dependency.

**Remaining cutover interval:** a successful epoch recheck is evidence at that instant, not a lock on a later commit in another database. If the cutover state is owned by the same transaction boundary, require the epoch comparison and that state transition to be atomic. If it is elsewhere, the integration must define and prove its commit coordination or obtain explicit acceptance of the remaining race. This design does not add cross-D1 locks, leases or reservation machinery. No claim of cross-D1 atomicity; unresolved commit coordination remains a later integration gate.

## Privacy and future tests

Restricted report rows: school, Staff ID, necessary display name, active status, issue fields/reasons and revision references. Show only to authorised same-school Admins/Contacts Power Users; keep staff rows out of Git, CI and public denial responses. No notification delivery or new export workflow. Retention remains a separate owner decision before durable storage.

Required future tests (Not tested by this document):

- A consistent snapshot of 150 and 257 synthetic staff covers every active ID once without per-person T1B reads or 128-stream exhaustion. All inactive with known effective status may yield zero active blockers; unknown status may not.
- Inactive staff with blanks do not block; active provisional/unlinked staff with missing records do. Explicit false is complete; no default writes occur.
- Staff cap+1, oversized response, duplicate ID, failed/partial owner read, missing joined data and inconsistent count return incomplete, never empty-ready.
- A mutation attempting to interleave within the owner read cannot produce mixed epochs/rows. Validate this against the real chosen snapshot API; a mocked array cannot prove database consistency.
- Reactivation during read/evaluation, after final read, and after report publication invalidates readiness. Active->inactive->active with equal final count is still detected by epochs.
- Scheduled active-status or authority interval transition invalidates at validUntil without relying on an epoch increment. Accepted future/expired/revoked records are distinguished from missing evidence.
- Authority/catalogue change, rollback/restored source generation, epoch-read outage and expired report cannot certify cutover.
- Reactivated incomplete staff receive exact AUTHORITY_EVIDENCE_MISSING/403/non-retryable on the derived path; independent Admin and read-only preview semantics remain unchanged.
- Race after preflight but before an external consumer commit demonstrates the residual interval; do not call it solved by a single read. A same-owner conditional cutover transition must reject a changed epoch atomically.
- Restart discards a partial in-memory evaluation. A retained report needs fresh epoch/time checks; report counts alone cannot recreate readiness.

## Proposed next scope, not implementation authority

Propose one isolated library/query-contract task with these exact paths after coordinator approval: `v1/contacts/readiness-contracts.mjs`, `v1/contacts/authority-readiness.mjs`, `tests/v1-contacts-readiness.mjs`, `tests/v1-contacts-readiness-races.mjs`, `tests/v1-contacts-readiness-isolation.mjs`, `docs/v1/contacts/AUTHORITY_READINESS_SCAN_DESIGN.md`, `docs/coordination/tasks/v1-authority-readiness-contract.md`, `docs/coordination/LANES.md`. Inject one consistent owner-read operation and one epoch-recheck operation. No pagination, per-person network fan-out, new store, Worker binding or production reader is in this proposed scope. Real query implementation needs its own exact scope once the owning store is chosen. Official T1B-01/T1B-02 and runtime UAT remain Not tested; F5 remains OPEN.
