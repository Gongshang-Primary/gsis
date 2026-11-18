# v1-roster-receipt-integrity

- Status: claimed before implementation.
- Owner/model: Codex. Coordinator: ChatGPT (v1). Independent reviewer: Claude, exact head.
- Last updated: 18 November 2026, Asia/Singapore.
- Branch: `codex/v1-roster-receipt-integrity`.
- Refreshed main/base: `8c2ece8f6cabdb1956b4775c01a1364fd898a2ed`.
- Authorisation: owner requested v1 protection against the supplied WhatsApp report; coordinator approved this bounded correction after actual signed local gateway/Workers/D1 counterexamples. No merge, deployment, live data, provider sends, settings, schema or v0.9 edits.

## Start gates and ownership

Read current root/v1 instructions, coordination workflow, lanes, status, owner directives, deployments and engineering policy. Refreshed main and actual open PR inventories: #205 at `456f264796ea24ed03a51df9fe3eb96f9edf1cd5` and #182 at `57ab791db80c28f647f1ec03aee73e67cc981b90` have no overlap with this allowlist. The older queued v1 absence-confirmation task explicitly owns only its task record; it is not activated here. Re-read the accepted claim before product edits.

Source report SHA-256: `80776f27ab1ee81d042c98da4103400cf8df07e1f87bda9d71f02ca1bd4761f7`, describing v0.9 head `57ab791db80c28f647f1ec03aee73e67cc981b90`. The v1 evidence is independently reproduced at the main/base above; historical report observations are not assumed to be v1 outcomes.

## Exact five-path allowlist

- `v1/services/roster/service.mjs`
- `v1/runtime/receipts.mjs`
- `tests/v1-product-roster-receipts.mjs` (new)
- `tests/v1-product-receipts.mjs`
- `docs/coordination/tasks/v1-roster-receipt-integrity.md`

## Contract and acceptance

Reuse the existing durable provider-receipt mechanism for verified Roster callbacks. Genuine delivered/read evidence may resolve a failed result; read must never regress to delivered. A receipt arriving before the sender stores its provider ID must recover after that ID is durably attached. Keep exact event identity, school/provider/channel isolation and idempotency. Only the two existing WhatsApp-only Roster job types may join common reconciliation without channel metadata; email and receipt fanout jobs remain excluded.

Preserve older-sent-after-failure protection, explicitly queued retries and their due time, newer-attempt provider identity, expired claim uncertainty and no automatic resend. Preserve webhook signature/phone validation and existing scheduler/send ownership; no legacy flag or arbitrary recipient limit is introduced. Interrupted claims are an uncertainty safeguard, not proof of a receipt-ordering defect. Dashboard recipient count and staff acknowledgement remain independent from delivery.

Add a discoverable regression through actual local signed gateway, Workers and D1; establish failing expected-success assertions before changing product code, then verify correction and unchanged negative cases. Extend existing actual-D1 common-receipt tests for the narrow Roster type selection. Run relevant regressions and canonical build with `TZ=Asia/Singapore`; record failures, omissions, exact head and CI honestly. No hosted runtime UAT is performed.

## Verification and handoff

Pending implementation and tracked red/green evidence. A prior read-only synthetic matrix reproduced failed→delivered/read, read→older-delivered and early callback defects; older sent, explicit retry, provider identity and signature negatives already remained protected. No provider dispatch was invoked; no outbound-fetch counter was instrumented. No cloud skill is claimed executed.

Rollback reverts these bounded sources without schema migration, retaining durable provider event evidence. It reintroduces the identified ordering/recovery limitations. Claude reviews the exact implementation head; merge remains a separate decision.
