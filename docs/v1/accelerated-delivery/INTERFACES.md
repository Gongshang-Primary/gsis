# Isolated v1 product interfaces

Implementation baseline: main 27fa498657965169b9d971a9caabc33c8b19bc69; task claim f5a238527eb5661ffb4c5c889c05baf3cca4287d. Accelerated specification v1.1 at f39b671ac6da3f389c58345ce4f5c035f1cb3f65 controls. This document records the integrated implementation boundaries; exact-head verification and independent acceptance are recorded separately in VERIFICATION.md.

## Runtime and ownership

Eight domain Workers (`core`, `contacts`, `deploy`, `roster`, `calendar`, `lord`, `venues`, `layout`) each bind only their own `DB` and optional private `ARTIFACTS`. `web` serves generated static assets and forwards same-origin `/api/<domain>/...` through Service Bindings named `CORE`, `CONTACTS`, `DEPLOY`, `ROSTER`, `CALENDAR`, `LORD`, `VENUES`, `LAYOUT`. Domain code resides in `v1/services/<domain>/`; migrations in `v1/migrations/<domain>/`. No production code or bindings are changed.

Each domain exports `handle(ctx)` from `service.mjs` and optionally `scheduled(ctx)` from the same file. The shared worker adapter supplies `{env, request, path, method, body, principal, now, requestId}`. `path` is module-relative, e.g. `/staff`; body is bounded parsed JSON, never trusted. `principal` comes only from current Core authorization and contains `{schoolId, actorId, staffId, actorStaffId, sessionId, action, requestDigest, impersonating, capabilities, decisionId, validUntil, revisions}`; no browser-supplied role/actor headers are accepted. A service may add its own narrow action check. Returns a plain JSON value wrapped by adapter as `{ok:true,data:value}` or a `Response` for exports. Throw `ApiError(code,status,message,{retryable,...})` from `v1/runtime/errors.mjs`; internal exception details are never exposed. Domain `policy(method,path,body)` returns `{action,write,resourceId,ownStaffOnly?}` or rejects an unknown route. Unknown operations never default to permission.

Every mutation accepts stable `operationId`, expected affected `revision`, and typed payload. `requestId` identifies an attempt only. Receipt identity binds school, actor, action and canonical intent digest. Matching retries return original outcomes; changed intent conflicts. Shared `store.mjs` offers `canonical`, `digest`, `query`, `one`, `statement`, `prepareOperation`, `commitOperation`, `abortOperation`, `operationStatus`. Domain writes are explicit parameterised SQL, guarded in the same D1 transaction as receipt/audit/outbox; a failed SQL CAS aborts the batch through an assertion constraint. No pre-read is a transactional guard.

Shared store signatures: `query(db,sql,args=[]) -> rows`, `one(db,sql,args=[]) -> row|null`, `statement(db,sql,args=[]) -> prepared`; `prepareOperation(db,{schoolId,actorId,operationId,action,intent,now,validUntil,authorization:principal}) -> {state,fence,digest,receipt?}`; `commitOperation(db,op,{now,validUntil,guards:[{sql,args}],writes:[{sql,args}],result,audit?,outbox?:[{id,type,payload,dueAt}],admission?}) -> receipt`; `abortOperation(db,op,reason,now) -> receipt`; `operationStatus(db,schoolId,operationId)`. Guard SQL must return a truthy column named `ok`. Common schema in `v1/migrations/common.sql` installed into every owner DB before domain migrations. Domain schema changes are additive to isolated stores only.

## Authentication and protected admission

Core owns identity/session, explicit capability grants, linkage, audit/decision evidence and Core revision pins. Contacts owns permanent Staff IDs, accepted facts, immutable historical snapshots, catalogues and Contacts pins. Deploy owns publication pointer pins. Calendar owns year/date/parity revision pins. Shared backend `GSIS_SECRET` validates suite membership only, never user privilege or claimed caller identity. Service authorization must validate the actual opaque Core session and requested school/action/payload binding. Gateway strips internal identity headers; CSRF uses same-origin checks plus session CSRF proof for cookies. Public webhooks take only their dedicated provider-verified path.

`v1/runtime/security.mjs` exports `authorize(env, request, descriptor, now) -> principal`, `admit(env,db,op,principal,dependencies,now) -> admission`, `resolveAdmission(env,db,op,admission,outcome,now)`. Dependencies identify owner/revision/scope/effective validity. The Core/Contacts implementer owns this module plus durable pin protocol in `v1/runtime/admission.mjs`. Shared commit refuses protected mutations without a stored admission record matching operation fence, intent, decision evidence and final validity; domain handlers must admit before commit. No module may implement a permissive fallback. Acquisition order Core, Contacts, Deploy, Calendar; durable fenced abort precedes release; uncertain pins remain for receipt recovery. Source changes wait visibly for conflicting operations and block new pins. Core service is responsible for recording durable F5 evidence before returning a protected admission.

