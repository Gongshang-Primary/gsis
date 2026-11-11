# v1-core-t1a: isolated Core identity and current Deploy authority

- Status: claimed
- Owner/model: Codex
- Coordinator: ChatGPT, v1 only
- Reviewer/model: Claude, independent review of the exact head; never edit this branch
- Last updated (Asia/Singapore): 2026-11-12T04:42:29.826506+08:00
- Branch: codex/v1-core-t1a
- Pre-claim main SHA: 9bd0dcc2960819f3610bebb336bc2cb982dfd1a6
- Base SHA: the accepted claim-only commit containing this record
- PR: pending implementation and verification

## Owner authority and V1C arrangement

Owner explicitly authorised T1A implementation, one bounded PR, and V1C establishment. Latest instruction: "sufficiently released. overwrite gate conditions, proceed". This overrides the earlier mandatory Muse allocation-confirmation gate. Owner-provided Muse conversation records T1A ahead of Venues, followed by holding all Codex work; the latest proceed instruction releases this T1A task only. Venues and release PR #117 review remain outside this task. No production claim is deleted or taken over.

V1C is the v1-only Core identity and capability contract lane. ChatGPT coordinates v1, Codex builds T1A, Claude independently reviews the exact head. Muse continues coordinating v0.9.9* under the existing production rules. This scoped arrangement overrides older general coordinator/reviewer defaults only for T1A. It grants no merge, deployment, provisioning, migration or live-data authority. The implementation PR will add the same scoped entry to LANES.md as the separately authorised coordination-record exception.

## Requirements and start checks

Read the four supplied Revision 49 documents: consolidated specification, staged Codex handoff plan (historical Rev48 title plus controlling Rev49 amendment), Tranche 1 UAT, and execution-readiness handoff dated 11 November 2026. Section C governs schemas and A01–A18. Historical plan-only wording is superseded by the explicit owner implementation authorisation, not by inference from the documents.

Read AGENTS.md, README.md, WORKFLOW.md, LANES.md, STATUS.md, OWNER_DIRECTIVES.md, HANDOVER_REVIEWER.md and DEPLOYMENTS.md. Refreshed origin/main and remote branches. Inspected main claims and all 14 open PRs: #38, #40, #42, #46, #47, #48, #58, #60, #72, #103, #108, #110, #113, #117, including both file-list pages for #40. None changes the T1A implementation paths. No v1/Core branch or claim found. All 14 exact PR heads returned five successful check runs; these are historical PR evidence, not T1A evidence. Pre-claim main returned zero check runs. Stale production status documents are not live verification.

## Exact implementation scope

```
v1/core/contracts.mjs
v1/core/google-identity.mjs
v1/core/session-policy.mjs
v1/core/authority.mjs
v1/core/audit.mjs
docs/v1/core/T1A_CONTRACT.md
tests/v1-core-identity.mjs
tests/v1-core-session.mjs
tests/v1-core-authority.mjs
tests/v1-core-races.mjs
tests/v1-core-isolation.mjs
docs/coordination/tasks/v1-core-t1a.md
```

Separate coordination exception: docs/coordination/LANES.md, additive V1C entry only. No other file changes. Isolated library, injected providers/clocks, synthetic identities. No production imports, auth integration, UI, Contacts writes, databases, configuration, generated outputs, build/CI changes, T1B–T1D, merge or deployment.

## Acceptance and verification

A01–A18 engineering scenarios; actual signed synthetic Google tokens; ten-day absolute expiry; policy matrix; school and preview isolation; unavailable/malformed/stale providers; final revalidation races and explicit remaining check-to-commit interval; minimal audit projection. Canonical build with no tracked drift; five discovered top-level tests; full existing Node and LORD suite with TZ=Asia/Singapore; exact diff allowlist and production-import checks. Record exact commands, SHA, failures and omissions after execution.

Tests: not run yet. Runtime UAT: **Not tested**. No cross-D1 atomicity claim. Live integration remains gated by T1B, T1D and demonstrated consumer commit ordering.

## Review and deployment

Claude review pending. No self-approval. Any later code change requires review of the updated head. Not merged, not deployed. No live operations.
