# Codex v1 work queue — 13 November 2026

Model: Codex. Coordinator: ChatGPT (v1). Proposed independent reviewer: Claude, to be named in each authorised task.
Status: queue prepared for review; no implementation authorisation.
Owner request: "line up a series of work for codex good for a few hours".

## Authority and execution mode

The request authorises preparing this queue and its Git handoff. It does not itself approve application edits, task claims, implementation branches or implementation PRs. The documentation branch/PR publishing this queue is delivery of the requested plan, not a claim on any implementation lane.

Codex can carry out the read-only investigation and design work below. Publish resulting plans using the current documentation PR workflow after their scope is authorised; do not use the review-record-only direct-main exception for plans. Do not merge this queue or any later work without owner approval.

After explicit implementation approval, package A is the first bounded coding task. Packages B–D remain design-only until their separate implementation scopes are approved. While awaiting review/CI on an authorised A, continue independent B–D investigation rather than silently starting another implementation or taking over production work.

Budget: approximately 3–5 hours of focused engineering/design work, excluding unpredictable CI/review waits. These are planning estimates, not a completion guarantee. Prioritise a complete, reviewable result over filling time.

## Read order and baseline

Inspected main: `5aac5f7ead21fe5a0e1c5ae7b837e05050167a60`. T1B #125 and EO readiness plan #128 are merged. Read:
- Root AGENTS.md; docs/v1/AGENTS.md.
- docs/coordination/WORKFLOW.md, LANES.md, OWNER_DIRECTIVES.md and current task records.
- [EO authority and readiness plan](../contacts/EO_AUTHORITY_READINESS_PLAN.md).
- [Merged T1B contract](../contacts/T1B_CONTRACT.md).
- [Revised plan](../contacts/T1B_REVISED_PLAN.md) and [design addendum](../contacts/T1B_CONTRACT_DESIGN_ADDENDUM.md).
- docs/v1/engineering/QUALITY_GATES.md and RUST_PRINCIPLES.md.
- Relevant exact-head review findings for #125 and #128.

Refresh main and actual overlaps before claiming any future task. An open PR title inventory alone does not prove file nonoverlap. No blanket clearance of Codex allocation is claimed. Owner resolves an actual competing allocation. Preserve v0.9.9 production responsibilities.

## Sequence and deliverables

| Order | Package | Focused estimate | Deliverable | Dependency |
|---|---|---|---|---|
| A | Missing-authority error contract | 60–90 min design/authorised implementation; CI extra | Exact bounded change brief; code/test PR only after explicit approval | Merged Core/T1B and EO plan |
| B | Contacts acceptance transaction design | 45–75 min | State/permission matrix, atomic persistence and recovery contract | Settled EO plan; independent of A merge |
| C | Active-staff readiness scan design | 45–60 min | Bounded snapshot/pagination algorithm and race-test specification | Merged read contract; B defines evidence, not code dependency |
| D | F5 evidence recovery design and consolidated handoff | 45–75 min | Recovery counterexamples, minimum durable design, proposed next scopes | Existing audit and B evidence requirements |

### A — distinguish incomplete records from service outages

Proposed task ID: `v1-authority-evidence-missing`.

Required result: a trusted, validated, current school/staff/query-bound Contacts response proving absent or nonaccepted required authority records produces:
`AUTHORITY_EVIDENCE_MISSING`, outcome deny, HTTP mapping 403, retryable false.

This is a library error-contract change, not an HTTP endpoint or UI implementation. Record the consumer message in contract documentation: "Your authority records are incomplete. Contact a Contacts Power User."

Do not map every PROVIDER_INVALID or 503 to this denial. Wrong-school/staff, malformed/untrusted evidence, stale reads, timeouts and unavailable providers keep their safe existing classes. Accepted future/expired/revoked intervals are not missing. Explicit accepted false is complete data, evaluated by the existing role matrix. Keep the three-record requirement, independent Admin, read-only preview and content-versus-observation revisions unchanged.

Before coding, trace real call paths: validated reader result -> Contacts adapter -> Core failure mapping -> audit reason validation. Show where malformed evidence cannot be misclassified as missing. An exception from an arbitrary provider is not proof of missing records.

Proposed exact implementation allowlist:
- `v1/core/contracts.mjs`: add the reason-code mapping only.
- `v1/contacts/core-provider.mjs`: classify validated missing/nonaccepted evidence.
- `tests/v1-authority-evidence-missing.mjs`: focused end-to-end library/audit regression.
- `tests/v1-authority-evidence-missing-isolation.mjs`: exact task scope, dependency and discovery checks.
- `docs/v1/core/T1A_CONTRACT.md`: additive new reason and compatibility semantics.
- `docs/v1/contacts/T1B_CONTRACT.md`: adapter mapping and limits.
- `docs/coordination/tasks/v1-authority-evidence-missing.md`: future claim/evidence.
- `docs/coordination/LANES.md`: additive task-specific scope after approval.

Core authority/audit implementation remains read-only unless investigation proves a necessary change; propose that scope change before editing. Do not silently widen this allowlist. Existing historical isolation tests must not be weakened to permit new files; use their documented task-context behaviour.

Required tests after authorisation:
1. Missing EO with SMC=true/SL=false; all three missing; pending/rejected/superseded-only required evidence -> exact deny code, 403 mapping and non-retryable.
2. One accepted role record plus pending observation remains valid; no accidental denial.
3. Three explicit false records -> existing capability denial, not missing.
4. Valid SMC+EO and SMC+SL; SMC-only read; independent Admin during Contacts outage; every preview mutation denied.
5. Future/expired/revoked interval boundaries retain existing semantics.
6. Timeout/unavailable remains retryable unavailable; stale evidence retains conflict; malformed/foreign evidence is never classified as honest incompleteness.
7. Real audit projector retains the new reason and excludes staff field lists/payloads; no durable-observation claim.
8. Unchanged-content revalidation passes; no per-read source-revision increment.

