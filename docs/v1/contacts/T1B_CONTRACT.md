# T1B Contacts read contract, schema 1

Model: Codex. Implements the bounded package in [revised plan](T1B_REVISED_PLAN.md) and [final addendum](T1B_CONTRACT_DESIGN_ADDENDUM.md), published at `99b56377edf8cb34d05fccac671e3fbb65962ca4`. Normative source: recovered Revision 49 bundle and controlling staged-handoff addendum; exact file digests remain in the plan's source manifest. Owner subsequently authorised implementation ("take your recommendation"). This contract describes an isolated library, not an authenticated endpoint, authoritative store or deployment.

## Usage and ownership

```js
const reader = createContactsReader({schoolId, clock, readCurrent, readHistorical});
const result = await reader.readAcceptedFacts({schemaVersion:1, schoolId,
  staffId, profile:'staff', evaluationId});
const readContacts = createCoreProvider({reader, schoolId});
// Inject readContacts into unchanged T1A createAuthority({..., readContacts}).
```

`v1/contacts/contracts.mjs` owns profiles, schemas, result codes and resource bounds. `accepted-facts.mjs` owns snapshot consistency, temporal projection and injected historical reads. `catalogues.mjs` validates exact catalogue variants and referenced definitions. `core-provider.mjs` translates the authority profile into T1A's exact schema. Only pure Core contract utilities are imported; Core code/tests/contract are unchanged. No IO, production imports, persistence or retries exist in these modules.

Contacts assigns permanent Staff ID, owns facts/catalogues and attests source currentness, content identity and dependency completeness. Core owns account linkage, sessions and capability evaluation. Deploy owns planning, workloads and publication; T1C owns contributions; T1D owns authenticated transport. An injected function or correct JSON shape does not establish authenticated provenance. The trusted caller must authenticate, constrain school/actor/subject/purpose and authorise access before invoking the library. A future public adapter must not expose these functions directly to browser JSON.

Alternatives rejected: adding broad staff fields to T1A's strict three-role parser; replacing immutable content revision with a per-read counter; building a store/observation writer inside a read-only package. The single injected current reader returns a coherent bundle of snapshot and exact catalogue definitions, avoiding extra unbound catalogue reads. `readCatalogue` returns a definition from a newly validated bundle plus its observation, not an independently combined catalogue cache.

## Query and provider envelope

All keys are exact. Identifiers follow T1A's bounded 1–128-character opaque ID syntax. Time is safe nonnegative integer epoch milliseconds. Version is exactly 1. Query fields: `schemaVersion, schoolId, staffId, profile, evaluationId`. Unknown keys (including caller `effectiveAt` or role flags) reject. One staff per query; no name/email matching.

The injected `readCurrent` receives that frozen query plus server `requestedAt`. Its exact response:

```
{schemaVersion:1, kind:'current',
 observation:{evaluationId, requestedAt, asOf},
 snapshot:{schemaVersion:1, source:'contacts', schoolId, staffId, profile, snapshotId,
   revision, sequence, fields, groups, dependencies, catalogueRefs, catalogues}}
```

`asOf` is the owner's actual source observation time, between requestedAt and receipt time. It is not last-modified time or effective time. A cache cannot be made authoritative by stamping it with a fresh time. Snapshot identity and revision identify immutable content; ordered sequence is owner-managed per school/Staff ID/profile source stream and must survive restarts. Different profiles are distinct projections/streams, not mutually interchangeable whole-staff snapshots. Any content or dependency change requires a new snapshotId, revision and higher sequence. Re-reading identical content changes observation only. Clock rollback, wrong query binding, school or Staff ID rejects.

The returned `current` result contains the frozen snapshot, canonical SHA-256 `contentDigest` over that entire snapshot, observation extended with server `receivedAt` and final `effectiveAt`, projected `fields`, and `complete`. Observation fields are outside the digest. The digest proves comparison/integrity only, not owner truth or freshness. Each projected field is `{state, record?}`. States are effective, future, expired, revoked, missing, pending, rejected or superseded. Only `effective` is an eligible current Deploy input. `complete` means all requested fields are effective, not that a staff profile is complete or any operation is authorised. Incomplete staff data need not prohibit unrelated planning; no workload calculation or publication decision is made here.

## Finite fields and profiles

| Read group | Exact fields | Types |
|---|---|---|
| authority | smc, eo, schoolLeader | Boolean accepted facts |
| classification | profileState, schoolSection, personnelCategory, employmentArrangement, employmentStatus, employmentActive | Profile enum; four HR-term references; boolean Active |
| appointment | role, appointmentStatus, eoAppointmentLevel, memberships | Role reference; two HR-term references; unique role-reference set |
| tags | employmentTags, subjectTags, mkTags | Unique operational-tag reference sets |
| display | basicName, ttbName | Bounded 1–160-character display text, no control characters |

