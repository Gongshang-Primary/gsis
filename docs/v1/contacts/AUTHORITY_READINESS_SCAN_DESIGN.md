# Active-staff authority readiness scan — Package C design

Model: Codex. 13 November 2026 SGT. **Design only; no scan, report UI, store or cutover implemented.** Source queue `110bf5838b4a9c95735d503f42587dd0d1f34a40`, unmerged PR132; later owner authorisation permits design/publication only. Source baseline `e996dfdb3a69bee76355ba60500468679d0963de`. [EO plan](EO_AUTHORITY_READINESS_PLAN.md) and owner directives settle population: active staff must be complete; inactive staff may be informational but do not block; unknown active status cannot silently exclude a person. Verification uses the owner's own review, with [acceptance controls](AUTHORITY_ACCEPTANCE_DESIGN.md).

## Contract and owner boundary

The existing [T1B reader](T1B_CONTRACT.md) reads one school/Staff ID/profile through injected providers; it does not enumerate a directory, expose a population manifest or attest database-wide freshness. A future Contacts owner must provide the following versioned, authenticated read contract. Do not fabricate a manifest from the IDs a client happens to send.

| Read | Required response binding |
| --- | --- |
| Open scan | schoolId, scanId, manifestId, immutable manifest digest, populationRevision, authorityEpoch, catalogue/dependency epoch, snapshot time, total directory count, active count, inactive count, unknown-status count, expiry, canonical page size/order and root digest for enumerated entries |
| Page | scanId/manifestId/digest, requested cursor, page ordinal, entry range, previous/next cursor, page digest and count, bound immutable snapshot references for every entry, final flag. Opaque owner-authenticated cursor scoped to this school/scan; client cannot select a new snapshot midway. |
| Staff evidence | school/Staff ID, accepted active-status revision, authority snapshot ID/source revision/sequence/content digest, three fields and field/group/catalogue/dependency revisions with intervals. Return the exact manifest-bound version; do not fall back to latest. |
| Completion recheck | authenticated fresh current populationRevision, authorityEpoch, dependency epoch and time, compared to manifest. Unknown/timeout is incomplete. |
| Cutover preflight | repeat current revisions and verify scan report identity/digest/expiry. A successful earlier recheck is not a lock. |

The owner must advance populationRevision for additions, deletions or changes that affect membership, including reactivation, and authorityEpoch for any authority content/acceptance/revocation change. Active=false must itself be accepted authoritative evidence. Do not use UI flags, date-scoped Roster activation or a missing field as permanent employment Active=false. Catalogue changes affecting interpretation advance the dependency epoch. Content revisions change when facts change, never for each observation.

Recommend a manifest over the whole directory with explicit accepted status, rather than an active-only query that could hide unknown statuses. Inactive detailed authority rows may be omitted from blocking evaluation, but coverage/counts must prove they were deliberately excluded. Owner-generated manifest counts and digest are independently checked by the scan. A page sequence alone cannot prove an owner did not omit a staff member; the source contract and actual persistence tests must prove authoritative enumeration.

## Bounded algorithm

Proposed conservative limits, to be validated against actual school size before integration: 64 staff per page, 256 KiB maximum page body, 32 pages/2048 directory entries per scan, one in-flight page, 8 concurrent one-staff evidence reads, 2-second page/read deadlines, 120-second total scan budget and 5-minute maximum report lifetime. Hitting a limit returns incomplete, never truncated-ready. Retain at most 8 MiB of compact validated interval/reference summaries across the scan, with a 12 MiB total scanner-state budget; discard full per-staff payloads after validating and extracting these summaries. Exceeding either budget is incomplete. These are design budgets, not claims about deployed Cloudflare resources or approved retention duration. A report lifetime limits validity, not retention.

