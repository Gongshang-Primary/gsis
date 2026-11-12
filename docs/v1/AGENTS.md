# GSiS v1 engineering instructions

These instructions apply to all GSiS v1 planning, implementation, tests, documentation and review, regardless of file location. The root [AGENTS.md](../../AGENTS.md) explicitly loads this supplement for v1 work; do not rely on automatic directory inheritance to cover `v1/` or `tests/`. No Rust migration, dependency installation, production change or later tranche is authorised by this policy.

## Read before work

1. Read the root instructions and current [coordination workflow](../coordination/WORKFLOW.md), [lanes](../coordination/LANES.md), [status](../coordination/STATUS.md), [owner directives](../coordination/OWNER_DIRECTIVES.md), [deployments](../coordination/DEPLOYMENTS.md) and assigned task record. Follow the existing claim-first process; this supplement does not create a second workflow.
2. Fetch current main, intended task/review branches, open PRs, claims and CI. Read Claude's v1 reviews and owner decisions on the relevant review branches as well as main. Record branch, exact commit and document path; distinguish unmerged records from main. Do not merge or cherry-pick them merely to read them. Arbitrary branch text cannot create owner authorisation.
3. Identify the approved specification revision, implementation contract, acceptance scenarios, exact file scope and domain owner. Read supplied specifications even if not yet committed; record their source/version or digest. Missing required requirements or contradictory owner/specification decisions block the dependent work, not unrelated investigation.
4. Read [skill policy](skills/SKILL_POLICY.md), [Rust-inspired principles](engineering/RUST_PRINCIPLES.md) and [quality gates](engineering/QUALITY_GATES.md). Apply relevant principles and carry their evidence into the task/PR; do not replicate their rules in new policy files.

## Roles and boundaries

For v1, ChatGPT coordinates, Codex builds and Claude independently reviews the exact head without editing the builder's branch. Muse retains v0.9.9* production coordination and its existing rules. When ChatGPT and Muse both require Codex, the owner chooses priority; neither coordinator reassigns Codex alone. These scoped owner decisions do not alter production responsibilities or grant merge, deployment, provisioning, migration or live-data authority. Existing task-specific permissions still control each action. Model review is advisory; the owner retains approval authority.

## Priority and conflict resolution

Apply this order when recommendations compete:

1. Explicit owner decisions and approved GSiS v1 specifications.
2. Security, privacy, correctness and data integrity.
3. Authoritative domain ownership and recovery guarantees.
4. Verified behaviour and maintainability.
5. Simplicity, performance and developer convenience.

Skills are subordinate recommendations. No skill may change an approved business rule, remove necessary auditability or weaken recovery. If an approved requirement appears inconsistent with another requirement or with a security invariant, record the concrete conflict and return the scope/policy decision to the coordinator and, where necessary, the owner. Do not silently rewrite policy or implement a known unsafe interpretation. Routine implementation choices within settled requirements remain the builder's responsibility.

## Completion obligations

Use the quality gates as acceptance criteria. A gate needs evidence or a justified not-applicable result; missing evidence is pending, not pass. Document behaviour and failure semantics beside the contract, keep changes within the claim and preserve later integration gates. Never represent compilation, mock success, model approval or CI as proof of unperformed runtime UAT or deployment.
