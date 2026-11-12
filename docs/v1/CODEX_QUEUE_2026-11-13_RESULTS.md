# Codex v1 queue results — 13 November 2026

Model: Codex. Coordinator: ChatGPT v1. Independent reviewer: Claude (review pending). **No merge or deployment authorised or performed.** The owner authorised A implementation within eight paths and B–D design/publication in a separate documentation PR. This explicitly supersedes only the historical approval wording of the pinned [queue](https://github.com/helper-gsps/gsis/blob/110bf5838b4a9c95735d503f42587dd0d1f34a40/docs/v1/CODEX_WORK_QUEUE_2026-11-13.md). PR132 stays unmerged and was not cherry-picked.

## Git handoff

| Package | State and repository path | Branch and exact source commit |
| --- | --- | --- |
| A | Implemented isolated error-contract change; [PR133](https://github.com/helper-gsps/gsis/pull/133). Contract: `docs/v1/core/T1A_CONTRACT.md`, `docs/v1/contacts/T1B_CONTRACT.md`; task: `docs/coordination/tasks/v1-authority-evidence-missing.md` | `codex/v1-authority-evidence-missing`, [0213160a7d45810849d5ed859818d09c55bdb4e2](https://github.com/helper-gsps/gsis/commit/0213160a7d45810849d5ed859818d09c55bdb4e2) |
| B | Design only: [authority acceptance](contacts/AUTHORITY_ACCEPTANCE_DESIGN.md) | `codex/v1-queue-designs`, [d6a9747bce6e0d2d475193f2c1b8de82ae24593a](https://github.com/helper-gsps/gsis/commit/d6a9747bce6e0d2d475193f2c1b8de82ae24593a) |
| C | Design only: [active-staff readiness](contacts/AUTHORITY_READINESS_SCAN_DESIGN.md) | Same design branch/commit above |
| D | Design only, F5 OPEN: [evidence recovery](core/F5_EVIDENCE_RECOVERY_DESIGN.md) | Same design branch/commit above |
| Index | This file plus `docs/coordination/tasks/v1-queue-designs.md` | `codex/v1-queue-designs`; exact final documentation head is in its PR, avoiding a self-referential commit hash |

Refreshed main before work: `e996dfdb3a69bee76355ba60500468679d0963de`. A claim `f7014a1`; B–D claim `a03a3323570922fa642df84f2b04d28e0de39eb4`. A starts from its own claim; documentation starts from the later claim without A code. Actual changed files of all 16 then-open PRs were checked with paginated GitHub file lists; none overlapped A's eight paths or the new design paths. Existing production claims were preserved. Current main at the last refresh was `a03a3323570922fa642df84f2b04d28e0de39eb4`.

Read current root/v1 instructions and engineering policies; merged T1A/T1B/EO contracts and applicable plans/addenda; Claude's PR125 and PR128 review records including the review branch `claude/beautiful-dirac-uiflqu` at `63ab0630bed7d9d991716ea04a164a30087a09c2`. Source queue read at its exact commit. Prior recovered Revision 49 source digests remain in the revised T1B plan; no current live staff/store evidence was accessed. No skill package was executed; repository ownership, explicit failure, recovery, simplicity and verification principles were applied manually.

## A behaviour and verification

The new code is confined to Core's reason mapping and Contacts' adapter. A validated current reader response with zero accepted records for any required field yields AUTHORITY_EVIDENCE_MISSING / deny / 403 / retryable false. All authority fields and accepted counts are checked first; malformed or ambiguous sibling evidence cannot be hidden by missing evidence. Only the locally constructed missing denial is propagated; a provider-thrown lookalike is not affirmative evidence. Core authority/audit implementations are unchanged. Content revision/sequence does not advance per read.

| Check | Actual evidence |
| --- | --- |
| Red test | M01 failed against baseline runtime: PROVIDER_INVALID instead of AUTHORITY_EVIDENCE_MISSING |
| Focused | At exact A head, `TZ=Asia/Singapore node tests/v1-authority-evidence-missing.mjs`: 10/10 grouped cases pass (M01–M10, state/action/interval loops) |
| Scope/dependency/discovery | At exact A head, `TZ=Asia/Singapore AUTHORITY_MISSING_BASE_SHA=e996dfdb3a69bee76355ba60500468679d0963de node tests/v1-authority-evidence-missing-isolation.mjs`: pass; 1084 runner programs, two new tests, exact four-shard partition; eight-path boundary and unchanged old tests/runner verified |
| Unchanged regressions | At exact A head, all five `tests/v1-core-*.mjs` and seven `tests/v1-contacts-*.mjs` pass, 26+30 cases |
| Build | At exact A head, `TZ=Asia/Singapore npm run build`: 18 components, followed by `git diff --exit-code`: pass, no tracked drift |
| Full suite | Local `TZ=Asia/Singapore npm test` (Node then LORD) running at A head; exact-head [CI run 43313064264](https://github.com/helper-gsps/gsis/actions/runs/43313064264) also running at index preparation. Final outcomes are appended in the PR; pending is not pass. |

Environment corrections, not suppressed failures: initial `npm ci` failed because `/home/agent/.npm` could not be created; consequent isolation/regression attempt lacked acorn and the first build failed. `npm ci --cache /tmp/gsis-a-npm-cache` succeeded (locked 86 packages), then affected checks passed. Local browser setup used `PLAYWRIGHT_BROWSERS_PATH=/tmp/gsis-pw node node_modules/playwright/cli.js install chromium`; the full-suite invocation sets ROSTER_TEST_CHROMIUM and GSIS_BROWSER_EXECUTABLE to that installed browser and AUTHORITY_MISSING_BASE_SHA to the original baseline. No lockfile/dependency changes. CI uses the existing unchanged Node24/browser/build/four-shard/Node+LORD workflow.

No local runtime UAT, live provider, migration, acceptance write, persistence or backup test was performed. Future consumer integration must recognise the additive reason enum and approved message. Rollback reverts the isolated library contract/tests/docs; no stored data or production config needs rollback.

## Design results and remaining gates

B recommends one Contacts-owned conditional transaction for accepted facts, revisions, approval fences, audit and operation result. It preserves no-self-acceptance, non-subject Admin approval for elevated true facts, owner-review verification and MKE consistency. Concrete crash/concurrency tests are specified; SQL/API atomicity is unproven. Core permission revocation in a separate store still leaves a check-to-commit interval.

C recommends an immutable full-directory manifest with explicit status, bounded pages and per-staff readers, a common evaluation time, completion/cutover epoch rechecks and interval-bounded report validity. Inactive blanks do not block; unknown status and reactivation invalidate certification. More-than-128-person tests and failed-last-page negatives are specified. A cross-store cutover fence remains unresolved; fresh reader instances are not proof of durable freshness.

D recommends existing audit eventId (canonical decisionId) plus a durable event/observation/content association. This is smaller than a new audit field if the convention is enforced. Existing source references alone do not recover actual observations. Exact content identity, historical Staff ID, all relevant revisions, intervals, evaluatedAt and asOf must be recoverable after restart/restore. An acceptance audit is not decision-observation evidence. **F5 OPEN** until actual durable recovery is demonstrated.

Each design gives a proposed exact library-only future allowlist after repository inspection. None authorises implementation, introduces an authoritative store, chooses a production database or claims cross-D1 atomicity. Actual persistence/cutover adapters require separately scoped implementation after their owner/API is chosen. Design-test specifications are **Not tested**, not synthetic passes.

Next owner decision, after Claude's exact-head reviews: whether to authorise merge of the bounded A and documentation PRs (currently prohibited), and whether to authorise the next isolated contract task. Before durable evidence/acceptance deployment, owner must settle retention/recovery audience and the policy for privileged operations with unconfirmed required evidence. Technical field names and routine retry details are resolved in the designs, not delegated to the owner. Existing school classifications, presentation, verification source and active-only gate remain settled.

Official **T1B-01: Not tested. T1B-02: Not tested.** All unperformed runtime UAT stays Not tested. No release, infrastructure, live-data access, default authority records, notifications or production coordination changes.
