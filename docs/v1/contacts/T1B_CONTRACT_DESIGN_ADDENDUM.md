> Publication record — 12 November 2026. Model: Codex. The owner explicitly requested publication of these planning documents directly to main, instead of local transfer. This authorises this two-document publication only, overriding the default PR route for this delivery. It creates no implementation claim and grants no T1B implementation, merge of other work, deployment or live-data authority. Historical statements about no edits describe the planning review before publication. Source: chat "Work - Do T1B", document blocks 73184 and 84216. No independent review, build or test run is claimed for this publication.

Related: [Revised T1B plan](T1B_REVISED_PLAN.md), including the exact proposed 14-path allowlist and official UAT mapping.

# GSiS v1 T1B — final contract-design addendum  
**PROPOSED — NOT AUTHORISED FOR EXECUTION**

This addendum refines the preceding revised T1B plan. Its source requirements, exclusions, exact 14-path allowlist and official UAT mappings remain applicable.

**1. Source requirements versus engineering decisions**

Source requirements remain: permanent Staff ID; accepted/effective-dated facts; field/group revisions; Contacts-owned catalogues; revision/as-of evidence; explicit absence/staleness behaviour; no Contacts writes, migration or contribution acceptance.

The field names, result variants, read groups and recovery interfaces below are proposed engineering decisions. They introduce no new school policy or catalogue meanings.

**2. Finite field register**

Every field is keyed by permanent Staff ID within one school. Contacts owns every fact listed below; Core alone interprets capability policy.

| Proposed field | Value type | Projection |
|---|---|---|
| `smc`, `eo`, `schoolLeader` | Boolean with accepted revision and effective interval | Core authority |
| `profileState` | `provisional` or `complete` | Deploy staff facts |
| `schoolSection` | Catalogue code reference | Deploy staff facts |
| `personnelCategory` | Catalogue code reference | Deploy staff facts |
| `employmentArrangement` | Catalogue code reference | Deploy staff facts |
| `employmentStatus` | Catalogue code reference | Deploy staff facts |
| `employmentActive` | Boolean; distinct from Roster daily activation | Deploy staff facts |
| `role` | Catalogue code reference | Deploy staff facts |
| `appointmentStatus` | Catalogue code reference | Deploy staff facts |
| `eoAppointmentLevel` | Catalogue code reference; reference-only | Deploy staff facts |
| `memberships` | Unique set of catalogue code references | Deploy staff facts |
| `employmentTags`, `subjectTags`, `mkTags` | Unique sets of catalogue code references | Deploy staff facts |
| `basicName`, `ttbName` | Bounded text; display-only | Deploy display |

A catalogue reference contains catalogue identity, exact revision and stable entry code. Labels are not keys. No parsing of TTb Name, comma-separated legacy strings or blank-as-default classification.

The contract does not manufacture a production catalogue. Synthetic fixtures use explicitly declared test definitions. Production vocabulary and legacy mapping remain separate integration/migration work.

A provisional profile may lack classification fields. An accepted empty tag set is valid evidence; a missing set is not an empty set. A `complete` claim with absent required classification evidence is inconsistent.

`ttbName` is supplied as Contacts-derived display evidence. T1B does not implement a second name-derivation engine.

**3. Exact evidence distinctions**

Use separate representations for:

- **Accepted record:** value, immutable field revision, `validFrom`, nullable `validUntil`, and revocation state.
- **Absent record:** explicit missing state; no invented value or field revision.
- **Nonaccepted observation:** pending, rejected or superseded, without exposing proposed values through the accepted-facts interface.
- **Read failure:** unavailable, timeout, stale or invalid evidence.

An accepted record can be future-effective. Acceptance does not imply current applicability.

For current Deploy inputs, select only accepted records effective at the trusted evaluation instant. A current accepted record may remain usable while a different future or pending change exists. Overlapping accepted records without an unambiguous owner-supplied selection fail as inconsistent.

For Core, preserve T1A’s interval-bearing booleans. Do not replace a future or expired positive fact with a fabricated accepted false fact. Core evaluates its interval at the final authority check.

**4. Read groups without inventing acceptance policy**

Use fixed projection groups:

| Group | Fields and purpose |
|---|---|
| Authority | `smc`, `eo`, `schoolLeader` |
| Classification | Profile state, school section, personnel category, employment arrangement/status and employment Active |
| Appointment and membership | Role, appointment status, EO appointment level and memberships |
| Structured tags | Employment, subject and MK tags |
| Display | Basic Name and TTb Name |

These are **read-consistency groups**, not new T1C acceptance groups.

For each group, require a group revision bound to its exact field-state/revision vector. Require all groups in a response to belong to the same owner snapshot. An absent field participates explicitly in the vector; it cannot disappear from comparison.

Contacts-owned dependent validation groups may span these read groups. Their definition revision and member-field vector must accompany affected evidence. T1B checks that the supplied group is complete and internally consistent. It does not invent which combinations are valid or accept/reject contributions.

A source unable to attest consistent dependent evidence returns unavailable/invalid for the affected projection. A transport envelope saying “accepted” does not override contradictory field evidence.

**5. Catalogue contract**

