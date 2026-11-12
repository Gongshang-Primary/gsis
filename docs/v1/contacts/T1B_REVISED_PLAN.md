> Publication record — 12 November 2026. Model: Codex. The owner explicitly requested publication of these planning documents directly to main, instead of local transfer. This authorises this two-document publication only, overriding the default PR route for this delivery. It creates no implementation claim and grants no T1B implementation, merge of other work, deployment or live-data authority. Historical statements about no edits describe the planning review before publication. Source: chat "Work - Do T1B", document blocks 73184 and 84216. No independent review, build or test run is claimed for this publication.

Related: [Final contract-design addendum](T1B_CONTRACT_DESIGN_ADDENDUM.md). Read both; the addendum refines this plan without authorising execution.

# GSiS v1 T1B — revised scope and planning review  
**Status: PROPOSED — NOT AUTHORISED FOR EXECUTION**  
**Review date: 12 November 2026, Singapore**

**Evidence and precedence**

The requirements baseline is the recovered four-document bundle:

- Revision 49 consolidated specification (`GSIS_V1_CONSOLIDATED_SPEC_2026-11-11_REV49.md`, recovered bundle): principally T101–T103, TV02, TV06, CC01/04/06/07, TL01–TL07, TM01–TM07 and CO04.
- Staged handoff (`GSIS_V1_DEPLOY_STAGED_CODEX_HANDOFF_PLAN_2026-11-11_REV49.md`, recovered bundle): its controlling Revision 49 addendum separates T1B reads from T1C contributions and excludes Contacts writes and migration.
- Tranche 1 UAT (`GSIS_V1_DEPLOY_TRANCHE1_UAT_2026-11-11_REV49.md`, recovered bundle): official T1B-01 and T1B-02.
- Historical T1A execution-readiness audit (`GSIS_V1_T1A_EXECUTION_READINESS_HANDOFF_REV49_2026-11-11(1).md`, recovered bundle): ownership, evidence, privacy and integration constraints. Its historical implementation status is superseded by verified merge evidence.

The staged handoff’s Revision 48 heading is historical; its Revision 49 addendum controls. Later explicit amendments in the consolidated specification supersede earlier conflicting wording.

The recovered original ZIP’s SHA-256 is `f23f2d23a90ba0c5d333cde257f952232b14c7b63a622b47e70b76cdee155762`, matching the source-bundle digest recorded by T1A. Individual document hashes are reproduced in the source manifest at the end of this document.

**Verified GitHub baseline**

Current main was read and then rechecked at:

`96f2b7d823c49f58216b2b7fb4b75c6fa14f056a`

