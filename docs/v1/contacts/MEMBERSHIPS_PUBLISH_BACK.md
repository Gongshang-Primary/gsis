# Version-owned Memberships and publication

Model: Codex. Implements the owner's 16 November 2026 instruction, **“Complete publish-back before deployment”**, under [the bounded claim](../../coordination/tasks/v1-deploy-memberships-publish.md). This is the Memberships slice of the [Contacts lifecycle](CONTACTS_LIFECYCLE_DESIGN.md), not completion of all eleven deployment-tag publication rules. Review and hosted verification remain separate gates.

## Owner amendment: role matrix and application authority — 16 November 2026

The owner now requires the v0.9-style role Membership matrix and explicitly requires its SMC/EO/School Leader values to affect application permissions on publication. This supersedes the earlier descriptive-only publication limitation below for newly marked authority publications. The owner also allows publication to change the publisher's own values; direct Contacts self-acceptance restrictions remain outside this exception. See [the scoped implementation claim](../../coordination/tasks/v1-deploy-role-membership-matrix.md) and [owner directives](../../coordination/OWNER_DIRECTIVES.md).

The version owns explicit Role Shortform, Formal Role Name, ten managed grouping labels (SL, SC, SMC, KP, TL, SDT, CMT, SAT, Support, MK), appointment-grade mapping and an independent EO yes/no/unknown value. No role name, grade, teaching duty or screenshot-derived default manufactures EO or another authority flag. An explicitly configured blank-role row can address staff whose Role is blank; absent mappings preserve existing facts. Managed grouping labels come from the configured role row; unrelated custom Memberships remain separate. Existing per-person Membership workbooks retain their contract. A distinct Role Membership workbook carries the matrix, with deliberate preview for a legacy v0.9 matrix import and no implicit reinterpretation of another table.

On publication, Deploy supplies a new, immutable, proof-bound authority contribution for each explicitly mapped person. Contacts owns the resulting current authority records and applies each person's represented tuple and Memberships atomically, with ordering frontiers, snapshots/history, audit and receipts. Current Core rules remain unchanged: SMC enables its existing routes; Deploy edit/publish requires SMC plus EO or School Leader. Global Admin and explicit module grants are not assigned by this path. MKE+SMC is still invalid. Missing EO is not false and must not be guessed from the appointment-grade column. Appointment grade remains separate planning data in this slice; completing every ordinary deployment-tag or role-catalogue publication rule is separate work.

The publication exception permits the publisher's own grants or removals. Original publishing identity and the actual applying/recovering identity are retained independently. Recovery must not require the original publisher to retain a permission that this publication just removed: another currently authorised publisher or Global Admin can reconcile and continue the same committed publication, without changing its intent or replaying completed writes. Historical publication payloads are never upgraded into authority grants. Ordering is per field: a direct edit made after a publication protects that field against delayed delivery, without cancelling unrelated changes. In particular, a custom Memberships edit or EO edit cannot suppress a pending SMC removal. Contacts commits the still-eligible fields together and records applied versus superseded fields; only a bundle with no eligible fields is wholly superseded. A newer deliberate publication can replace earlier direct values. Multi-owner application is not one atomic cross-D1 transaction, so UI receipts must distinguish committed publication, pending application and confirmed applied/superseded results.

Implementation and synthetic verification are recorded in the new claim; independent exact-head review and release remain separate gates. The additive `0006_authority_publications.sql` introduces one ordering frontier per person and authority field. Back up Contacts before any separately authorised hosted migration, and retain that table and its history on rollback. Never replay the new authority-publication marker through an older implementation. No live permissions are changed by this document. F5 remains OPEN and unperformed runtime UAT remains Not tested.

## Editing and copying

New and duplicated Deploy versions copy current known Contacts Memberships. Thereafter that version owns its Memberships: viewing, recalculating, saving unrelated cells, exporting and publishing do not replace them with current Contacts values. Current identity, accepted authority and teaching eligibility still refresh normally. Duplicate retains the existing assignment-copy rules.

Historical PR192 behaviour (retained as the separate per-person editor): the HR Settings Membership table permits authorised Deploy editors to enter per-person labels, using the existing draft, Save and revision controls. These are ordinary grouping facts, not accepted SMC/EO/School Leader authority. Free-text labels are allowed; no role or permission is inferred. Input remains bounded to 32 labels of at most 160 characters each, with the existing Contacts restriction against control characters and reserved comma/semicolon delimiters. Use one label per line; import does not silently split a label at punctuation.

