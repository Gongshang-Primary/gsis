# Re-review: PR #235 — Port Roster delivery review and private WhatsApp report/media routes (F04, F05, F11)

- Reviewer: Muse, replacing Claude until Claude returns, per the owner's 16 November directive (source 12b06eb).
- Verdict: **APPROVED at the exact head** `5721f5f4`.
- Branch: `antigravity/v1-roster-delivery-review-and-media`. Base: main `559f5f51`. PR status: open, MERGEABLE. GPT to merge.
- No deployment authorised.
- This is a re-review at a rebased head. The original approval at `f4e851b` (record `pr235-muse-review.md`) does not carry across the rebase; this record is the approval for the new head.

## Why a re-review

GPT merged #231, #232, #234, #236, #238, #239, #240 and #241 after the original approval, and #235 conflicted with the new main in `tests/v1-product/operation-probe-allowlist.json` and `v1/services/roster/service.mjs`. The owner directed conflict resolution and a fresh exact-head review. The rebase was performed by Muse (the reviewer) at the owner's direction, because the conflicts were purely mechanical unions with a unique correct resolution — no product decision was involved. The resolution is disclosed here, and this approval rests on the fresh exact-head evidence below (green product CI at the new head plus full local verification), not on the rebase itself.

## What the rebase changed

The branch was rebased onto main `559f5f51`. Two files conflicted, both unions of independent additions:

