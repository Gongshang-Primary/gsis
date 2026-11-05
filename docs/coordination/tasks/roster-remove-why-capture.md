# roster-remove-why-capture: remove the "Why" capture; restore the Allocation Audit TXT format

- Status: implemented; full verification in progress; Model: Codex; lane R; owner authorised 6 Nov 2026; must land before release build n
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
- Current implementation head / PR: implementation is ready for the full suite; exact tested head follows below.
- Files owned: the five canonical files in Scope, affected audit regression tests, this task, CHANGELOG.md, and canonical generated copies.
- Out of scope: ad hoc reoptimisation; allocator policy; workbook/queue/ledger behavior; #81; live records, settings and deployment.
- Coordination: owner explicitly requests a separate PR alongside the claimed ad hoc reoptimisation task; whichever lands second rebases. No changes to that branch.
- Acceptance: exact pre-#82 TXT bytes from `644108f` on Google and D1; save paths write no allocationWhy; unchanged workbook and queue checks; canonical build and full CI green.

## Decisions and changes

- Restore `shared/roster-allocation.js`, `backend/RosterOperations.gs` and `backend/RosterAuditExport.gs` byte-for-byte from `644108f`; their only intervening changes were #82 Why capture, its report helpers/sections and the extra audit snapshot copies.
- Keep the pre-existing Google audit intent marker. Delete the new #82 D1 mutation hook entirely; the background output runner already captures the original event trail.
- Regenerate the allocator, audit renderer, backend and Worker copies with the canonical builder. No catch-and-ignore wrapper, replacement reporting work or stored-data migration is added.
- Retained Why fields are ignored by the TXT renderer. Original audit facts, queue/coalescing/ledger, workbook renderer, capacity-warning wording and #81 are retained.
- The claim-only main update was blocked by automatic approval review because this task requests a separate PR. The claim was instead published on this task branch at `5da7c74e09bcd85e9366a10eed9eb530c5864711`; main was not changed.

## Verification

- Before removal, the new legacy TXT comparison failed (5207 bytes versus 3268); all 12 save/API regression cases failed on Why capture or the extra D1 hook.
- `TZ=Asia/Singapore npm run build`: passed, all 18 components regenerated and Apps Script syntax gate passed.
- Focused programs passed: `roster-daily-audit.cjs`, `roster-remove-why-save.cjs` (12 cases), `roster-daily-edge.mjs`, `roster-daily-queue.mjs`, `roster-daily-workbook.cjs`, `roster-daily-writer.cjs`, `roster-daily-capacity-wording.cjs`, `roster-drive-backup.mjs`, `roster082-backend-audit.cjs`.
- TXT comparison uses the verbatim pre-#82 renderer pinned from `644108f` under `tests/fixtures/`, on the same synthetic day for Google and generated D1, including retained old Why fields. FINAL does not change the TXT format.
- Save tests exercise Google allocation, optimise, manual assignment, compact publication, absence, intake and scheduled commits, plus the actual D1 mutation coordinator for allocation, optimise, assignment and absence. Writes succeed without the deleted reporting code or fields.
- Full local Node/LORD suite and remote exact-head CI: in progress. Six historical comparison branches remain excluded by the existing runner, not counted as passes.

## Deployment
No deployment or live action authorised or performed.

## Handoff
Finish full verification, publish the task branch and open a small PR for Claude at its exact head. Owner merges. Ad hoc reoptimisation remains a separate branch; whichever lands second rebases. No local-only implementation should remain at handoff.
