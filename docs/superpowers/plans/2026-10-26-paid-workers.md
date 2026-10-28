# GSiS v0.9.7 Implementation Plan

> **For agentic workers:** Use approved task boundaries below with test-first implementation and independent final review.

**Goal:** Ship approved full paid-Workers suite with private operational backend, bounded asynchronous jobs, safe recovery and clear status.
**Architecture:** Existing domain modules and D1 authority fences remain canonical. Pages delegates operational APIs to one private backend; notification Worker retains clock scheduling and uses bounded queues. Shared health and recovery modules enforce consistent controls.
**Tech Stack:** JavaScript ESM, Workers/Pages, D1, R2, Queues, existing Apps Script adapters, Python build tools.
**Spec:** docs/superpowers/specs/2026-10-26-paid-workers-design.md

## Global Constraints
- No live deployment, sends, migrations or restoration. Preserve manual allocation, permissions and receipt idempotency.
- Approved scopes and privacy constraints in spec bind every task. Keep existing data/source authority and fail closed on missing bindings.
- Do not edit another task's owned files; agree interfaces through controller. Root owns release versions/build and integration.

## Review Focus
- Service binding forwarding preserves identity and cannot expose administrative/service methods to untrusted callers.
- Queue redelivery, crash/restart, retry/park and provider-uncertain responses cannot duplicate operational writes or blindly resend.
- Recovery pause blocks all mutation, outbound dispatch and cleanup even if restored D1 contains older flags.
- Concurrent cache writer/cleanup preserves manifests; cache reuse respects permissions and restored source generations.
- Receipt dismissal cannot hide unresolved work or cross user boundaries; admin health exposes no private contents.

## Task 1: Private operational backend
Files: operations-worker/*, shared/backend-service.js, Roster/Deploy _worker.js gateway hooks, tests/paid097-backend*. Interfaces: GSIS_BACKEND fetch service binding; backend dispatches original gateway handler with recursion disabled. Root integrates health/recovery routes. Preserve existing Google adapters.
- [x] Write failing auth/origin/delegation/private-service tests; implement minimal backend/forwarding and setup config; run new and affected gateway tests.

## Task 2: System Health
Files: shared/edge-health.js, roster-update/public/system-health.{html,js,css}, tests/paid097-health*. Interfaces: recordJobHealth(env,event), readSystemHealth(env); job event {job,status,code,httpStatus,traceId,startedAt,finishedAt,counts}. No authorization inside shared module; private backend verifies admin before read/retry/checkpoint routes. UI API /api/system-health, on-demand only. Root adds admin link.
- [x] Reproduce safe status persistence/privacy/history bounds; implement shared module and protected UI consumer; verify with SQLite and DOM tests.

## Task 3: Queues and job diagnostics
Files: notification-worker/*, shared/edge-background-jobs.js, tests/paid097-jobs*. Interfaces: exported requestBackgroundWork(env,kind,{now}) and read/retry job APIs agreed with root. Consume recordJobHealth(env,event), assertRecoveryWritable(env). Queue payloads contain only job kind/id. Notify/cache/audit batching and durable claims/parked retries. Root wires after-commit wake hooks.
- [x] Write failure/retry/idempotency/pause tests; implement bounded jobs and scheduler wrappers; run scheduled/delivery regressions.

## Task 4: Recovery
Files: shared/edge-recovery.js, scripts/gsis-recovery.*, docs/v097/RECOVERY.md, tests/paid097-recovery*. Interfaces: assertRecoveryWritable(env), readRecoveryState(env), recordRecoveryCheckpoint(env,input,actor). Durable admin checks performed by backend. GSIS_RECOVERY_MODE='true' env is independent of restored database. Record native Time Travel bookmark evidence; do not invent bookmark verification or automate restore. Root integrates write/dispatch gates.
- [x] Verify pause/checkpoint validation and nonsecret status with SQLite; implement operator tool/guide and bounded state; verify.

## Task 5: Timetable cache/pruning
Files: roster-update/public/edge-timetable-cache.js, edge-roster-r2-cleanup.js, tests/paid097-cache*. Preserve existing source-version cache and tombstone races. Review prudent paid limits and cold hit paths, bound pruning; recovery-aware GC. No source/audit/media deletion. Expose freshness helper only if root needs it.
- [x] Review/extend cache, manifest miss/recovery, retention and concurrent delete tests; implement justified changes only; run096 timetable/GC tests.

## Task 6: Receipt management
Files: roster-update/public/roster-operations-ui.{js,css}, tests/paid097-receipts*. Use scoped local dismissal of completion fingerprints, clear completed and reopenable history, no persistence of report payloads; pending/review never dismissed. Existing withdrawal remains separately audited.
- [x] Write DOM tests, implement controls and amber unresolved states, test refresh/newstate/user separation and existing absence UI.

## Task 7: Full release and integration
Root owns version promotion, canonical generation, packaging scripts, health/recovery/queue integration routes, migration guide and release docs. Promote all components to0.9.7; preserve complete source provenance from supplied imported baseline. Include private Worker dashboard text and settings examples. Tests execute actual shipped bundles.
- [x] Integrate and verify interfaces and activation checks, update manual/architecture/installation inventory, run targeted then appropriate broad checks.
- [x] Independent auth/recovery/queue/privacy review; fix important findings and validate artifacts/source parity.
- [x] Commit, tag, build full deployment and suite archives, save deliverables and report exact validation and limits.

## Verification record

Implementation and independent reviews are complete. The consolidated release run has 743 passing Node scripts and 4 historical-context blocks, detailed in docs/v097/VALIDATION.md. LORD has 34 passing programs. The release packager records the final commit/tag in the delivered archive; no live operations are part of this plan.
