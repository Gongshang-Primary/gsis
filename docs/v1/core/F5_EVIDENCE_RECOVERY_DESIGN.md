# F5 — durable decision evidence recovery design

Model: Codex. 13 November 2026 SGT. **F5 OPEN. Design only; no evidence writer, store, audit change or durable recovery demonstrated.** Source queue at `110bf5838b4a9c95735d503f42587dd0d1f34a40` (unmerged PR132); owner's later instruction approves D design/publication only. Contracts inspected at source main `e996dfdb3a69bee76355ba60500468679d0963de`. Package A changes a denial reason, not this evidence gap. ChatGPT coordinates; Claude independently reviews the exact documentation head.

## Findings from actual contracts

| Required evidence | What exists | Recovery limitation |
| --- | --- | --- |
| School and permanent Staff ID | Core allow result has school/staff IDs; T1B snapshot is school/staff-bound. Audit retains schoolId, optional actor/preview account IDs. | Audit drops staffId; mutable account linkage cannot reliably reconstruct the historical subject. Denials deliberately expose no staff ID. |
| Exact Contacts content and role revisions | Core allow `contactsRevisions` contains source, smc, eo, schoolLeader. T1B content has snapshotId/revision/sequence/digest and interval-bearing accepted fields. | Audit has one optional `contactsRevision`, not the vector/snapshot digest; source revision uniqueness alone is not a durable recovery service. |
| Relevant group/catalogue revisions | T1B snapshot has groups with field vectors, complete dependency definitions and catalogues/refs. | Narrow Core adapter strips these; audit cannot reconstruct them by passing extra properties. |
| Effective intervals and evaluatedAt | T1B immutable fields contain intervals; Core decision supplies final evaluatedAt; audit optionally retains evaluatedAt. | Omitted evaluatedAt cannot be replaced by recordedAt; original intervals need immutable recoverable content. A denied evaluation may stop before final Core recheck; preserve its actual supplied time, not an invented final time. |
| Actual observation | Reader validates observation evaluationId/requestedAt/asOf, adds receivedAt/effectiveAt; Core query evaluationId is decisionId. | Adapter returns narrow asOf; Core allow/audit do not retain the original reader observation. Re-reading unchanged content later gives a different observation. |
| Durable association | Audit has required eventId and requestId; mutation events also require operationId. | No present contract associates eventId with a persisted query-bound Contacts observation. recordSecurityAudit's sink is optional; its successful receipt alone says nothing about sidecar recovery. |

Sources: `v1/core/authority.mjs` evaluate (random decisionId per evaluation; query bindings; returned result), `v1/core/audit.mjs` projectSecurityAudit (strict permitted fields, no staff/vector/observation), `v1/contacts/core-provider.mjs` (narrow projection), `v1/contacts/accepted-facts.mjs` current/recoverSnapshot, and [T1B contract](../contacts/T1B_CONTRACT.md). These are inspectable source claims, not live-store tests. Existing `tests/v1-contacts-recovery.mjs` documents synthetic snapshot recovery and audit field stripping, not durable F5 closure.

Concrete counterexamples:

1. Same source revision and field values read at t1 and t2. Both produce the same content identity and Core authority digest; requestId or operationId may also be reused during revalidation. Without a persisted decision-observation association, an audit event cannot establish which asOf was actually used. Stamping a new source revision per read breaks unchanged-content revalidation and is rejected.
2. Staff account is relinked after a decision. Current account->staff lookup yields the new Staff ID. Audit actor ID cannot recover the old subject; preview makes actor and subject different even at the original time.
3. Same role booleans but changed group/catalogue definition. A source snapshot may have been advanced correctly, yet retaining only three boolean values loses the dependency evidence. Reconstructing with today's catalogue silently rewrites history.
4. An accepted EO interval expires between observation and later audit persistence. recordedAt is not evaluatedAt; replay at recordedAt can produce a different decision without any revision change.
5. projectSecurityAudit drops an attached `staffId`, `contactsRevisions`, `decisionId` or `observation` property. The caller cannot turn that into durable evidence by adding more keys to its input object.
6. Restart or restored backup contains an audit event but no associated observation/content. An in-memory reader cache, matching source string or successful old sink receipt cannot fill that gap.

## Recommended minimum: existing event ID plus a durable association

Use the existing audit `eventId` as a key into a new versioned, access-controlled decision-evidence record persisted by the future audit/evidence owner. No Core audit projection extension is initially necessary. For one canonical security event per authority evaluation, choose **eventId = decisionId**; both satisfy the existing bounded ID contract. Bind school and eventId as the unique key. Do not reuse a requestId or operationId as eventId: one operation may have several evaluations with different observations. Other event kinds may have independent IDs; if they reference a decision, bind that explicit association in the evidence owner, not by guessing from timestamps.

At this baseline no canonical event-ID convention or durable evidence owner exists. This is a proposed integration contract, not proof that F5 is already solved. The coordinator must approve the later code and storage scope. The current Core audit projector can remain unchanged only if the integration actually enforces and tests the convention and atomic association described here.