Unknown is different from an explicit empty list. An untouched missing value stays missing. Deliberately clearing a known list, or explicitly setting an unknown list to none, records `[]`. Omitted people/fields do not clear stored data. The canonical Membership workbook preserves stable Staff IDs and school, version and working-revision metadata; preview and confirmation remain required. Import rejects foreign identities, stale revisions and ambiguous name matching. HR Terms remains a Contacts reference.

## Publication and ordering

New immutable publication envelopes carry `membershipPublicationVersion: 1`. Only publications with that marker generate Memberships contributions for known version values. Historical publications are not reinterpreted by an upgrade. A new publication applies immediately regardless of its displayed term/date range. Each represented known value overwrites the corresponding Contacts field, including explicit clears; an unknown value produces no write.

Contacts owns its field, history, audit, receipt and per-person publication frontier. The frontier records the latest relevant Deploy sequence and whether a direct edit or publication wrote the field. A direct Contacts edit pins the current Deploy pointer and commits that sequence with its field update. A publication numbered N applies only while N is current and the person's frontier is less than N. Therefore:

- A Contacts edit before publication N can be replaced by N.
- A direct edit after N is published survives delayed delivery/retry of N.
- A deliberate newer publication N+1 can replace that edit.
- An old publication cannot overtake a newer publication or direct edit.

Both individual and grid/import Memberships writes use the same ordering. The existing owner-enforced publication pin closes the read-to-commit pointer race. Each Contacts transaction atomically checks current field/staff revisions and commits the field, history, frontier and receipt. This is not a transaction across two D1 databases. Draft saves do not need publication pins, and Roster retains its own workload copy.

The original immutable publication, actor, field and operation identify a contribution. Core verifies the publication proof and original publishing decision, then rechecks the actor's current account, capability and accepted authority for each application. Only this marked Memberships path replaces the obsolete copied field-revision precondition with the current Contacts CAS and publication frontier; other contributions keep their existing contract. Revoked authority leaves an explicit pending outcome rather than fabricated success.

## Bounded delivery and recovery

The authenticated `POST /memberships/sync` route requires current `deploy.publish` permission and CSRF protection. It accepts the original publication operation, publication and version IDs, an offset and a limit of at most eight. Each progress request has its own operation receipt; retrying a lost response retains that request's complete body and operation ID. Contacts applications retain the original per-person contribution identities. A conclusively aborted attempt may use a recorded next attempt; an unknown outcome is reconciled first. A narrow verified proof returns only the requested page or staff member after checking the original immutable payload digest. Membership lists are not appended to the existing general recipient proof or outbox.

The browser advances bounded chunks while open and displays progress. Interruption, stale authority or service failure leaves the publication committed and Memberships pending, with continuation through the original publication. No general scheduler, provider sender, Drive backup or Google integration is activated. Per-person work crosses a narrow internal service request so one chunk does not combine all field transactions into one Worker's D1 budget.

Publication commit, contribution ingestion and field application are distinct states. `membershipsSync` reports Memberships completion independently from other Contacts proposals and recipients. A terminal superseded contribution means a newer applicable edit/publication was retained; it does not mean the older value overwrote it. For marked publications, the generic delivery tracker calls receipt of ordinary proposals `ingested`, not `applied`.

## Release and evidence

This implementation does not populate real Memberships, infer them from labels or confirm missing entries. The owner must enter/import reviewed Memberships in Deploy and publish before relying on membership-based workload calculations. Existing missing values remain missing until an explicit edit.

The additive `v1/migrations/contacts/0005_membership_publications.sql` requires a fresh private Contacts D1 backup before hosted migration. Retain the frontier/history on rollback; do not replay newer marked publications through an older implementation. Release also retains Core/Roster migration and backup requirements in the deployment checklist.

Local tests and exact-head CI are recorded in the claim and PR. Hosted Membership editing/publication, actual school data readiness and runtime UAT are **Not tested** until performed explicitly. F5 remains **OPEN**; official T1B-01 and T1B-02 remain **Not tested**.
