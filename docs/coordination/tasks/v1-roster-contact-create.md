# v1 Roster contactCreate via Contacts provisional registration (F03)

- Model: Antigravity
- Status: implemented and locally verified; exact-head CI and Muse review pending
- Updated (Asia/Singapore): 20 November 2026
- Base: `origin/main` `7ee2418`
- Coordinator / Merger: GPT
- Reviewer: Muse at the exact PR head
- Owner scope: port Roster `contactCreate` (`F03`), called by both Assign Relief (`roster-operations-ui.js`) and Stapler (`roster-stapler-ui.js`), delegating permanent Staff ID creation to Contacts' existing `/internal/register-provisional` boundary.

## Exact file allowlist

1. `docs/coordination/tasks/v1-roster-contact-create.md`
2. `v1/services/roster/contact-create.mjs`
3. `v1/services/roster/service.mjs`
4. `tests/v1-product/operation-probe-allowlist.json`
5. `tests/v1-product-roster-contact-create.mjs`

## Ownership and recovery invariants

- Contacts remains the sole write owner of staff identities (`R01`); Roster never writes to Contacts D1 directly and delegates through authenticated `/internal/register-provisional` + Core `/internal/delegate`.
- Requires `roster.write` (SMC/Admin); unprivileged staff (`roster.own`) and read-only preview sessions fail closed (403/503).
- Exact mobile or derived TTb Name collisions return `{ saved: false, blocked: true, duplicates }` without creating duplicate records; similar names require `confirmDistinct: true`.
- Exact retry with the same `operationId` / `requestId` recovers the original permanent Staff ID without falsely flagging itself as a duplicate (`R09`).
- Created relief contacts stay inactive with zero inferred SMC/EO/School Leader authority.
- Zero SQL migrations, zero v0.9 edits, no merge or deployment.

## Verification evidence (`TZ=Asia/Singapore`)

- `node tests/v1-product-roster-contact-create.mjs`: PASS (fail-closed unprivileged denial, invalid mobile 400, Contacts provisional creation + Contacts D1 verification, exact `operationId` retry recovery, duplicate mobile block, duplicate TTb Name block, similar-name warning and `confirmDistinct: true` creation).
- `node tests/v1-product-operation-probe.mjs`: PASS (`F03` removed; zero stale/unallowed entries).
- `node tests/v1-product-roster-service.mjs`: PASS (all existing Roster service regressions intact).
- `npm run build` + production-path `git diff --exit-code`: PASS (zero tracked drift).
- `node scripts/v1/build.mjs` + `node scripts/v1/verify-build.mjs`: PASS (9 Wrangler dry-runs + local additive migration upgrade).
- `git diff --check`: PASS.
- Q01–Q06: pass locally; Q07: awaiting exact-head CI and Muse review; Q08: deployment not authorised; hosted UAT, F5 and official T1B-01/T1B-02 remain unchanged.
