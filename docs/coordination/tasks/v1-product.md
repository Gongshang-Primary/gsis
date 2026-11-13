# v1-product: complete isolated accelerated product

- Status: implemented in isolated worktree; exact-head verification outcomes are maintained in the PR and its evidence package. Independent Claude review remains pending. Owner implementation instruction 13 November 2026: “build product fully”.
- Owner/model: Codex; coordinator ChatGPT (v1); independent exact-head reviewer Claude.
- Branch: codex/v1-product
- PR: https://github.com/helper-gsps/gsis/pull/139 (draft until final verification; exact head and outcomes recorded there)
- Refreshed base SHA: 27fa498657965169b9d971a9caabc33c8b19bc69
- Last updated (Asia/Singapore): 13 November 2026
- Requirements: accelerated implementation specification v1.1 at f39b671ac6da3f389c58345ce4f5c035f1cb3f65, docs/v1/accelerated-delivery/GSIS_V1_ACCELERATED_IMPLEMENTATION_SPEC_2026-11-13.md; full Revision 49 source on that same branch; PR137 current head b6cd8f5702fbea8fc4dc22c245de00b6dfdd2a22. Read without merging/cherry-picking. Latest Contacts design at PR136 head 0081eea4e8924691818b68d18c5d53d6927985fa also read without merging.
- Authorised work: full isolated v1 product, local schema/configuration preparation, synthetic testing, build and reviewable implementation PR. This later instruction supersedes historical library-only scope for this new task. No production takeover.
- File scope: new v1/runtime/**, v1/services/**, v1/web/**, v1/allocator/**, v1/migrations/**, v1/config/**, v1/package.json, v1/package-lock.json; scripts/v1/**; tests/v1-product-*.mjs and tests/v1-product/**; .github/workflows/v1-*.yml; docs/v1/accelerated-delivery/PARITY.md, INTERFACES.md, VERIFICATION.md, OPERATIONS.md, RELEASE.md; this task. Existing v1/core/** and v1/contacts/** contracts reused without modification. Existing production source is read-only; build copies go into ignored deliverables. Generated production outputs and root package/CI unchanged.
- Overlap: refreshed all open PR actual files. PR137 owns specification/source documents; PR136 owns policy/design documents; this scope excludes them. PR132 is queue documentation. Production release branches and stale Roster PR40/72 own legacy files outside this scope; preserve their ownership. Existing A/B implementation claims are already merged (#133/#134); PR136 updates their historical status. No competing current v1 runtime claim found.
- Parallel work: Codex subagents may build disjoint domains on this one task branch after shared contracts are frozen; root owns integration and commits. No additional implementation branch/PR per subagent.
- Excluded: merge, deployment, Cloudflare provisioning, live data/Contacts acceptance writes, migration execution, real provider sends or credential changes. Use existing provider tokens via backend secret injection and common GSIS_SECRET; never infer actor identity from secret possession.
- Acceptance: all accelerated-spec cases, full source parity inventory, actual Workers/D1 transaction/race/restart tests, authenticated browser journeys and negative permission tests, canonical no-drift build, full Node/LORD suite and exact-head CI, independent review. Local tests do not establish production UAT. Official T1B-01/T1B-02 remain Not tested. F5 remains OPEN until durable recovery evidence is demonstrated and reviewed.

## Engineering and evidence

Apply current v1 Q01–Q08 and Rust-inspired principles. Workers best-practices skill read from cloud package c0/workers-best-practices, including runtime patterns; actual implementation evidence will be recorded here and in VERIFICATION.md. No third-party skill repository copied. Isolated D1 owners, durable receipts and outbox, immutable publications, revision pins and explicit uncertainty are required; no cross-D1 atomicity claim.

Implementation is recorded in [PARITY](../../v1/accelerated-delivery/PARITY.md), [INTERFACES](../../v1/accelerated-delivery/INTERFACES.md), [VERIFICATION](../../v1/accelerated-delivery/VERIFICATION.md), [OPERATIONS](../../v1/accelerated-delivery/OPERATIONS.md), and [RELEASE](../../v1/accelerated-delivery/RELEASE.md). Final PR/head/CI evidence is linked from this task's branch handoff; it must identify the final tested commit without transferring earlier working-tree results.

| Gate | Builder status before exact-head handoff |
| --- | --- |
| Q01 | Pass: owner full-product instruction, source/claim refs above; refreshed main still f5a2385, actual open PR files disjoint, including new PR138 aSc documentation. Exact final inventory checked against this scope. |
| Q02 | Pass: eight domain D1/R2 owners and gateway, reused T1A/T1B/pure source calculations, explicit projection/admission/publication boundaries in INTERFACES. |
| Q03 | Local negative engineering evidence supplied for sessions, school/permissions, source pins, preview, webhook/phone/token boundaries and private artifacts; independent Claude review pending. |
| Q04 | Actual Workers/D1/R2 race/restart/restore evidence supplied, including cross-owner operation-ID collision, interrupted pins, weekly cap contention, source occupancy fencing and uncertain provider receipts. No cross-D1 atomicity claimed. Final-head review pending. |
| Q05 | Bounded provider/body/job/import/storage protocols and measured synthetic load. Thirty simultaneous cold browsers miss the proposed first-screen target; shared-host contention is reported. Worker resource/production-region acceptance remains open. Workers best-practices skill applied; no copied skill repository. |
| Q06 | First consolidated development pass 34/34 product programs, later targeted additions passing; canonical 18-component build has zero tracked drift. Full existing Node/LORD, refreshed discovery, final-head focused checks and exact-head CI must be recorded in the PR before completion. |
| Q07 | One product PR on codex/v1-product; Model: Codex attribution, independent reviewer Claude. Exact-head verdict pending; no internal Codex review is described as Claude approval. |
| Q08 | Deployment/live operations Not applicable to this authorization. Official T1B-01/T1B-02 and unperformed runtime UAT Not tested. F5 OPEN pending reviewed durable recovery evidence. |

External provider and school production acceptance remain Not tested. No merge, deployment, provisioning, live-data import, real send or credential change was performed. Rollback before deployment is removal of isolated product artifacts; after eventual live writes it requires the separately approved data recovery/cutover procedure. Remaining release decisions belong to the owner after exact-head review and evidence.
