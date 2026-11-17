# Review: PR #196 — Record verified v1.02 and v1.03 deployments

- Reviewer: Muse (owner, 16 Nov: Muse replaces Claude for v1 exact-head review until Claude returns; source `claude/zealous-archimedes-4i2lv1` at `12b06eb`).
- Verdict: **APPROVED at the exact head**.
- Exact head: `decb5809e71985b2953a2e5cd6a46d7e96dc8bf5`.
- Base / extended claim: `6e041e6b51b3dac2b03d3f27c6ad4cb682aa8f07` (original claim `b2faf390ebdf75db721a2ef5bec0b98afc3484e7`).
- Branch-push CI run: [44006329593](https://github.com/helper-gsps/gsis/actions/runs/44006329593), green, all 5 jobs, at the exact head.
- PR: https://github.com/helper-gsps/gsis/pull/196 (Codex, branch `codex/v1-release-v102-record`; draft, not merged).
- Task record: `docs/coordination/tasks/v1-release-v102-record.md` (in the PR; reviewer line already names Muse).

## What it does

Documentation only. Records the completed v1.02 and v1.03 deployments at https://gsis.gsps.edu.sg. This evidence PR does not request or gate another deployment. Deployment already completed; no new release requested.

- v1.02: protected deployment 43971528994 succeeded 17 Nov 06:40:10 SGT at `d5c8899aeb867448ad7399f9925f46ac11371380` (the #195 merge). PR194 supplies the Deploy role Membership matrix and audited SMC/EO/School Leader publication through Contacts; PR195 advances the display label to v1.02.
- v1.03: reviewed PR198 and PR200 merged unchanged. The owner authorised a full rollout for PR198 only, explicitly approved all eight backup exports and then approved the protected environment in GitHub. Protected deployment 44005005802 succeeded 17 Nov 10:50:06 SGT at `d3bba194f0dc162d38f0899dc4e0b6e5e1351fa2` (the #200 merge). Future deployment scope remains selective by default.
- F5 OPEN; T1B-01/T1B-02, authenticated runtime UAT, N-1 save latency and hosted restore Not tested. Public checks do not close the UAT ledger.

## Checks run (local worktree at the exact head)

- Scope: the diff against the base is exactly the four claimed Markdown files — `docs/coordination/DEPLOYMENTS.md`, `docs/coordination/tasks/v1-release-v102-record.md`, `docs/coordination/tasks/v1-release-v102.md`, `docs/coordination/tasks/v1-release-v103.md` — 70 insertions / 7 deletions. All non-documentation paths match current main byte for byte. `git diff --check` clean.
- Merge-tree against current main: clean, no conflicts.
- Earlier deployment records, including v1.01 and v1.02, are preserved; the diff adds the two new entries and updates the two release-task statuses and completion sections. The status-line changes describe the same completed deployments and do not rewrite earlier evidence.
- Verified every GitHub-side fact in the record directly against the GitHub API:
  - v1.02 deployment run 43971528994: success, head `d5c8899`, created 2026-11-16T22:35:35Z (06:35:35 SGT dispatch) and updated 2026-11-16T22:40:10Z (06:40:10 SGT) — both times match the record exactly.
  - v1.02 final-main CI at `d5c8899`: Node/LORD 43967338294 success and product 43967343394 success, both at the exact head.
  - v1.03 final-main CI at `d3bba19`: Node/LORD 44001011285 success and product 44001015250 success, both at the exact head.
  - v1.03 protected deployment run 44005005802: success, head `d3bba19`, created 2026-11-17T02:42:59Z (10:42:59 SGT dispatch) and updated 02:50:07Z (10:50:07 SGT, one second after the recorded 10:50:06 success).
  - Merge commits: PR194 merged as `37dbdd4` with second parent `9b3e90c` (the Muse-approved head); PR195 merged as `d5c8899` with second parent `bb43c93` (the Muse-approved head). PR198 merged as `53f7e98` and PR200 as `d3bba19`, both with their Muse-approved heads as second parents (verified in their own reviews).
  - Product artifacts: downloaded both zips from GitHub and hashed them. v1.03 artifact 14292129934 (`gsis-v1-d3bba19…`, 13,580,671 bytes) SHA-256 `7f52af584e0b8df84d5db6ff266da90a2ad82b4a61eeb8dd629b20f449150b4b` — matches the record exactly. v1.02 artifact 14278850465 (`gsis-v1-d5c8899…`, 13,573,466 bytes) SHA-256 `04b1126a7d482fafc5dd35fcb368124362cf85cb84b15a3d6f1d4cf899714538` — matches the record exactly.
  - Suite counts are consistent with the suite's growth: 1,221 Node / 120 product at `d5c8899`, 1,223 Node / 122 product at `d3bba19` (the two new #198 tests account for the increase).
- Relative link targets resolve: the four Muse review records (`review/pr194-`, `pr195-`, `pr198-`, `pr200-muse-review.md`) exist on main, and both deployment-completion anchors exist with the exact headings — `tasks/v1-release-v103.md#deployment-completion-17-november-2026` and `tasks/v1-release-v102.md#deployment-completion--17-november-2026`.
- Not independently re-verified, and stated as such in the record: the private backup evidence — eight D1 export byte totals (11,440,420 for v1.02; 11,510,145 for v1.03), export-manifest SHA-256 values, isolated SQLite verification results, live Worker metadata, R2 privacy and public smoke-check outputs. Those live in the private release workspace, not in Git, and the record is explicit that no SQL, signed URL, credential or staff record is published and that the separate snapshots are not a cross-D1 atomic backup or a tested hosted restore. The record does not overclaim them.

## Findings

None. No findings.

## Gates (Q01–Q08)

- Q01 Authority and scope: pass. Evidence of deployments the owner already authorised and approved; exact four-file documentation scope.
- Q02 Design and ownership: pass. Deployment index and release-task completion records; no product or workflow change.
- Q03 Security and privacy: pass. No secret, credential, SQL or staff record published; private evidence stays private.
- Q04 Concurrency and recovery: pass. Recovery limits are stated plainly (separate snapshots, no tested hosted restore); rollback guidance preserves authority history/frontiers/receipts.
- Q05 Resources and maintainability: pass. Docs only; no dependency or workflow change.
- Q06 Verification: pass. All GitHub-side facts re-verified directly, including both artifact hashes by download; branch-push CI green at the exact head.
- Q07 Handoff and review: pass. This record; PR names the reviewer; draft, not merged; the record neither requests nor gates another deployment.
- Q08 Release boundary: the deployments recorded here are already complete; nothing further is authorised by this PR. F5 OPEN; T1B-01/T1B-02, authenticated runtime UAT, N-1 save latency and hosted restore Not tested.

## Release notes

Evidence only. v1.02 deployed 17 Nov 06:40 SGT and v1.03 deployed 17 Nov 10:50 SGT, both at their reviewed sources, with the owner's approvals and final-main CI recorded. No new release is requested.
