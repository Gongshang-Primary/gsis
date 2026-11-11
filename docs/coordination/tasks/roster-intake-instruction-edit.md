# roster-intake-instruction-edit: SMC can edit a stuck relief-instruction draft so it applies ("makes it hit")

- Status: proposed
- Owner/model: Codex
- Reviewer/model: Muse
- Last updated (Asia/Singapore): 2026-11-11 ~14:48
- Branch: codex/roster-intake-instruction-edit
- Base SHA: d2257e1 (re-check main's head before branching; #114 must be merged first — lane R is serial, one open task at a time)
- Current head SHA (or PR head; avoid self-referential commit hashes):
- PR:
- User-authorised scope: On a received report whose relief instructions are at 'needsReview' (ABSENCE_CHANGED or INSTRUCTION_SOURCE_CHANGED), give the SMC an "Edit instructions" action that lets them correct the mismatch and apply the instructions, so the receiving teacher sees them, instead of only a blind "Retry processing" that keeps failing. The SMC can edit the instruction text per lesson/date and, where the absence changed, which current saved absence/date the instructions attach to. Saving applies the edited instructions to the current absence through the existing `saveInstructions` path (which writes them onto the absence and syncs them to the receiving teacher's duties), and marks the draft resolved. The original submitted text is retained in the draft/audit, not overwritten silently.
- Files/domains owned (include generated outputs): roster-update/public/roster-operations-ui.js (the "Edit instructions" action and dialog on the intake receipt), roster-update/public/edge-roster.js (the edit-apply path for instruction drafts — reuse `saveInstructions` and the existing receipt/requestId idempotency), shared/roster-operations.js only if `saveInstructions` needs a change to accept an SMC edit (prefer reuse), tests, CHANGELOG.md, generated Worker bundles via the canonical build.
- Out of scope: removing the timetable scope check globally (the broader "forward directly" policy is a separate decision — this is a per-item SMC correction, not a policy change); editing the absence itself (dates/periods/type — the SMC already does that via Report Absence / Manage reported absences; this task is about editing the instruction draft so it applies); the receipt fix (#114) and the release branches; any live data, settings, merge or deploy.
- Acceptance checks:
  1. A test proves an SMC edit of a stuck (needsReview) instruction draft applies the edited text to the current absence and the receiving teacher's duty shows it (fails on current code, passes after).
  2. The original submitted text is retained (the draft/audit shows the original and the SMC edit with actor and time).
  3. Editing cannot apply to a deleted/withdrawn absence — it fails plainly with the absence-gone message and creates no duty. If there is no current saved absence to attach to, the UI says so and points the SMC to record the coverage first (Report Absence / Manage reported absences), then edit/apply.
  4. The timetable scope check still applies to the automatic processor (unchanged); only the explicit SMC edit bypasses it for that item.
  5. Canonical build leaves no diff; full local suite green; full CI green; draft PR naming Muse as reviewer at the exact head.

## Decisions and changes

- Diagnosis (verified in code by Muse, 11 Nov): relief instructions are held as a D1 `edgeInstructionDraft` (status 'pending') when a report is received (edge-roster.js:542). The draft processor `processEdgeInstructionDrafts` (edge-roster.js:588) applies them via `saveInstructions`, but fails to 'needsReview' when the absence cannot be found (409 ABSENCE_CHANGED, "The absence changed before its instructions could be applied.") or when the timetableId/parity scope check fails (409 INSTRUCTION_SOURCE_CHANGED). The SMC's only options on a stuck item today are "Retry processing" (re-runs the same check, so it fails again when the mismatch persists), "Review report" (read-only — it explicitly changes no records), or "Withdraw report". There is no way to correct the mismatch in place. Live example: Sri Asilah, 12 Nov 2026 P5–P9, instructions "Lesson swap with Syahirah", stuck at needsReview with ABSENCE_CHANGED.
- The apply mechanism already exists and is reused, not rebuilt: `saveInstructions` (shared/roster-operations.js:1912, and the `instructionChanges` patch variant) writes instructions onto the absence (keyed by lessonKey, with `instructionAuthors` and `instructionsUpdatedBy/At`) and `syncLessonInstructions` (shared/roster-operations.js:1321) copies them onto the lessons/duties the receiving teacher sees in My Relief Duties. The new work is the SMC edit surface and the draft-resolution wiring, not a new apply path.
- Owner decision (11 Nov ~14:48, "allow SMC to edit details of the absent 'to make it hit'. ASAP please"): the SMC edits the stuck instruction draft so it applies. This is urgent and jumps the queue after #114 merges.

## Verification
Exact command, tested commit, outcome and evidence. Explicitly list checks not run.

## Review
Reviewer/model, reviewed SHA, findings, resolution. Advisory review is not human approval.

## Deployment
Not deployed unless supported by explicit environment/version/time evidence. State staging and production separately. Note: the edit-apply works only after the owner redeploys the Worker with this fix. Live verification after deploy: use the SMC edit on the stuck Sri Asilah 12 Nov item and confirm the receiving teacher sees the instructions in My Relief Duties.

## Handoff
- Remaining work: implement, verify per the acceptance checks, open a draft PR naming Muse at the exact head.
- Do not delete/re-submit reports or clear receipts to reverse anything. The original submitted text must stay visible in the draft/audit alongside the SMC edit.

- Claim: Model: Codex, 11 November 2026. Owner-authorized branch created from current main after #114 merges. Muse reviews the exact implementation head. No live operations or changes to release branches are authorized.
