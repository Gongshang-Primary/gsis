# roster-google-deploy-reference: R2 published Deploy adapter

- Status: verifying
- Owner/model: Codex
- Reviewer/model: Claude, exact PR head
- Branch: codex/roster-google-deploy-reference
- Base SHA: a0f7e6bbd9855ec909aa25e3154b3144cc41a9d3, main after #53 merged
- Authorised scope: attempt 3 R2, lane R cutover exception. Google remains Deploy authority. Read the immutable published document through the signed Roster service and run the existing Deploy rosterReference calculator.
- Files/domains owned: public/edge-deploy.js, backend/DeployEdge.gs, backend/RosterEdgeMigration.gs, targeted tests and canonical generated outputs.
- Out of scope: other module migration, held #38/#40-#48, live settings and messages.
- Acceptance: D1 and Google quota parity; cache by publication identity; a changed publication refreshes; invalid/missing publication fails clearly for quota consumers; full Node and LORD verification.

## Decisions
Cache the verified publication in D1. Recheck publication metadata after 30 seconds using its commit and revision. Warm reads reuse the same document and calculator. Signed Google failures do not return an empty quota list. Personal calculations share the same source selection.

## Verification
The new source-path test first reproduced the inactive Deploy authority failure. Quota parity, real D1 publication parity, finite synthetic quotas, warm-cache request count, metadata-only recheck, a changed publication, Google outage and personal calculations pass. Backend export tests reject pending/changed publications. Existing deploy094-edge regression passes. Full CI pending. No deployment or authority change.

## Handoff
Claude reviews the exact head. Owner merges.

## Review correction, 2 November 2026
Model: Codex. The verified Google publication now remains usable if the optional D1 cache insert or refresh fails. The catch logs only `ROSTER_DEPLOY_CACHE_WRITE_FAILED`, never upstream text or the publication. Source validation still fails closed. A real SQLite trigger first reproduced the rejected-write failure; the regression now covers warm metadata refresh, a cold publication above 2 MiB and personal calculations, with unchanged canonical quota parity and safe diagnostics. All 18 components rebuilt; focused and exact-head CI results are recorded in the PR.

Current live published Deploy document size: **not measured**. The connected browser is unavailable in this conversation, and the available cloud browser reaches Deploy's sign-in screen without a signed-in school session. No live document was read or exported. The >2 MiB synthetic regression is not a measurement of the current publication. To close this evidence item, an authorised signed-in operator must measure UTF-8 bytes of `JSON.stringify(document)` and the cached `JSON.stringify({entry,document})`, recording the publication commit/revision and measurement time without uploading staff content. This does not block returning a freshly verified reference when the cache rejects its size.

First CI found an old unavailable-quota assertion expecting the inactive-D1 error. The fixture has no signed Google source configured, so R2 now correctly reports DEPLOY_EDGE_CONFIG. Updated only that expected source error; the existing unchanged-state, no-receipt and no-approval assertions remain. Rebase includes the R1 actual-Pages reset route fix.

## Sequential integration handoff, 2 November 2026
Model: Codex. Owner requested #54, then #55, #56, #58 and #59 after each predecessor merges, by 17:00 SGT. #54 rebased on main a0f7e6bbd9855ec909aa25e3154b3144cc41a9d3 after #53 merged. Both changelog entries remain. All generated backends and Worker bundles regenerated with npm run build, without hand edits. Focused Google/D1 quota/cache, signed publication export and D1 peer-mail/fence checks run on the combined source. Full exact-head Node/LORD CI is the merge gate; the PR body records its final result and exact head. Downstream branches remain unchanged until their predecessor merges. No deployment, authority, school-record change or provider send.
