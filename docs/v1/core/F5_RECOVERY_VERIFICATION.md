# F5 captured-decision recovery

**F5 OPEN.** Codex implementation for Claude exact-head review; isolated synthetic stores only. Official T1B-01/T1B-02 and runtime UAT: **Not tested**.

## Implemented boundary

Base PR145 `f1efe8a687cb640dae8731fe674acb72b33e7f9b` already writes a Core evidence row and immutable Contacts snapshots. Recovery previously returned JSON without checking its association. Deploy event and sidecar timestamps used request start, which could precede the Contacts observation; event request ID could differ from the actual T1A request. New schema-2 sidecars retain the final allow decision, its exact evaluatedAt/requestId and four revision values. Event, sidecar, principal and request descriptor are sealed together in their existing single Core row.

The Global Admin evidence endpoint checks school/decision/binding, final time, actual observation ordering and role vector. It obtains the exact historical snapshot through Contacts' existing authenticated historical endpoint and the unchanged T1B historical validator. This checks immutable content identity, permanent Staff ID, interval-bearing fields, group vectors and catalogue/dependency closure. It never reads current facts as a substitute or creates a new observation. Repeated unchanged reads retain the same content revision/sequence/digest with distinct observation identities.

The digest detects accidental corruption and association errors within trusted owner stores; it is not a signature against an administrator who can rewrite both data and digest. Each owner retains its own data and backup. There is no transaction across D1 databases. If the historical Contacts store is missing or corrupted, recovery fails rather than accepting Core's embedded copy alone.

Verified scope is explicitly `captured-allow-decision`, never current authority or proof that a downstream business write committed. Destination receipts are returned as linked evidence, not revalidated against destination stores by this endpoint. Current Global Admin permission is required to inspect history. Admin decisions that legitimately bypass Contacts report `contacts: not-required`. Legacy unsealed records remain incomplete, including unverifiable final evaluation time; history is not rewritten. Non-Deploy records without a T1A decision contract remain incomplete. Denial-event capture is a separate remaining gap: authorizeCore currently rejects denials before this allow-row persistence path.

## Evidence

- `TZ=Asia/Singapore node tests/v1-product-evidence-recovery.mjs`: eight groups cover verified content/observation, tampered event/binding/observation, school/staff mismatch, observation ordering, revision mismatch, missing/altered history, legacy incompleteness, Admin bypass and non-Deploy limits.
- `TZ=Asia/Singapore node tests/v1-product-core-contacts.mjs`: real local D1/R2 bindings, unchanged-content/different-observation assertions, process restart, separate Core and Contacts backups restored into empty owner stores, then the actual Core evidence endpoint recovers the original observation and snapshot. Tampered Core event and deleted historical Contacts content reject. Existing corrupt-backup rejection remains.
- First negative unit probe attempted to mutate the intentionally frozen reader result; test fixture now clones it before deliberate corruption. No production mutability was changed.
- Canonical build, product-suite and exact-head CI outcomes are recorded in the PR. Both existing runners discover the new `v1-product-*` program.

## Remaining closure evidence

Claude reviews the exact implementation head. After separately authorised deployment, demonstrate captured allow evidence, restart and recovery using the deployed protocol and independently restored owner backups, with complete historical content, actual observation and the final decision time. Decide coverage for rejected decisions and separately verify destination receipts where completion is claimed. Retention must preserve referenced Contacts history and Core evidence; no cleanup in this task deletes either. Synthetic tests do not establish live durability or close F5. No automatic retention policy, live data access, backup activation or deployment is included.
