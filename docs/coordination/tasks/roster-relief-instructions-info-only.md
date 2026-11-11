# roster-relief-instructions-info-only: Relief instructions never block a report; they always reach the relief teacher

- Status: approved at aeb4aa7 (review docs/coordination/review/pr115-muse-review.md), awaiting owner's "merge 115"
- Owner/model: Codex
- Reviewer/model: Muse
- Last updated (Asia/Singapore): 2026-11-11 ~16:30
- Branch: codex/roster-relief-instructions-info-only
- Base SHA: re-check main's head before branching (lane R serial; take this before any other lane R task not yet started)
- Current head SHA (or PR head; avoid self-referential commit hashes):
- PR:
- Owner ruling (11 Nov, verbatim): "the 'relief instructions' are stopping relief reports from landing properly. the 'relief instructions' are for-info and doesn't not affect relief allocation. they need to be conveyed to the teachers receiving the relief duty. via whatsapp and in their relief duty details in roster.gsps.edu.sg"
- Supersedes: `roster-intake-instruction-edit` (edit the absence "to make it hit") and `roster-intake-instruction-orphan-close` (close/dismiss stuck drafts). Under this ruling, no instruction can be stuck, so neither is needed as written. Their acceptance points that still apply are folded in below. Do not build them separately.

## Problem (verified in code and live D1, 11 Nov)
1. A received report saves the absence, then holds its instructions as a separate deferred draft (`edgeInstructionDrafts`, edge-roster.js:542). A later processor (`processEdgeInstructionDrafts`, edge-roster.js:588) applies them through `saveInstructions`.
2. That step fails the whole draft to `needsReview` when:
   - the absence was edited or deleted (ABSENCE_CHANGED);
   - the day's `timetableId` or parity changed (INSTRUCTION_SOURCE_CHANGED), which happens whenever a Stapler plan is confirmed after the report;
   - any other error occurs (INSTRUCTIONS_NEED_REVIEW).
   The report then sits in "Needs attention", and the relief teacher never sees the note.
3. Inside `saveInstructions`, `instructionMap(input, known)` silently drops notes whose `lessonKey` is not in the current lesson list. A Stapler change of class, venue or subject therefore loses the note even when nothing fails.
4. Live cost on 11 Nov: 8 drafts were stuck (1 for 12 Nov, 7 for 10 Nov). All were withdrawn by hand; those notes never reached the relief teachers.

## Required behaviour
1. **Instructions are information only.** They never fail, delay or hold a report, an absence save, allocation or publication. No instruction path may set an intake to `needsReview` or `pending`.
2. **Saved with the absence, in the same mutation.** On intake (and on SMC/teacher save), the submitted notes are stored on the absence record in the same `saveAbsence` commit. No deferred draft is needed for new reports. The submitted text is kept exactly as written, with author and time (`instructionAuthors`).
3. **Store by lesson, match tolerantly.** Each note keeps its original lesson descriptor (period, class, subject, venue, as submitted) plus the original `lessonKey`. Match a note to a relief duty in this order:
   1. same `lessonKey`;
   2. same period and same class;
   3. same period.
   A note that matches no lesson today becomes a **general note** for that absence and day. It is shown on every relief duty that covers that absence, and labelled "Note from <teacher> (original lesson: P6 1H MA)". Never drop a note silently. Never apply a note to another teacher's absence.
4. **Remove the scope check from instructions.** `expectedInstructionScopes`, the timetableId/parity check and `instructionScope` no longer gate instructions. Keep the fields if other code reads them, but they must not reject.
5. **Delivery to the relief teacher.**
   1. Roster: My Relief Duties → duty details show the matched notes. They are visible before and after acknowledgement, and on the day.
   2. WhatsApp: the existing paths carry the note: `conditional_relief_instruction` (gsis_relief_instruction_v1) on publish, and when a note is added or changed after publish (existing `syncLessonInstructions` → publication snapshot → queue). Verify end to end that a note submitted through intake reaches the WhatsApp outbox for the relief teacher on publish. Add a test for it.
   3. A general note goes out the same way, once per duty, not once per period.
