# Review: PR #114 — edge-receipt-accepted (Muse)

- Verdict: **APPROVE** at the exact head `ad0c164942df4be1316d48489f3af72ccfb6fdbc`.
- Reviewer/model: Muse.
- Reviewed SHA: `ad0c164942df4be1316d48489f3af72ccfb6fdbc` (branch `codex/edge-receipt-accepted`, base main `65d7bb5efe0fc8dfeedb8d852bab0a703f84c441`).
- PR: https://github.com/helper-gsps/gsis/pull/114 (draft, open).
- Task: `docs/coordination/tasks/edge-receipt-accepted.md`.

## What the PR does

The edge (D1) `receiptStatus` handler (`roster-update/public/edge-roster.js:157`) now returns `accepted` as a boolean in every branch, matching the Google receipt contract. A stored reliefBatch receipt returns `accepted:true`; a missing receipt returns `{accepted:false, confirmation:'unconfirmed', found:false, requestId}`. The legacy branch already returned `accepted:true` and is unchanged; the absence branch was verified to already yield `accepted:true` through `receiptResult` and is unchanged. One line changed in `edge-roster.js` (two response expressions). The frontend retry guard, the save handler, the D1 store, receipt recording, request/digest/actor checks, the client timeout and the operation inventory are all unchanged. The stored receipt itself is not modified — the lookup supplies `accepted` without changing the recording contract.

## Evidence

- CI run **42945205951** at the exact head: all 5 jobs passed (verified via the check-runs API on the head SHA; single run, no cancelled duplicate).
- Local worktree wt114 at the exact head: new test `tests/edge-receipt-accepted.mjs` **5 PASS, 0 FAIL, exit 0**. It covers: a stored reliefBatch receipt satisfies the unchanged frontend boolean check; a missing reliefBatch receipt is explicitly unconfirmed and can be resent; receipt identity remains bound to the original actor and command; a legacy receipt still reports accepted true; a retained absence receipt already supplies accepted true through receiptResult. It also asserts receipt checks are read-only (saved assignments, notification collections, audit and revisions unchanged).
- **Negative control reproduced by the reviewer**: the same new test run against the base main `edge-roster.js` (old handler) FAILS at the expected stored/missing acceptance assertions (`accepted` is `undefined` where `false`/`true` is expected), while the legacy and absence cases pass on old code. The test proves the fix. The worktree was restored to the PR head afterwards (clean).
- Canonical build at the exact head: **PASS, 18 components, no diff** (verified in wt114 after `npm ci`).
- Merge-tree vs origin/main: clean (no conflicted files). GitHub reports MERGEABLE.
- Secret scan on the diff: clean (no secret values; only synthetic fixture emails in the test, the standard fixture pattern).
- Scope verified: 8 files, all within the task scope — `edge-roster.js` (1 line), the new test, CHANGELOG (Pending entry), the task record, and the canonically regenerated notification/operations Worker bundles. No frontend, save-path, store, or release-label files changed. No live data, settings, deployment or provider calls.
- PR body names Muse at the exact head, states what changed, why, which files, the tests run with their results (including the negative control), and what was not tested. It does not claim a Muse review or approval, and does not claim the live 11 November save has recovered.

## Findings

- None blocking.

## Not independently re-run by the reviewer

- The full local suite (Codex reports 1046/1046 Node + 40/40 LORD at the head; CI is the gate). The reviewer ran the new test file (pass at the head, fail on old code) and the canonical build only.
- No live reads/writes, deployment or provider calls tested (none claimed).

## Release notes for the owner

- After merge, the next release's Worker code will return `accepted` from edge `receiptStatus`, so the retry of an unconfirmed reliefBatch can confirm via replay (receipt found) or re-send the original batch under the same request ID (receipt missing). The retry works only after you redeploy the Worker with this fix. This PR does not itself verify the live 11 November save — retry the stuck save in its original browser after deploying, and do not delete/re-submit the draft or clear receipts.
- The fix makes recovery work. It does not prevent a save going unconfirmed in the first place (the 45-second client timeout stays).
- Rollback: restore the previous Worker code; saved receipts, drafts and identities are retained.
