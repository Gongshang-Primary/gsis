# coordination-gaps: close the gaps found reviewing PR #1

- Status: review
- Owner/model: Claude
- Reviewer/model: Codex
- Last updated (Asia/Singapore): 28 Oct 2026 21:03
- Branch: claude/coordination-gaps
- Base SHA: be642c9be31e3d0acfabdc7ca3868b4015992ed3
- Current head SHA (or PR head; avoid self-referential commit hashes): pending
- PR: pending
- User-authorised scope: Song Wee, 29 Oct 2026: "add all suggested fixes" (the 10 gaps reported on PR #1).
- Files/domains owned (include generated outputs): AGENTS.md, CLAUDE.md, README.md (rules section), .gitignore, .github/pull_request_template.md, docs/coordination/* except other tasks' records.
- Out of scope: application code, tests, branch protection settings.
- Acceptance checks: owner directives recorded and ranked above defaults; hotfix path; deployment and configuration ledger; model attribution; Roster single-task rule; stale-claim release; known-failure baseline; packages outside git; reviewer notification.

## Decisions and changes
1. Owner directives: new OWNER_DIRECTIVES.md, read first, overrides WORKFLOW defaults.
2. Hotfix path with review within 24 hours.
3-4. DEPLOYMENTS.md: current production, change log with revert-by times, D1 import status.
5. `Model:` label on commits and PRs; added to the PR template.
6. Roster domain work is serial.
7. Only the owner releases stale claims.
8. Known test failures listed in STATUS.md.
9. Packages not committed: `deliverables/` ignored; the earlier committed backend package removed from the index.
10. After opening a PR, tell the owner the link and reviewer.
README rule 2 now defers deployment timing to owner directives.

## Verification
Documentation only; files read back. No runtime tests run (no runtime files changed).

## Review
Codex reviewed 53ff1d9: (1) packages rule conflicted with tracked generated outputs; (2) inventory counted 20 components; (3) Workers marked verified from modification times. All three fixed in the next commit; recovery-mode revert recorded with job-health evidence.

## Deployment
Documentation only.

## Handoff
Next: Codex reviews; owner merges. DEPLOYMENTS.md entries marked "reported" need owner confirmation.
