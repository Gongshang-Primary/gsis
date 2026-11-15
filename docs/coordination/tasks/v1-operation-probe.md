# v1-operation-probe: built-browser operation coverage in existing CI

- Status: claimed; implementation not yet started.
- Owner/model: Codex. Coordinator: ChatGPT v1. Lane: tests/documentation only.
- Reviewer/model: Claude, independent exact-head review; pending.
- Last updated (Asia/Singapore): 15 November 2026, 21:06.
- Branch: `codex/v1-operation-probe`.
- Required product/review base: PR175, `codex/v1-global-save-status`, exact `77e30eece77cf2477384ecd4fdc901b828e47599`.
- Refreshed main before claim: `d77408178f9e6adfb67914643add48a783e87f11`.
- Current implementation head / PR: to be recorded by the PR, avoiding a self-referential hash.
- User-authorised scope: Job2/T07 only, a test-only sibling beside PR176. No application, build, workflow, dependency, migration or generated-output changes.

## Owner clarification: sibling, not a deeper stack

The owner explicitly approved this exception on 15 November 2026: the limit means **do not make the chain deeper; it does not forbid a sibling**. Open this one test-only PR on PR175 at77e30ee, beside PR176, never on top of it. Keep exactly the three files below, with no overlap with PR176. It must be green independently at that base, seed its reasoned allowlist from the follow-up ledger Section2, and **be rebased onto main and rerun after PRs160–175 merge**. This exception is for this PR only. **Do not start Job3 until PR176 has Claude's review**; product work must not sit on an unreviewed base. The owner retains all merge and deployment authority. Do not reinterpret the earlier one-new-PR wording as a ban on this expressly approved sibling, or as permission for further siblings.

Publish this task alone to main using the workflow's expected-head, non-force claim exception. Then carry only this accepted task record onto the exact175 base before test edits. This is the task-specific exception to the workflow's default branch-from-main-claim ancestry: merging unrelated newer main ancestry would violate the owner's pinned base and three-file scope. Do not merge/cherry-pick PR177 or incorporate PR176 merely to obtain instructions/code. Record the accepted claim SHA on the branch.

## Exact file scope

```text
tests/v1-product-operation-probe.mjs
tests/v1-product/operation-probe-allowlist.json
docs/coordination/tasks/v1-operation-probe.md
```

All26 current open PRs and their actual file inventories were refreshed before claiming. PR160–175 are still unmerged. None owns these three paths. PR176 remains frozen at `5e44fdf3c4619abf13873eb961d781b321d45025`; its own green CI/review status does not transfer to this sibling. Existing Node/product runners automatically discover the proposed test name; no workflow or runner edit is authorised.

## Controlling sources and decisions

Read current main root/v1 AGENTS, workflow, lanes/status, owner directives/deployment record, engineering/skill policies and task template. Source references:

