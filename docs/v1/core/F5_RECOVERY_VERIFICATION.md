# F5 captured-decision recovery

**F5 OPEN.** Codex implementation for Claude exact-head review; isolated synthetic stores only. Official T1B-01/T1B-02 and runtime UAT: **Not tested**.

## Implemented boundary

Base PR145 `f1efe8a687cb640dae8731fe674acb72b33e7f9b` already writes a Core evidence row and immutable Contacts snapshots. Recovery previously returned JSON without checking its association. Deploy event and sidecar timestamps used request start, which could precede the Contacts observation; event request ID could differ from the actual T1A request. New schema-2 sidecars retain the final allow decision, its exact evaluatedAt/requestId and four revision values. Event, sidecar, principal and request descriptor are sealed together in their existing single Core row.

The Global Admin evidence endpoint checks school/decision/binding, final time, actual observation ordering and role vector. It obtains the exact historical snapshot through Contacts' existing authenticated historical endpoint and the unchanged T1B historical validator. This checks immutable content identity, permanent Staff ID, interval-bearing fields, group vectors and catalogue/dependency closure. It never reads current facts as a substitute or creates a new observation. Repeated unchanged reads retain the same content revision/sequence/digest with distinct observation identities.

The digest detects accidental corruption and association errors within trusted owner stores; it is not a signature against an administrator who can rewrite both data and digest. Each owner retains its own data and backup. There is no transaction across D1 databases. If the historical Contacts store is missing or corrupted, recovery fails rather than accepting Core's embedded copy alone.

Verified scope is explicitly `captured-allow-decision`, never current authority or proof that a downstream business write committed. Destination receipts are returned as linked evidence, not revalidated against destination stores by this endpoint. Current Global Admin permission is required to inspect history. Admin decisions that legitimately bypass Contacts report `contacts: not-required`. Legacy unsealed records remain incomplete, including unverifiable final evaluation time; history is not rewritten. Legacy job/recipient sidecars that lack their own school field remain inspectable as incomplete only when the enclosing event and captured principal match the school and decision; schema-2 sidecars require their explicit school binding. Non-Deploy records without a T1A decision contract remain incomplete. The bounded final-denial capture described below is separate from this allow/principal row. Earlier authorization failures still have no final T1A decision and remain outside that capture.

## Evidence

- `TZ=Asia/Singapore node tests/v1-product-evidence-recovery.mjs`: eight groups cover verified content/observation, tampered event/binding/observation, school/staff mismatch, observation ordering, revision mismatch, missing/altered history, legacy incompleteness, Admin bypass and non-Deploy limits.
- `TZ=Asia/Singapore node tests/v1-product-core-contacts.mjs`: real local D1/R2 bindings, unchanged-content/different-observation assertions, process restart, separate Core and Contacts backups restored into empty owner stores, then the actual Core evidence endpoint recovers the original observation and snapshot. Tampered Core event and deleted historical Contacts content reject. Existing corrupt-backup rejection remains.
- First negative unit probe attempted to mutate the intentionally frozen reader result; test fixture now clones it before deliberate corruption. No production mutability was changed.
- Canonical build, product-suite and exact-head CI outcomes are recorded in the PR. Both existing runners discover the new `v1-product-*` program.

## Remaining closure evidence

Claude reviews the exact implementation head. After separately authorised deployment, demonstrate captured allow evidence, restart and recovery using the deployed protocol and independently restored owner backups, with complete historical content, actual observation and the final decision time. Decide coverage for rejected decisions and separately verify destination receipts where completion is claimed. Retention must preserve referenced Contacts history and Core evidence; no cleanup in this task deletes either. Synthetic tests do not establish live durability or close F5. No automatic retention policy, live data access, backup activation or deployment is included.


## Final non-allow decision capture

The Core follow-up records actual final `deny` and `unavailable` results returned by the Deploy T1A resolver. It preserves the resolver result and existing public error semantics. It does not manufacture a final decision for earlier session, identity, active-record, missing-authority or capability checks. The existing principal schema and granting rules remain unchanged.

Denials append to existing Core `product_audit` with action `core.authority-denial`; they never enter `core_evidence`. That distinction prevents a denied decision ID from being replayed through the internal decision, pin or dispatch paths. The existing Global Admin `/evidence/:decisionId` lookup can inspect a denial by its stored event ID. This slice adds no audit-search UI and does not change the public error/request-ID protocol: an outer HTTP request ID is not automatically the resolver's request ID.

The audit event uses the unchanged minimal security projector. Its separate sealed sidecar keeps the exact final result, opaque actor/subject/session identity, school/service/action/resource/operation binding and request-body digest. It contains no principal, credential, token, email, arbitrary request body, provider error payload or complete Contacts snapshot. A validated final Contacts read is linked only when its evaluation ID matches the final decision. The immutable reference retains Staff ID, snapshot/source identity, digest, selected role-field revisions and that read's actual observation. A missing/failed final read is explicitly `not-captured`; the successful preliminary read cannot stand in for it.

Recovery validates the seal and row/binding identities. Where an observation exists, it obtains the exact historical Contacts snapshot through the established owner endpoint and T1B validator, checks its content/dependency closure and selects role revisions at the captured effective time. It makes no new current-fact observation. Failed T1A resolution can retain the evaluation-start timestamp; recovery preserves that exact time separately from requested/as-of/received/effective observation times and the later audit-recorded time. It does not rewrite time to imply an ordering the resolver did not supply.

The returned verification scope is `captured-final-non-allow-decision`, with `currentAuthority:false` and `operationCommitted:false`. `contacts:not-captured` and its explicit issue remain visible even when the captured denial envelope verifies. This is not full authority evidence or F5 closure.

Persistence is best-effort under the existing audit contract's one-second bound. Projection, encoding, seal, conflict and storage failures produce `unconfirmed`; Core emits only a bounded capture-status warning with the opaque decision ID and returns the original denial. A timeout does not cancel a D1 write or prove absence. Exact event replay keeps the first recorded time and content; changed reuse cannot overwrite it. The audit record is capped at32KiB. Existing backup enumeration includes the audit table, and existing cleanup excludes it; no retention deletion is introduced.

Verification results and exact-head CI are recorded in `docs/coordination/tasks/v1-core-denial-evidence.md` and its PR. Broader F5 remains **OPEN**: preliminary rejection coverage, independently verified destination commits, hosted restart/restore and retention decisions remain separate. Official T1B-01/T1B-02 and unperformed runtime UAT remain **Not tested**.
