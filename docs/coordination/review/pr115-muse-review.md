# Review: PR #115 — Relief instructions are information only

- Reviewer: Muse
- Reviewed head: `aeb4aa79f5f404a0a654c8c5ffdd4daa252a13e9` (branch `codex/roster-relief-instructions-info-only`, base main)
- Verdict: **APPROVE**
- Date (Asia/Singapore): 2026-11-11 ~19:30
- Task: `docs/coordination/tasks/roster-relief-instructions-info-only.md` (owner ruling 11 Nov)

## Evidence

- **CI run 42996845685** at the exact head: all 5 jobs green (full-suite + Regression shards 1/4, 2/4, 3/4, 4/4), verified via the check-runs API.
- **Local worktree wt115 at the exact head**: all 26 changed/new test files run with `TZ=Asia/Singapore NODE_NO_WARNINGS=1` and the Playwright chromium-1234 path — **all pass**:
  - New: `tests/roster-relief-instructions-info-only.mjs`, `tests/roster-relief-instructions-info-only-policy.mjs`, `tests/roster-relief-instructions-info-only-browser.mjs` — all PASS.
  - Changed (23): `absence718d-flow.cjs`, `paid097-receipts.cjs`, `release084-instruction-concurrency.cjs`, `release084-own-arrangements.cjs`, `release084-report-instructions.cjs`, `roster-d1-parity.mjs` (272 operations, 85 successful, 15 internal, 172 errors, 57 missing; zero remote requests), `roster-intake-instruction-drafts-drain.mjs`, `roster090-multiple-absence.cjs`, `roster093a-absence-arrangements.cjs`, `roster093a-instruction-review.cjs`, `roster093b-peer-ui.cjs`, `roster094-edge-roster.mjs`, `roster096-absence-coverage.cjs`, `roster096-probe-plans.mjs`, `roster096-scheduled-idle.mjs`, `roster098d-resubmissions.cjs`, `roster098n-shorter.cjs` (exit 0, fail 0), `roster701-r05.cjs`, `roster701-r20.cjs`, `roster710-absence-policy-ui.cjs`, `roster710-operations.cjs`, `roster712-absence-concurrency.cjs`, `roster716-absence-fast-browser.cjs` — all PASS.
  - Codex reported the full local suite 1049/1049 Node + 40/40 LORD; not independently re-run by Muse — CI is the gate.
- **Negative control (reproduced by Muse)**: the new acceptance test run against main's old code (32b6f9c) FAILS with exit 1, `AssertionError: instructions must never hold a landed absence pending` (actual 'pending', expected 'applied'). On the PR head it passes. The test proves the change.
- **Canonical build** in the worktree at the exact head: 18 components, `git status` clean — **no diff**.
- **Merge-tree** `git merge-tree --write-tree --name-only origin/main <head>`: clean (no conflicts).
- **Allocation**: `git diff` for `shared/roster-allocation.js` is empty — allocation untouched.
- **Secret scan**: no secrets, tokens, private links or private school records in the diff. The only "token" hits are the existing day/authority-token functions and a CHANGELOG mention.
- **Scope**: matches the task file. Product files are `shared/roster-operations.js`, `roster-update/public/edge-roster.js`, `edge-roster-policy.js`, `roster-operations-ui.js`, plus generated `edge-roster-domain.js` and `roster-operations-model.js` (the same 182-line change propagated from `shared/roster-operations.js` via the canonical build). Generated Worker/Google bundles, CHANGELOG, the task record, and the regenerated parity catalog (`docs/roster/d1-parity.json`, `D1_PARITY.md`) are in scope. `roster-acknowledgement-ui.js`, `backend/RosterMirror.gs` and `shared/edge-health.js` are unchanged — duty details and status counts are covered by the changed UI/model files, and the browser test confirms duty-note visibility before/after acknowledgement.

## Findings (owner's blocking criteria, all checked)