A trusted integration wrapper around the real Contacts reader captures its validated result keyed by evaluationId before the narrow adapter strips fields. It also captures the actual provider query and trusted actor/session/preview binding. After Core returns, bind the returned decisionId, outcome/reason, actual evaluatedAt and authorityRevision (if available) to that observation. For allowed decisions, verify the returned source/role vector and Staff ID agree with the captured content; preserve final Core revision/policy/linkage references as necessary to explain subject identity and policy. The wrapper does not re-read to manufacture an asOf and does not infer denied subject identity from public error output.

The capture is per evaluation, bounded and isolated; overlapping reads or same-operation retries cannot overwrite another decision's observation. A timed-out or superseded provider response cannot be attached to a successful evaluation. If the verified reader observed data before an outer Core timeout, retain it only with a status explicitly stating it was not established as the deciding authority observation. Never label that bundle complete decision evidence.

## Versioned evidence record (proposed)

| Component | Minimal retained fields / rule |
| --- | --- |
| Identity | schemaVersion, schoolId, eventId, decisionId, record kind, evidenceStatus; immutable canonical intent digest |
| Decision binding | requestId, operationId if applicable, action, resource binding, trusted service/actor/session/preview references, actual outcome/reason/evaluatedAt, policyVersion/coreRevision/authorityRevision where supplied. Reference IDs only, no tokens/session secrets. |
| Subject | permanent Staff ID actually queried and historical Core linkage reference; distinguish actor from preview subject. If Core Admin bypasses Contacts, record `contacts-not-required` and no fabricated staff/Contacts observation. |
| Content reference | snapshotId, source revision, sequence, contentDigest; exact role field vector; group/dependency/catalogue revision references. Immutable content must recover the full necessary intervals/values and dependency closure. |
| Observation | actual evaluationId, requestedAt, asOf, receivedAt, effectiveAt from validated reader; captured query binding and attested source identity. Immutable observation ID/digest binds this read, not the content version. |
| Retention/recovery | evidence schema version, retention class/expiry under approved policy, durable commit/result identity; status describing complete, unavailable, incomplete, expired or tampered evidence |

Do not duplicate whole unrelated staff profiles, phone/email/name fields or free-form provider responses. The authority profile and exact dependency closure are sufficient. A cryptographic digest checks content identity/integrity but does not authenticate an arbitrary caller-supplied snapshot; trusted owner attestation/service identity and access controls remain necessary. A missing or nonaccepted-only authority record can be recorded exactly as observed; do not turn it into false for replay.

Separate **content identity** from **observation identity**. Repeated reads of the same source snapshot keep source revision/sequence/digest and field/group/catalogue revisions stable. Each actual observation has its own immutable binding to a decision, time and query. The Core decision's final evaluatedAt may differ from the reader's effectiveAt/asOf; preserve both. Content validity and observation freshness are different checks.

## Persistence, event publication and recovery protocol

Recommended owner split: Contacts retains immutable authority content with a retrieval contract; the security evidence owner retains canonical audit events, decision-observation association and operation results. This may later be a single audit/evidence D1 database, but no database is selected or provisioned here.

1. Before labelling evidence complete, obtain a verifiable durable content reference whose dependency closure is recoverable under the required retention class. An ephemeral snapshot in a reader is insufficient. If content must first be persisted by Contacts, confirm that independent operation or mark the result unknown/incomplete; do not claim a transaction across stores.
2. Validate capture and final decision binding, construct the canonical security projection using the unchanged real projector, and build the evidence association. Require schema/version and digest checks; a stripped extra property cannot become the evidence payload.
3. In the evidence owner's single atomic transaction, persist canonical projected event, immutable evidence association and idempotent result under `(schoolId,eventId)`. Same ID/same intent returns the original receipt. Changed payload/decision/observation for the same ID conflicts; no last-writer-wins replacement. Preserve evidence even if the delivery reply is lost.
4. Return evidence-confirmed only after this commit and referenced content availability have been verified. The existing Core sink receipt `{schemaVersion:1,eventId,persisted:true}` may describe the projected event; the wrapper must not equate it to a complete bundle unless its own integrated transaction protocol guarantees both. A generic legacy sink cannot provide this guarantee.
5. On unknown result, reconcile by original eventId/intent digest. If event and evidence exist with matching content, return the original confirmation. If partial/mismatched, report incomplete and repair only through a separately authorised reconciliation procedure; never regenerate an observation by reading current Contacts. Retrying the same ID is safe only after checking the durable result; never allocate a new ID to hide uncertainty.
6. Recovery begins at security event `(schoolId,eventId)`: authorise reader, load association, verify event/projection digest and decision binding, load exact immutable content/dependencies, verify all digests/vectors/identity/time relationships, then return the actual historical bundle. Never fall back to current content, a nearby timestamp or current account linkage. Recovery cannot feed current Core authority.

Acceptance audit B and access-decision evidence D have different purposes and writers. B can prove who accepted a fact and its revision. D must still prove what the evaluator actually observed. Neither replaces the other. They can reference one another by immutable IDs with compatible retention, without sharing an invented distributed transaction.