- [PR177 at429367ed23bf4edf8d10cbb575226c84c228474c](https://github.com/helper-gsps/gsis/tree/429367ed23bf4edf8d10cbb575226c84c228474c): `docs/coordination/OWNER_DIRECTIVES.md`, `docs/v1/V09_V1_TRACE_LEDGER_2026-11-15.md`, and `docs/v1/V09_V1_TRACE_LEDGER_FOLLOWUP_2026-11-15.md`. Read unmerged. The follow-up's actual-request findings supersede its first ledger's name-search false alarms.
- [PR159 queue at1dca6e7315431e7d8226c4e0b1555a34ebb1df21](https://github.com/helper-gsps/gsis/blob/1dca6e7315431e7d8226c4e0b1555a34ebb1df21/docs/v1/accelerated-delivery/CHANGELOG_2026-11-15.md).
- [PR162 Run B at ee052420628e3567038df5141c448bc366d0d9ba](https://github.com/helper-gsps/gsis/blob/ee052420628e3567038df5141c448bc366d0d9ba/docs/v1/accelerated-delivery/UAT_RUN_B_2026-11-15.md). Historical live/migration permissions do not authorise this task to repeat them.
- Owner's nine-job handoff, uploaded `Pasted text.txt`, SHA-256 `56c18b11a281bfe41582f9d3c96fbf9d06e7f38699e912fb2f8e10278d1449be`, plus the explicit sibling clarification above. Job2 is the operation probe, not validation. Later product jobs, look/speed changes, migration tooling T01–T03 and access-grant migration H08 are excluded.

Strict session, school, capability, revision, operation-identity, accepted-authority and size checks remain unchanged. This task does not implement any relaxed validation, estimated allocation, missing handler, retirement or replacement UI. Source permissions and provider verification remain intact.

## Implementation and acceptance contract

1. Build actual browser assets through the existing product test harness. Extract API paths and operation/action/command names with source-file/call-site provenance from the built browser code. Reuse locked Acorn and existing dependencies. Resolve the actual shared-adapter transport; do not confuse an old browser spelling with a missing native handler or count an arbitrary string search as a proven call.
2. Probe the real local web gateway, Workers and D1 using a synthetic signed-in Admin and bounded payloads. Supply synthetic parameter/operation identities where necessary to reach dispatch. Classify explicit unknown-route/unknown-operation responses separately from validation, prerequisite and missing-resource responses. A handler reached is not evidence that its business operation succeeds.
3. Seed narrowly matched missing-handler entries only from follow-up Section2, with one ledger reference and reason per entry. Claude reviews the actual allowlist in this exact-head PR. Unknown entries outside it fail. Detect duplicate, unjustified and stale exceptions so a later fix must remove its allowance. Do not treat the owner's permission to seed a candidate list as a completed Claude review.
4. Include meaningful negative controls: a newly discovered synthetic call to a missing handler fails without an allowance; an unrelated/domain-mismatched allowance cannot hide it; a fixed/reached exception cannot stay silently allowed. Exercise actual built-browser transport against the local Workers as a representative integration check. No helper-only acceptance claim.
5. Report discovered/probed surfaces and unresolved dynamic limitations explicitly. Do not silently discard unsupported call shapes or claim all business paths are verified. No provider sends, live requests, real staff identifiers or real operation IDs. Keep provider/scheduler execution disabled in the local fixture and prevent external browser requests.
6. Fit the unchanged existing test-runner timeout, with bounded work and concise failure diagnostics. Use a fresh isolated local store and dispose browser/Workers after pending requests settle. No timeout increase, product instrumentation or new dependencies.

## Verification

Pending implementation. Required evidence at the published head: focused probe including expected red controls; existing runner discovery; canonical `TZ=Asia/Singapore npm run build` without tracked drift; full existing Node/LORD and product regressions; exact-head CI; exact three-file scope and zero overlap with176. Record actual commands, outcomes, failures, exclusions and omissions in this task/PR. Compare with the base's own passing evidence, never substitute that baseline for this head's checks.

Approach: apply the repository's Superpowers/Ponytail principles manually for meaningful negative controls and existing-harness reuse. No optional skill package or independent model review is claimed as executed. Q01 is supported by the owner exception/claim; Q02–Q06 require implementation evidence; Q07 Claude review pending; Q08 release not applicable.

## Review, release and handoff

Claude reviews the exact new head without editing this branch. PR must say: **rebase onto main and rerun after PR160–175 merge; never merge into the parent feature branch**. The builder has no merge, deployment, infrastructure, live migration/data or provider-send authority. Visible changes: none intended; tests only. Rollback is removal/revert of this test and its reasoned exceptions, with no production data effects.

Only T07's engineering test infrastructure may be closed here. All known allowed gaps remain open; no first-ledger false alarm becomes a repair or unperformed browser pass. F5 remains **OPEN**. Official T1B-01/T1B-02, hosted/runtime UAT and provider integration remain **Not tested**. Next product work is Job3, gated on Claude's review of PR176 and a fresh base/scope check; this sibling exception cannot be reused for it.
