# v1-engineering-policy: skills and Rust-inspired standards

- Status: claimed
- Owner/model: Codex
- Coordinator: ChatGPT, v1 only
- Reviewer/model: Claude, exact-head independent review
- Last updated (Asia/Singapore): 12 November 2026
- Branch: codex/v1-engineering-policy
- Pre-claim main: c4c1de8aed5c9f062cbdc7e6ed83deb721fbb3c3
- Base: accepted claim-only commit; exact head and PR recorded at handoff
- Authority: owner's documentation-only engineering-policy request, after T1A review and before T1B. T1A PR #118 remains unmerged; its approval and CI at 57686a304ddd75109e1ad76eaa11de5ad34004d0 do not authorise merge. This explicitly requested follow-on documentation PR is separate from that held implementation PR.
- Scope: docs/v1/AGENTS.md, docs/v1/skills/SKILL_POLICY.md, docs/v1/engineering/RUST_PRINCIPLES.md, docs/v1/engineering/QUALITY_GATES.md, minimal additive root AGENTS.md reference, and this workflow-required task record.
- Excluded: application/test code, CI, dependencies, infrastructure, production, release behaviour, T1B implementation, merge and deployment.

## Start evidence

Read root instructions, coordination workflow, lanes, status, owner directives, deployments, README and task template. Read Claude's v1 review and owner directives on `claude/beautiful-dirac-uiflqu`, including owner arbitration of competing Codex allocations. Refreshed main, relevant branches and open PR file inventories: no overlap with the five policy paths. Historical root-instructions task `coordination-gaps` was merged as PR #4, not assumed released from its stale task status. No existing v1 engineering-policy branch found.

## Acceptance

Root discovery explicitly covers all v1 work, including code/tests outside docs/v1. Four documents have distinct responsibilities and link to canonical coordination/specification records. Each of twelve principles has JavaScript/Workers/D1 guidance and observable checks. All six requested skill approaches have selective usage and honest availability rules. Review checks licences, security, recovery, scope, conflicts, documentation links and unchanged application/CI/release files.

## Verification and handoff

Claim only; no implementation or verification yet. Final PR records exact head/base, actual commands/outcomes, omissions and review status. Claude review pending. No skill execution is claimed by this policy task; the owner's approaches are documented as principles, not installed dependencies. Runtime UAT: Not tested. Not deployed to staging or production. Owner retains merge approval.
