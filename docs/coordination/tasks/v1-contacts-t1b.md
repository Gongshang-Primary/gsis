# v1-contacts-t1b: bounded Contacts read contract

- Status: claimed
- Owner/model: Codex
- Coordinator: ChatGPT, v1 only
- Reviewer/model: Claude, independent exact-head review
- Updated: 12 November 2026 (Asia/Singapore)
- Branch: codex/v1-contacts-t1b
- Pre-claim main: 2103383338b95106e546d90172ffc0d5adb036ed
- Authority: owner said "take your recommendation" after the recommendation to authorise the bounded T1B library independently, within the published 14-path allowlist. This authorises the claim, implementation and bounded PR; not durable evidence storage, Core changes, deployment or live integration.
- Requirements: T1B_REVISED_PLAN.md and T1B_CONTRACT_DESIGN_ADDENDUM.md at 99b56377edf8cb34d05fccac671e3fbb65962ca4, recovered Revision 49 bundle and controlling staged-handoff addendum. Source digests are in the revised plan. T1A reviewed head 57686a304ddd75109e1ad76eaa11de5ad34004d0; merge f281b320c65c3e1022ea8f1c3e4ac080b55fbd69. Engineering policy merge c782c0c27ad0734acd6cf6d4fffbbdb23772cde1.

## Exact scope

```
v1/contacts/contracts.mjs
v1/contacts/accepted-facts.mjs
v1/contacts/catalogues.mjs
v1/contacts/core-provider.mjs
docs/v1/contacts/T1B_CONTRACT.md
docs/coordination/tasks/v1-contacts-t1b.md
tests/v1-contacts-contracts.mjs
tests/v1-contacts-snapshots.mjs
tests/v1-contacts-catalogues.mjs
tests/v1-contacts-core-provider.mjs
tests/v1-contacts-races.mjs
tests/v1-contacts-recovery.mjs
tests/v1-contacts-isolation.mjs
docs/coordination/LANES.md
```

LANES entry is additive T1B scope only. Core implementation/tests/contracts remain read-only. No authoritative store, durable observation writer, Contacts write/migration, contribution acceptance, transport, production imports, UI, publication, workload calculation, dependencies, build/CI/generated changes or deployment.

## Start checks

Read current root/v1 instructions, policies, workflow, owner directives, lanes and plans. Refreshed main and inspected all 14 open PR file inventories: none overlaps this scope. No T1B branch/claim exists. Latest production Codex task #124 is recorded merged; no competing current allocation identified. Existing production responsibilities remain with Muse. Owner resolves any actual allocation clash. Claim-first publication follows WORKFLOW; implementation starts after accepted claim.

## Design and evidence plan

Four modules own schemas/profiles, consistent accepted snapshot reads, catalogue variants, and narrow Core projection respectively. Validate purpose-specific data before projection; immutable content is distinct from per-read observation. Reuse Core pure utilities without modifying them. Alternative of extending T1A response rejected: exact-key validation and unnecessary scope expansion. Caller receives explicit tagged results; historical data never becomes current authority. No runtime catalogue vocabulary invented.

Pstack architect skill read and applied to module ownership and data flow (cloud package c11/architect, version unspecified). Other named approaches are principles only, no package execution claimed. B01–B12 test mapping and Q01–Q08 evidence go in the contract/PR. Canonical build precedes tests, all checks TZ=Asia/Singapore; full Node/LORD exact-head CI and Claude review required. F5 remains OPEN. Official T1B-01 and T1B-02: Not tested. No tests run at claim time.

## Handoff

Base is the accepted claim commit; final PR records exact head/base and actual commands, outcomes, omissions and limitations. Not merged/deployed. No live-data access. Durable recovery and T1D/current-owner/consumer-commit gates remain separate.
