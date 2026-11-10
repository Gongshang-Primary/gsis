# roster-intake-instruction-drafts-drain: Scheduled drain applies pending relief-instruction drafts on the edge path

- Status: claimed before implementation (Model: Codex)
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
