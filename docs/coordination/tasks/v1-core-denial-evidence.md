# Core final denial evidence

- Model/owner: Codex. Coordinator: ChatGPT v1. Independent reviewer: Muse, exact head.
- Status: claim published before product changes; implementation and verification pending.
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
