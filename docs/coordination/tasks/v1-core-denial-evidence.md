# Core final denial evidence

- Model/owner: Codex. Coordinator: ChatGPT v1. Independent reviewer: Muse, exact head.
- Status: implemented; focused verification and canonical build pass. Exact-head CI and Muse review pending.
- Date: 19 November 2026, Asia/Singapore.
- Branch: `codex/v1-core-denial-evidence`.
- Refreshed main/base: `360853c32ce5f0a07b5e385fea3647fea5c63b6e` (v1.06 plus the separate Venues claim).
- Authority: coordinator authorises the bounded Core F5 final-denial capture/readback slice following the read-only inventory. No merge, deployment, live data, provider operation, grants or schema migration.

## Gates and exact scope

Read current root/v1 instructions, workflow, lanes, owner directives, status, engineering policy and F5 recovery contract. Only open PR182 at `57ab791db80c28f647f1ec03aee73e67cc981b90` is v0.9 work; its actual inventory does not overlap. The new physical-Venues claim does not own these paths. Publish this branch-only claim from refreshed main before product edits, honoring the coordinator's earlier branch-only instruction; no direct-main retry.

1. `v1/services/core/service.mjs`
2. `v1/services/core/evidence.mjs`
3. `tests/v1-product-core-denial-evidence.mjs` (new)
4. `docs/v1/core/F5_RECOVERY_VERIFICATION.md`
5. `docs/coordination/tasks/v1-core-denial-evidence.md` (new)

## Bounded contract

Capture only actual final non-allow results returned by the existing Deploy T1A resolver. Core's preliminary identity, activity, missing-record and capability checks occur earlier and remain outside this slice; do not fabricate T1A decisions for them. Preserve exact 403/409/503 reason/retry semantics and the current allow/principal schema. Persistence failure cannot turn a denial into permission or a new server outage; capture status must be honest and bounded.

Use existing owner-local `product_audit` storage with minimal projected security event and separately sealed request/context/observation references. Never insert denial rows into `core_evidence`, which is consumed by authorization/pin/dispatch paths. Preserve original decision time even where a failed resolver returns its evaluation-start time; observation timing is distinct. Capture a Contacts reference only when the validated final read's evaluation identity matches the decision. Missing final evidence stays explicitly unavailable; earlier reads are not substitutes. No provider payloads, credentials, session tokens, email or arbitrary request bodies in audit.

Global Admin historical inspection may recover the captured denial and exact immutable Contacts reference where present. It must never return a principal, grant current authority, imply a business commit or treat absent evidence as verified facts. No source revision/sequence changes on read, retrospective inference, retention deletion, new grant policy or cross-D1 atomicity claim.

## Verification and remaining gates

Establish meaningful red then green through real synthetic gateway/Workers/D1, with final denial, exact failure response, durable capture/readback, school/Admin isolation and non-replay into decision/pin paths. Include immutable event conflict/tamper, actual observation association, missing history, same-content distinct reads, restart and persistence-failure semantics. Existing allow-recovery and Core/Contacts regressions remain required; canonical build must show no drift. Run with `TZ=Asia/Singapore`; both test runners must discover the new program. Full exact-head Node/LORD and isolated-product CI precede review readiness. Draft PR only after Node/LORD green.

F5 remains **OPEN**: earlier rejection coverage, destination receipt verification, hosted durable recovery and retention decisions are not closed here. Official T1B-01/T1B-02 and unperformed runtime UAT remain **Not tested**. No optional skill execution is claimed. Rollback reverts the bounded code while retaining historical audit rows; it must not delete evidence or change accepted facts/grants.


## Implementation and exact evidence

The branch-only claim was published and re-read at `0fac1fb352b82cfe2a1334a435ddf3fae7bc3766` before product changes. No direct-main push occurred. The five-path implementation uses existing audit storage and the unchanged minimal projector. No principal, permission, schema, runtime/gateway, CI, configuration or Contacts writer changes are included.

The source hook runs only after the real final Deploy resolver returns non-allow. Its audit append is protected from generic cleanup and included by existing owner backup enumeration. A one-second sink bound returns `unconfirmed` on failure or timeout without changing the original denial; a late completion can still persist. The warning contains only its opaque decision ID. Same-event retry preserves original recorded time/content; changed content cannot replace it. Admin readback validates the separate sealed row and exact historical Contacts reference where captured. Only a validated read with the final evaluation identity is eligible; missing final evidence is explicit, never replaced by the preliminary observation. Failed resolver evaluation time remains distinct from later observation/recording time.

All commands use `TZ=Asia/Singapore`:

| Command | Actual result |
| --- | --- |
| `node tests/v1-product-core-denial-evidence.mjs` against unchanged source | Meaningful red:403/nonretryable final denial succeeded, but expected audit row was absent; exit1,10.600s. |
| Same new program after implementation | Pass:6 groups,15.404s inside program /16.452s shell. Real gateway/Workers/D1 denial/readback; no principal/replay/business write; Admin/school isolation; stable content with distinct observations; immutable replay/conflict/tamper/history; controlled final provider503 and actual Core revision-race409; original error and evaluation time preserved; preliminary denial remains uncaptured; realD1 capture failure, malformed projection, late timeout completion; fresh Worker restart recovers original evidence. |
| `node tests/v1-product-core-contacts.mjs` (unchanged) | Pass,27.941s. Includes existing allow evidence, acceptance/isolation, restart, separate-owner D1/R2 backup/restore and actual recovery API, source-pin fencing and service-grant checks. |
| `node tests/v1-product-evidence-recovery.mjs` (unchanged) | Pass,8/8 existing allow-recovery cases. |
| `node tests/v1-core-authority.mjs`; `node tests/v1-core-isolation.mjs` (unchanged) | Pass,7/7 and4/4 cases; existing authority and minimal audit/dependency boundaries retained. |
| `node tests/run.cjs --list`; `node scripts/v1/test.mjs --list` | New test discovered among1,235 Node /134 isolated-product programs; no runner changes. |
| `npm run build` | Pass,18 canonical production components, no tracked generated drift. |
| `git diff --check`; changed-source/test syntax checks | Pass; exact five-path inventory. |

Retained intermediate fixture failures: the first green attempt wrongly equated outer HTTP request ID with inner T1A request ID (11.408s); corrected to preserve the existing separate identifiers and verify event/decision/binding equality. The next failed before its intended second provider read because the Node-to-Worker fixture passed a cross-runtime Request directly (11.480s); explicit URL/method/header/body forwarding corrected the adapter. All assertions then passed in16.117s, but teardown double-disposed the old Miniflare server and exited1; corrected fixture cleanup disposes each runtime once. No product assertions were removed and no timeout increased.

Q01–Q05 **Pass**: scoped claim/owner boundaries, separate audit identity, minimal privacy projection, non-replay, real recovery/race/failure evidence,32KiB row and one-second sink bounds, no new dependency. Q06 **Pass locally; exact-head full Node/LORD and product CI Pending**. Q07 **Pending Muse exact-head review**; final implementation SHA and CI links belong in the PR handoff. Q08 **Not applicable to deployment**; hosted UAT and official T1B-01/T1B-02 **Not tested**.

The test's controlled final provider outage and revision race execute the real Core implementation with actual D1 and the real local Contacts Worker behind a narrow transport/failure adapter; they are labelled fault injection, not hosted failures. The public gateway403, recovery, isolation, storage failure and restart flows execute actual built Workers. No live school records, providers, hosted backups/restores or deployments were accessed. This does not close broader F5 or add a public audit-discovery UI.
