# PR #125 review (v1 Contacts T1B), Claude

Model: Claude. Reviewed 12 Nov 2026 (Asia/Singapore).

| Item | Value |
|---|---|
| Head reviewed | `b4cbec95b3a335b3212bbd3770bbdefb66d37833` |
| Base | `620010fb85c4d90b498d15724250af1d86a469c5` (equals current origin/main) |
| Verdict | **Approve the library** (advisory; owner merges). **Live integration blocked** on decision D1 below. |

## Evidence I produced

Separate worktree at the exact head, `npm ci`, `TZ=Asia/Singapore`, `T1B_BASE_SHA=620010f…`:

1. Seven Contacts programs: catalogues 4/4, contracts 3/3, core-provider 4/4, isolation 3/3, races 7/7, recovery 3/3, snapshots 6/6. 30 cases.
2. Five unchanged Core programs: 26 cases pass.
3. `npm run build`: success, no tracked drift.
4. `git merge-tree` against origin/main: clean.
5. `v1/core/*` and `tests/v1-core-*`: zero changes. Scope matches the 14-path allowlist.

Not run by me: full `npm test`. CI at this head: not verified by me.

## Findings

### M1 (medium, integration gate): blank role evidence reads as an outage

`v1/contacts/core-provider.mjs` requires exactly one accepted record for each of SMC, EO and School Leader. A `missing` record throws `PROVIDER_INVALID`, which T1A maps to 503 unavailable, retryable.

Reproduced at the head through the real Core authority:

| Contacts evidence | Action | Result |
|---|---|---|
| SMC true, EO blank, SL false | read | unavailable PROVIDER_INVALID retryable |
| All three roles blank | read | unavailable PROVIDER_INVALID retryable |
| All three roles explicit false | read | deny CAPABILITY_DENIED |

Fail-closed is correct; the class is wrong. Effects once live:
1. A teacher with blank role fields sees "service unavailable, retry", not "no permission". Retries never succeed, because the fault is data, not service.
2. An SMC with a blank EO field cannot even read, although read needs SMC only.
3. Every such request raises an outage signal, so monitoring cannot tell a real Contacts outage from incomplete data.

The spec forbids turning missing into false; that rule stands. The fix is a distinct deny, not a false value. **Decision D1** (needed before T1D integration):
1. Data: Contacts holds an explicit accepted record for all three roles for every staff member (backfill plus a readiness check), and/or
2. Contract: a later, separately reviewed T1A change adds a non-retryable deny code for missing authority evidence (403 class), which the provider uses instead of `PROVIDER_INVALID`.

I recommend both. Option 2 alone makes the failure honest; option 1 makes it rare.

The existing B10 test asserts only `outcome !== 'allow'` for a missing role. When D1 is implemented, assert the reason code and retryable flag.

### L1 (low, integration gate): reader limits must match the school's size

The reader keeps at most 128 staff/profile streams and 8192 identity fingerprints, with no eviction; exhaustion fails every later read with `LIMIT_EXCEEDED` (to Core: 503). That is deliberate and documented. But one long-lived reader per school would stop serving staff beyond the 128th stream. T1D must create readers per request or per bounded batch, or size limits from headcount with a tested reset. Add this to the T1D entry criteria.

### L2 (low): F5 remains open

Snapshot recovery is not decision-observation recovery. Documented honestly and tested as a limitation. No action in T1B.

## Next action

Owner decides D1. Codex records D1 and L1 as T1D entry criteria in the T1B contract or the T1D plan. No code change required on this PR for library approval. No merge or deployment approved or implied.

## Owner input on D1 (12 Nov 2026)

Owner: "a teacher is an EO (education officer) but is generally blank in some of the fields".

EO is an employment grade most teachers hold, not a rare role. So the blank-field problem hits the common case:
1. An SMC who is an EO but has a blank EO field cannot edit or publish. Today that shows as 503; after the D1 code fix it shows as denied. Either way, a legitimate planner loses access at go-live.
2. The spec forbids inferring EO from blanks or teaching eligibility, so the code must not guess.

Consequence: D1 option 1 (explicit records) is mandatory, not optional. Before T1D go-live, Contacts must hold an accepted yes/no for SMC, EO and School Leader for every staff member, and a readiness check must report any staff member with a blank role field. A prefill from an HR source is acceptable only if a Contacts owner reviews and accepts each record; the prefill is not itself evidence. D1 option 2 (honest non-retryable denial) remains recommended.

## Reconciliation with the earlier record on main (fdc2dea)

Another Claude session (session_01L5sZ12iTdr4BjdeR74Bx43) committed a shorter review of the same head to main in fdc2dea, verdict approve, without finding M1. Both reviews agree the library is safe to merge, and its finding 2 matches L1 here. This record adds M1 (blank role evidence returns retryable 503) and decision D1, reproduced at the head. Where they differ, this record governs: library approved, live integration blocked on D1. The earlier text is kept verbatim below.

<details><summary>Earlier record, verbatim</summary>

# PR #125 review (Claude): v1-contacts-t1b bounded Contacts read library

- Head reviewed: b4cbec95b3 (codex/v1-contacts-t1b). Reviewer: Claude (independent exact-head review named in the task; ChatGPT coordinates v1).
- Verdict: **approve**.

## Evidence
- CI at the head: full-suite success; regression shards 1-4 success.
- Local, TZ=Asia/Singapore, T1B_BASE_SHA=620010fb85c4d90b498d15724250af1d86a469c5: all 7 `tests/v1-contacts-*.mjs` pass; all 5 unchanged `tests/v1-core-*.mjs` pass.
- Diff: exactly the 14 allowlisted paths. No production code, Core code, generated output, CI or dependency change. Merge-tree against main: clean.

## Findings (none blocking)
1. Fail-closed throughout: exact-key schemas, bounded walk (depth, nodes, bytes), timeout via race with cleared timer, every unexpected error maps to `UNAVAILABLE`/`PROVIDER_INVALID`. The Core adapter requires exactly one accepted record per authority role and never infers authority from names or catalogue labels.
2. Watch for T1C (integration): the reader keeps per-instance rejection maps capped at 128 staff/profile streams and 8192 identities, and fails explicitly when full (documented, no silent eviction). A school of about 150 staff with 3 profiles exceeds 128 streams. The integrating code must create a reader per evaluation or request, not one per Worker isolate, or authority reads will start failing closed for everyone. Record this in T1C's design.
3. `recoverSnapshot` correctly does not move current watermarks or invent an `asOf`.

## For the owner
Safe to merge: isolated library, no live effect. "merge 125" when ready.

</details>
