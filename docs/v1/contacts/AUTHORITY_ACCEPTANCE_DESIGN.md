# Contacts authority acceptance — Package B design

Model: Codex. 13 November 2026 SGT. **Design only; not an implemented writer, store or migration.** ChatGPT coordinates v1; Claude reviews the exact documentation head. Source queue: `docs/v1/CODEX_WORK_QUEUE_2026-11-13.md` at `110bf5838b4a9c95735d503f42587dd0d1f34a40` (unmerged PR132). The owner's later instruction authorises this design/publication, not B implementation. Baseline inspected: `e996dfdb3a69bee76355ba60500468679d0963de`; existing `v1/contacts` contains only contracts, accepted-facts, catalogues and core-provider. There is no authoritative v1 Contacts persistence implementation to extend.

This design implements the requirements of the merged [EO plan](EO_AUTHORITY_READINESS_PLAN.md) in a future scoped task. The owner’s own review is the verification source; the existing Contacts Power User accepts records. It is not an HR import or tag-derived grant. Core's current Deploy capability resolver cannot stand in for a Contacts write-capability resolver.

## Ownership and proposed interfaces

Contacts owns staff identity, accepted facts, proposals, approval lifecycle, content revisions, operation results and acceptance audit. Core owns account/session/linkage and independent Admin status. The future authenticated service boundary obtains current Core identity/capability evidence; browser input supplies neither authority nor actor identity. Deploy has no acceptance permission. Never import a production gateway into the isolated library.

Proposed versioned command envelope (`schemaVersion: 1` is for this new interface, not an edit to existing read schemas):

| Component | Required binding and validation |
| --- | --- |
| Trusted context | service identity, schoolId, actorAccountId, actorStaffId resolved uniquely from Core/Contacts linkage, linkage revision, current session reference and Contacts capability evidence. No aliases supplied by the caller. Ambiguous/unlinked actors cannot accept. |
| Subject | schoolId and permanent staffId; same school as trusted context; no names as keys. |
| Proposal | proposalId and proposalRevision, field (`smc`, `eo`, `schoolLeader`), explicit boolean value, validFrom and exclusive validUntil/null, source owner-review reference, authenticated proposer ID, subject, expected accepted-field revision (or explicit no-record precondition). Exact shape; reject unknown versions/keys. |
| Acceptance | operationId, proposal reference/revision, expected subject/source revision, approval reference if required. Intent digest binds all immutable intent above plus actor and command kind. Exclude retry time and fresh observation times from intent identity. |
| Admin approval | immutable approvalId/revision, approving account and resolved Staff ID, same-school subject/proposal digest, grant time, validUntil, and revocation state/epoch. No bearer approval trusted solely because its ID exists. |
| Result | `applied` with operationId, accepted revision/source sequence and audit reference; `rejected` with a bounded reason; `conflict` with no fabricated success; `unknown` when delivery/commit outcome is not established. Receipt means received, not applied. |

Do not encode staff records in operation IDs. Bound command size to 16 KiB, one subject and one authority field per ordinary command; a related status/section/appointment consistency update is an explicitly bounded owned write set (at most 8 fields, never a whole-directory bulk update). No default authority records. Single requests are not permission to create new catalogue definitions.

## Capability and state matrix

| Actor/action | Allowed condition | Reject condition |
| --- | --- | --- |
| View proposal/history or reconcile own operation | Current same-school Contacts Power User or Admin, minimum subject scope | Unauthenticated, wrong school/service, unrelated consumer or revoked capability |
| Propose | Same-school authorised Contacts Power User/Admin; capture proposer and owner-review reference | Proposed identity or permission supplied by form; unrecognised field/value; no accepted source of verification |
| Accept EO true/false, SMC=false or SL=false | Current Contacts Power User (or Admin authorised for this function); accepter uniquely linked and not subject | Self-acceptance for any value; missing or ambiguous linkage; expired session; preview/impersonation |
| Accept SMC=true or SL=true | Above plus valid non-subject Admin approval bound to unchanged proposal | Missing/stale/revoked/wrong-school approval, mismatched value/interval/revision, subject approving own record |
| Approve elevated proposal | Current same-school Admin, uniquely linked and not subject | Power User only; subject/alias of subject; stale Admin proof |
| Revoke approval | Same-school authorised Admin; append revocation/advance approval epoch | Mutation without authority or attempted erasure of prior audit |
| Edit already accepted record | New proposal/revision with expected-version checks, same permissions | In-place rewrite of immutable history |
| Export or read another school's evidence | Not permitted by this contract | Always reject; no administrative bypass across schools |

