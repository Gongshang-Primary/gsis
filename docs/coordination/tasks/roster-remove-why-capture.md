# roster-remove-why-capture: remove the "Why" capture; restore the Allocation Audit TXT format

- Status: merged (#85 at a79f4a3 as 05a2558, owner "merge 85 86", 6 Nov); for release build n
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
- Last updated (Asia/Singapore): 6 Nov 2026, 02:08
- Branch: `codex/roster-remove-why-capture`
- Base SHA: `ebc27d0589e9ed376169101ea4bf318b9d1d2784`
- Current implementation head / PR: locally tested implementation `8f4ab860269166401541fc51dce9192871f2b0e9`; documentation-only verification record follows it. No PR opened.
- Files owned: the five canonical files in Scope, daily-output backfill seeding, affected audit regression tests, this task, CHANGELOG.md, and canonical generated copies.
- Out of scope: ad hoc reoptimisation; allocator policy; workbook behavior; #81; live records, settings and deployment.
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
- Full local verification at `8f4ab860269166401541fc51dce9192871f2b0e9`: canonical build passed in four isolated worktrees, then all 1,013 current Node programs passed (254 + 253 + 253 + 253), plus all 40 LORD programs. Every shard's LORD run passed. `TZ=Asia/Singapore`; Chromium supplied for browser checks. Six optional historical comparisons remain excluded by the unchanged runner, not counted as passes. Remote exact-head CI has not run because the updated branch has not been uploaded.

## Deployment
No deployment or live action authorised or performed.

## Handoff
Publish the task branch and open a separate draft PR for Claude at its exact head after the upload restriction is resolved. Owner merges. Ad hoc reoptimisation remains a separate branch; whichever lands second rebases. Publication is currently blocked by automatic approval review; the completed work remains local and is not available on GitHub yet.
## Clarification (owner 6 Nov ~01:50)
Owner asked: "the removal of 'why' in 82 retains the ability to still save text audit logs to google drive, correct?" Yes, and this is a hard requirement: the Allocation Audit TXT must keep being written to `01 Live Data/Roster/Allocation Audit/<YYYY>/<MM>/<YYYY-MM-DD>.txt` on both Google and D1 (fresh-start mode included), with the same content as before #82. Add a test that a committed allocation on D1 results in the day's TXT being queued and written to Drive (fake writer) with the pre-#82 text.

## Finding (Claude, 6 Nov 01:05, D1 read-only)
On D1 (v0.9.9m) the audit export works but writes R2 archives only (`gsis_roster_audit_exports`: 2026-11-05/06/10/11/13 exported to `gsis/roster/audit/<date>/<digest>.json.gz`, job health OK at 01:02). The Drive TXT was written by the Google backend, frozen since 23:03 on 5 Nov, so Drive files stop at the freeze. #82's `log` output (Drive "Allocation Audit" folder, backend/RosterDriveOutputs.gs) is what writes the TXT from D1.
Added requirement: on first run after deploy, **backfill** a Drive TXT for every date that has D1 audit events but no Drive log written since the fresh start (5 Nov onward), in the pre-#82 format; ledger row per file. Test it.

## Resume (6 November 2026, Model: Codex)

Resumed published head `216c92e`; integrated current main `90b2523` without rewriting the branch. The original removal omitted the later backfill requirement. Complete it through the existing background queue and verified writer, with no extra capture in saves. Recover the separate ad hoc branch after this task is reviewable.

## Backfill implementation (resume, Model: Codex)

The background daily-output seed now discovers dated D1 audit rows and retained R2 audit-export pointers from the stored fresh-start effective date. It queues missing Drive logs through the existing writer and ledger; verified Drive files are not requeued. No live backfill was executed. A new real-SQLite regression first failed with both audit-only dates absent, then passed for live and archived evidence, exact legacy bytes, folder path, per-file ledger, repeat safety, and a committed D1 allocation. Existing queue, workbook and backup behavior is unchanged. Full-suite verification follows.

## Advisory review corrections

A separate read-only Codex review found that non-school dates and removed historical timetables blocked TXT backfill, and disabled optional logging could repeatedly reopen FINAL workbooks. Each case was reproduced by a failing integration regression and fixed. TXT rendering now uses retained audit evidence independently of workbook inputs; unavailable workbook inputs retain a failed/retryable workbook intent after the TXT succeeds. Non-school audit dates need only the TXT. The seed respects the existing verbose/essential policy. These corrections do not add work to Roster saves. No Claude approval or live execution is claimed.

## Publication blocker and recovery

Automatic approval review rejected the GitHub blob upload as unauthorised sharing of internal repository documentation. Read-only connector checks confirmed the destination is the private `helper-gsps/gsis` repository, the connected identity is its owner with admin access, and the existing task requests this PR. A second upload request was still rejected; no upload, ref update or PR succeeded. Do not bypass that rejection through another upload route. Obtain explicit user approval for publishing these task changes to that repository, then refresh main and branch heads, publish with an expected-head/non-force update, open the draft PR and run remote CI. Claude reviews the final published SHA.

Local recovery: `/workspace/scratch/13f97e1820a9/gsis`, branch `codex/roster-remove-why-capture`; full verification logs are the sibling `why-final-ci-1.log` through `why-final-ci-4.log`. Published head before this resume was `216c92ed193d9fec67077cfa7a3892dde5bc2c2e`; integrated main was `90b252304202a482a6821bb55c6f37736faa2479`. This is an explicit record of local-only work, not a completed GitHub handoff.

## Final verification after resume (6 Nov 2026, Model: Codex)

No product code changed after the fully verified implementation `8f4ab860269166401541fc51dce9192871f2b0e9`. A fresh canonical build passed. Fresh audit, save-path, D1 daily-output, queue, workbook, writer, capacity-wording and backup checks passed. `roster-audit-backfill-edge.mjs` also passed for live and archived audit-only dates, exact legacy TXT bytes, per-file ledger, repeat safety, committed D1 allocation, non-school dates, missing timetables and suppressed optional logs.

The final ad hoc priority implementation was combined with this branch in an isolated review worktree. After resolving the overlapping allocator hunk and rebuilding generated files, all nine integration programs passed: priority, Google/D1 parity, relief-pool policy, manual ranking, no-Why saves, legacy TXT, backfill, output queue and workbook. This was a local compatibility check, not a third product branch or Claude approval. The second PR to land must resolve that allocator overlap and regenerate its bundles.

GitHub was refreshed at main `e7d4f028ec1f6db499b44f14c0fea798fec55eca`; its only addition since integrated main is a separate Deploy task document. The remote Why branch remains at `216c92ed193d9fec67077cfa7a3892dde5bc2c2e`. No new upload was attempted because the earlier automatic approval rejection requires explicit publication approval. Next action: obtain that approval, publish the prepared branch without force, open its draft PR and hand its exact head to Claude. No deployment, live backfill or school-data write occurred.

## Publication approved (6 Nov 2026, 02:36 SGT)

The owner explicitly replied "approve" to uploading both prepared branches and opening draft PRs in `helper-gsps/gsis`. This resolves the earlier publication approval blocker. The destination was rechecked as the private owner repository with push access. Proceed with the approved uploads, remote exact-head verification and draft PRs for Claude. No merge or deployment is authorised by this approval. Product code is unchanged from the local verification above.

## Published recovery (6 Nov 2026, Model: Codex)

The approved upload is complete. Implementation head: `2467e028ee8181e1bd93106af2e31e2fe7be0b77`; published tree `9cfb91e6929d939460d83c7eb0ba23f163566e30` exactly matches the previously tested local tree. The remote branch now contains all prepared product changes. This documentation-only handoff follows that implementation commit. GitHub full CI is running; open the draft PR after green CI and give Claude its final exact head. Earlier publication-blocker entries above are historical and resolved. No merge, deployment, live backfill or notification occurred.
