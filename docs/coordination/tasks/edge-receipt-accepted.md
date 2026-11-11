# edge-receipt-accepted: Edge receiptStatus returns `accepted` as a boolean, so the retry of an unconfirmed reliefBatch can confirm or re-send

- Status: approved at ad0c164 (review docs/coordination/review/pr114-muse-review.md), awaiting owner's "merge 114"
- Owner/model: Codex
- Reviewer/model: Muse
- Last updated (Asia/Singapore): 2026-11-11 ~10:05
- Branch: codex/edge-receipt-accepted
- Base SHA: db57e3e (re-check main's head before branching)
- Current head SHA (or PR head; avoid self-referential commit hashes):
- PR:
- User-authorised scope: Make the edge (D1) `receiptStatus` return `accepted` as a boolean in all branches, matching the Google receipt contract, so the frontend retry of an unconfirmed reliefBatch can confirm (receipt found) or re-send (receipt not found) instead of always throwing "Save confirmation is unavailable".
- Files/domains owned (include generated outputs): roster-update/public/edge-roster.js (the `receiptStatus` handler only), one regression test, CHANGELOG.md, generated Worker bundles via the canonical build.
- Out of scope: the frontend retry check (roster-operations-ui.js:318, stays as-is); the save path; the draft logic; the D1 store; the receipt recording; the 45-second client timeout; the 11 Nov stuck draft itself (it is recovered by the retry once this fix is deployed); any live data, settings, merge or deploy.
- Acceptance checks:
  1. A regression test drives `receiptStatus` for a reliefBatch on the edge path, receipt found and receipt not found, asserting `accepted` is a boolean (true when found, false when not found). It fails on current code and passes after.
  2. The legacy receipt branch keeps returning `accepted:true` (it already does — verify, do not change it unless the test proves otherwise).
  3. The absence (`edgeAbsenceReceipts`) branch returns a boolean `accepted` too (verify whether `receiptResult` already yields one for the intake entry; add it if missing, same contract).
  4. No change to the receipt recording, the D1 store, or the frontend check. No new operation, flag, binding or authority change.
  5. Canonical build leaves no diff; full local suite green; full CI green; draft PR naming Muse as reviewer at the exact head.

## Decisions and changes

- Diagnosis (verified in code by Muse, 11 Nov): the frontend retry of an unconfirmed reliefBatch requires `receipt.accepted` to be a boolean (roster-operations-ui.js:318: `if(receipt?.requestId!==request.requestId||typeof receipt.accepted!=='boolean')throw Error('Save confirmation is unavailable. Retry this same save.');`). The Google backend always returns one (backend/RosterOperations.gs:351: `{accepted:!!receipt, confirmation: receipt?'accepted':'unconfirmed', requestId, currentRevision, ...}`). The edge (D1) `receiptStatus` (roster-update/public/edge-roster.js:157) never returns `accepted`: receipt found returns the stored result (the allocation view plus metadata — it has `acceptedRevision` and `acceptedAt` but no `accepted` boolean); receipt not found returns `{found:false, requestId}`. So on the live edge path every retry throws before re-sending the batch, no matter how many times it is retried.
- Verified it is not a digest mismatch: the store lookup (`roster-update/public/edge-store.js:155`) selects by (scope, actor, request_id) and only verifies the digest (409 on mismatch). Verified the stored result has no `accepted`: the allocation view (shared/roster-operations.js:575-576) has no top-level `accepted`, and `rosterOperationsAttachDayToken_` (roster-update/public/edge-roster-policy.js:28) adds no `accepted`.
- Pre-existing in the 0.9.9 baseline (2efd6e0, 28 Oct), NOT an r regression. r's only frontend change is the Export Excel button (#112, 11 lines); #111 touched only the scheduled drain. The bug was latent until a save went unconfirmed and the retry was exercised.
- Live 11 Nov: the owner deployed r; a reliefBatch went unconfirmed (45-second client timeout / lost response); retries failed repeatedly; the 11 Nov Assign Relief save was stuck, and new saves on that date were blocked while the uncertain error stood. The user later saved from a context without the stuck draft (a different tab/device/date), because the stuck draft is per-browser per-date and a fresh save skips the broken receipt check entirely.
- Fix (one handler, edge-roster.js:157): store receipt found → add `accepted:true` to the return; not found → return `{accepted:false, confirmation:'unconfirmed', found:false, requestId}`. Leave the legacy branch (`accepted:true` already) and the frontend check unchanged. After the fix the retry works in both cases: receipt found, it confirms via replay; receipt not found, it proceeds to re-send the batch, which the server applies fresh or replays by requestId.
- This fix makes recovery work. It does NOT prevent a save going unconfirmed in the first place (the 45-second client timeout and lost responses remain).

## Verification
Exact command, tested commit, outcome and evidence. Explicitly list checks not run.

## Review
Reviewer/model, reviewed SHA, findings, resolution. Advisory review is not human approval.

## Deployment
Not deployed unless supported by explicit environment/version/time evidence. State staging and production separately. Note: the retry works only after the owner redeploys the Worker with this fix. Live verification after deploy: retry the stuck 11 Nov save in the original browser and confirm it resolves (either confirms via replay or re-sends).

## Handoff
- Remaining work: implement, verify per the acceptance checks, open a draft PR naming Muse at the exact head.
- The 11 Nov stuck draft is recovered by the retry once this fix is deployed; do not delete or re-submit the report, and do not clear receipts to reverse anything. If the original batch applied online, the retry confirms it; if it did not, the retry re-sends it.

- Claim: Model: Codex, 11 November 2026. Owner-authorized branch created from current main. Muse reviews the exact implementation head. No live operations or changes to release branches are authorized.
