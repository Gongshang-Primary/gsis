# V1 implementation and review quality gates

These gates operationalise [v1 instructions](../AGENTS.md), [skill policy](../skills/SKILL_POLICY.md) and [R01–R12](RUST_PRINCIPLES.md). They are mandatory task/review criteria, enforced by the builder's evidence and independent review. This documentation adds no CI job, branch protection or automatic enforcement. Never describe a manual gate as automated.

## Evidence format

In the existing task record and PR, mark each applicable gate **Pass**, **Fail**, **Pending**, or **Not applicable — reason**. Pass requires a command/result or inspectable design/document evidence at the identified SHA. Pending includes missing access, unrun tests and unavailable required requirements. A failure or pending required gate prevents a completion/ready-to-merge claim. Not applicable is a scoped judgement for the reviewer to verify, not a waiver of security or approved acceptance criteria.

Record base and exact tested head, requirements revision, claimed file inventory, actual commands/environment (use `TZ=Asia/Singapore`), outcomes, relevant failures, exclusions, limitations and rollback implications. Documentation-only evidence may be link/scope checks and direct content inspection. Never transfer an earlier head's pass to a later implementation without the required revalidation. A task record may point to PR evidence to avoid self-referential commit hashes.

## Gates

| Gate | Builder must supply | Claude verifies at the exact head |
| --- | --- | --- |
| Q01 Authority and scope | Current claim, owner request/specification, branch/base, changed-file inventory and overlap check; relevant branch-only review/directive references. | Work is authorised, in scope and in the correct v1 lane. Production coordination is preserved; owner resolves allocation conflicts. Reading an unmerged directive does not merge it. |
| Q02 Design and ownership | Invariants, owner/projection map and transitions proportionate to the change; applicability of R01–R04 and R10. | One authority per field/write; explicit valid states; immutable publication; no speculative abstractions or competing authoritative copies. Existing contracts are reused where suitable. |
| Q03 Security and privacy | Trust-boundary/data-flow review and relevant negative tests under R05–R06; minimal audit/error projections. | School isolation, current capabilities, service identity, impersonation boundaries, secret handling and required auditability survive all changed paths. No client-controlled privilege inference. Approved business policy is unchanged unless explicitly authorised. |
| Q04 Concurrency and recovery | Atomic boundary, request/operation binding, revision/fence checks, idempotency and recovery evidence under R07–R09; unresolved intervals. | Controlled races, duplicate requests, stale state and unknown outcomes are handled as claimed. No cross-D1 atomicity or receipt-as-success assertion; later integration gates remain explicit. |
| Q05 Resources and maintainability | R11 budgets and relevant boundary/measurement evidence; concise skill-use record and explanation of new abstractions/dependencies. | Work is bounded; late completions/retries are safe; complexity buys a current requirement. Skills are honestly described, licences/attribution preserved, no copied skill repository. |
| Q06 Verification | R12 evidence mapped to approved acceptance scenarios: meaningful positive/negative tests, runner discovery, canonical build and required regression suites for implementation. | Tests exercise behaviour rather than mirror implementation; no weakened assertions, skipped tests or generated drift hidden as a pass. Existing required Node/LORD suites and exact-head CI remain required under the repository workflow; browser QA applies to changed user flows. |
| Q07 Handoff and review | PR with Model: Codex attribution (or actual builder), exact head/base, inventory, evidence, limitations, rollback and named reviewer; runtime UAT status. | Findings have severity, location, impact and evidence. Claude reviews without editing Codex's branch. Every later code change needs updated-head review; document-only follow-ups also disclose the new head and what changed. Advisory model approval is not owner merge approval. |
| Q08 Release boundary | If separately authorised: release/staging/runtime evidence, configuration inventory, recovery procedure and remaining gates. Otherwise explicitly Not applicable to deployment and Not tested for unperformed runtime UAT. | No skill or green CI grants merge, deployment, infrastructure or live-data permission. Distinguish locally verified, merged, staged, deployed and live-verified. Existing production/release rules continue unchanged. |

## Documentation-only tasks

For a task restricted to documentation, inspect the exact file inventory, validate relative links, read for conflicting/duplicated instructions, verify preservation of existing policies and inspect `git diff --check`. Confirm zero application, tests, CI, configuration, dependency or generated-output changes. Do not add application tests solely to test prose. Follow any existing repository-mandated build/regression checks; this policy does not relax them. If checks are not run, say so and leave required gates pending. Do not turn a documentation PR into implementation or release work.

## Review of this policy

Claude's acceptance checklist for this documentation PR is:

- Root AGENTS links to the v1 entry point and explicitly covers code/tests outside docs/v1; all internal policy links resolve.
- V1 coordination and v0.9.9* responsibilities remain separate, including owner arbitration of competing allocations.
- None of the six skill approaches is falsely declared installed or executed; licence and attribution rules are explicit.
- Precedence has one canonical home, the four files have distinct responsibilities, and no approved business policy or existing release rule is contradicted.
- All twelve Rust-inspired principles have concrete JavaScript/Workers/D1 applications and observable checks, with no language migration requirement.
- The diff is limited to authorised documentation and workflow-required task evidence; existing application, CI and release behaviour is unchanged.

Review findings that affect correctness, security, scope or conflicting policy block acceptance until resolved or the owner makes an explicit scope decision. Do not silently waive them to obtain a green checklist. Preserve accepted limitations and deferred follow-ups with their owning stage; do not imply they are fixed by documenting them.
