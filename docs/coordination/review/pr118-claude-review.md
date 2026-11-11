# PR #118 review (v1 Core T1A), Claude

Model: Claude. Reviewed 12 Nov 2026 (Asia/Singapore).

| Item | Value |
|---|---|
| Head reviewed | `11f7329af97bcd728d94028362f7ecbfa689d837` |
| Base | `c4c1de8aed5c9f062cbdc7e6ed83deb721fbb3c3` (equals current origin/main; no conflict) |
| Verdict | **Changes requested** (one medium finding, F1) |

## Evidence I produced

Separate worktree at the exact head, `npm ci`, `TZ=Asia/Singapore`:

1. `tests/v1-core-identity.mjs`, `-session`, `-authority`, `-races`: pass.
2. `T1A_BASE_SHA=c4c1de8… node tests/v1-core-isolation.mjs`: 4/4 pass, allowlist verified, runner selects 1056 programs.
3. `npm run build`: success, no tracked drift.

Not run by me: full `npm test` (1056 Node programs plus LORD). Not verified by me: GitHub CI runs for this head (GitHub connector unavailable in this session). The PR body's CI claim stands as Codex's evidence only.

Not verifiable: the Revision 49 specification, handoff and UAT documents are not in the repository. I checked the code against `docs/v1/core/T1A_CONTRACT.md`, not against Rev49.

## Scope

Diff is 13 files: the 12 allowlisted paths plus an additive `LANES.md` entry. No production imports, generated outputs, CI or runner changes. Matches the task record.

## Findings

### F1 (medium, fix before approval): concurrent requests in one session deny each other

`v1/core/authority.mjs` keys `inFlight` by `[actorAccountId, sessionId]` only. Any later-started evaluation for the same session makes every earlier one fail with `AUTHORITY_CHANGED`, even for a different action or resource.

Reproduced at the head: two parallel `deploy.read` calls for `plan-1` and `plan-2` from one session, first provider call 20 ms slower. Result: `deny AUTHORITY_CHANGED | allow CAPABILITY_ALLOWED`.

Impact: any page that loads two resources in parallel gets spurious 409s. Consumers retry; retries collide again under load. Sequence rollback is already caught by the `watermarks` check, so this extra guard adds denial without adding safety for unrelated requests.

Fix options (Codex chooses): key `inFlight` by the full `binding(request, context)`, or remove it and rely on the sequence watermarks. Add a test: two concurrent evaluations for different resources in one session both allow; two overlapping evaluations for the same binding keep the current older-response rejection.

### F2 (low, note in contract): unknown `kid` returns retryable 503

`google-identity.mjs`: a token whose `kid` matches no key returns `SIGNING_KEYS_UNAVAILABLE` (503, retryable). The `kid` is attacker-controlled, so junk tokens look like a provider outage. This suits key rotation, but the T1D adapter must refresh keys once and then map to 401, or monitoring will alert on garbage. Record this in the contract.

### F3 (low): no clock-skew grace on `iat`/`nbf`

Documented as deliberate. A server clock a few seconds behind Google rejects fresh tokens. Acceptable for T1A; T1D should decide a bounded grace.

### F4 (low): `reauthenticate` folds every failure into `REAUTHENTICATION_REQUIRED`

A Google key outage (503) becomes a 401, sending users back to sign-in during an outage. Acceptable now; T1D should preserve the unavailable class.

### F5 (low): audit takes one `contactsRevision`; decisions carry four

Allowed decisions return `contactsRevisions {source, smc, eo, schoolLeader}`. Audit projection accepts a single `contactsRevision`. Pick the field the audit trail needs before T1B.

## Governance point for the owner

The task record and the new `LANES.md` V1C entry name **ChatGPT** as v1 coordinator. `OWNER_DIRECTIVES.md` has no entry adding ChatGPT as a model or moving v1 coordination. The quoted instruction ("sufficiently released. overwrite gate conditions, proceed") releases a gate; it does not on its face appoint a coordinator. If the owner made that appointment, record it dated in `OWNER_DIRECTIVES.md`. Until then, I treat V1C as owner-claimed, not repository-verified.

Resolved 12 Nov 2026: owner confirmed the appointment ("yes i appointed"). Recorded in `OWNER_DIRECTIVES.md`.

## Next action

Codex fixes F1 on `codex/v1-core-t1a`, adds the test, notes F2 in the contract, and posts the new head. I re-review only the new commits. No merge or deployment is approved or implied.