## Domain projection boundaries

Contacts serves versioned immutable fact snapshots plus distinct per-read observation envelopes, constrained purpose-specific names/mobile/email projections, contributions, readiness and cutover epoch checks. No per-read content revision increment. Deploy publication envelopes follow TV05 and preserve Contacts revision/as-of and workload quality. Roster owns dated timetable/absence/day/assignment and Ri ledger snapshots; Calendar owns dated events/week parity; Venues owns capacity/reservations and durable occupancy publication fences; Layout owns geometry/local annotations/adopted source snapshot; LORD owns resources, bookings, loans and per-item state.

Allocator exports pure `allocate(snapshot,policy,runOptions)` from `v1/allocator/index.mjs`, with no runtime/provider imports. Jobs use stable outbox identity, bounded lease/fence and explicit accepted/delivered/uncertain states. Direct provider adapters are in `v1/runtime/providers.mjs`; injected local test providers never authorize production sends. Automatic evidence deletion is disabled initially.

## Parallel file ownership

Root: shared store/errors/worker adapter/providers/backup/build/configuration/integration tests/docs. Core agent: core+contacts services/migrations, security+admission, core/contacts product tests. Deploy agent: deploy service/migrations/tests. Roster agent: roster service/migrations, allocator/tests. Calendar/Venues agent: those services/migrations/tests. LORD/Layout agent: those services/migrations/tests. Frontend agent: `v1/web/**`, `scripts/v1/build-web.mjs`, frontend product tests, per-module parity inventory fragments under `v1/web/`. Root integrates and commits; agents never commit or alter another domain without agreement. No worker provisioning, live data or real provider messages.

## Named capabilities and system operations

The gateway exposes none of the internal routes. `GSIS_SECRET` cannot distinguish two suite members, so no membership-only request can mint a user or scheduler decision. Narrow named Worker entrypoints supply additional service identity:

| Recipient | Binding / provider entrypoint | Permitted contract |
| --- | --- | --- |
| Roster | LORD_RECEIPTS and VENUES_RECEIPTS / ProviderReceipts | Verified original WhatsApp status only; durable owner-local receipt reconciliation, never sends or user grants |
| Roster | CORE_SCHEDULER / RosterScheduler | Current explicitly granted, date/slot-bound scheduled authority |
| Roster | CORE_EXTERNAL / CoreRosterExternal | Original durable scoped peer/duties capability and current owner evidence |
| Roster | CORE_WEBHOOK / CoreRosterWebhook | Verified, deduplicated original provider event only |
| Core | CONTACTS_AUTHORITY / ContactsAuthorityProjection | Current immutable authority snapshot plus distinct read observation |
| Core | CONTACTS_RECIPIENTS / ContactsRecipientProjection | Purpose-scoped current staff/mobile lookup |
| Contacts | DEPLOY_CONTACTS / ContactsDeploymentProjection | Verified published teaching projection; no Deploy management grant |
| Contacts | CALENDAR_CONTACTS / ContactsBirthdays | Reconcile the verified committed Contacts birthday event |
| Calendar | CONTACTS_CALENDAR / ContactsCalendarProjection | Minimal current birthday projection, no general directory export |

Read projections preserve immutable content identity and per-read observation identity separately. No fetch increments a source revision. Stored effective interval phases change only at a real fact boundary. Delayed work verifies its original receipt plus current relevant authority, audience and source facts. Core persists original decision evidence before protected work; destination receipt associations are reconciled from the actual owning service.

The public gateway preserves only the required session, CSRF, preview, scoped device/external token and content headers. Roster external links carry opaque tokens in the URL fragment and submit them through a header/body; they do not obtain a normal Core session. Provider webhooks bypass browser-origin checks only on the exact signed provider routes. All other writes retain same-origin and current capability checks.

Every owner exposes Admin-only `/system/health`, POST `/system/backup` with stable `operationId`, and GET `/system/backup/manifest` or `/system/backup/part` with `backupId` and a scoped `key`. Backup downloads require a committed original backup receipt. There is no live restore HTTP route. Restore into empty isolated stores verifies exact schema, data and object hashes, then fences restored preparations and marks potentially dispatched jobs uncertain. `activationReady:false` requires suite reconciliation.

An operation may renew computation time only before acquiring pins, using `renewPreparedOperation` with the same actor, school, action and request binding plus fresh current authority. It cannot extend an acquired admission or bypass source revision checks. An interrupted acquisition retains every original pin identity, fences the destination, and reconciles them before another attempt. Source-change exemptions require both destination owner and operation ID; two domains reusing the same string are separate operations.

Outbox dispatch leases one job immediately before execution. The deadline includes response-body consumption, and a successful HTTP status without a trustworthy receipt remains uncertain. Restored queues are never blindly replayed. Venues publication staging uses immutable bounded chunks before source activation and a durable fence until the source receipt proves adoption/abort; this is not a transaction across owner databases.