A non-subject Admin may approve and accept; a distinct proposer is recorded but not universally required. Self-acceptance prohibition compares permanent Staff IDs, including alternate accounts and Admins. No bootstrap exemption. If no eligible non-subject approver exists, remain blocked; this design cannot manufacture one.

EO employment status, school section and appointment are separate accepted facts. MKE is EO employment in MK without the primary-school EO tag and must not be SMC. Reject an attempted accepted MKE+SMC=true combination against the current subject consistency revision; do not merely warn after committing. A concurrent section change is a competing write to that same consistency revision. 4/5 and Full-time are arrangements, not authority. No requirement to populate Non-EO arrangements for this purpose. Per-person owner review and accepted evidence remain mandatory; category labels are not runtime proof.

| State | Transition / observable result |
| --- | --- |
| Proposed | Editable through a new proposal revision; not authority |
| Awaiting approval | Elevated true value has no valid bound approval; cannot accept |
| Approved | Bound approval exists; still not accepted authority; revalidate at acceptance |
| Applied | Atomic accepted revision + audit + operation result committed; immutable |
| Rejected/conflict | No accepted effect; reason recorded under bounded operation/result policy |
| Unknown to caller | Timeout/disconnect; state may be Applied; reconcile original operation before retry |
| Superseded/revoked | New accepted revision or recorded revocation, never deletion of history |

## Atomic boundary and concurrency

Recommended future persistence: one Contacts-owned transactional store for proposals, approvals/revocations, subject consistency revisions, accepted records, content/group/source revision changes, acceptance audit and idempotent operation results. This is a logical design, not a chosen existing D1 binding. If D1 is selected later, implement conditional SQL and all dependent writes in one supported transactional batch with constraints/guarded inserts. A SELECT followed by an unconditional batch is insufficient; do not rely on interactive transactions spanning Worker calls.

1. Parse/bound intent; authenticate the service and current actor; resolve actor/subject IDs and permissions. Obtain a fresh Core authority observation. Stable operation identity is chosen before any write.
2. Look up the school/operation ID under authenticated access. Same intent and applied result returns that immutable result, not another acceptance. Different intent rejects. A replay query must not expose results to an unauthorised actor. Recording a prior successful result is not a new grant or new write.
3. At the owning atomic commit, assert expected subject/field/source/proposal revisions; compare trusted actor Staff ID with subject; assert required approval is still active and bound, and its revocation epoch has not changed. Assert MKE/section consistency and schema/interval invariants against stored state. Revalidate the current Contacts-local permission/approval epochs used by the command.
4. Atomically append the accepted revision and link any supersession, advance affected content/field/group/source revisions and sequence, append immutable acceptance audit, and install the definitive operation result. Source sequence advances for content change, not for later observations or idempotent replay. A guard failure changes none of these.
5. Return `applied` only from the durable result. A lost reply returns unknown to the caller; reconcile by the same operation ID. Do not allocate a replacement ID on retry.

**Cross-domain limit:** Core Admin/session/linkage revocation is not atomic with a Contacts transaction in another database. Recheck current Core evidence immediately before submitting the owned transaction, bind its revision/expiry into the acceptance evidence, and reject stale responses. This reduces but does not eliminate the check-to-commit interval. The later integration task must specify and test its authority fence/lease protocol or explicitly approved remaining risk before go-live. Do not invent a lock across D1 databases. Contacts approval revocation, however, is local to the owning store and must be fenced atomically: a revocation committed before acceptance defeats acceptance; a later revocation does not retrospectively undo an already accepted staff fact. Removing that fact requires a new authorised revision.

## Acceptance audit, privacy and recovery

Each successful acceptance durably binds school, subject Staff ID, field and old/new revision references, proposal/revision, proposer, accepter, acceptance time, operation ID and intent digest, owner-review reference, and required Admin approver/approval revision/time plus checked authority evidence references. The record must distinguish proposal time, approval time and acceptance time. Avoid retaining free-text HR payloads, names, tokens, email addresses or entire sessions. The owner-review reference is a bounded reference to the verification act, not a copy of private chat.

