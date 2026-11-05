# roster-remove-why-capture: remove the "Why" capture; restore the Allocation Audit TXT format

- Status: authorised (owner 6 Nov ~01:25: "lets get codex to work removal"); Codex, lane R; must land before release build n
- Reviewer/model: Claude
- Source: owner decision recorded in tasks/roster-daily-drive-outputs.md ("Owner decision (6 Nov ~01:15)"), review notes in review/pr82-claude-review.md

## Scope
1. Remove `captureDecisionWhy` and helpers (`whyForPlan`, `whyChecks`, `decisionEligibility` if only used there) from shared/roster-allocation.js and every call: backend/RosterAuditExport.gs (`rosterAllocationAuditAccepted_`), backend/RosterOperations.gs, roster-update/public/edge-roster.js (line ~117), roster-update/public/edge-roster-output-renderers.js, and generated copies via the canonical build. Nothing extra runs inside saves.
2. Restore the Allocation Audit TXT to its exact pre-#82 output (no Day summary, no rules glossary, no Why block). Keep #82's queue/coalescing/ledger for the TXT only where needed to write the unchanged text.
3. Keep: the daily relief workbook, Drive outputs queue, ledger, capacity-warning wording fix, and everything from #81.
4. Old events that already carry `allocationWhy` (none in production: #82 is not deployed) are simply ignored.
5. Tests: audit TXT byte-identical to the pre-#82 renderer (main at 644108f) for a fixture day on Google and D1; no `allocationWhy` written by any save; workbook and queue tests unchanged and green.

## Clarification (owner 6 Nov ~01:50)
Owner asked: "the removal of 'why' in 82 retains the ability to still save text audit logs to google drive, correct?" Yes, and this is a hard requirement: the Allocation Audit TXT must keep being written to `01 Live Data/Roster/Allocation Audit/<YYYY>/<MM>/<YYYY-MM-DD>.txt` on both Google and D1 (fresh-start mode included), with the same content as before #82. Add a test that a committed allocation on D1 results in the day's TXT being queued and written to Drive (fake writer) with the pre-#82 text.
