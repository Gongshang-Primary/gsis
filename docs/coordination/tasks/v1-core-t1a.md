# v1-core-t1a: isolated Core identity and current Deploy authority

- Status: implementation prepared; exact-head full verification and Claude review pending
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

## Implementation evidence and exact-head handoff convention

Accepted claim-only commit: `c4c1de8aed5c9f062cbdc7e6ed83deb721fbb3c3`. Implementation branch starts there. Main claims were reread after the non-force claim push; no intervening claim appeared. Owner allocation override and scoped V1C arrangement above remain controlling. The additive LANES entry is the only coordination exception outside the twelve implementation files.

Implemented five independent modules and five top-level test programs, plus the contract. The contract documents provider schemas, failure mappings, current capability policy, preview field scope, opaque evidence/provenance, per-instance rejection of older responses, and unresolved cross-D1 intervals. A13 deliberately includes a counterexample where a synthetic unsafe consumer could write after post-check revocation; this is not a production race guarantee.

Pre-commit engineering checks: A01–A18 represented in 25 grouped cases across the five programs. Early identity/session/authority smoke checks ran before the first canonical build; they are not the final verification gate. `TZ=Asia/Singapore npm run build` then succeeded, rebuilding 18 components with no tracked generated-output drift. The initial isolation test failed because its AST walker visited metadata objects without a node type; the walker now limits inspection to actual AST nodes, and the rerun passed. No production change was needed. Existing test runner discovers 1056 programs including all five new programs. These observations describe the pre-commit tree, not an exact-head full-suite pass.

Final verification commands at the implementation commit (results and the exact tested SHA will be recorded in the PR body, avoiding a self-referential evidence commit):

```
TZ=Asia/Singapore npm run build
TZ=Asia/Singapore node tests/v1-core-identity.mjs
TZ=Asia/Singapore node tests/v1-core-session.mjs
TZ=Asia/Singapore node tests/v1-core-authority.mjs
TZ=Asia/Singapore node tests/v1-core-races.mjs
TZ=Asia/Singapore node tests/v1-core-isolation.mjs
TZ=Asia/Singapore node tests/run.cjs --list
TZ=Asia/Singapore NODE_NO_WARNINGS=1 ROSTER_TEST_CHROMIUM=/usr/bin/chromium GSIS_BROWSER_EXECUTABLE=/usr/bin/chromium npm test
git diff --exit-code
git diff --name-only c4c1de8aed5c9f062cbdc7e6ed83deb721fbb3c3 HEAD
```

The existing runner excludes its historical programs/comparison branches unchanged; no exclusions are added. Full suite and CI are pending at this commit's creation. See the bounded T1A PR for actual final head/base, command outcomes, run IDs and any failures/omissions. Do not infer a pass from this task record. Claude review remains pending until independently published against the exact head. Every subsequent code commit requires updated review.

Runtime UAT remains **Not tested**. No live Google keys/identities, Contacts, Service Binding, D1, provider delivery, browser auth route, deployment or production data tested. Rollback is removal of the unused library/tests/docs; no data or configuration rollback. Integration remains gated by T1B/T1D and demonstrated consumer ordering. No merge or deployment authorised.

### Audit attribution correction before review

Initial implementation commit `3c22cf376b6e483b94d632fd21487f72285af267` passed all focused cases; full local verification was deliberately stopped before completion after internal review found missing required attribution in audit projection. The correction requires actor/policy/Core revision for privileged decisions, both actor and preview subject for impersonation denials, and operation ID for mutation events; negative tests prove omissions fail. This is not an independent Claude review. CI run 43098518383 for the older head is superseded, not final acceptance evidence. Full local and remote verification will restart at the corrected head; final results remain in the PR body.

A supplementary all-ref refresh used an explicit heads refspec because this environment's default fetch config tracks main only. All 178 remote refs were inspected for T1A/Core paths; only this task's claim/main and implementation branch contain them. No other Core implementation overlap was found. This completes the earlier partial branch listing; it does not claim that the initial default fetch listed every branch.

### Canonical evidence correction

A direct provider-compatibility probe at `97a685cda018cce13ed1555860fa91abde4c723e` reproduced a false AUTHORITY_CHANGED denial when the final Core read returned identical fields in a different JSON key order. Evidence digests now sort object keys recursively while preserving array order; request bindings enumerate resource fields explicitly. The A14/revalidation test now accepts reordered equivalent records/requests and still rejects changed content at an unchanged sequence.

This correction was prepared in an isolated worktree so the ongoing full local suite could finish against unchanged commit 97a685c. Final-head canonical build and all five focused tests are required again. Final-head full Node/LORD evidence comes from the existing four-shard GitHub workflow; the PR distinguishes the exact SHA of each local and remote run. No prior-head result is presented as a final-head CI pass.
