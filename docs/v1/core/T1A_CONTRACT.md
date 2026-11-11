# T1A Core contract, schema 1

Model: Codex. Normative baseline: supplied GSiS v1 Revision 49 specification, staged handoff amendment, Tranche 1 UAT and 11 November execution-readiness handoff Section C. This is an isolated library. No production module imports it; it has no routes, database, network fetch, configuration bindings or credentials.

## Usage and ownership

```js
const core = createAuthority({
  clock: () => Date.now(), schoolId: 'school-a',
  callers: [{ serviceId: 'deploy', schoolId: 'school-a',
    actions: ['deploy.read', 'deploy.edit', 'deploy.publish'] }],
  readCore, readContacts, timeoutMs: 1000,
});
const prepared = await core.resolveAuthority(request, trustedContext);
// Preparation, waits and retries require another current check.
const checked = await core.revalidateAuthority(request, prepared, trustedContext);
// checked is evidence at evaluatedAt, NOT a lock or reusable permission to commit.
```

Core owns identity linkage, account suspension, independent Admin grants and sessions. Contacts owns accepted effective SMC, EO and School Leader facts. Deploy owns its eventual writes and commit protocol. The five modules own schema parsing, Google verification, session policy, authority evaluation and security audit respectively. All dependencies remain inside `v1/core`; Web Crypto is the only cryptographic implementation.

Chosen shape: factories capture trusted clocks, caller configuration and provider functions. Runtime request data cannot choose a provider, school configuration or role. An alternative stateless resolver receiving arbitrary evidence with every request would make it easier to accidentally trust browser role flags and would not reject delayed older responses within an instance. Importing an existing gateway would couple the contract to production IO and seven-day legacy sessions. Neither alternative is used.

The future transport adapter must authenticate the service, session reference, actor and preview context before calling this library. A JavaScript object with `serviceId` is not authentication. These APIs are not safe to expose as JSON endpoints directly. T1D owns that transport proof; T1B owns live Contacts evidence. This implementation does not build either adapter.

## Request, context and results

`request` is a plain object with only:

| Field | Shape |
|---|---|
| schemaVersion | integer 1 |
| requestId, schoolId | nonempty bounded identifiers |
| action | deploy.read, deploy.edit, deploy.publish |
| resource | `{domain:'deploy', schoolId, resourceId?}` |
| operationId | identifier, required for edit/publish |
| expectedAuthorityRevision | optional 64-character lowercase SHA-256 hex |

Identifiers are 1–128 ASCII characters matching `[A-Za-z0-9][A-Za-z0-9._:@/-]*`. Providers must supply opaque IDs, not personal names, phone numbers or credentials. Google subject has its separate 1–255 alphanumeric/underscore/hyphen contract. All unknown request fields, including role, Admin, timestamp and preview flags, are rejected. `trustedContext` contains exactly schemaVersion, serviceId, schoolId, actorAccountId, sessionId and optional previewAccountId. It comes from the authenticated server boundary, never the request body. Configuration's caller/action/school combination is checked before provider access.

Every authority result contains schemaVersion, requestId, decisionId, configured schoolId, action, outcome, reasonCode, server evaluatedAt and retryable. Invalid requests return null requestId/action; unavailable clock returns null evaluatedAt. Denials expose no account, Staff ID, provider exception or foreign-school details. Allowed results additionally include actorAccountId, subjectAccountId, applicable staffId or null, impersonating, fieldScope, policyVersion, coreRevision, contactsRevisions or null, authorityRevision and sessionExpiresAt. Results are deeply frozen. Allowed field scope is `deploy.planning`; a preview adapter must enforce it, not return broader Contacts data.

Policy version is `deploy-capabilities/1`. Unknown schema versions return `UNSUPPORTED_CONTRACT_VERSION`; unknown policy versions require reevaluation with a compatible implementation. Breaking security semantics require a new version. An allow result is not a bearer credential or authorization lease. Revalidation requires the original immutable allow object issued by the same instance, and binds school, resource, action, operation, service, actor, session and preview subject. New request IDs may identify retries. Serialization intentionally loses this in-process provenance; future cross-service evidence needs a separately reviewed T1D contract.

| Later HTTP mapping | Reason codes |
|---|---|
| 400 | MALFORMED_REQUEST, UNSUPPORTED_CONTRACT_VERSION |
| 401 | IDENTITY_INVALID, IDENTITY_UNLINKED, SESSION_INVALID, SESSION_EXPIRED, SESSION_REVOKED, REAUTHENTICATION_REQUIRED |
| 403 | SCHOOL_MISMATCH, ACCOUNT_SUSPENDED, CAPABILITY_DENIED, IMPERSONATION_DENIED, SERVICE_DENIED |
| 409 | AUTHORITY_CHANGED |
| 503 | AUTHORITY_UNAVAILABLE, PROVIDER_TIMEOUT, PROVIDER_INVALID, SIGNING_KEYS_UNAVAILABLE |

503 produces `unavailable`; other failures produce `deny`. 409/503 are retryable only after a new current check; no outcome other than allow authorizes anything. These are documentation mappings, not HTTP handlers. No legacy fallback exists.