1. Authorise the caller as a same-school Contacts Power User or Admin. Generate scanId and open a trusted manifest. Validate exact schemas/version, counts, revisions, time ordering and known active-status coverage. Bind subsequent requests to its digest.
2. Fetch each page in deterministic permanent-Staff-ID order. Validate request cursor, ordinal, range, count and previous/next linkage. Retain a bounded set of seen IDs/page digests; duplicate, skipped ordinal, nonmonotonic range, changed manifest, cursor loop or premature final page is incomplete. At completion verify counts and the enumeration root digest; retrying the same page must not double-count.
3. For each active entry, recover the exact manifest-bound authority snapshot and verify all identities, digest, revisions, dependency completeness and catalogues. This is historical snapshot recovery for readiness analysis, not current authority. Inactive rows may be counted/listed separately; missing authority on them does not block. Unknown active status blocks certification because coverage is unknown.
4. After all pages/evidence are validated, choose one server `evaluatedAt` and evaluate all active entries' accepted intervals at that common instant. Do not use different page arrival times as the policy evaluation time. Explicit false is complete; a sole future, expired or revoked accepted record is not missing, but prevents current readiness. Pending/rejected/superseded-only records are missing accepted authority. Multiple ambiguous accepted schedules and malformed evidence are integrity errors. MKE+SMC inconsistency blocks. Retain bounded immutable intervals/references needed for this final pass; no raw private payload in public logs.
5. Recheck the authoritative current epochs and manifest expiry after the final evaluation. Any change invalidates the run, even if active count or booleans happen to match again (reactivate/deactivate ABA). If unchanged and all active entries are complete and consistent, emit a bound ready result. Otherwise emit blocked or incomplete with bounded reason counts; no fabricated empty pass.
6. Before cutover, recheck epochs, report digest/lifetime and the earliest upcoming interval transition. If any accepted interval changes effectiveness before cutover, the report is no longer ready even at unchanged content revision. Use `validUntil` no later than the earliest future interval boundary, manifest expiry or five-minute limit. Retry with a new scan rather than reusing stale evidence.

No auto-write, repair or implicit acceptance occurs. Proposed retries: one same-cursor retry for transient read failure within total budget; any revision change restarts as a new scan, capped at one automatic restart before returning incomplete/manual retry. Schema/identity/cursor errors are non-retryable for the same evidence. Cancellation stops processing; late pages cannot update a completed/replaced scan.

## Reader lifecycle and semantics

Use **one T1B reader per staff evidence request**, bounded by the eight-request concurrency limit, and discard it after the requested profiles finish. This never consumes a long-lived reader's 128 staff/profile stream budget. Individual payload/reference/fingerprint limits still apply; exceeding them is incomplete. For a profile count above one, the same staff reader may read its bounded classification/authority profiles, but cannot infer they share a transaction without manifest-bound revision evidence.

Fresh reader instances have no cross-request sequence memory. They therefore do **not** prove global freshness or rollback detection. The owner-attested immutable manifest, source epochs and completion/cutover rechecks carry those obligations; a restored owner needs a monotonic recovery epoch/anti-rollback mechanism before resuming service. Resetting instance maps is not that mechanism. For more than 128 staff, tests must prove complete enumeration against the owner contract, not merely that fresh instances avoid LIMIT_EXCEEDED.

T1B `recoverSnapshot` returns historical evidence and explicitly says observationRecovery not-provided/evidenceComplete false. C may inspect immutable content for readiness, with its own current manifest and evaluation boundary. It must never turn that recovered snapshot into a current Core provider response or assert that it recovers a prior decision's observation. No existing method is silently redefined.

| Result | Meaning and minimum fields |
| --- | --- |
| Ready | Complete authoritative population coverage; all active records accepted/effective/consistent; final epochs unchanged. scan/report ID, school, manifest/epoch references, evaluatedAt, checkedAt, validUntil, active/inactive counts and report digest. |
| Blocked | Coverage complete but active staff have missing/noncurrent/inconsistent evidence. Same provenance plus bounded issue counts and restricted rows. Never a permission grant. |
| Incomplete | Coverage/freshness cannot be established: failed last page, unknown status, bounds, malformed data, changed epochs, timeout, expired manifest. Partial counts are labelled partial; no ready flag. |

Reason buckets distinguish `missing-accepted-record`, `future`, `expired`, `revoked`, `ambiguous`, `malformed`, `unknown-active-status`, `population-changed`, `authority-changed`, `dependency-changed`, `incomplete-page`, `limit-exceeded` and `unavailable`. C is a report contract; it does not replace A's Core reason codes. A reactivated person's Contacts-derived access with missing accepted records uses AUTHORITY_EVIDENCE_MISSING, deny/403/non-retryable. Correcting records permits a new capability evaluation; it does not automatically grant access. Independent Core Admin remains independent; global go-live readiness is not a new per-request Admin dependency.