- Allowlist, three regions: #235 removed five entries (roster `/operations` cancelPendingNotifications, deliveryReview (F04), dismissDeliveryIssues (F05), `/whatsapp/media/synthetic-probe`, `/whatsapp/reports/synthetic-probe` (F11)); the merged PRs had removed six (deploy `/commands`, `/layout-reference` (F12), lord `/auth/relief` (F15), roster `/operations` contactCreate (F03), resolveAbsenceIntake/retryAbsenceIntake (F06)). Resolution keeps the union of both removals: 13 entries remain (24 − 6 − 5). The entry before the conflict region (`archiveColdOutput`, F10) became the last entry, so its trailing comma was removed to keep the JSON valid.
- `v1/services/roster/service.mjs`, three regions: imports keep both the `absence-clash.mjs` import (main, #236) and the `delivery-review.mjs` import (#235); the operations set keeps both `"contactCreate"` (main, #234) and `"dismissDeliveryIssues"` (#235); the `operations()` dispatch keeps both the `resolveAbsenceIntake`/`retryAbsenceIntake` branch (main, #236) and the `deliveryReview`/`dismissDeliveryIssues`/`cancelPendingNotifications` branch (#235).

Verified after the rebase: the diff vs the new main is exactly #235's original change (6 files, 1500 insertions, 42 deletions) — the only difference from the original diff is the `v1-release-v108.md` claim file, which is now on main via #233. The allowlist entry set and the `dynamicCallSites` set both satisfy the union rule, with nothing missing or extra.

## What it does (unchanged from the original approval)

Ports the Roster delivery-review operations and the private WhatsApp report/media routes, clearing all five F04/F05/F11 probe allowances:

- New `v1/services/roster/delivery-review.mjs` (850 lines):
  - `deliveryReview` (`roster.read`): builds the exact `roster-delivery-review-ui.js` view contract over `product_outbox` notification rows and `deliveryReviewReceipts` — issues, pending (admin only), `canCancel`, in-flight/uncertain counts, reports, `messagesSent: 0`. URLs and long tokens are redacted in `sanitizeText`; review state is fingerprint-bound (`rowFingerprint` over job/state/code/attempts/fence/provider/updated_at), so a changed row automatically reopens its alert.
  - `dismissDeliveryIssues` (`roster.write`): validates preview tokens (64-hex), re-checks the fingerprint, and commits receipt rows under SQL guards on state/attempts/fence/updated_at/last_code/provider_id. `product_outbox` history is untouched.
  - `cancelPendingNotifications` (`roster.admin`): admin-only, cancels strictly `state = 'queued'` rows with `last_code = 'CANCELLED_BY_SMC'`; the state check is enforced both in code and in the UPDATE's WHERE clause (fence-guarded). `leased`/`accepted`/`delivered`/`uncertain`/`failed` rows are rejected with 409.
  - `GET`/`HEAD /whatsapp/reports/<YYYY-MM-DD>`: same-origin enforced, strict calendar date, school-scoped R2 key (`schools/<schoolId>/...`, no `..`), SHA-256 digest verification (503 on tamper), `private, no-store`, `nosniff`. Falls back to a live-rendered redacted report when no archived row exists; 404 when there is nothing to report.
  - `GET`/`HEAD /whatsapp/media/<messageId>`: same-origin enforced, message must exist in `roster_inbox` for this school (optional `waId` cross-check), object key must be school-scoped `schools/<schoolId>/inbox-media/` with a safe charset, strict MIME allowlist (jpeg/png/webp; ogg/mp3/mp4/aac/amr/opus/webm), 5 MB image / 16 MB audio caps, HTTP Range with 206/416, SHA-256 verification on full GET when a digest is recorded, `Content-Security-Policy: sandbox`, `Cross-Origin-Resource-Policy: same-origin`.
- `v1/runtime/gateway.mjs`: `/api/whatsapp/(media|reports)/<segment>` aliases to Roster `/whatsapp/...`; non-GET/HEAD on the alias is 405; `range` and `sec-fetch-site` headers are forwarded.
- `v1/services/roster/service.mjs`: `deliveryReview` in reads, `dismissDeliveryIssues` in writes, `cancelPendingNotifications` in adminWrites; both WhatsApp routes map to `roster.read`.
- The operation-probe allowlist loses exactly the five F04/F05/F11 entries.

## Scope, merge, secrets

- Diff vs origin/main: exactly 6 files, matching the task record's exact-file allowlist. 1500 insertions, 42 deletions.
- `git merge-tree --write-tree --name-only origin/main 5721f5f4` clean (tree 8dfc7bf5), re-checked against current main.
- `git diff --check`: clean. Secrets scan of the diff: clean.
- No SQL migrations, no v0.9 source edits.

## CI at the exact head

- Isolated v1 product run 44695566451: **success at head 5721f5f**, after a rerun. The first run failed on a single infrastructure flake: `v1-product-venues-register-ui.mjs` crashed on an uncaught `TypeError: fetch failed` (`SocketError: other side closed`, `UND_ERR_SOCKET`) from the local miniflare server during a Playwright route handler — after the test's own PASS line had printed (160/161 programs passed). That test passes locally at this exact head, and the rerun passed the full suite. The flake is recorded here, not hidden.
- Node/LORD ("Verify GSiS queue changes"): **no run exists for this head**. The workflow `verify-queue.yml` triggers only on push to `codex/**`, `muse/**`, `claude/**` branches, so `antigravity/**` branches never trigger it. The owner waived this notation difference on 20 Nov 2026 ("review all done by antigravity, ignore difference in notation, i will orchestrate") and will orchestrate the workflow fix/merges. This approval rests on the green product CI at the exact head plus the full local verification below, and the waiver is recorded here rather than hidden.

## Local checks at the exact head

Worktree `wt235-rebase` at 5721f5f4, `npm ci` in root and in `v1/`, `TZ=Asia/Singapore`, Playwright Chromium:

- `tests/v1-product-roster-delivery-review.mjs`: exit 0, PASS — deliveryReview, dismissDeliveryIssues, cancelPendingNotifications, `/whatsapp/reports`, `/whatsapp/media`.
- `tests/v1-product-operation-probe.mjs`: exit 0, PASS — 406 probes, `knownMissing` 13 (the union count on this base: 24 − 6 cleared by merged PRs − 5 cleared here), parsedScripts 131.
- `tests/v1-product-roster-service.mjs`: exit 0, PASS — existing Roster service regressions intact.
- `tests/v1-product-venues-register-ui.mjs`: exit 0, PASS — run locally to check the CI flake above; all assertions pass at this head.
- `npm run build`: exit 0, no diff. `node scripts/v1/build.mjs` and `node scripts/v1/verify-build.mjs`: exit 0.

## Findings

None.

## Quality gates

- Q01–Q06 pass at the exact head (bounded scope, fail-closed guards, exact-head product CI green, local checks green). Q07 is this review. Q08 is not applicable — no deployment authorised.
- Hosted/runtime UAT: **Not tested**.