## Google verification and ten-day session policy

`createGoogleIdentityVerifier({clock,getSigningKeys,timeoutMs})` returns `verifyGoogleIdentity(token,trustedSchoolConfig)`. Config has exactly schoolId, audience and hostedDomain. Audience is one configured string, not a token-selected client; audience arrays are conservatively rejected. Both documented Google issuer spellings normalize to `https://accounts.google.com`. A token is at most 16 KiB, uses canonical base64url, RS256 and one unique trusted kid. RSA public modulus must be at least 2048 bits. Keys are injected JWKS `{keys:[{kid,kty:'RSA',alg:'RS256',use:'sig',n,e,...}]}` with at most 32 entries. No token-supplied key URL is fetched; unknown header fields and algorithms fail. Signature, subject, issuer, audience, optional azp, integer iat/exp/nbf and expiry are checked. There is no positive clock-skew grace. `hd` must equal the configured domain; verified email must use that exact domain, not a suffix/lookalike. Only school, canonical issuer, subject, verification time and token expiry are projected. Email is never a linkage key.

`createSessionPolicy({clock,verifyGoogleIdentity})` returns validateSession and reauthenticate. Session evidence contains schemaVersion, schoolId, sessionId, accountId, issuer, subject, authenticatedAt, expiresAt and revoked. All times are safe integer epoch milliseconds. `expiresAt - authenticatedAt` must equal exactly **864000000**. `now >= expiresAt` rejects. Activity, reads and permission refresh cannot alter these fields. Current verified account school/ID/issuer/subject must match; GSiS suspension and session revocation override validity. The trusted Core snapshot attests current storage evidence; a browser cannot submit session evidence directly.

`reauthenticate(token,config,currentAccountEvidence)` invokes fresh Google verification and matches its subject to the same currently verified unsuspended Core account. It returns a new authentication-time/expiry proposal only after success. Failed verification cannot mutate or revive an old session. There is no session storage or cookie route; a future store must recheck current account state and persist the proposal atomically. Workspace-only suspension can leave an existing GSiS session valid until absolute expiry unless GSiS revokes it, as accepted by the owner. No Workspace status query is claimed.

## Injected current evidence

Each provider receives a frozen query with schemaVersion, schoolId, unique evaluationId, requestedAt, actorAccountId, sessionId and previewAccountId or null; Contacts also receives staffId. The Core fence read receives a fresh requestedAt. Providers must perform a current authority read for this query and attest it, not stamp a cached snapshot with a new time.

Every response has schemaVersion=1, matching schoolId/evaluationId, current=true, asOf between requestedAt and the server clock at receipt, bounded opaque revision, and a monotonically increasing safe integer sequence. asOf is a check time, not the last data-change time. The adapter must increment the sequence on any content change, never reuse a sequence for different content. Snapshot evidence is copied on receipt. Unsupported, missing, stale, inconsistent, malformed or unavailable evidence cannot grant access. Per-call local deadlines default to 1000 ms and accept trusted values 1–30000 ms; late completions have no mutation callback. They do not implement T1D transport retries/cancellation.

Core adds exactly policyVersion, account, session, previewAccount and previewGrant. The last two are null outside preview. An account contains exactly schoolId, accountId, canonical issuer, subject, identityVerified=true, identityUnique=true, suspended boolean, linkage (`unique`, `none`, `ambiguous`), linkageRevision, staffId and globalAdmin. A unique link requires Staff ID; other linkage states require null. Missing/ambiguous linkage denies derived privileges. Independent verified Core Admin does not depend on Contacts linkage or availability; verified unique Google account identity, school, suspension and session checks still apply. Relinking is not implemented.

`globalAdmin` and each Contacts fact use `{value:boolean,validFrom:ms,validUntil:ms|null,revoked:boolean}`. Intervals are half-open; null means no scheduled end. Invalid intervals fail. Current means value=true, not revoked, validFrom <= now and now < validUntil if present.

Contacts adds exactly source='contacts', status='accepted', matching staffId, fieldRevisions `{smc,eo,schoolLeader}` and facts with the same three explicit interval fields. Pending, superseded, foreign, missing or stale facts fail. EO is never inferred from blanks, teaching eligibility, a display tag or Deploy planning. Revisions accompany every allowed derived decision.

Preview grant contains schoolId, actorAccountId, subjectAccountId, revision, permission interval and fieldScope=['deploy.planning']. Current Core must attest preview permission for that exact actor/subject/school. Target account must be independently verified and unsuspended. Target access, not the union of actor and target roles, controls preview reads. Every preview edit/publish is denied before provider access, including Global Admin. Request JSON cannot remove trusted preview mode.

## Policy and revalidation

| Current target authority | Read | Edit/publish |
|---|---|---|
| School Global Admin | Allow | Allow |
| SMC and EO | Allow | Allow |
| SMC and School Leader | Allow | Allow |
| SMC only | Allow | Deny |
| EO only, School Leader only, ordinary teacher | Deny | Deny |
| Verified preview | Target's scoped read only | Always deny |

