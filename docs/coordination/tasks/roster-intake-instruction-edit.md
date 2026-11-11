# roster-intake-instruction-edit: SMC can edit the absence record itself so stuck relief instructions apply ("make it hit")

- Status: in progress; published Codex claim retained
- Owner/model: Codex
- Reviewer/model: Muse
- Last updated (Asia/Singapore): 2026-11-11 ~14:50
- Branch: codex/roster-intake-instruction-edit
- Base SHA: 68b4e7929bf4ffa6f24ec6b1417d312e564c3dd8 (verified current main; #114 owner-merged as 9989142)
- Current head SHA (or PR head; avoid self-referential commit hashes): exact implementation head and final gate results are recorded in the draft PR body.
- PR: open only after the exact implementation head passes local and CI gates.
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

- Model: Codex implementation: SMC/Admin select a linked live absence from the receipt and reuse the existing edit dialog. A server token binds the current draft, saved absence and timetable source. The edit atomically validates/matches every retained note, records a per-absence correction and retries the original draft. Original command/text and receipt identity remain unchanged. The UI refreshes the original report; it does not claim the draft is applied merely because the absence edit was saved.
- The automatic processor uses the approved source only for that selected absence and verifies it has not changed again. All other items retain their original timetable-ID/parity fence. Existing nonempty instructions are retained; ambiguous mappings or conflicting text reject the whole correction rather than drop instructions. A deleted or unlinked absence is never recreated.
- Owner approval, 11 November 2026: "Include both generated parity files". Refresh `docs/roster/d1-parity.json` and `docs/roster/D1_PARITY.md` for 86 moved handler references only. All 272 operations, probe outcomes and missing-handler counts remain unchanged.

- Diagnosis (verified in code by Muse, 11 Nov): relief instructions are held as a D1 `edgeInstructionDraft` (status 'pending') when a report is received (edge-roster.js:542). The draft processor `processEdgeInstructionDrafts` (edge-roster.js:588) applies them via `saveInstructions`, but fails to 'needsReview' when the absence cannot be found (409 ABSENCE_CHANGED) or when the timetableId/parity scope check fails (409 INSTRUCTION_SOURCE_CHANGED). The SMC's only options on a stuck item today are "Retry processing" (re-runs the same check, so it fails again when the mismatch persists), "Review report" (read-only — it explicitly changes no records), or "Withdraw report". There is no "Edit absence" action on the stuck item, so the SMC must navigate away, find the absence, edit it, come back, and retry.
- The absence edit already exists and is reused, not rebuilt: `saveAbsence` with `p.id` edits an existing absence (shared/roster-operations.js, `saveAbsence` branch), and the server already allows SMC to edit another teacher's absence (`owned` permits SMC/admin; `editable` adds date-not-past and not-deleted). The absence edit dialog (`openEntry`, roster-operations-ui.js:1338) already lets the SMC change reason/type, periods and relief-required, and saves via `saveAbsence` with `p.id`. The new work is wiring that edit into the stuck instruction item and reconciling the draft after the edit (re-point at the corrected/current absence, accept the current timetable scope for that item) so the retry succeeds. Note for the implementer: editing the absence's periods alone does not change the day's timetableId/parity, so the reconciliation must handle the scope side as well as the absence side — if the draft cannot be reconciled, stop and report back rather than silently dropping the instructions.
- Owner decision (11 Nov ~14:50, "allow SMC to edit details of the absent 'to make it hit'. ASAP please", corrected to editing the absence record itself): the SMC edits the absence record so the instructions apply. This is urgent and jumps the queue after #114 merges. Live example: Sri Asilah, 12 Nov 2026 P5–P9, instructions "Lesson swap with Syahirah", stuck at needsReview with ABSENCE_CHANGED.

## Verification

Model: Codex. Provider-free fixtures use synthetic identities, real SQLite D1/R2 adapters, the real edge dispatcher and scheduled drain, plus the real receipt UI in JSDOM.

- Red evidence: `TZ=Asia/Singapore NODE_NO_WARNINGS=1 node tests/roster-intake-instruction-edit.mjs` against an isolated `68b4e7929bf4ffa6f24ec6b1417d312e564c3dd8` checkout fails at "fresh entry binds the explicit SMC correction". The same test passes with this implementation.
- The regression covers the receipt action opening the existing absence editor, changing periods, preserving the original submitted command/text, scheduled application to a published receiving teacher's My Relief Duties, immutable receipt replay, role denial, forbidden text replacement, unmatched-period rollback, deleted-entry guidance including deletion after opening the editor, stale editors, later edits, and separate authorization for each absence in a multi-absence draft.
- Targeted checks passed before the final commit: `tests/roster-intake-instruction-edit.mjs`, `tests/roster-intake-instruction-drafts-drain.mjs`, `tests/roster099n-intake-overlap-ui.cjs`, `tests/roster093a-instruction-review.cjs`, and `tests/roster-draft-absence-instructions-browser.cjs`. Commands use `TZ=Asia/Singapore NODE_NO_WARNINGS=1 node <file>`; the browser check also uses `ROSTER_TEST_CHROMIUM=/usr/bin/chromium` outside the browser-restricting sandbox. Initial browser attempts lacked the executable selection or were blocked by the sandbox; neither is counted as a pass.
- Final-head canonical build, full local Node/LORD suite and all five CI jobs must pass before opening the draft PR. Their exact head, commands and actual results are recorded in that PR body after execution.
- Not tested: live D1/Google, production reports, provider delivery or deployment. No live reads or writes were made.

## Review
Reviewer/model, reviewed SHA, findings, resolution. Advisory review is not human approval.

## Deployment
Not deployed unless supported by explicit environment/version/time evidence. State staging and production separately. Note: the edit-apply works only after the owner redeploys the Worker with this fix. Live verification after deploy: use the SMC edit on the stuck Sri Asilah 12 Nov item and confirm the receiving teacher sees the instructions in My Relief Duties.

## Handoff
- Handoff: the draft PR records final gate results and names Muse at its exact head. Muse reviews; the owner merges and redeploys the Worker. The separate orphan-close task stays unclaimed until this task is merged, because lane R is serial.
- Do not delete/re-submit reports or clear receipts to reverse anything. The original submitted text must stay visible in the draft/audit alongside the SMC absence edit.

- Claim: Model: Codex, 11 November 2026. Owner-authorized branch created from current main after #114 merges. Muse reviews the exact implementation head. No live operations or changes to release branches are authorized.
