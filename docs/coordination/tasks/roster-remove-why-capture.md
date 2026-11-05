# roster-remove-why-capture: remove the "Why" capture; restore the Allocation Audit TXT format

- Status: claimed; Model: Codex; lane R; owner authorised 6 Nov 2026; must land before release build n
- Reviewer/model: Claude
- Source: owner decision recorded in tasks/roster-daily-drive-outputs.md ("Owner decision (6 Nov ~01:15)"), review notes in review/pr82-claude-review.md

## Scope
1. Remove `captureDecisionWhy` and helpers (`whyForPlan`, `whyChecks`, `decisionEligibility` if only used there) from shared/roster-allocation.js and every call: backend/RosterAuditExport.gs (`rosterAllocationAuditAccepted_`), backend/RosterOperations.gs, roster-update/public/edge-roster.js (line ~117), roster-update/public/edge-roster-output-renderers.js, and generated copies via the canonical build. Nothing extra runs inside saves.
2. Restore the Allocation Audit TXT to its exact pre-#82 output (no Day summary, no rules glossary, no Why block). Keep #82's queue/coalescing/ledger for the TXT only where needed to write the unchanged text.
3. Keep: the daily relief workbook, Drive outputs queue, ledger, capacity-warning wording fix, and everything from #81.
4. Old events that already carry `allocationWhy` (none in production: #82 is not deployed) are simply ignored.
5. Tests: audit TXT byte-identical to the pre-#82 renderer (main at 644108f) for a fixture day on Google and D1; no `allocationWhy` written by any save; workbook and queue tests unchanged and green.

## Claim (6 Nov 2026, Asia/Singapore)

- Owner/model: Codex
- Reviewer/model: Claude; owner merges
- Last updated (Asia/Singapore): 6 Nov 2026, 00:50
- Branch: `codex/roster-remove-why-capture`
- Base SHA: `ebc27d0589e9ed376169101ea4bf318b9d1d2784`
- Current implementation head / PR: not yet created
- Files owned: the five canonical files in Scope, affected audit regression tests, this task, CHANGELOG.md, and canonical generated copies.
- Out of scope: ad hoc reoptimisation; allocator policy; workbook/queue/ledger behavior; #81; live records, settings and deployment.
- Coordination: owner explicitly requests a separate PR alongside the claimed ad hoc reoptimisation task; whichever lands second rebases. No changes to that branch.
- Acceptance: exact pre-#82 TXT bytes from `644108f` on Google and D1; save paths write no allocationWhy; unchanged workbook and queue checks; canonical build and full CI green.

## Verification
Pending implementation. No tests claimed.

## Deployment
No deployment or live action authorised or performed.

## Handoff
Implement the bounded removal, verify the legacy text and save paths, then publish a small PR naming Claude and the exact head.