## Cutover and reactivation race

| Interleaving | Required outcome |
| --- | --- |
| Reactivation before opening manifest | Person appears active and must have three accepted records |
| Reactivation during any page/read/final evaluation | populationRevision differs at completion; no ready result from that run |
| Reactivation after ready report, before cutover preflight | Preflight rejects the old report and requires a fresh scan |
| Reactivation after preflight but before another database's cutover commit | **Unresolved distributed interval**; a preflight alone cannot prove safety |
| Reactivation after authorised go-live | Prior readiness evidence becomes stale; per-request authority still denies incomplete staff; require new readiness evidence for subsequent gated integration changes |

Recommend a Contacts-owned cutover reservation for later integration: conditionally reserve a particular manifest/epoch at the Contacts owner; all population/authority writers must respect that reservation or invalidate it. A lease expiry alone does not fence a delayed consumer; the consumer commit needs a verifiable, current fencing token and a defined integration protocol. Contacts and a separate Deploy database cannot share an atomic D1 transaction. The exact reservation/fence and failure/recovery protocol must be separately designed and tested with both owners before claiming closure of the final race. This read-only C design does not implement or authorise a reservation writer, a maintenance freeze or a live cutover.

## Privacy, verification and next scope

Restricted rows: school, permanent Staff ID, necessary current display name, accepted active status, missing/invalid field names and reason, source/field revision references, evaluatedAt. No names/rows in Git, CI, ordinary denial responses or cross-school logs. Counts and synthetic fixtures suffice for review. Only authorised same-school Contacts Power Users/Admins see identifiable reports. No report retention or export capability is inferred; apply the future approved retention policy, independent of the five-minute validity bound.

Required future tests (all Not tested by this design):

- 0 active staff plus known inactive directory: ready only with complete manifest/coverage; unknown status prevents it. Inactive staff with three blank records do not block; active provisional/unlinked staff with blanks do.
- At least 257 synthetic staff across five pages with fresh per-staff readers: every active ID appears once, no 128-stream exhaustion, no hidden reset-based freshness claim. Check all documented limits at/over boundary.
- Failed last page, duplicate staff/page, missing ordinal, cursor loop, wrong-school cursor, changed digest, false final marker or inconsistent counts: incomplete, never ready with zero issues.
- Reactivation at page boundary, after last page, during final recheck and after report publication: invalidated. Change active->inactive->active with equal final count must still invalidate via revision/epoch.
- Authority revoked/accepted, group/catalogue revision changes, restored lower sequence and source generation changes: old report invalid. Unrelated display-only changes need not invalidate authority if the owner contract proves dependencies unchanged.
- Common evaluatedAt catches grant expiry during scan; interval transition after report publication shortens validity and blocks stale cutover even without a content revision change.
- Readiness missing/nonaccepted versus malformed/future/expired/revoked remain distinct. Explicit three false values count as complete. MKE+SMC inconsistency blocks without inventing false defaults.
- Reactivated incomplete staff request: exact AUTHORITY_EVIDENCE_MISSING/403/non-retryable on derived path; independent Admin and preview semantics unchanged.
- Process restart discards partial in-memory scan; no ready receipt can be reconstructed from counts alone. A retained report is usable only with complete bound evidence and fresh owner rechecks; tampered/expired report fails.
- Cutover-race test pauses after preflight and changes population before consumer commit: demonstrates why preflight alone fails. Do not mark this solved by a mocked reader or a passing pagination test.

Proposed exact future library-only allowlist, requiring coordinator approval: `v1/contacts/readiness-contracts.mjs`, `v1/contacts/authority-readiness.mjs`, `tests/v1-contacts-readiness.mjs`, `tests/v1-contacts-readiness-races.mjs`, `tests/v1-contacts-readiness-isolation.mjs`, `docs/v1/contacts/AUTHORITY_READINESS_SCAN_DESIGN.md`, `docs/coordination/tasks/v1-authority-readiness-contract.md`, `docs/coordination/LANES.md`. It would inject manifest/page readers and remain non-deployed. No current T1B files, production readers, Worker bindings or database schema are included. A real enumeration source and cutover protocol need separate exact scopes after owner-store selection. Official T1B-01/T1B-02, live readiness and runtime UAT remain Not tested.
