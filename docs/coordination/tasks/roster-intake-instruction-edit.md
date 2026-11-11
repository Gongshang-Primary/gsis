# roster-intake-instruction-edit: SMC can edit the absence record itself so stuck relief instructions apply ("make it hit")

- Status: proposed
- Owner/model: Codex
- Reviewer/model: Muse
- Last updated (Asia/Singapore): 2026-11-11 ~14:50
- Branch: codex/roster-intake-instruction-edit
- Base SHA: 6b97fe1 (re-check main's head before branching; #114 must be merged first — lane R is serial, one open task at a time)
- Current head SHA (or PR head; avoid self-referential commit hashes):
- PR:
- User-authorised scope: On a received report whose relief instructions are at 'needsReview' (ABSENCE_CHANGED or INSTRUCTION_SOURCE_CHANGED), give the SMC an "Edit absence" action in context (in the intake receipt, next to "Retry processing") that opens the existing absence edit dialog for the absence the instructions belong to. The SMC corrects the absence record's details (periods, type, relief setting) so the instructions match and apply ("hit"). After saving the absence edit, the instructions are re-applied (the draft is retried) and the receiving teacher sees them in My Relief Duties. The instruction text itself is NOT edited in this task — the original submitted text is retained. This corrects the earlier draft of this task, which wrongly scoped it as editing the instruction text; the owner corrected it (11 Nov ~14:50): "i meant editing the absence record itself instead".
- Files/domains owned (include generated outputs): roster-update/public/roster-operations-ui.js (the "Edit absence" action on the intake receipt, wiring to the existing absence edit dialog, and retry after the edit), roster-update/public/edge-roster.js (the draft reconciliation on edit-apply — re-point the draft at the corrected/current absence and accept the current timetable scope for that item, so the retry succeeds once the absence matches), shared/roster-operations.js only if `saveAbsence`/`saveInstructions` needs a change (prefer reuse — `saveAbsence` with `p.id` already edits an existing absence, and the server already allows SMC to edit another teacher's absence), tests, CHANGELOG.md, generated Worker bundles via the canonical build.
- Out of scope: editing the instruction text itself (NOT this task — the earlier wrong scope); removing the timetable scope check globally (the broader "forward directly" policy is a separate decision — this is a per-item SMC correction, not a policy change); the receipt fix (#114) and the release branches; any live data, settings, merge or deploy.
- Acceptance checks:
  1. A test proves: from a stuck (needsReview) instruction draft, the SMC edits the absence record and the instructions then apply to the receiving teacher's duty (fails on current code, passes after).
  2. The original submitted instruction text is retained (the absence edit does not overwrite it).
  3. If the absence was deleted (no record to edit), the flow fails plainly and guides the SMC to re-record the coverage (Report Absence / Manage reported absences) — it creates no duty from a deleted absence and does not silently no-op.
  4. The automatic processor's scope check is unchanged for non-edited items; only the explicit SMC edit (and the retry after it) reconciles the draft for that item.
  5. Canonical build leaves no diff; full local suite green; full CI green; draft PR naming Muse as reviewer at the exact head.

## Decisions and changes

- Diagnosis (verified in code by Muse, 11 Nov): relief instructions are held as a D1 `edgeInstructionDraft` (status 'pending') when a report is received (edge-roster.js:542). The draft processor `processEdgeInstructionDrafts` (edge-roster.js:588) applies them via `saveInstructions`, but fails to 'needsReview' when the absence cannot be found (409 ABSENCE_CHANGED) or when the timetableId/parity scope check fails (409 INSTRUCTION_SOURCE_CHANGED). The SMC's only options on a stuck item today are "Retry processing" (re-runs the same check, so it fails again when the mismatch persists), "Review report" (read-only — it explicitly changes no records), or "Withdraw report". There is no "Edit absence" action on the stuck item, so the SMC must navigate away, find the absence, edit it, come back, and retry.
- The absence edit already exists and is reused, not rebuilt: `saveAbsence` with `p.id` edits an existing absence (shared/roster-operations.js, `saveAbsence` branch), and the server already allows SMC to edit another teacher's absence (`owned` permits SMC/admin; `editable` adds date-not-past and not-deleted). The absence edit dialog (`openEntry`, roster-operations-ui.js:1338) already lets the SMC change reason/type, periods and relief-required, and saves via `saveAbsence` with `p.id`. The new work is wiring that edit into the stuck instruction item and reconciling the draft after the edit (re-point at the corrected/current absence, accept the current timetable scope for that item) so the retry succeeds. Note for the implementer: editing the absence's periods alone does not change the day's timetableId/parity, so the reconciliation must handle the scope side as well as the absence side — if the draft cannot be reconciled, stop and report back rather than silently dropping the instructions.
- Owner decision (11 Nov ~14:50, "allow SMC to edit details of the absent 'to make it hit'. ASAP please", corrected to editing the absence record itself): the SMC edits the absence record so the instructions apply. This is urgent and jumps the queue after #114 merges. Live example: Sri Asilah, 12 Nov 2026 P5–P9, instructions "Lesson swap with Syahirah", stuck at needsReview with ABSENCE_CHANGED.

## Verification
Exact command, tested commit, outcome and evidence. Explicitly list checks not run.

## Review
Reviewer/model, reviewed SHA, findings, resolution. Advisory review is not human approval.

## Deployment
Not deployed unless supported by explicit environment/version/time evidence. State staging and production separately. Note: the edit-apply works only after the owner redeploys the Worker with this fix. Live verification after deploy: use the SMC edit on the stuck Sri Asilah 12 Nov item and confirm the receiving teacher sees the instructions in My Relief Duties.

## Handoff
- Remaining work: implement, verify per the acceptance checks, open a draft PR naming Muse at the exact head.
- Do not delete/re-submit reports or clear receipts to reverse anything. The original submitted text must stay visible in the draft/audit alongside the SMC absence edit.

- Claim: Model: Codex, 11 November 2026. Owner-authorized branch created from current main after #114 merges. Muse reviews the exact implementation head. No live operations or changes to release branches are authorized.
