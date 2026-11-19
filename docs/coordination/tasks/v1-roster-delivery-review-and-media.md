# Task: v1-roster-delivery-review-and-media

- **Lane:** GSiS v1 (`v1/services/roster`, `v1/runtime/gateway.mjs`, `tests/v1-product`)
- **Implementer:** Antigravity
- **Reviewer:** Muse (exact head commit)
- **Coordinator / Merger:** GPT
- **Branch:** `antigravity/v1-roster-delivery-review-and-media`
- **Status:** Locally verified (ready for Muse exact-head review)

## Scope
Ported the Roster delivery-review operations and private WhatsApp report/media routes, clearing probe allowances `F04`, `F05`, and `F11` (5 allowances total):
1. `deliveryReview` (`roster.read`) — reads `product_outbox` notification rows (`roster-notification`, `roster-inbox-reply`, WhatsApp-tagged) and `deliveryReviewReceipts` in `roster_records`; returns exact `roster-delivery-review-ui.js` view contract (`checkedAt`, `revision`, `issues`, `pending`, `canCancel`, `inFlight`, `uncertain`, `unresolvedUncertain`, `reviewedUncertain`, `reports`, `messagesSent: 0`).
2. `dismissDeliveryIssues` (`roster.write`) — validates preview tokens and guards `product_outbox` state/attempts/fence/updated_at before recording review receipts in `roster_records`; preserves `product_outbox` history untouched and reopens alerts automatically if a row's fingerprint changes.
3. `cancelPendingNotifications` (`roster.admin`) — Admin-only guarded cancellation strictly of `state = 'queued'` notification rows (`last_code = 'CANCELLED_BY_SMC'`), rejecting any `leased`, `accepted`, `delivered`, `uncertain`, or `failed` rows.
4. `GET`/`HEAD` `/whatsapp/reports/<YYYY-MM-DD>` (plus gateway `/api/whatsapp/reports/<YYYY-MM-DD>` alias) — authenticated (`roster.read`), privacy-safe redacted plaintext report with R2 archive digest verification (`503` on tamper), `Cache-Control: private, no-store`, `X-Content-Type-Options: nosniff`, and same-origin enforcement.
5. `GET`/`HEAD` `/whatsapp/media/<messageId>` (plus gateway `/api/whatsapp/media/<messageId>` alias) — authenticated (`roster.read`) school-scoped R2 media proxy verified against `roster_inbox`, with strict MIME allowlist, HTTP `Range` (`206`/`416`), SHA-256 verification, and `Content-Security-Policy: sandbox`.
6. Removed all 5 `F04`/`F05`/`F11` entries from `tests/v1-product/operation-probe-allowlist.json` and added `tests/v1-product-roster-delivery-review.mjs`.

## Local Verification (`TZ=Asia/Singapore`)
- `node tests/v1-product-roster-delivery-review.mjs` — PASS
- `node tests/v1-product-operation-probe.mjs` — PASS (`probe: 407`, `knownMissing: 19`)
- `node tests/v1-product-roster-service.mjs` — PASS
- `npm run build` + `git diff --exit-code -- roster-update/ public/ shared/` — PASS (zero v0.9 drift)
- `node scripts/v1/build.mjs` + `node scripts/v1/verify-build.mjs` — PASS (all 9 Wrangler dry-runs + local upgrade check)
- `git diff --check` — PASS

## Remaining Gates
- Independent exact-head review by Muse; merge & coordination by GPT.
- Hosted runtime UAT, F5, and official T1B-01/T1B-02 remain Not tested / OPEN. No live deploy or provider activation performed.