Audit failure rolls back the acceptance; it is not a best-effort post-commit sink. Existing `v1/core/audit.mjs` cannot persist these fields: its projector strips them, and its sink is explicitly separate from authority evaluation. Use a Contacts-owned acceptance record in a later scope, not an undocumented extension passed to that projector. This record proves a staff fact was accepted; it does not prove what a later access decision observed. See [F5 design](../core/F5_EVIDENCE_RECOVERY_DESIGN.md).

No indefinite retention is assumed. Owner must approve retention for acceptance/audit/operation-deduplication evidence and backup copies before durable deployment. Keep linked evidence for the approved recoverability window; if required material expires, return explicit unavailable/expired history rather than fabricated provenance. Deduplication expiry needs a protocol preventing old IDs from being applied again (bounded operation epoch and tombstones); TTL alone is unsafe. Retention expiry must not erase live authoritative facts. Unauthorised viewers receive no subject-specific history.

No background retry writer is proposed. Proposed bound: one commit attempt per call, one reconciliation read after an uncertain response, then explicit unknown/manual reconciliation; callers cannot retry with a new intent/ID. A deadline cannot cancel an already submitted transaction. Rollback of future code must preserve committed facts, audits, operation identities and unknown outcomes; disable new acceptance before switching readers if schema compatibility is uncertain. Never restore an older database blindly over later accepted revisions.

## Required future tests and interleavings (Not tested)

| Case | Required persisted outcome |
| --- | --- |
| Self accept any of three fields, true or false; Admin or alternate account | Denied; no fact/revision/audit-success entry; resolved subject identity used |
| Non-subject Power User accepts EO with owner-reviewed evidence | One accepted revision, source/group change, audit and operation result |
| SMC/SL=true without Admin, wrong school, expired/revoked approval | Denied; unchanged accepted facts |
| Two acceptances share expected revision | One commits; other conflicts; no partial audit or second active revision |
| Approval revoked while command waits | If revocation wins owning commit order, acceptance rejects; if acceptance wins, later revocation preserves history |
| Proposal value/interval/revision changes after approval | Bound approval invalid; new approval required |
| Audit append or result insert fails | Transaction rolls back accepted facts and all revision updates |
| Timeout before submit / after commit but before reply | Reconciliation distinguishes absent operation from applied; same ID retry yields at most one accepted effect |
| Restart and same operation+intent / changed intent | Original durable result / conflict; no second revision, no attribution drift |
| Section changes to MK during SMC acceptance | Shared subject revision fence rejects stale intent or inconsistent MKE+SMC combination |
| Core permission revokes in external check-to-commit interval | Demonstrate limitation; integration gate remains open until chosen fencing protocol is evidenced |
| Restore backup with result/audit missing or mismatched | Detect incomplete recovery, disable acceptance; never report saved from partial restored rows |

Synthetic provider tests can prove transition logic, not SQL atomicity, durable deduplication or backup recovery. Those require an authorised real persistence adapter and failure injection in its actual API.

## Proposed next implementation scope (not approved)

For an isolated contract/state-machine package only, propose these exact eight paths after coordinator approval: `v1/contacts/acceptance-contracts.mjs`, `v1/contacts/authority-acceptance.mjs`, `tests/v1-contacts-authority-acceptance.mjs`, `tests/v1-contacts-acceptance-races.mjs`, `tests/v1-contacts-acceptance-isolation.mjs`, `docs/v1/contacts/AUTHORITY_ACCEPTANCE_DESIGN.md`, `docs/coordination/tasks/v1-authority-acceptance-contract.md`, `docs/coordination/LANES.md`. It would inject a transactional owner interface and must not claim durability from mocks. Existing Core and Contacts read modules stay read-only in that proposed scope.

An actual writer needs another reviewed allowlist after choosing its owning store, service authentication and transaction API; this document authorises no SQL, binding, Worker route or migration. Outstanding real owner choices are retention and any required cross-domain risk acceptance. School classifications, verification source and presentation are already settled. Official T1B-01/T1B-02 and runtime UAT remain Not tested.
