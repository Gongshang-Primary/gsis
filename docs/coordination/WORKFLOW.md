# Two-model coordination

Repository: helper-gsps/gsis. Owner and release decision: Song Wee. Models: Codex and Claude. Neither model is permanently the lead. The assigned implementer owns one task; the other reviews.

## Start each session
1. Read AGENTS.md, README.md, this file, STATUS.md and the current task record.
2. Fetch current main, open pull requests and the intended branch. Record the base commit. Do not start from an old ZIP or chat snapshot.
3. Before editing, publish one task record in docs/coordination/tasks/<task-id>.md using TASK_TEMPLATE.md. Give it an owner, branch, bounded file/domain scope, acceptance checks and update time in Singapore time.
4. For a new claim, commit only that task record to main using a non-force, expected-head update. This documentation-only claim is the exception to the PR rule. Re-read active claims after it lands. If the head moved, fetch and reassess; never force through a rejected claim. Start the implementation branch from the accepted claim commit.
5. If scopes overlap, stop the overlapping work. Use the same implementer, narrow the scopes, or obtain an explicit handoff. A stale timestamp is not permission to take over.

## Implement
- One task, one branch, one implementer. Use codex/<task-id> or claude/<task-id> and separate clones/worktrees.
- The reviewer does not edit the implementer's branch. Send findings for the implementer to fix. Transfer ownership explicitly before another model edits it.
- Edit canonical sources and regenerate copies with the repository builders. Shared domain files, generated bundles, package metadata and release assembly count as overlapping scope even when UI files differ.
- Keep changes bounded. Do not combine Calendar fixes and Roster migration in one PR. Preserve Google-first Roster authority.
- Update the task record on the branch with decisions, exact checks/results, omissions and next action. Update STATUS.md only for durable cross-project facts, not every progress tick.

## Review and integrate
1. Open a PR with the supplied checklist. Name the reviewer and exact head SHA. GitHub records, not private chat, are the handoff.
2. Review actual diff and relevant tests. Record findings against that SHA, with file/line, impact and evidence. State tests not run. New commits require review of the new changes.
3. Model review is advisory. When both agents use the same GitHub identity, it is not an independent GitHub approval. Do not fabricate approval or bypass repository controls.
4. Song Wee decides when to merge and release unless explicitly delegating that action. No auto-merge or force-push. Recheck current main and resolve conflicts in the task branch before merging.
5. Mark the task merged with PR/commit evidence; close or supersede its main-branch claim. Never mark deployed merely because merged.

## Handoff when stopping
Record task status, base/head SHA, changed files, tests with outcomes, unresolved risks, local-only work, blocker, owner and next exact action. Keep credentials, raw staff records and provider payloads out of these records. No hidden work should be assumed recoverable.

## Production boundary
Follow README staging and school-hour restrictions. No production deployments on school days from 06:00 to the last period. Staging acceptance, merge, package and production deploy are separate states. No real messages or authority cutover as test side effects. Retain receipt identities, uncertain outcomes and SMC/peer work.

## Enforcement limits
These files are a coordination protocol, not an automatic lock service or background model-to-model chat. Both agents must read GitHub at the start and before handoff. Existing branch protection and CI remain unchanged. If enforcing PR-only main later, use an owner-merged claim PR before implementation instead of the claim-only direct commit. Set required checks only after a real workflow successfully produces them; do not invent a green check. Do not grant bots deployment secrets merely for code review.
