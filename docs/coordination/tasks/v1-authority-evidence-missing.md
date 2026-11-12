# v1-authority-evidence-missing — Package A

- Status: claimed; implementation authorised by owner 13 November 2026 SGT.
- Model/owner: Codex; coordinator ChatGPT v1; independent exact-head reviewer Claude.
- Branch: codex/v1-authority-evidence-missing
- Refreshed main/base: e996dfdb3a69bee76355ba60500468679d0963de
- Source: docs/v1/CODEX_WORK_QUEUE_2026-11-13.md at 110bf5838b4a9c95735d503f42587dd0d1f34a40 (PR132, unmerged; read only, not cherry-picked). Its historical approval wording is superseded by the owner's explicit Package A implementation authorisation; B–D remain design-only.
- Exact allowlist: v1/core/contracts.mjs; v1/contacts/core-provider.mjs; tests/v1-authority-evidence-missing.mjs; tests/v1-authority-evidence-missing-isolation.mjs; docs/v1/core/T1A_CONTRACT.md; docs/v1/contacts/T1B_CONTRACT.md; this task; docs/coordination/LANES.md.
- Scope: validated missing/nonaccepted authority evidence -> AUTHORITY_EVIDENCE_MISSING, deny/403/non-retryable. Preserve all other failure, interval, Admin, preview and revision semantics.
- Excluded: Core authority/audit implementation edits; B–D implementation; production imports, UI, acceptance writes, stores, infrastructure, live data, merge/deployment.
- Overlap: inspected all changed-file pages for open PRs 132,126,122,117,113,110,103,72,60,58,48,47,46,42,40,38; no allowlist intersection. Existing production claims retained; no takeover. Current v1 claims are merged/plan-only. Owner explicitly permits a separate B–D documentation PR alongside A.

## Trace and checks

createContactsReader validates query-bound observation, full snapshot schema, school/staff/profile, field states, dependencies, catalogue references and immutable identity/watermarks before producing kind current. The adapter then enforces its three-single-record projection. Core contracts.failure maps registered reason codes; audit.projectSecurityAudit uses the same whitelist, requiring no projector changes. Provider exceptions alone never prove absence.

Required: red/green focused end-to-end and audit tests, unchanged Core/Contacts tests, runner discovery and exact eight-path isolation, canonical build/no drift, full Node/LORD and exact-head CI. Tests and review pending. Official T1B-01/T1B-02 and runtime UAT Not tested; F5 OPEN. No skill package executed; repository boundary, explicit-error, simplicity and evidence principles applied manually. Rollback reverts the additive library contract and tests; no stored data or deployment changes.

## Implementation and local evidence

Claim commit `f7014a1`; branch built from it. Runtime change is confined to the reason map and adapter. The adapter checks all field schemas and accepted counts before absence; malformed/ambiguous sibling fields cannot be hidden by an earlier missing field. Only its own locally created missing denial escapes; provider-thrown lookalikes remain failures. Audit and authority implementations untouched.

Red/green: `TZ=Asia/Singapore node tests/v1-authority-evidence-missing.mjs` first failed M01 (actual PROVIDER_INVALID vs expected AUTHORITY_EVIDENCE_MISSING) on baseline runtime, then passed all M01–M10. Required scenarios are grouped into these ten behavioural cases, with loops over states/actions. Existing five Core and seven Contacts programs passed unchanged (26+30 cases). Isolation/discovery passed: unchanged runner selects 1084 Node programs, exactly partitioned into four shards; eight-path task scope and static dependency checks passed.

Commands: `TZ=Asia/Singapore AUTHORITY_MISSING_BASE_SHA=e996dfdb3a69bee76355ba60500468679d0963de node tests/v1-authority-evidence-missing-isolation.mjs`; `TZ=Asia/Singapore node <each tests/v1-core-*.mjs and tests/v1-contacts-*.mjs>`; `TZ=Asia/Singapore npm run build` regenerated 18 components without tracked generated drift. These initial passes used the precommit tree; exact committed-head confirmation and full Node/LORD/CI results are recorded in the PR and results index.

Environment failures retained: initial `npm ci` failed because default /home/agent/.npm cache could not be created; isolation/unchanged-regression attempt then lacked acorn and initial build failed. `npm ci --cache /tmp/gsis-a-npm-cache` installed the locked 86 packages; all focused/regression/build checks above were rerun successfully. No dependency/lockfile edits. Full suite and exact-head CI pending; browser installation is local test setup only.

Q01–Q05: scope/trace, explicit failure/privacy, unchanged revisions/recovery limits, resource/dependency inspection pass. Q06: focused/build/discovery pass; full-suite/CI pending. Q07: Claude review pending. Q08: no release; all runtime UAT Not tested. F5 OPEN. Scope/readiness does not imply durable storage or implementation of B–D.
