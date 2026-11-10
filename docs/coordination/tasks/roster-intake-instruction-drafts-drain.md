# roster-intake-instruction-drafts-drain: Scheduled drain applies pending relief-instruction drafts on the edge path

- Status: merged (#111 at d886d1c as 0f51376, 11 Nov 06:13 SGT)
- Owner/model: Codex
- Reviewer/model: Muse
- Last updated (Asia/Singapore): 2026-11-10 ~19:06
- Branch: codex/roster-intake-instruction-drafts-drain
- Base SHA: a1e2954b07e1ae125e06ff38ab2be2616cd57b63
- Current head SHA (or PR head; avoid self-referential commit hashes):
- PR:
- User-authorised scope: Make the scheduled drain apply pending relief-instruction drafts on the edge (D1) path, so absence reports stop sitting at "Relief instructions are being checked" ("Needs attention") after the absence is saved. The fix is to run the draft processor on the normal schedule, not only in the wake-fallback case.
- Files/domains owned (include generated outputs): roster-update/public/_worker.js (dispatchReceivedReports and the scheduled drain path), notification-worker/dashboard-worker.mjs (scheduled handler), roster-update/public/edge-roster.js only if the draft processor itself needs a change, tests for the drain and draft path, CHANGELOG.md, generated bundles via the canonical build.
- Out of scope: removing or bypassing the timetable scope check (the check stays; the owner's broader "forward directly" policy question is a separate decision, not this task); the export hotfix branch (muse/assign-relief-export-stapler-format); the release v0.9.9q branches; any live data, settings, merge or deploy.
- Acceptance checks:
  1. A test proves pending instruction drafts are applied by the scheduled drain (fails on current code, passes after).
  2. The scope check still works: a draft whose timetableId or parity changed goes to 'needsReview', not 'applied'.
  3. Re-running the drain on an already-applied draft is a no-op (no double-apply, no duplicate instructions).
  4. Canonical build leaves no diff; full local suite green; full CI green; draft PR naming Muse as reviewer at the exact head.

## Decisions and changes

- Diagnosis (verified in code by Muse, 10 Nov ~18:5x): on the live D1 path the Google intake pipeline never runs — `roster-update/public/edge-roster.js:222` returns `{job:null}` for `nextAbsenceIntake`, and there is no `processAbsenceIntake` handler on the edge. Instead, each report's instructions are held as a D1 `edgeInstructionDraft` (status 'pending'; created at edge-roster.js:542). The draft processor (`processEdgeInstructionDrafts`, edge-roster.js:588, called via `processEdgePeerProposals`) is called ONLY from `wakeAbsenceIntake` (`_worker.js:644` / dashboard-worker.mjs:23164) and ONLY when the notification wake FAILS to queue (`if(!wake.queued)`). The normal scheduled drain (`dispatchReceivedReports`) never calls it, so pending drafts are never applied. The 7 absence reports for 10 Nov are stuck at instructionState 'pending' for this reason. The timetable did NOT change, so the scope check (timetableId/parity) is not the blocker — the processor simply does not run.
- The draft processor itself is sound: it applies `saveInstructions` to the saved absences, checks timetableId/parity against the current day, sets the draft 'applied' on success and 'needsReview' on a 4xx mismatch. The fix is wiring, not logic: run it on the normal schedule.

## Verification
Exact command, tested commit, outcome and evidence. Explicitly list checks not run.

## Review
Reviewer/model, reviewed SHA, findings, resolution. Advisory review is not human approval.

## Deployment
Not deployed unless supported by explicit environment/version/time evidence. State staging and production separately.

## Handoff
- Remaining work: implement, verify per the acceptance checks, open a draft PR naming Muse at the exact head.
- The owner's broader point — relief instructions are for-info and should simply be forwarded to the teacher receiving the duty — is a separate policy decision. This task only fixes the stuck drafts by running the existing processor with its existing scope check. Do not remove the check here.

- Claim: Model: Codex, 10 November 2026. Owner-authorized branch created from current main a1e2954. Muse reviews the exact implementation head. No live operations or changes to release/export branches are authorized.

## Codex implementation and verification record

Model: Codex. Branch `codex/roster-intake-instruction-drafts-drain`, base `a1e2954b07e1ae125e06ff38ab2be2616cd57b63`. Claim-only commit `473ee70` preceded implementation edits. Muse reviews the exact final head; Claude is unavailable.

- `dispatchReceivedReports` now invokes the existing `processEdgePeerProposals` service on D1 in both the idle transport fast path and after fresh transport/intake work. That service already applies pending instruction drafts and peer proposals. Existing bounded batches, durable identities, pending-only filtering and timetable-ID/parity checks are unchanged. The returned `edgeDrafts` counters retain unresolved work through `hasMore`; an unconfirmed service result fails the scheduled stage instead of claiming success.
- The existing notification Worker minute schedule and Queue handler already call this drain, independently of automatic allocation. No new cron, flag, binding, backend mutation API or wake policy is introduced. Canonical build regenerates notification and operations Worker `.mjs` / `.txt` bundles that embed this shared gateway; generated files were not hand-edited. `edge-roster.js` is unchanged.
- New `tests/roster-intake-instruction-drafts-drain.mjs` uses actual D1 dispatch/domain/store code with in-memory SQLite and synthetic R2/Contacts/timetable data. Before the fix it failed at the expected assertion, 0 of 7 retained drafts applied after three scheduled drain ticks (`/tmp/instruction-drain-red.log`). After the fix, seven synthetic reports apply over the existing bounded batches even with no transport work, a freshly forwarded report applies its instructions on the busy path, changed timetable ID and changed parity separately retain drafts as `needsReview`, and repeated drains preserve the full saved state and D1 head revision, including notification/peer collections. All outbound fetches are trapped.
- Canonical build passed all 18 components before focused verification. Ten focused programs passed: the new regression, `roster094-edge-roster.mjs`, `roster096-dispatch-idle.mjs`, `roster096-scheduled-idle.mjs`, `roster099n-intake-overlap.mjs`, `roster098d-intake-throughput.cjs`, `roster093b-intake-gateway.mjs`, `roster093b-worker-capture.mjs`, `roster098b-health.mjs`, `roster-peer-mail-d1-fence.mjs`.
- The parity test initially failed only because source references after the edited function moved. Owner explicitly approved "Include the generated parity refresh" on 10 November. Added only generated `docs/roster/d1-parity.json` to scope. Prepared/refreshed through the existing parity harness: 21 rows change source line references only; all 272 inventory operations, 85 successful request probes, 15 internal references, 172 error outcomes and 57 missing entries are unchanged. `docs/roster/D1_PARITY.md` does not change. No parity assertion is weakened.

### Remaining release gates and limitations

Run the complete local Node/LORD suite and a no-diff canonical build at the final implementation head, push only this feature branch, and require all five full-CI jobs green at that exact head before opening the draft PR. The PR body must identify Muse at that head, actual results and omissions. These gates are not claimed complete by this pre-commit record; their exact-head results belong in the PR handoff.

No live D1/Google reads, actual seven-report inspection/backfill, provider calls, deployment, merge, main push, settings/authority change, export-hotfix or q-release branch edits were performed. The seven reports in the regression are wholly synthetic; passing it is not a claim that the live reports have recovered. The owner deploys after review and checks retained report receipts; any source mismatch still requires review. Rollback is the previous notification/operations Worker code with existing bindings, flags, queues and original report/draft identities retained. Do not delete/re-submit reports or clear receipts to reverse code. The broader for-info instruction policy remains separate.