Profiles: `authority` contains authority only; `staff` contains classification, appointment and tags; `display` contains display only. `profileState` is provisional or complete. Complete requires effective evidence for every classification field; provisional may have explicit missing fields. employmentActive is not daily Roster activation. TTb Name is owner-derived display evidence; there is no second derivation engine. Names/labels never establish identity or grant privilege. No mobile, email, aliases, birthdays, statutory names, arbitrary fields or consumer formulas enter these schemas.

Each field holds 1–8 ordered records. An accepted record has exactly `state:'accepted', revision, value, validFrom, validUntil, revoked`; `validUntil` is null or strictly greater than validFrom. Other records are exactly `{state:'missing'|'pending'|'rejected'|'superseded'}` without values or fabricated revisions. Missing is the sole record when present. Accepted revisions are unique within a field. Non-revoked accepted intervals cannot overlap, even if the overlap is future. Schedules must therefore be unambiguous; ambiguous owner data fails rather than choosing a winner.

Select the accepted record effective at final server time with half-open intervals. Otherwise expose the nearest nonrevoked future record, or latest expired/revoked record, as explicitly non-effective evidence; without accepted records report missing/nonaccepted state. Pending/future replacements do not displace a separately valid current accepted record. Explicit false/empty sets remain accepted values; missing is neither. Both FAJT and BT survive structured tag projection without workload effects.

## Read groups and owner-defined dependent evidence

`groups` has exactly the profile's read-group keys. Each group is `{revision, vector}`. A vector has each member field mapped to the ordered array of `{state,revision}` for accepted records or `{state}` otherwise. Thus absent/nonaccepted fields participate explicitly. Compare canonical vectors exactly. A group revision cannot be reused for a changed vector.

`dependencies` is exactly `{complete:true, definitions:[...]}`. Each definition is `{groupId, definitionRevision, revision, members, vector}` with unique, nonempty members contained in the projection and an exact vector. Definition revision binds group membership; group revision binds definition and field-state vector. These are Contacts-supplied dependent groups, not T1B-invented T1C acceptance groups. `complete:true` is an owner attestation, not something JSON validation proves. If a required dependency spans fields unavailable in the requested profile, the source must report unavailable instead of omitting it or expanding the profile. No contribution acceptance, group policy inference or arbitrary validator is implemented.

## Catalogues

A field reference is exactly `{catalogueId, revision, code}`. Sets contain unique references. `catalogueRefs` is the unique list of `{catalogueId,revision}` for all snapshot dependencies, including authority provenance. `catalogues` must contain exactly those definitions, without duplicates or missing revisions. A definition is `{catalogueId, revision, kind, entries}`. All entry variants contain `code, label, active, definitionRevision` plus:

| kind | Additional exact fields |
|---|---|
| operational-tag | category (employmentTags/subjectTags/mkTags), ttbVisible boolean, order integer 0–10000 |
| membership-role | flags with exactly sl/sc/smc/kp/tl/sdt/cmt/sat/support/mk booleans; eoAppointment null or exact reference to an eoAppointmentLevel HR term |
| hr-term | category equal to a registered HR-term field |

Every accepted reference, including future/expired records, resolves against exact kind/category/code/revision. Retired entries remain valid reference evidence; retirement does not revoke an assignment. Unknown codes or mismatched definitions fail the affected projection, never inventing an effect. Catalogue capability flags do not replace accepted staff roles. Definition references and values are preserved for historical recovery. `readCatalogue(query,{catalogueId,revision})` returns kind catalogue, schoolId, staffId, profile, source revision/sequence, the matched definition, snapshotId, contentDigest and observation; no creation/import/update API exists. Synthetic catalogues contain declared test values only, not an invented production vocabulary.

## Core compatibility

`createCoreProvider({reader,schoolId})` accepts a trusted reader created above. It validates T1A's provider query and requests the authority profile, then strips everything except T1A's exact school/staff/evaluation/asOf/source revision/sequence, accepted source/status and three role facts/revisions. It preserves interval-bearing booleans, including future/expired/revoked records. Missing/nonaccepted role evidence fails; it is never converted to false.

For each authority role, the owner must supply exactly one accepted interval-bearing record (nonaccepted observations may accompany it). Multiple scheduled accepted role records fail safely: selecting different records as time passes would change T1A's fingerprint at an unchanged source sequence. The owner must advance the authority projection's content identity when replacing that selected record. The broader staff/display profiles support nonoverlapping schedules. A single role interval crossing its start/end preserves content identity and is evaluated at Core's final clock. This is a compatibility constraint, not a new permission policy or per-read version increment.

Core remains responsible for the settled capability matrix, independent Admin, read-only preview, school/session checks and revalidation. A source revision/sequence change correctly invalidates prior authority. Group/catalogue dependency changes must advance the authority stream even if its three booleans stay equal. No post-check consumer-commit guarantee is added.

