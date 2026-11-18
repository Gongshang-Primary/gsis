# Muse review — PR #208: reconcile v1 Roster WhatsApp delivery receipts

- Reviewer: Muse, replacing Claude until Claude returns, per the owner's 16 Nov directive (source 12b06eb).
- PR: #208, branch `codex/v1-roster-receipt-integrity`, OPEN, MERGEABLE.
- Exact head reviewed: `6435389111c1903444faedeef144e2bc8b0ac615`.
- Base (claimed implementation base): `badd6b31077fb246d234291f838f664ca46c8475` (merge-base of the head against current origin/main `30a26997`, which is the #209 review record on top of `badd6b31`).
- Verdict: **APPROVED at the exact head.**

## What it fixes

Roster WhatsApp delivery receipts could be lost or misordered: a genuine delivered/read callback after a failed status did not recover the failed result; an older delivered callback could regress a read; and a callback arriving before the sender stored its provider ID was dropped. The Roster webhook now records verified WhatsApp status through the existing durable receipt reconciler, with monotonic ordering.

## Scope verified

- Diff is exactly the five paths in the task record `docs/coordination/tasks/v1-roster-receipt-integrity.md`: the task record, `tests/v1-product-receipts.mjs`, `tests/v1-product-roster-receipts.mjs`, `v1/runtime/receipts.mjs`, `v1/services/roster/service.mjs`. 361 insertions, 36 deletions.
- `git merge-tree --write-tree --name-only origin/main 6435389` is clean (no conflicts).
- `git diff --check` clean. Secrets scan of the diff clean.
- No schema change, no migration, no dependency change, no provider configuration change, no deployment. No live data change. No v0.9 edits.

## Design read

- `v1/services/roster/service.mjs` (`webhook`): for a verified WhatsApp status callback (sent/delivered/read/failed), the webhook now calls `recordProviderReceipt` with school, provider, providerId (`event.id`), the digest eventId, status and occurredAt — **before** the fanout-operation replay check (`prepareOperation`). The receipt is therefore durable provider evidence even if the callback arrives during a lease, before the sender stored its provider ID, or is replayed; the existing fanout replay check still skips duplicate fanout writes (`op.receipt` → continue), and `recordProviderReceipt` is idempotent on exact replay (the test asserts one row in each evidence table after a duplicate callback).
- The old direct `product_outbox` UPDATEs for delivered/read/failed are removed. Reconciliation now goes through the common durable-receipt mechanism, whose monotonic ordering (read 4 > delivered 3 > failed 2 > sent 1, then event time, then event ID) means a genuine delivered/read resolves a failed result, an older delivered can never regress a read, and an older sent after a failure preserves the failed state and its due time. The existing Roster event/audit/fanout transaction is intact; the receipt recording is independent provider evidence, not a new business mutation or a cross-operation atomicity claim.
- `v1/runtime/receipts.mjs`: the `whatsappJob` predicate for common reconciliation now also matches the two existing WhatsApp-only Roster job types (`roster-notification`, `roster-inbox-reply`), so historical payloads without a channel field are included. The comment states the boundary explicitly: do not broaden this to email or receipt-fanout jobs. Email, receipt fanout and unknown job types remain excluded.
- Preserved, as stated in the task record and exercised by the tests: older-sent-after-failure protection, explicitly queued retries and their due times, newer-attempt provider identity, expired-claim uncertainty with no automatic resend, webhook signature/phone validation, and existing scheduler/send ownership. No legacy flag or arbitrary recipient limit is introduced. Dashboard recipient count and staff acknowledgement remain independent from delivery.

## CI verified at the exact head

- Node/LORD run 44218199265: head_sha verified `6435389`, completed success, all five jobs green.
- Product run 44220001834 (checks page): head_sha verified `6435389`, completed success. Product run 44218265435 (linked in the PR body) is the same isolated product check at the same head.

## Local checks run (TZ=Asia/Singapore, Playwright chromium-1234)

Worktree at the exact head; `npm ci` at root and inside `v1/` first.

- `node tests/v1-product-roster-receipts.mjs` — PASS (11 actual signed gateway/Workers/D1 cases: older sent after provider failure; older sent after explicitly retryable failed dispatch; genuine delivered and read after failure; older delivered after read stays read; callback before sender receipt then exact replay; interrupted claim and later matching read; old provider ID cannot overwrite a newer attempt; signature 401 and wrong-phone 403 with no events recorded; legacy durable-ingress flag not consulted; receipt fanout queued and delivered by the explicit v1 scheduler).
- `node tests/v1-product-receipts.mjs` — PASS (6 actual-D1 groups, including concurrent order, changed-event conflict, persistence/restart, late sender fencing and exact Roster type/channel selection).
- `node tests/v1-product-roster-service.mjs` — PASS (15 groups, unchanged, including durable fanout retry after restart).
- `npm run build` — PASS, no tracked drift.
- `node scripts/v1/build.mjs` — PASS.
- `node scripts/v1/verify-build.mjs` — PASS.

## Findings

None. No findings.

## Notes

- N1 (negative control, builder-stated): the new Roster receipts test failed on unchanged product source (exit 1; matching failed→delivered remained failed) and passed with the fix. The passing state is re-verified locally above.
- N2 (limits, as stated in the task record): this corrects new or replayed authenticated callbacks; it does not bulk-backfill old `roster_provider_events` that are never replayed. It neither retries uncertain sends nor makes a delivery callback equivalent to a staff acknowledgement. The historical dashboard count of 88 was not reproduced as a live incident and is not a v1 batching ceiling. Hosted UAT remains Not tested. F5 remains OPEN. No merge or deployment by this review.
- N3 (record staleness, not blocking): the task record's "Refreshed main/base" line cites `8c2ece8f`, while the PR body and the actual merge-base give `badd6b31` as the implementation base. The diff was verified against `badd6b31`; the record line predates the claim commit and does not affect the code.

## Quality gates

- Q01: Pass. Owner request recorded (v1 protection against the supplied WhatsApp report); coordinator-approved bounded correction; exact scope in the task record.
- Q02: Pass. Existing durable receipt mechanism reused; no new data source, authority or access path.
- Q03: Pass. Signature/phone validation, school/provider/channel isolation, event identity and idempotency retained and exercised.
- Q04: Pass. Durable ordering/recovery, lease/fence behaviour and retry preservation exercised in the new and existing tests.
- Q05: Pass. Bounded Roster Worker + shared receipt route only; no new workflow.
- Q06: Pass. Local verification above; exact-head Node/LORD CI green and product CI green.
- Q07: Pass. This exact-head review.
- Q08: No deployment authorised by this task and none performed.

## Release notes

No release label change. No deployment. Rollback reverts these bounded sources without schema migration, retaining durable provider event evidence; it reintroduces the identified ordering/recovery limitations.