1. **No path can still put an intake into needsReview or pending because of instructions.** New intakes no longer create an `edgeInstructionDraft` (the creation + `instructionState='pending'` is removed). The intake receipt `intakeState` no longer considers instruction state. `edgeIntakeEntries` maps old pending/needsReview instruction drafts to `'retained'`, so they cannot make the intakeState pending/needsReview. The old `processEdgeInstructionDrafts` apply-or-review processor is replaced by a migration that returns `{pending:0, needsReview:0}`. The UI removes the "Relief instructions are being checked" and "need review" messages, treats 'retained'/'withdrawn' as complete (so instruction items leave "Needs attention"), and `intakeRetryable` returns false for instruction-only items (so "Retry processing" no longer appears for them). The UI also normalises any stale pending/needsReview instruction state to applied/retained on load.
2. **No note dropped silently.** `instructionMap` no longer filters by known lessonKeys (it keeps every submitted entry; a bare string becomes a `submitted-note`). `retainInstructionNotes` keeps every note with author/time/history and never deletes one. `instructionNotesView` matches by lessonKey, then period+class, then period, and anything unmatched becomes a labelled general note ("Note from <teacher> (original lesson: ...)"). The malformed-key test proves a note is kept even when original-lesson parsing throws.
3. **No note leaks to another teacher's duty.** `dutyInstructionNotes` reads only the duty's own absence (`dem.absenceId`) and returns [] unless the duty's date and absent teacher match that absence. Each note is tagged with its absenceId/absentTeacherId. The wrong-teacher/day isolation test passes.
4. **Allocation untouched.** Confirmed by the empty diff above, and the policy test proves information-only edits preserve day authority while real coverage changes still hit the conflict fence.
5. **WhatsApp only to the relief teacher, no duplicate sends.** `queue()` dedups by key. `queueConditional` skips queueing when the prior snapshot has the same rule version and text (unchanged text queues none; changed text queues one update). Personal notes are grouped into one message per covering duty block (consecutive periods, same rule/text/class/subject/venue), so a general note goes out once per duty, not once per period. The recipient is the duty holder (`v.staffId`). At send time, a superseded queued version is blocked ('Published instruction or assignment was superseded.' / 'Conditional instruction recipient or text changed.' / 'no longer published for this teacher.'). The deduplication test passes.
6. **Migration is idempotent.** The probe only selects drafts with status pending/needsReview; inside `apply`, a draft that is not pending/needsReview returns `{replayed:true}` unchanged; the requestId is deterministic per draft. After the first run no draft is pending/needsReview, so a second run finds no work and changes nothing. No rows are deleted. Live future drafts are applied (retained text preserved under a `key|retained|<job.id>` key when the absence already holds different text); past/deleted ones are withdrawn with a reason. The idempotent-replay test passes.
7. **Google parity.** The parity catalog is regenerated (272 operations, counts unchanged from base) and `D1_PARITY.md` records the frozen Google-only journal/coarse-revision exception. The PR body states Google artifacts are regenerated but must NOT be deployed (Google is frozen) — correct.

## What was not tested

- Live D1/Google, production browser recovery, actual WhatsApp provider delivery/approval/configuration, or deployment. All new data is synthetic and outbound calls are trapped. Live draft counts after the 11 Nov withdrawals were 0 pending, 0 needsReview, so the migration has no live drafts to apply at this moment; it will apply to any drafts that appear before deploy.

## Release notes for the owner

- Deploy order (from the PR body): Notification Worker, then Operations Worker, then Roster Pages. Preserve flags, bindings, URLs, credentials and crons. **Do not deploy the regenerated Google artifacts** (`Roster_Backend_v0.9.9.gs`, `Deploy_Backend_v0.9.9.gs`, `backend/Code.gs`) — Google is frozen.
- The normal scheduled drain performs the migration. Open editors may need one refresh across the token-format change.
- Do not clear receipts or rows during rollout/rollback. Rollback retains note/history data, but the old code lacks the new tolerant/general-note guarantees.
- This supersedes the unmerged instruction-edit branch (no PR was opened for it) and orphan-close (not started). The next queue item is the Stapler period mass-apply task.
- Live verification after deploy: submit a report with instructions and confirm the report lands at once (no "being checked"), the relief teacher sees the note in My Relief Duties, and the WhatsApp instruction message arrives once.