Completion: focused tests plus unchanged Core/Contacts regressions; canonical build without drift; unchanged runner discovery; required full Node/LORD suites and exact-head CI; Claude exact-head review. Record actual results and failures. No merge/deploy.

If approval is absent, finish the traced design and test specification only, then continue B.

### B — Contacts authority acceptance, design only

Proposed output: `docs/v1/contacts/AUTHORITY_ACCEPTANCE_DESIGN.md`.

Specify exactly:
- Trusted actor linkage, subject school/Staff ID, field/value/interval, expected revision, proposal identity and stable operation ID.
- No self-acceptance, including Admin or an alias/account linked to the same Staff ID.
- SMC=true and SL=true require non-subject Admin approval bound to unchanged school, subject, field, value, interval and proposal revision.
- Contacts Power User EO acceptance uses the owner's own review, not bulk inference or an HR import.
- Revoked/expired/wrong-school approval and changed proposals fail; no bootstrap exception invented.
- Related record acceptance, revision change, proposer/accepter/Admin evidence and operation result persist atomically in the Contacts owner.
- Same operation/same intent returns original result; changed intent rejects. Timeout/crash recovery checks the original operation before retry.
- Status, section and appointment remain distinct; MKE semantics preserved; MKE+SMC inconsistency flagged; no name/tag inference.
- Explicit read/write/capability matrix, failure states, privacy/retention decisions and rollback obligations.

Deliver a transaction/state diagram or concise table and concrete interleavings: concurrent acceptance, approval revoked during wait, failed audit write, timeout before/after commit, retry after restart. Identify what must be tested against actual persistence later.

No storage schema execution, migration, UI, live staff access or acceptance implementation. Propose an exact future file allowlist only after inspecting the current repository. Do not invent an existing Contacts store.

### C — active-population readiness, design only

Proposed output: `docs/v1/contacts/AUTHORITY_READINESS_SCAN_DESIGN.md`.

Specify a bounded read-only scan over every active staff member, including provisional and unlinked entries. Inactive rows may be informational but do not block. Unknown active status prevents certification. No default/bulk false records.

Require immutable population manifest/revision, snapshot-bound cursor/pages, duplicate/omitted-page detection, source and authority revision checks, evaluation time, explicit incomplete/ready outcomes and completion/cutover rechecks. A failed final page never becomes an empty successful report. Reactivation during a scan invalidates it; reactivation afterwards invalidates its certification.

Respect T1B's 128 staff/profile reader-stream bound: choose and justify per-request/bounded-batch reader lifecycle without losing owner-backed freshness. Test specifications must cover more than 128 identities and page-boundary changes. Do not silently reset readers and claim that this proves durable freshness.

Missing/nonaccepted, malformed, expired, future-only and revoked evidence remain distinct. Explicit false is complete. Independent Core Admin remains independent; global readiness is not a new per-request Admin dependency.

List privacy-safe report fields and authorised viewers. Keep real staff rows out of Git and CI. Specify the unresolved cutover fence; no cross-D1 lock claim.

No report implementation or runtime scan. No UI screenshots required for this backend design; future UI work retains its own visual gate.

### D — F5 durable evidence, design only

Proposed output: `docs/v1/core/F5_EVIDENCE_RECOVERY_DESIGN.md`.

Reproduce the gap by inspecting actual contracts: decision has source/role revisions; audit has a single Contacts revision and drops extra evidence; content snapshot is distinct from its observation.

Compare:
1. Existing references plus a durable decision-observation association.
2. A minimal versioned audit-reference extension if existing identifiers cannot link evidence unambiguously.

Recommend one based on recoverability, privacy, write ownership and compatibility. Keep content revisions stable across reads. Do not concatenate the vector or stamp a new revision per observation.

Define recovery from a security event to exact school/Staff ID, immutable content and field/group/catalogue revisions, effective intervals, evaluatedAt and actual asOf. Distinguish acceptance audit (B) from access-decision evidence; one does not automatically satisfy the other.

Specify positive and negative recovery tests after process restart and backup restoration, missing/tampered observation, wrong school, reused event/operation with changed intent, unknown write outcome and independently changing retention. Identify genuine retention-policy decisions for the owner; no invented indefinite retention.

F5 stays OPEN until actual durable recovery is demonstrated. No evidence writer/store or Core audit change is authorised here.

## Consolidated handoff and review

Proposed final index: `docs/v1/CODEX_QUEUE_2026-11-13_RESULTS.md`.
Include each output path and exact commit, source baseline, proposed or implemented status, real checks, limitations, owner decisions and next exact task. Do not duplicate whole contracts or create a second policy.

Planning outputs B–D can be reviewed together in one bounded documentation PR if separately authorised for publication. Do not open multiple concurrent implementation PRs or stack dependent code without coordination approval. A uses its own implementation PR after approval. Review-record main exception does not apply to these plans.

For this queue's publication, no application tests/build are claimed: inspect complete content, relative links and documentation-only scope. For later code, follow all required checks under TZ=Asia/Singapore. Official T1B-01/T1B-02 and all unperformed runtime UAT remain Not tested.

## Stop rules

Stop only the affected work for: actual overlapping claim/allocation, required out-of-scope code change, unresolved owner policy, unavailable source evidence, or a correctness/security conflict. Continue independent authorised investigation and record the blocker. Never invent authority to meet a time estimate.

Excluded throughout: production auth, live data, Contacts writes, migrations, infrastructure, notifications, deployment, automatic merge, T1C acceptance implementation and T1D transport implementation. Publication of this queue is not approval of its implementation packages.