No implicit fail-open/fail-closed access policy is added by this design. Existing audit is after evaluation, separate from an eventual Deploy commit. A future privileged-operation integration must decide how an unconfirmed audit/evidence write affects commit eligibility under the approved business/security contract. Default design recommendation is to prevent reporting a privileged operation as auditable/completed until required evidence is confirmed, but this does not establish authority freshness at the later consumer commit. Revalidate as required and record any new decision under its own ID. The separate authority check-to-commit interval remains an integration gate, not solved by durable logging.

## Alternatives evaluated

| Alternative | Decision |
| --- | --- |
| Existing contactsRevision + current directory/role lookup | Reject: loses historical identity, intervals, dependency closure and observation; counterexamples above. |
| Persist only a richer immutable Contacts snapshot | Necessary content support, insufficient alone: two reads share content but have distinct asOf/query context. |
| Existing eventId + durable event-to-observation/content association | **Recommend**: eventId already survives projection and supports idempotent sinks; adds durability/binding at the owner rather than broadening public audit rows. Must prove the convention and atomic association. |
| Minimal versioned `evidenceRef` audit extension | Fallback if integration cannot guarantee one canonical event binding or the evidence owner must support multiple bundles. Requires a new audit schema/version or explicitly reviewed compatibility contract, projector validation, privacy policy and consumer tests. A new field alone is not durable recovery. Not necessary for the recommended one-event/one-bundle design. |
| Concatenated source/role vector in contactsRevision, or new sequence per read | Reject: opaque ambiguous reference, length/compatibility problems and no observation proof; per-read content revisions break T1A revalidation. |
| Copy whole staff/provider payload into each audit row | Reject: excess sensitive data and retention coupling; current projector drops it anyway. |

## Required future recovery evidence (all Not tested)

| Scenario | Positive / negative assertion |
| --- | --- |
| Two decisions, same content, different asOf | Both recover the same immutable content but their own actual observations; content revision/sequence unchanged |
| Restart with all memory cleared | Recover event -> exact school/Staff ID -> source/role/group/catalogue revisions -> intervals -> evaluatedAt and actual asOf from durable records alone |
| Backup restore | Restore an authorised consistent cut of event/association/content; verify dependency closure and digests. Missing or mismatched restored component yields incomplete, not an apparently complete bundle |
| Actor relinked or preview subject differs | Historical subject from evidence, not present-day linkage; foreign-school lookup denies without leakage |
| Missing/tampered observation, reused snapshot ID with different content | Detect exact missing/digest/identity violation; no latest fallback |
| Same event/operation ID reused with changed intent | Event binding conflicts; repeated operation may have distinct decision IDs, never overwrite the first observation |
| Timeout before/after evidence commit | Reconcile same eventId, at most one immutable association, exact original observation recovered after restart |
| Delayed response from superseded evaluation | Never attached to the newer event or asserted as its decision evidence |
| Content retained but observation expired; converse; catalogue expiry alone | Distinct incomplete/expired statuses; no fabricated reconstruction; retention dependency test detects loss |
| Admin bypass, provider failure or invalid request before Contacts | Explicit not-required/not-observed/unavailable state; no invented complete Contacts bundle |
| Audit projector regression | Real projector retains eventId/reason and drops extra raw fields; recoverability still comes from the separately committed association |
| Independence from acceptance audit | Accepted fact audit present but decision observation absent remains F5 failure |

Use an actual authorised persistence adapter, crash injection before/after each commit boundary, fresh processes and backup/restore of separate components. Synthetic maps or a durable sink receipt without a recovery walk cannot close F5. Closure needs exact implementation/tested SHA, store/API semantics, authenticated recovery traces with synthetic identities, restart and restoration evidence, retention-loss negatives, independent Claude review, and evidence that live integration uses the same protocol. Keep official T1B-01/T1B-02 and unperformed runtime UAT Not tested even if isolated engineering tests pass.

## Proposed scopes and genuine owner decisions

First propose an isolated evidence-interface package, exact paths (not approved here): `v1/core/decision-evidence.mjs`, `v1/core/decision-evidence-contracts.mjs`, `tests/v1-decision-evidence.mjs`, `tests/v1-decision-evidence-recovery.mjs`, `tests/v1-decision-evidence-isolation.mjs`, `docs/v1/core/F5_EVIDENCE_RECOVERY_DESIGN.md`, `docs/coordination/tasks/v1-decision-evidence-contract.md`, `docs/coordination/LANES.md`. Existing authority/audit implementation remains unchanged for this proposed library. It would inject durable owner operations but cannot prove their implementation from mocks. A later storage/integration task needs an exact separately approved allowlist after choosing the owning persistence component and backup boundary; no existing production database is implicitly selected.

Owner policy decisions before durable implementation/deployment: retention periods for acceptance provenance, immutable content/dependencies, decision observations, event/deduplication records and backups; authorised recovery/export audience beyond same-school security administration; and treatment of privileged consumer operations when required evidence remains unconfirmed. Recommend aligned recoverability windows, minimal PII, explicit expiry statuses and no premature success claim. Do not ask the owner to choose field names, digest algorithms or routine retry mechanics. Coordinator must scope storage and integration separately. **F5 stays OPEN until the recovery chain is demonstrated, not merely specified.**