| Integration | Verified merge commit | Merged on 12 November, Singapore time |
|---|---|---|
| [#120 — coordination/directives](https://github.com/helper-gsps/gsis/pull/120) | `0c4d1a3a43869c0b4bb87068d6c8b3f70dff1958` | 09:35:37 |
| [#119 — engineering policy](https://github.com/helper-gsps/gsis/pull/119) | `c782c0c27ad0734acd6cf6d4fffbbdb23772cde1` | 13:00:33 |
| [#118 — T1A](https://github.com/helper-gsps/gsis/pull/118) | `f281b320c65c3e1022ea8f1c3e4ac080b55fbd69` | 13:02:12 |

All three merge commits are ancestors of the observed main. The T1A application code, contract and tests have no changes since its merge; the engineering-policy files are also unchanged.

GitHub returned successful full-suite and all four regression-shard checks at:

- T1A head `57686a304ddd75109e1ad76eaa11de5ad34004d0`.
- Engineering-policy head `4e105dceb761d4af9fc48c8bfbf03625547769e7`.

These are existing CI results, not tests run during this planning review.

All 14 currently open PR file inventories were inspected; none overlaps the proposed paths below. The complete main tree contains no T1B implementation or named T1B task record; the T1B branch search returned none. This does not certify absence of unpublished work. Recheck immediately before any authorised claim.

The scoped v1 instructions, engineering policy and owner directives apply. ChatGPT coordinates v1, Codex builds and Claude reviews the exact head. Existing V1C lane wording authorises T1A only; T1B needs its own authorised scope.

**Source requirements — settled**

T1B provides a versioned, purpose-limited Contacts read contract covering:

1. Permanent Contacts-assigned Staff ID.
2. Accepted facts and their effective intervals.
3. Individual field and dependent-group revisions.
4. Contacts-owned catalogue definitions and revision references.
5. Source revision, observation/as-of evidence and consistent snapshots.
6. Explicit absence, pending, future, stale and unavailable handling.
7. Compatibility with T1A’s current-authority evaluation.
8. Immutable historical evidence without treating history as current authority.

Contacts owns staff facts and catalogues. Core owns verified account linkage, sessions, independent Global Admin and capability evaluation. Deploy owns planning assignments, workload calculation and eventual publication. T1C owns contribution acceptance; T1D owns authenticated transport.

The source excludes Contacts writes and staff migration from T1B. No new owner decision is needed to establish those exclusions.

**Proposed engineering design**

Use a broader Contacts read contract with a narrow T1A compatibility projection:

- `readAcceptedFacts`: reads a bounded, purpose-specific staff projection from an injected Contacts-owned snapshot reader.
- `readCatalogue`: reads the exact catalogue revision referenced by that projection, under the same consistency contract.
- `recoverSnapshot`: reads historical evidence by immutable identity and revision; its result cannot satisfy a current-authority request.
- `readContacts(query)`: projects only the three authority facts into the existing T1A schema.

These names and shapes are proposals, not source-prescribed APIs. They are internal library interfaces, not public HTTP endpoints or deployed Service Bindings.

The Contacts reader must return owner-attested data. Validating JSON does not authenticate its origin or prove storage freshness. Missing reader configuration fails safely. Synthetic readers demonstrate contract behaviour only; they do not establish live integration.

A single current read must bind:

- `schemaVersion`, `schoolId`, permanent `staffId`, request/evaluation identity.
- `source: "contacts"`, immutable `snapshotId`, source `revision` and ordered `sequence`.
- `asOf`: when the owner actually observed current source state.
- `effectiveAt`: the instant at which fact validity is evaluated.
- Field revisions, dependent-group revisions and exact catalogue references.
- A purpose/profile identifier preventing a narrow projection from being mistaken for a complete staff snapshot.

Keep `asOf` distinct from last-modified time and from `effectiveAt`. A fresh timestamp on old cached data is not a fresh read. Current operation time comes from the trusted server clock; an arbitrary caller date cannot select future authority.

Copy and validate external data, then deeply freeze published projections. Unknown fields, versions, field codes and contradictory metadata fail validation. No arbitrary extension bag or caller-selected validator.

**Contract matrix**

The identifiers in the Test column refer to the proposed automated checks below. All proposed paths are expanded in the allowlist.

| Applicable requirement and source | Proposed contract/fields | Authoritative owner | Test | Proposed file |
|---|---|---|---|---|
| Versioned read contract — T101 | Exact versioned query/result variants; purpose/profile; reject unknown versions | Contacts contract | B01 | `contracts.mjs`; contract tests |
| Permanent Staff ID — T101, CT01/10, TM01 | School + permanent `staffId`; no name/email lookup or identity substitution | Contacts assigns ID; Core links accounts | B02 | `contracts.mjs`, `accepted-facts.mjs`; contract tests |
| Accepted, effective-dated facts — T101, CC01, TV06 | Per-field accepted evidence, revision, `validFrom`, `validUntil`, explicit value/state | Contacts | B03–B05 | `accepted-facts.mjs`; snapshot tests |
| Field revisions — T101 | Stable field codes and immutable field revisions; missing differs from false/empty | Contacts | B03, B06 | `contracts.mjs`, `accepted-facts.mjs`; snapshot tests |
| Dependent-group revisions — T101, CC06 | Group code, group revision, exact member-field revision vector | Contacts defines valid combinations | B06 | `contracts.mjs`, `accepted-facts.mjs`; snapshot tests |
| Catalogue ownership — T101, TL01–TL07, TV02 | Catalogue ID/revision; stable entry codes; category, label, visibility, order and active state where specified | Contacts; Global Admin governs definition changes outside T1B | B07 | `catalogues.mjs`; catalogue tests |
| Revision/as-of evidence — T101, TV06 | Snapshot/source revision, sequence, owner observation `asOf`, effective instant, request binding | Contacts attests; consumers verify | B08–B09 | `accepted-facts.mjs`; snapshot/race tests |
| Absence/staleness — T101 acceptance table | Explicit missing, pending, not-effective, stale, unavailable and invalid outcomes | Contacts reports facts; consumer decides permitted operation | B04–B05, B08–B09 | `accepted-facts.mjs`; snapshot/race tests |
| Current authority compatibility — T101 dependency, historical audit | Exact T1A `readContacts` envelope and `{smc, eo, schoolLeader}` facts/revisions | Contacts facts; Core decisions | B10 | `core-provider.mjs`; Core integration tests |
| No premature privilege or inference — T101, TJ01, CC07 | No role inference from names, missing classifications, drafts or pending proposals | Core capability policy | B05, B07, B10 | `core-provider.mjs`; Core integration tests |
| Historical identity and provenance — TV06, TM06 | Recover exact school/Staff ID/snapshot/revision, fields/groups/catalogues and effective context | Contacts historical evidence; consumer retains use context | B11 | `accepted-facts.mjs`; recovery tests |
| Isolation and ownership — T102, TV02 | Read-only exports; no foreign-domain writes or production imports | Each domain retains its boundary | B12 | All modules; isolation test |
| No execution or UAT promotion — T103 | Separate engineering evidence, runtime UAT and integration readiness | Owner approval; builder evidence | Review gate | Contract and future task record |

**Field coverage and purpose limitation**

The field register must explicitly cover the following source-defined families. Internal field names and encodings are engineering choices; their meanings and owners are not.

| Projection | Required coverage | Restrictions |
|---|---|---|
| Core authority | SMC, EO and School Leader, each explicit and effective-dated | No names, contact details, employment defaults or catalogue-driven capability grants |
| Deploy staff facts | Permanent Staff ID; profile/provisional state; school section, personnel category, employment arrangement/status; school role, appointment status, memberships; structured employment, subject and MK modifiers/tags | Preserve combined tags such as FAJT + BT; missing classification stays unknown; no workload computation |
| Deploy display/reference | Basic Name and Contacts-derived TTb Name where needed; EO Appointment Level as reference evidence | Display names never establish identity, eligibility or privilege |
| Catalogue reference | Membership/role, HR Terms and operational-tag definitions relevant to the projection, with stable codes and exact revisions | Read-only; no catalogue import, replacement, definition creation or consumer formula storage |

Do not expose statutory names, mobiles, birthdays, email or aliases merely because they exist in Contacts. CC04 requires purpose-specific disclosure. Any additional field needs a documented consumer purpose and source mapping.

Contacts supplies structured facts and catalogue identity. Deploy owns workload effects; Roster owns relief effects. T1B must not invent a complete catalogue from examples in the specification or implement new business effects for unknown codes.

Dependent-group membership must be a finite, documented contract derived from Contacts validity rules. T1B preserves and validates the owner’s group revision vector; it does not decide which contribution to accept. Unsettled combinations block the affected field profile rather than receiving an assumed grouping.

**Why three roles are insufficient**

The merged T1A parser accepts exactly three facts and three field revisions. It has no fields for employment arrangements, appointment facts, combined subject/employment tags, dependent groups or catalogue revisions. Adding those fields directly would violate its exact-key schema.

Therefore:

- The three-role adapter covers the Core-authority projection only.
- The broader Contacts snapshot contract supplies the other T101 requirements.
- The adapter strips unrelated fields and preserves all three original role intervals and revisions.
- Field/group/catalogue consistency must be checked before projection.
- Compatibility tests must feed the adapter into the real, unchanged T1A evaluator.

This establishes a proposed design covering the T101 requirement categories. It is not proof that a live source or a finished implementation satisfies them.

**Explicit fact and failure behaviour**

Acceptance state, effective state and read freshness are separate concepts.

| Condition | Required behaviour |
|---|---|
| Accepted and effective | Eligible for the requested fact projection only after identity, revision, catalogue and freshness checks |
| Accepted explicit false or accepted empty set | Preserve that value with evidence; do not confuse it with missing |
| Pending proposal | Exclude from accepted inputs. Report a non-authoritative diagnostic if authorised; never promote its value |
| Future accepted fact | Preserve its interval as future evidence; exclude from current effective inputs. It must not displace a still-valid current fact prematurely |
| Missing field or Staff ID | Explicit missing result; no fabricated false, zero, full-time EO, empty membership or synthetic identity |
| Expired/revoked fact | Cannot supply current positive authority; historical evidence remains historical |
| Rejected or superseded proposal | Exclude from current accepted inputs; preserve permitted historical references |
| Stale, rolled-back or mixed revision | Retryable safe failure; do not combine individually plausible fields from inconsistent snapshots |
| Invalid/future observation time | Reject evidence; do not correct the timestamp locally |
| Contacts unavailable or timeout | Explicit unavailable result; no stale-authority fallback. A late completion cannot replace the returned result |
| Unknown catalogue code or unsupported semantics | No new permission/workload effect; block the affected authoritative projection until compatible interpretation exists |
| Retired catalogue entry | Preserve historical/current assignments as specified; do not treat retirement as deletion or silently assign new effects |

A pending change does not invalidate an independently verified current accepted value. Conversely, the presence of an older accepted value is not proof that it remains current.

Historical snapshots may support clearly labelled display where authorised by CO04. They cannot become accepted inputs for a new authority-sensitive operation through an age-based grace period.

A missing verified workload input also does not imply a blanket ban on unrelated planning operations. Preserve the later OK13/TV05 distinction: estimated or unavailable calculations may be represented where allowed, but cannot be labelled verified or authorise dependent Roster decisions.

For Core compatibility, valid interval-bearing role evidence retains T1A’s semantics: Core evaluates the intervals at its own final clock. A future positive interval never grants early access. Missing or unaccepted role evidence produces a provider failure, not an invented false record.

**Consistency and resource decisions — proposed**

- One requested staff projection comes from one consistent owner snapshot. Referenced catalogues and dependent groups must match that snapshot.
- Sequence scope is school + Staff ID/source stream; catalogue revisions have their own explicit scope. Sequence identity survives provider restarts and instances.
- Any change to evidence content or referenced dependency advances the owning stream’s sequence. The same revision cannot identify different content.
- In-memory high-water marks are rejection safeguards, not durable authority.
- Re-evaluate effective intervals even when revisions are unchanged.
- Current reads and historical recovery are different result variants. Historical recovery never sets `current: true`.
- Use one Staff ID per library request, finite field profiles and bounded catalogue references. No unbounded directory scan or recursive expansion.
- Proposed initial budgets: 64 projected fields, 128 tag/membership references, 256 returned catalogue entries and 256 KiB total response; reject excess explicitly. Validate these engineering limits against the final field register before implementation approval.
- Retain T1A-compatible provider deadlines: default 1,000 ms, trusted configuration within 1–30,000 ms. No internal automatic retry loop; T1D owns transport retries and cancellation.
- No locks, leases, queues or mutation idempotency machinery are needed for these read-only modules.

The remaining interval between a final remote check and a later consumer commit is unchanged. Neither a digest nor a local lock proves cross-D1 atomicity.

**Official UAT and proposed automated evidence**

All tests below are proposed and unexecuted.

| Test | Concrete automated assertion | Official mapping |
|---|---|---|
| B01 Schema | Valid profile parses; unknown version/key, malformed identifier and oversized payload reject | T1B-01 |
| B02 Stable identity | Two snapshots with changed name/classification retain the same Staff ID; missing/mismatched ID and wrong school reject | T1B-01; T1B-02 |
| B03 Accepted facts | Accepted effective scalar, explicit false and combined FAJT + BT retain values, field revisions and effective intervals | T1B-01 |
| B04 Time boundaries | Immediately before start excluded; at start included; at end excluded; unchanged revision still respects clock transition; current fact survives unrelated future proposal | T1B-02 |
| B05 Nonaccepted/missing | Pending, rejected, superseded, absent and ambiguous required fields cannot appear in accepted projection; missing never becomes false/zero/default EO | T1B-02 |
| B06 Group consistency | Matching member revisions succeed; mixed field/group snapshots and incomplete dependent groups reject without partial authoritative output | T1B-01; T1B-02 |
| B07 Catalogues | Exact definition revision resolves; unknown/mismatched definitions reject affected projection; retired code history survives; labels/name suffixes cannot grant roles; no write API exists | T1B-01; T1B-02 |
| B08 Freshness | Current query-bound read succeeds; old/future `asOf`, forged evaluation binding, rollback and reused sequence with changed content fail | T1B-01; T1B-02 |
| B09 Failure/races | Provider outage, timeout and late completion yield no accepted projection; controlled concurrent changes reject mixed data; fresh instance cannot rely on prior local watermarks | T1B-02 |
| B10 Real Core compatibility | Full role matrix, independent Admin during Contacts outage, preview mutation denial, revocation and unrelated-resource concurrency pass through unchanged T1A | Both, plus T1A regression protection |
| B11 Recovery/F5 | Exact reference recovers identity, field/group/catalogue revisions and temporal evidence; missing, tampered, wrong-school or unrecoverable reference fails | T1B-01 supporting evidence; F5 gate |
| B12 Isolation | Exact allowlist, automatic runner discovery, no production imports/network/storage writes, no dependency or generated-output change | T102 and engineering gates |

**T1B-01: Not tested. T1B-02: Not tested.**

B01–B12 are engineering labels, not replacement UAT IDs. Synthetic success would establish only the tested library behaviour. Publication persistence, authenticated transport and runtime UAT require separately authorised integration evidence.

**F5 disposition — OPEN**

The current decision exposes `contactsRevisions {source, smc, eo, schoolLeader}`. The audit accepts only `contactsRevision`; it does not retain the Contacts observation `asOf` or Staff ID directly. The decision’s `evaluatedAt` is not interchangeable with the provider’s `asOf`.

The proposed mapping

`audit.contactsRevision = decision.contactsRevisions.source`

is acceptable only when evidence demonstrates that the audit context and reference recover:

- Exact school and permanent Staff ID.
- Immutable source snapshot and the three role field revisions.
- Relevant group/catalogue revisions.
- Effective intervals and the effective evaluation instant.
- The actual observation/as-of evidence associated with that decision.
- Integrity, uniqueness and recovery after restart; no substitution of today’s record for history.

A stable content revision alone cannot recover a particular observation time if that same revision was read repeatedly. Recovery therefore needs a durable, query-bound observation record or a separately reviewed audit-contract extension.

No such durable recovery was demonstrated in this review. An in-memory fixture, hash, concatenated revision string or successful audit-sink acknowledgement would not close this gap.

Keep F5 open. Do not modify Core audit code under this allowlist. If recovery cannot satisfy the existing schema, propose a separate exact Core/audit scope before implementation depends on it.

**Proposed exact file allowlist**

These are future permissions to approve, not permission to create or edit anything now.

| Path | Purpose |
|---|---|
| `v1/contacts/contracts.mjs` | Exact schemas, field profiles, tagged results and bounds |
| `v1/contacts/accepted-facts.mjs` | Snapshot validation, effective projection and injected historical recovery |
| `v1/contacts/catalogues.mjs` | Read-only catalogue evidence validation |
| `v1/contacts/core-provider.mjs` | Exact T1A compatibility projection |
| `docs/v1/contacts/T1B_CONTRACT.md` | Source matrix, field register, failure semantics and integration gates |
| `docs/coordination/tasks/v1-contacts-t1b.md` | Future authorised claim and exact-head evidence |
| `tests/v1-contacts-contracts.mjs` | B01–B02 |
| `tests/v1-contacts-snapshots.mjs` | B03–B06, B08 |
| `tests/v1-contacts-catalogues.mjs` | B07 |
| `tests/v1-contacts-core-provider.mjs` | B10 |
| `tests/v1-contacts-races.mjs` | B09 and temporal/concurrency cases |
| `tests/v1-contacts-recovery.mjs` | B11; explicit evidence limitations |
| `tests/v1-contacts-isolation.mjs` | B12 |
| `docs/coordination/LANES.md` | Separately authorised, additive T1B scope only |

Core code, existing Core tests and `T1A_CONTRACT.md` remain read-only in this proposal. Compatibility and F5 findings belong in the new Contacts contract; an actual Core change needs a revised scope.

No wildcard permissions. Test fixtures remain synthetic and within the named test files.

**Exclusions and dependencies**

Excluded: Contacts writes, creation/relinking, migration, contribution acceptance/conflict resolution, catalogue administration, production readers, storage provisioning, HTTP/Service Binding handlers, UI, Excel, workload calculation, publication implementation, Roster integration, notifications, dependencies, build/CI changes, generated outputs, merges and deployment.

Dependencies:

- **Satisfied:** T1A merge, engineering-policy merge and recorded v1 coordination.
- **Design work still required:** finite field/profile register, source-backed value validators and dependent-group definitions; source reader consistency and recovery contract.
- **Live integration gates:** a demonstrated authoritative Contacts read implementation, durable sequence/revision behaviour, authenticated T1D transport and consumer commit-boundary handling.
- **F5 gate:** recoverable immutable snapshot plus decision observation context, or separately approved audit extension.

A contract library with synthetic providers may be accepted only as that bounded deliverable. It must not be described as completed live Contacts integration.

**Unresolved owner decisions**

1. Approve or revise the proposed T1B deliverable and exact allowlist after the remaining engineering contract details are settled.
2. Separately authorise implementation, claim/branch/PR scope and scheduling.
3. If existing audit evidence cannot support F5, decide whether to authorise a separate audit-contract extension or retain F5 as an explicit blocked integration gate.

Exact schema encoding, validation algorithms and test organisation are engineering decisions. Contacts ownership, no writes/migration, and T1C contribution acceptance are already settled and should not be reopened.

**Acceptance gates**

Before execution:

- Complete the field/profile register and every source → contract → owner → test → file mapping.
- Resolve required type/group semantics without invented catalogue values or business rules.
- Record the four source digests and this review’s exact GitHub baseline.
- Refresh main, branches, claims, open PR files and relevant policy/review records.
- Obtain explicit owner implementation authority. Publish no claim before that authority.

After authorised implementation:

- Run focused positive, negative, boundary, race and recovery checks using real T1A modules and synthetic identities.
- Prove all proposed tests are selected by the unchanged runner.
- Run canonical build, require no generated drift, then required Node/LORD regressions and exact-head CI under `TZ=Asia/Singapore`.
- Record Q01–Q08 as Pass, Fail, Pending or Not applicable with evidence. Do not waive security/recovery checks.
- Obtain Claude’s independent exact-head review, including source coverage and F5 disposition.
- Keep runtime UAT **Not tested** until executed evidence warrants a change.
- Keep contract completion, live integration, merge and deployment as separate states.

This review applied ownership, failure-state, consistency, recovery and scope analysis manually. No skill-package execution, independent review, build or new test pass is claimed.

## Source manifest

The four source files are supplied separately in the recovered Revision 49 bundle; this publication does not claim that they are committed to the repository.

| Source filename | SHA-256 |
|---|---|
| `GSIS_V1_CONSOLIDATED_SPEC_2026-11-11_REV49.md` | `8fce6177b98d8e5fd87ba924e56be31f4d70e179407782bc6dd1d78495762683` |
| `GSIS_V1_DEPLOY_STAGED_CODEX_HANDOFF_PLAN_2026-11-11_REV49.md` | `573e91875e44ec21f72935f6ca3795659760457340f5098df746705dd71244fd` |
| `GSIS_V1_DEPLOY_TRANCHE1_UAT_2026-11-11_REV49.md` | `324646f1c904359bed1fe566fd44dd498871650ef417f7a22cbff62ae816e96f` |
| `GSIS_V1_T1A_EXECUTION_READINESS_HANDOFF_REV49_2026-11-11(1).md` | `6bcbee1419862fd550c90811c7eabd87487d76688d6637d838a7bb296607c1e3` |