## Historical recovery and F5

`recoverSnapshot` query adds `snapshotId, revision, sequence, contentDigest` to the normal query. The injected historical reader returns exactly `{schemaVersion:1,kind:'historical',snapshot}`. Validate full schemas and exact identity/digest. The result remains kind historical and includes `observationRecovery:'not-provided', evidenceComplete:false`. It has no current flag, current observation or accepted current projection. It neither updates live watermarks nor falls back to the latest snapshot. The caller must retain a trustworthy reference/digest; a caller-selected digest is not authenticated proof.

**F5 OPEN.** Snapshot recovery is not decision-observation recovery. This package contains no durable writer or event association. The existing audit projector drops Staff ID/observation additions; tests verify that limitation. A later separately approved evidence record must recover school/Staff ID, immutable facts/role/group/catalogue revisions, intervals, decision effective time and the actual query-bound observation after restart. No concatenated revision or per-read counter workaround is allowed. Synthetic retained snapshots and fresh reader instances test interfaces only, not storage durability, backup restoration or live integration.

## Failure and resource contract

Methods return `{schemaVersion:1,kind:'failure',code,retryable}` without provider payloads or exception strings. Codes: MALFORMED_QUERY, INVALID_EVIDENCE, SCHOOL_MISMATCH, STAFF_MISMATCH, STALE_EVIDENCE, UNAVAILABLE, TIMEOUT, LIMIT_EXCEEDED, INCOMPLETE_EVIDENCE, REFERENCE_MISMATCH. Only stale/unavailable/timeout are retryable; there is no internal retry loop. Unknown provider exceptions map to unavailable. Core adapter maps timeout to PROVIDER_TIMEOUT, stale to AUTHORITY_CHANGED, other reader failures to AUTHORITY_UNAVAILABLE and malformed adapter evidence to PROVIDER_INVALID. Consumer transport status mapping belongs to T1D.

Limits: 256 KiB total response, depth 16, 32768 walked values, 64 fields, 8 records/field, 128 accepted catalogue references, 128 catalogue dependencies, 256 total returned entries, 32 dependent groups. Reject excess, never truncate. Objects with accessors, cycles, non-JSON prototypes/values or unsupported keys fail. Copy/freeze at boundaries; query/reference mutation cannot redirect an in-flight read. Default deadline 1000ms, trusted configuration 1–30000ms. Timeout stops processing the result, not the underlying provider operation; providers must remain side-effect-free and supply their own resource/cancellation bounds. No background durable jobs exist.

Per-reader rejection-only maps retain at most 128 staff/profile streams and 8192 immutable identity fingerprints; exhaustion fails explicitly, with no silent eviction. They detect sequence rollback and changed content under reused snapshot/source/field/group/catalogue identities observed in that instance. All entries from a current observation are checked before synchronous installation. Historical reads do not poison current sequence tracking. Memory proves neither distributed freshness nor immutable-history truth; fresh processes require owner-attested reads and durable source sequences. The adapter must define its instance lifecycle before live use.

## Source and verification map

| Requirements | Implementation | Engineering cases |
|---|---|---|
| T101 version/permanent identity, CT01/10, TM01 | contracts; snapshot envelope | B01–B02 |
| CC01/07, accepted/effective/missing facts | accepted-facts and field schemas | B03–B05 |
| CC06 and field/group consistency | snapshot groups/dependencies | B06 |
| TL01–07, TV02 catalogue ownership | catalogues and narrow Core adapter | B07, B10 |
| TV06 revision/as-of, CO04 history | observation validation, current vs historical variants | B08–B09, B11 |
| TM06 immutable evidence and F5 limits | digest-bound injected recovery | B11 |
| T102 isolation, engineering scope | dependency/discovery/allowlist checks | B12 |

B01–B12 are engineering checks, not official UAT. Seven top-level test programs are discovered by the unchanged runner. Run canonical `TZ=Asia/Singapore npm run build` and check no tracked generated drift, the seven `tests/v1-contacts-*.mjs` programs, unchanged Core regressions, and full existing Node/LORD CI. For task scope use `T1B_BASE_SHA=620010fb85c4d90b498d15724250af1d86a469c5`; CI on this branch also enables it. Outside this task context only permanent dependency/discovery checks run, so later unrelated work is not frozen by a historical diff allowlist.

Official **T1B-01: Not tested. T1B-02: Not tested.** Runtime UAT, live Contacts reads, durable observation recovery, T1D authentication and consumer commit ordering remain separate gates. Exact commands/tested SHA/actual outcomes and omissions are recorded in the task and PR, not inferred from this document. Claude independently reviews the exact head. Rollback removes an unused library/tests/docs; no data or configuration rollback. This work does not authorise deployment.
