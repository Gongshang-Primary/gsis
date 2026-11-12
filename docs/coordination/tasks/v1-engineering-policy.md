# v1-engineering-policy: skills and Rust-inspired standards

- Status: merged (#119 at 4e105dceb761d4af9fc48c8bfbf03625547769e7 as c782c0c27ad0734acd6cf6d4fffbbdb23772cde1)
- Owner/model: Codex
- Coordinator: ChatGPT, v1 only
- Reviewer/model: Claude, exact-head independent review
- Last updated (Asia/Singapore): 12 November 2026
- Branch: codex/v1-engineering-policy
- Pre-claim main: c4c1de8aed5c9f062cbdc7e6ed83deb721fbb3c3
- Base: d1839d4e5eb7cb2760733b0b5bf6860b005dbde1; exact head and PR recorded at handoff
- Authority: owner's documentation-only engineering-policy request, after T1A review and before T1B. T1A PR #118 remains unmerged; its approval and CI at 57686a304ddd75109e1ad76eaa11de5ad34004d0 do not authorise merge. This explicitly requested follow-on documentation PR is separate from that held implementation PR.
- Scope: docs/v1/AGENTS.md, docs/v1/skills/SKILL_POLICY.md, docs/v1/engineering/RUST_PRINCIPLES.md, docs/v1/engineering/QUALITY_GATES.md, minimal additive root AGENTS.md reference, and this workflow-required task record.
- Excluded: application/test code, CI, dependencies, infrastructure, production, release behaviour, T1B implementation, merge and deployment.

## Start evidence

Read root instructions, coordination workflow, lanes, status, owner directives, deployments, README and task template. Read Claude's v1 review and owner directives on `claude/beautiful-dirac-uiflqu`, including owner arbitration of competing Codex allocations. Refreshed main, relevant branches and open PR file inventories: no overlap with the five policy paths. Historical root-instructions task `coordination-gaps` was merged as PR #4, not assumed released from its stale task status. No existing v1 engineering-policy branch found.

## Acceptance

Root discovery explicitly covers all v1 work, including code/tests outside docs/v1. Four documents have distinct responsibilities and link to canonical coordination/specification records. Each of twelve principles has JavaScript/Workers/D1 guidance and observable checks. All six requested skill approaches have selective usage and honest availability rules. Review checks licences, security, recovery, scope, conflicts, documentation links and unchanged application/CI/release files.

## Verification and handoff

Claim only; no implementation or verification yet. Final PR records exact head/base, actual commands/outcomes, omissions and review status. Claude review pending. No skill execution is claimed by this policy task; the owner's approaches are documented as principles, not installed dependencies. Runtime UAT: Not tested. Not deployed to staging or production. Owner retains merge approval.

## Prepared policy and verification

The four requested documents separate discovery/priority, selective skill use, twelve testable engineering principles, and acceptance evidence. Root AGENTS.md has only the additive discovery reference. Original production instructions are byte-preserved as a prefix. No third-party skill implementation/text was copied or executed; principles are project-specific applications of the owner's requirements. Enforcement is explicitly task/review based; no automated enforcement is claimed.

`python3 /workspace/work/check-v1-policy.py` passed before commit: all Markdown relative links resolve, root prefix is unchanged, all twelve principle rows and six approaches are present, and only the six authorised/workflow documentation paths changed. `git diff --check` passed. Manual content review checked all twelve principles against the owner request, the stated precedence order, source attribution, explicit owner conflict arbitration, branch-review discovery and unchanged production/release authority. No application tests were added for prose. Build and exact-head CI results will be recorded in the PR; pending checks are not represented as passed. Runtime UAT remains Not tested. Claude's independent review is pending. Rollback removes these instructions/reference; no runtime or data rollback is needed.


## Owner-authorised sequential merge — 12 November 2026

Model: Codex. Owner explicitly instructed: merge #120, then #119, then #118. #120 was already merged as 0c4d1a3a43869c0b4bb87068d6c8b3f70dff1958 at head 5fc068471f129709d0b3f4b6d7804453250da91a. Verified Claude's #119 approval in docs/coordination/review/pr119-claude-review.md at main 2790ec25de6d14ef1ea3b354774ef72b06d1a5b7; L1–L4 are owner-accepted nonblocking follow-ups. Exact-head CI run 43129824397: full-suite and all four shards successful. No GitHub review submissions or unresolved review threads. GitHub reported clean mergeability; intervening main changes are disjoint coordination documents. Marked ready and merged with expected head SHA, merge method merge. Main confirmed at the merge SHA above. Earlier pending-review statements are historical and superseded by this record. No new local build/test run; relied on published exact-head review and refreshed CI. No deployment, infrastructure changes, live data access or T1B work.