Resolution reads Core, validates session, reads Contacts if the independent Admin path does not apply, then reads Core again to catch changes during Contacts IO. Policy/effective times and session expiry are evaluated after asynchronous reads/hashes. Revalidation repeats all reads; changed Core, linkage, policy or Contacts evidence cannot reuse a previous decision. It evaluates effective-date transitions even without revision changes. A SHA-256 authorityRevision describes the complete validated evidence excluding query ID and check time, with recursively sorted object keys and preserved array order. JSON object-key order is not an authority change. It is a comparison digest, not a signature or distributed lock.

Rejection-only per-instance high-water marks detect provider sequence rollback and same-sequence content changes. Overlapping evaluations for the same actor/session reject older delayed results. This memory never grants access and is not a persistent/distributed freshness guarantee. Provider contracts must establish freshness across instances/restarts. Retain instances only for the intended trusted school context; memory grows with distinct authenticated identities/session/preview combinations, so a long-lived adapter must define lifecycle/resource bounds before integration.

## Evaluation boundary and remaining race

There are three separate instants: preparation allow, final Core evaluation, consumer commit. This library owns only evaluation. A Core fence read can detect changes during earlier reads; it cannot lock Contacts or Deploy D1. Contacts may change after its read; Core may change after its last read. An allowed result remains historical evidence even if revocation happens one instruction later.

A13 tests revoke during preparation/waits/retries and prove zero synthetic writes after denial. A14 tests concurrent linkage/policy/source changes and out-of-order responses. A separate counterexample deliberately demonstrates an unsafe synthetic consumer writing once after a post-check revocation. That counterexample is evidence of the unresolved interval, not a passing production mutation guarantee. A new check then denies.

Live mutation integration remains blocked until T1B accepted-fact adapters, T1D authenticated transport and actual consumer commit ordering/race handling are independently demonstrated. No cross-D1 transaction, stale grace, emergency override or post-write check is claimed to solve this. Consumers must revalidate after every wait/retry/conflict, and must not treat these decisions as reusable authorisation.

## Security audit

`createSecurityAudit({clock,sink,timeoutMs})` exposes projectSecurityAudit and recordSecurityAudit. Event kinds: identity-rejection, session-expiry, session-revocation, capability-denial, authority-unavailable, authority-changed, impersonation-denial and privileged-decision. Required fields: schemaVersion, kind, eventId, requestId, schoolId, action or null, outcome and reasonCode. Optional bounded IDs: operationId, actorAccountId, previewAccountId, policyVersion, coreRevision, contactsRevision; optional evaluatedAt cannot be in the future. recordedAt always comes from the injected clock. Mutation actions require operationId. Privileged-decision events require allow/CAPABILITY_ALLOWED, actorAccountId, policyVersion and coreRevision. Impersonation-denial events require deny/IMPERSONATION_DENIED and both real actor and preview subject. Other event kinds cannot claim allow.

Projection drops every other field, including tokens, cookies, secrets, mobiles, statutory names and complete provider records. Denials should use only already authenticated local actor attribution. Event producers must supply opaque IDs, never place personal values inside ID fields. Projection validation rejects unsupported versions/kinds and invalid identifiers. No arbitrary payload or exception message reaches the sink.

Audit is explicit and separate from evaluation, so a slow sink cannot silently postpone an evaluation boundary. The caller chooses the corresponding event and records it. A sink must confirm `{schemaVersion:1,eventId,persisted:true}` for persistence to be reported. Missing sink reports not-configured/persisted=false; errors, malformed receipts or deadlines report unconfirmed/persisted=false. Unconfirmed is not evidence that the sink did not persist; eventual durable sinks need event-ID idempotency. Storage, retention and UI are out of scope.

## Acceptance and compatibility

| Engineering scenarios | Executable file |
|---|---|
| A01–A03 signed identity, wrong subject/domain/claims/keys | tests/v1-core-identity.mjs |
| A04–A05 session boundaries and reauthentication; A08 suspension | tests/v1-core-session.mjs |
| A06–A10 policy/effective grants/preview; A12 tampering; A16 providers | tests/v1-core-authority.mjs |
| A13–A15 races, evidence changes and time transitions | tests/v1-core-races.mjs |
| A11 isolation, A17 audit, A18 dependency/allowlist/discovery | tests/v1-core-isolation.mjs |

Run `TZ=Asia/Singapore npm run build`, require no tracked generated-output drift, then run the five files with Node and the full `TZ=Asia/Singapore npm test` Node/LORD suite. `node tests/run.cjs --list` discovers the five files automatically. The isolation test compares against claim base c4c1de8aed5c9f062cbdc7e6ed83deb721fbb3c3, or an explicit T1A_BASE_SHA for review. It checks the exact 12-file allowlist plus the separately authorised additive LANES.md coordination exception and rejects production imports, dynamic imports or direct network calls in Core.

Runtime UAT T1A-01–T1A-04 and all other Tranche 1 UAT: **Not tested**. Synthetic engineering checks do not change those statuses. Actual tested commits, commands, failures, CI and omissions belong in the task/PR evidence. No v0.9.9 interfaces change. Rollback removes the unused library/tests/docs; it needs no database, live configuration or data rollback. Never deploy it as a production auth replacement from this PR.