6. **Re-match on change.** When the absence is edited, a Stapler plan is confirmed, or relief is reallocated, notes re-match automatically (extend `syncLessonInstructions`). A duty whose note changes after publish gets the existing "instructions updated" handling. No message is resent if the text is unchanged.
7. **Deleted absence.** The notes stay on the deleted record for history. No duty is created from them and nothing waits for review.
8. **Existing drafts (migration).** On the first run after deploy, any `edgeInstructionDrafts` row with status `pending` or `needsReview`:
   - if its absence is live and the date is today or later, apply it by rule 3 and mark it `applied`;
   - otherwise (date past or absence deleted), mark it `withdrawn` with a plain `resolutionReason`.
   The processor then finds no work for new reports. Keep the collection and its history; delete no rows.
9. **SMC view.** Assign Relief / Manage absences shows each absence's notes and where each one matched (lesson, or "general"). This is read-only information, not a task. The "Needs attention" list no longer shows instruction items. "Retry processing" for instructions is removed.
10. **Google parity.** If the Google path (`backend/`) still saves instructions, give it the same "never reject" rule, or record it as Google-only in `docs/roster/D1_PARITY.md`. Google is frozen; do not redeploy it for this.

## Files/domains owned (include generated outputs)
- shared/roster-operations.js (`saveAbsence`/`saveInstructions` storage, `instructionMap`, `assignmentInstructions` tolerant match + general notes, `syncLessonInstructions` re-match, `instructionScope` no longer gating).
- roster-update/public/edge-roster.js (intake stores notes in the same mutation; draft processor migration and never `needsReview`; `edgeIntakeEntries` state mapping).
- roster-update/public/roster-operations-ui.js and roster-acknowledgement-ui.js (duty details, SMC read-only view, remove instruction "Needs attention"/"Retry").
- notification-worker paths only if the instruction message needs the general-note case.
- backend/RosterMirror.gs and shared/edge-health.js only for status counts.
- Tests, CHANGELOG.md, generated bundles via the canonical build.

## Out of scope
- Allocation logic (instructions must not affect it).
- New WhatsApp templates. Use the approved `gsis_relief_instruction_v1` and the existing relief messages; if the general note needs different wording, stop and ask.
- Any live D1 edit, settings, merge or deploy.

## Acceptance checks
1. Test: an intake with notes saves the absence and the notes in one revision. The report shows as landed at once, with no pending/needsReview state (fails on current code).
2. Test: a Stapler plan confirmed after the report (new timetableId, changed class/venue) does not reject or drop the note. It matches by period+class or period, or becomes a general note.
3. Test: no instruction error can put an intake into "Needs attention". Force an exception in matching; the absence save still succeeds.
4. Test: a published relief duty for a lesson with a note shows the note in My Relief Duties, and queues `conditional_relief_instruction` for the relief teacher with the note text. Changing the note after publish queues one update; saving unchanged text queues none.
5. Test: a general note appears once per covering duty, labelled with its original lesson.
6. Test: migration as in rule 8. Live future drafts are applied; past or deleted ones are withdrawn; no rows are deleted.
7. Test: a note is never shown on a duty for a different absent teacher.
8. Browser test: the SMC sees the absence's notes with their match. No instruction "Retry processing" control remains.
9. Canonical build leaves no diff; full local suite green; full CI green; draft PR naming Muse as reviewer at the exact head; PR body lists the deploy files that change.

## Review notes for Muse (reviewer)
- Review at the exact head with HANDOVER_REVIEWER.md §2.
- Check especially:
  - no code path can still set an intake to `needsReview` or `pending` because of instructions;
  - no note can be dropped silently;
  - no note can leak to another teacher's duty;
  - allocation is untouched (diff `shared/roster-allocation.js` must be empty or trivially unrelated);
  - WhatsApp goes only to the relief teacher, with no duplicate sends;
  - the migration is idempotent (running it twice changes nothing).
- Ask the owner for a read-only D1 check if you need live draft counts. Claude's count on 11 Nov after withdrawals: 0 pending, 0 needsReview.

## Decisions and changes
- 11 Nov ~16:20 (owner "withdraw the 7"): Claude set 7 drafts dated 10 Nov to `withdrawn` (roster head revision 10693), and earlier draft adbaa6cc… (revision 10683). Records kept.

## Verification
Exact command, tested commit, outcome and evidence. Explicitly list checks not run.

## Review
