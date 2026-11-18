# v1-roster-receipt-integrity

- Status: implemented and locally verified; exact-head CI and independent review pending.
- Owner/model: Codex. Coordinator: ChatGPT (v1). Independent reviewer: Muse, exact head.
- Last updated: 18 November 2026, Asia/Singapore.
- Branch: `codex/v1-roster-receipt-integrity`.
- Refreshed main/base: `8c2ece8f6cabdb1956b4775c01a1364fd898a2ed`.
- Authorisation: owner requested v1 protection against the supplied WhatsApp report; coordinator approved this bounded correction after actual signed local gateway/Workers/D1 counterexamples. No merge, deployment, live data, provider sends, settings, schema or v0.9 edits.

## Start gates and ownership

Read current root/v1 instructions, coordination workflow, lanes, status, owner directives, deployments and engineering policy. Refreshed main and actual open PR inventories: #205 at `456f264796ea24ed03a51df9fe3eb96f9edf1cd5` and #182 at `57ab791db80c28f647f1ec03aee73e67cc981b90` have no overlap with this allowlist. The older queued v1 absence-confirmation task explicitly owns only its task record; it is not activated here. Accepted claim `badd6b3` was published and re-read before product edits; implementation starts from that claim. The coordinator's branch-only follow-up arrived after the non-force claim push had already succeeded; no further main push is made. Current owner-appointed reviewer for this batch is Muse (superseding the older repository reviewer wording for this task).

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

The Roster webhook now records verified WhatsApp status through the existing common durable-receipt mechanism before checking the fanout operation receipt. This is independently idempotent provider evidence, not a new business mutation or cross-operation atomicity claim. The existing Roster event/audit/fanout transaction remains intact. Common recovery selects only known WhatsApp channel metadata or the two existing WhatsApp-only Roster job types; it ignores email, receipt fanout and unknown job types. Current queued retry and lease/fence behavior is preserved. A callback during a lease remains durable until the sender outcome/identity becomes eligible for reconciliation.

All commands use `TZ=Asia/Singapore`:

| Command | Result |
| --- | --- |
| `node tests/v1-product-roster-receipts.mjs` on unchanged product source | Expected red: exit 1, 10.801s; matching failed→delivered remained failed. Older sent and explicitly queued retry protections passed first. |
| `node tests/v1-product-roster-receipts.mjs` after correction | Pass: 11 actual signed gateway/Workers/D1 cases, final 12.384s. Includes failed→delivered/read, monotonic read, early callback/exact replay, uncertain claim, old provider ID, signature/phone rejection and false legacy flag with real scheduled receipt fanout. |
| `node tests/v1-product-receipts.mjs` | Pass: 6 actual-D1 groups, 4.596s, including concurrent order, changed-event conflict, persistence/restart, late sender fencing and exact Roster type/channel selection. |
| `node tests/v1-product-roster-service.mjs` (unchanged) | Pass: 15 groups, 13.861s, including durable fanout retry after restart. |
| `node tests/run.cjs --list` | Pass: both receipt programs discovered among 1,230 current programs; no runner/CI change. |
| `npm run build` | Pass: 18 canonical production components; no tracked generated drift. |
| `git diff --check`, source/test syntax checks | Pass; exact five-path inventory. |

Initial command invocation used unavailable `/usr/bin/time` and exited 127 before running a test; the recorded timings above use the shell timer. A prior read-only synthetic matrix independently reproduced all three defects. No provider dispatch was invoked; no outbound-fetch counter was instrumented. No cloud skill is claimed executed.

Q01–Q05: Pass for bounded authorization, source ownership, signature/school/channel/identity negatives, durable ordering/recovery and unchanged resource limits. Q06: local focused verification/build/discovery pass; full Node/LORD and isolated-product exact-head CI pending. Q07: implementation branch will be pushed for exact-head Muse review; final tested commit is the PR head and its CI, not an invented self-referential task SHA. Q08: deployment not applicable; hosted/runtime UAT **Not tested**.

Limitations: this corrects new or replayed authenticated callbacks; it does not bulk backfill old `roster_provider_events` that are never replayed. It neither retries uncertain sends nor makes a delivery callback equivalent to a staff acknowledgement. The historical dashboard count of 88 was not reproduced as a live incident and is not a v1 batching ceiling. No account, scheduler, send-owner, infrastructure or provider configuration changed.

Rollback reverts these bounded sources without schema migration, retaining durable provider event evidence. It reintroduces the identified ordering/recovery limitations. Muse reviews the exact implementation head; merge remains a separate decision.
