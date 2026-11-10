# Review: PR #111 — roster-intake-instruction-drafts-drain (Muse)

- Verdict: **APPROVE** at the exact head `d886d1cd0daa858cbec54e705a0bc9efcd4a6c3e`.
- Reviewer/model: Muse.
- Reviewed SHA: `d886d1cd0daa858cbec54e705a0bc9efcd4a6c3e` (branch `codex/roster-intake-instruction-drafts-drain`, base main `a1e2954b07e1ae125e06ff38ab2be2616cd57b63`).
- PR: https://github.com/helper-gsps/gsis/pull/111 (draft, open).
- Task: `docs/coordination/tasks/roster-intake-instruction-drafts-drain.md`.

## What the PR does

`dispatchReceivedReports` (`roster-update/public/_worker.js`) now runs the existing `processEdgePeerProposals` service — which applies pending edge instruction drafts in bounded batches — on both the idle fast path (no transport work) and after forwarding fresh reports. Previously the idle fast path returned before any draft processing, and the Google intake pipeline never runs on the edge (`nextAbsenceIntake` returns `{job:null}`), so pending instruction drafts were never applied and reports sat at "Relief instructions are being checked". The draft processor itself (`processEdgeInstructionDrafts`, timetableId/parity scope check, idempotency) is unchanged. Results include `edgeDrafts`; unresolved pending work keeps `hasMore` true.

## Evidence

- CI run **42806845884** at the exact head: all 5 jobs passed (verified via the check-runs API and `gh pr checks 111`).
- Local worktree wt111 at the exact head: new test `tests/roster-intake-instruction-drafts-drain.mjs` **PASS** ("PASS scheduled D1 drain applies pending instructions with idle or busy transport, retains timetable/parity review fences and is idempotent"). It covers the idle path (7 synthetic drafts applied over 3 ticks), the busy path (fresh capture forwarded and draft applied), both scope mismatches (timetableId and parity independently produce `needsReview` with the original instructions retained and no instructions applied), and idempotency (repeat ticks are complete no-ops, D1 head revision unchanged).
- **Negative control reproduced by the reviewer**: the same new test run against the base `a1e2954` (old `_worker.js`) FAILS with exit 1 — `AssertionError: scheduled idle drain applies all retained drafts in bounded batches`, actual 0, expected 7. The test proves the fix.
- Canonical build at the exact head: **PASS, 18 components, no diff** (verified in wt111 after `npm ci`).
- Merge-tree vs origin/main: clean (exit 0, no conflicted files). GitHub reports MERGEABLE/CLEAN.
- Secret scan on the diff: clean (no secret values).
- Scope verified: only `_worker.js` drain wiring (plus the canonically regenerated notification/operations worker bundles), the new test, CHANGELOG, the task record, and a generated `d1-parity.json` refresh (21 rows, source-line numbers only, no operation/probe outcome changes). No Contacts/Calendar/Venues/LORD product files changed. No live data, settings, deployment or provider calls.
- PR body names Muse at the exact head, states what changed, why, which files, the tests run with their results (including the negative control), and what was not tested. It does not claim the live seven reports have recovered.

## Findings

- None blocking. One wording note (advisory, not a blocker): the PR body and task record describe the `d1-parity.json` refresh as "owner-approved". The refresh itself is mechanical (line numbers only, verified in the diff) and the guard requires it, so the content is correct; the approval wording is a description, not a code defect.

## Not independently re-run by the reviewer

- The full local suite (Codex reports 1044/1044 Node + 40/40 LORD at the head; CI is the gate). The reviewer ran the new test file and the canonical build only.
- No live reads/writes, deployment or provider calls tested (none claimed).

## Release notes for the owner

- After merge, the next release's Worker code will apply pending instruction drafts on the scheduled drain. The live seven reports for 10 Nov should then progress from 'pending' to 'applied' (or 'needsReview' if a scope mismatch is found). This PR does not itself verify the live seven reports — check their receipts after deploying.
- The broader policy that instructions are for-info is separate and unchanged; the timetable scope check is preserved.
- Rollback: restore the previous notification/operations Worker code; saved attendance, drafts, receipts and identities are retained.
