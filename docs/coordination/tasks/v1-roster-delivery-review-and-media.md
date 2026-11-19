# Task: v1-roster-delivery-review-and-media

- **Lane:** GSiS v1 (`v1/services/roster`, `v1/runtime/gateway.mjs`, `tests/v1-product`)
- **Implementer:** Antigravity
- **Reviewer:** Muse (exact head commit)
- **Coordinator / Merger:** GPT
- **Branch:** `antigravity/v1-roster-delivery-review-and-media`
- **Status:** Claimed (in progress)

## Scope
Port the remaining Roster delivery-review operations and WhatsApp report/media routes to clear probe allowances `F04`, `F05`, and `F11` (5 allowances total):
1. `POST /api/roster/operations` (`operation: "deliveryReview"`) — read-only SMC/Admin view over `product_outbox` notification rows and `deliveryReviewReceipts` in `roster_records`.
2. `POST /api/roster/operations` (`operation: "dismissDeliveryIssues"`) — SMC/Admin guarded dismissal writing review receipts in `roster_records` without modifying `product_outbox` delivery history.
3. `POST /api/roster/operations` (`operation: "cancelPendingNotifications"`) — Admin-only guarded cancellation of strictly `state = 'queued'` notification rows in `product_outbox` (never cancelling `leased`, `accepted`, `delivered`, `uncertain`, or `failed` rows).
4. `GET`/`HEAD` `/whatsapp/reports/<YYYY-MM-DD>` (plus gateway `/api/whatsapp/reports/<YYYY-MM-DD>` alias) — authenticated privacy-safe plaintext report with redaction, integrity check for archived R2 reports, and strict security headers.
5. `GET`/`HEAD` `/whatsapp/media/<messageId>` (plus gateway `/api/whatsapp/media/<messageId>` alias) — authenticated school-scoped R2 media proxy with `roster_inbox` verification, MIME allowlist, HTTP Range support, digest check, and `Content-Security-Policy: sandbox`.
6. Remove the 5 `F04`/`F05`/`F11` entries from `tests/v1-product/operation-probe-allowlist.json` and add regression coverage in `tests/v1-product-roster-delivery-review.mjs`.

## Guardrails
- No v0.9 source or generated files modified (`npm run build` zero drift).
- No provider sending, webhook enablement, live deployment, or live school data mutation.
- Preserve all `product_outbox` history on dismissal; never claim dismissal proves WhatsApp delivery.