Maintain separate exact variants:

- **Operational tag:** stable code, category, label, TTb visibility, display order, active state and definition revision.
- **Membership/role reference:** stable role code, formal label, explicit source-defined membership flags and EO appointment reference.
- **HR term:** stable code, field category, label and definition revision.

Do not force unrelated catalogue types into one permissive object.

Catalogue definitions contain no Deploy workload formula or Roster allocation rule. Unknown codes cannot acquire business effects. Retired definitions remain recoverable for existing assignments/history; retirement does not itself delete a staff assignment.

Capability flags in a reference catalogue never substitute for current staff authority evidence. Core continues to consume explicit accepted SMC/EO/School Leader facts.

**6. Freshness and snapshot identity**

Separate two records:

1. **Immutable content snapshot:** school, Staff ID, source revision, ordered sequence, field/group revisions, catalogue dependencies and values.
2. **Read observation:** evaluation identity, requested time, actual owner observation `asOf`, snapshot reference and effective evaluation context.

Identical content can have several fresh observations without changing its content revision or sequence. Changed content or dependencies require a new revision and advancing sequence.

The owner reader must obtain a consistent snapshot and attest the read. The adapter cannot prove truth merely by checking timestamps or hashes. A fresh process must obtain current owner evidence rather than relying on remembered high-water marks.

Historical recovery returns a historical variant and never `current: true`. Failed recovery never substitutes the latest record.

The proposed resource limits from the revised plan remain engineering limits to validate against fixtures, not approved school-size limits. Reject oversized data explicitly; never truncate an authoritative projection.

**7. F5: why the obvious workaround fails**

The merged T1A evaluator excludes `evaluationId` and `asOf` from its evidence digest, but includes source revision and sequence. Revalidation requires the same authority digest when underlying evidence has not changed.

Consequently, assigning a new source revision to every observation would make unchanged-authority revalidation fail. It would also misuse content sequence as a read counter.

The existing audit projection drops unrecognised fields. Adding an `asOf` or observation reference to a caller object does not preserve it automatically.

Therefore:

- Keep `contactsRevisions.source` as immutable content identity.
- Do not concatenate revisions or encode observation timestamps into it.
- Keep F5 **OPEN**.
- Specify, but do not implement, a future durable observation record linked unambiguously to the security decision/audit event.
- Close F5 only after recovery demonstrates school/Staff ID, exact content and field revisions, catalogue/group dependencies, effective instant and actual observation evidence.

A separate audit extension may be required if the existing event identifiers cannot provide that durable linkage. No Core/audit changes enter the T1B allowlist.

Code evidence: [T1A authority evaluator](https://github.com/helper-gsps/gsis/blob/96f2b7d823c49f58216b2b7fb4b75c6fa14f056a/v1/core/authority.mjs), [audit projection](https://github.com/helper-gsps/gsis/blob/96f2b7d823c49f58216b2b7fb4b75c6fa14f056a/v1/core/audit.mjs).

**8. Additional concrete tests**

Extend the existing B01–B12 plan with these assertions:

| Existing test | Additional assertion |
|---|---|
| B03 | Accepted empty sets differ from missing sets; FAJT and BT both survive projection |
| B04 | A pending/future replacement does not erase a separately valid current accepted record |
| B06 | Changing a member field without its group revision/vector fails; missing dependent evidence cannot be silently omitted |
| B07 | Catalogue labels cannot change identity or grant roles; retired-code history remains readable |
| B08 | Two current reads of unchanged content retain revision/sequence but carry different legitimate observations |
| B10 | Those unchanged reads pass real T1A revalidation; changing content revisions on every read is a negative control |
| B11 | Snapshot recovery succeeds while observation recovery is missing: report incomplete evidence, not F5 resolved |
| B11 | Supplying extra observation fields to the existing audit projector does not falsely count as preserved evidence |

All remain **Not tested**. Official T1B-01 and T1B-02 remain **Not tested**.

**9. Concrete implementation package proposed for approval**

The package is the isolated library, exact schemas, broad purpose-specific projections, catalogue validation, T1A compatibility adapter, synthetic contract tests and documentation described in the revised plan’s 14-path allowlist.

It includes no authoritative store or durable observation writer. Historical recovery is an injected read interface, tested against synthetic retained snapshots. Such tests establish interface behaviour only.

This package can demonstrate T101 contract coverage without pretending that three roles cover all staff facts. It cannot establish live Contacts integration or close F5.

The proposed implementation gate is now:

- Owner approves this bounded library package and the existing exact allowlist.
- Codex refreshes main/claims/overlaps, then follows the authorised claim workflow.
- Codex implements and records required checks.
- Claude reviews the exact head.
- Live-source, durable recovery, T1D transport and consumer-commit gates remain explicit.

**10. Remaining owner decisions**

Only the following need owner direction:

1. Whether to authorise this bounded T1B library implementation package.
2. Whether later F5 closure should receive a separate evidence-storage/audit scope once that concrete design is prepared.
3. Scheduling if competing Codex work actually arises.

No approval is inferred from this planning review. No claims, edits, commits, PRs, merges or deployment were performed.
