# Proposed browser-only v1 deployment approval

Model: Codex. 14 November 2026, Asia/Singapore. **Design only; pending Claude exact-head review and explicit owner acceptance.** This does not replace P1 yet or authorise implementation, repository creation, settings/credential changes, merge, provisioning, migration or deployment. [Task](../../coordination/tasks/v1-browser-deployment-design.md).

## Recommendation and owner experience

Use a separate private repository, proposed name `helper-gsps/gsis-v1-release`, whose only deployment operator and writer is the owner. GitHub-hosted runners execute the tools; the school computer uses GitHub and Cloudflare web pages only. No local Wrangler, terminal, downloaded executable or school-machine credential file is required.

The owner would:

1. Open the release repository's Actions page and run **Prepare staging candidate**, selecting a full reviewed GSiS commit SHA on main. This builds without Cloudflare or GSIS credentials and produces a candidate summary.
2. Read the summary: source SHA, exact-head review reference, successful CI run IDs, controller SHA, configuration digest, artifact ID/digest, migrations and intended isolated resources. Claude's review is advisory; it is not automatically treated as a GitHub approval because models share an account.
3. Run **Deploy approved staging candidate** from the release repository's main branch. Enter the preparation run ID, full source SHA, artifact SHA-256 and configuration SHA-256 shown in that summary. This owner action is the approval of those exact inputs, not a generic phrase authorising whatever main contains later.
4. Follow the GitHub run's progress and open its private receipt and staging URL. A successful upload is not school acceptance. Bootstrap cleanup after the first Admin sign-in remains a separately recorded operation.

This is a substitute based on owner-exclusive repository access and credentials, **not an emulation of GitHub required-reviewer protection**. The same owner can approve and deploy. No independent two-person approval is promised. Someone controlling the owner's account or a credential with controller write access can bypass it, just as a repository administrator can change repository policy. The owner must accept this trust model.

## Evidence and current limits

| Source | Observed fact |
| --- | --- |
| Main `02daf9378b3897c3ef6a0a8074147f3a333d5d5f`, [Claude review](https://github.com/helper-gsps/gsis/blob/02daf9378b3897c3ef6a0a8074147f3a333d5d5f/docs/coordination/review/pr139-claude-review.md) | Claude approves PR139 at `957d5f05489b3329bde43da8331462aaa6afc266`; P1 remains open; R1 recommends removing seven provider-secret references. |
| PR139 at that exact head, [workflow](https://github.com/helper-gsps/gsis/blob/957d5f05489b3329bde43da8331462aaa6afc266/.github/workflows/v1-deploy.yml) | A typed phrase gates one job in the product repository. It checks out selected source, installs source dependencies, builds, then executes source-owned deployment code with credentials. |
| Same head, [deploy adapter](https://github.com/helper-gsps/gsis/blob/957d5f05489b3329bde43da8331462aaa6afc266/scripts/v1/deploy.mjs) | Imports build tooling, applies eight owner migrations, installs service entrypoints, binds the service graph, deploys nine Workers and injects present secrets. Earlier mutations can remain if a later step fails. |
| Same head, [resource verifier](https://github.com/helper-gsps/gsis/blob/957d5f05489b3329bde43da8331462aaa6afc266/scripts/v1/verify-resources.mjs) | Checks actual D1 identity and private R2 access before mutations; name prefixes alone are insufficient. Preserve these checks in the proposed controller. |
| GitHub environment GET and branch-policy GET in this conversation | Environment exists; sole branch rule is `main`; no `required_reviewers` rule returned. Owner screenshot confirms environment `GSIS_SECRET` exists, not its value or freshness. |
| Environment secret metadata and main branch-protection API | Both return HTTP403 through this connection. This does not prove absent secrets or absent branch protection. Controller access, plan entitlements and Cloudflare permissions have not been inspected. |
| Existing coordination workflow | Models share a GitHub identity. An actor-name check alone cannot distinguish owner actions from agents using that account. |
| Owner instruction | Fully browser-based Cloudflare deployment; school machines cannot run Wrangler. |

P1 was introduced to stop writers dispatching a modified deployment workflow with secrets. Moving a check into the same editable workflow cannot solve that problem. R1 is separate: an omitted environment secret can fall back to a matching repository secret. Seven provider references must be removed, not set to empty strings. These historical reasons come from Claude's review; the controller recommendation is new design judgment.

## Security boundary and prerequisites

The release repository is private and owner-controlled. Product contributors, source-repository Actions tokens and coding-agent GitHub apps must have **no write, Actions-dispatch, administration or secret access** there. No reusable workflow call from the source repository, `repository_dispatch`, source `workflow_run`, PR event or push event starts a deployment. Both entry points use manual `workflow_dispatch`; deploy additionally requires the main ref, allowlisted immutable owner user ID, matching `actor_id` and `triggering_actor`, and `run_attempt == 1`. These checks defend mistakes; repository access is the actual boundary.

Before putting credentials there, the owner inspects installed apps, selected-repository grants, collaborators, deploy keys and personal tokens in the browser. An app installed on **all repositories**, or a broad classic PAT held by an agent, defeats the separation. Narrow or remove that access under separate setup authorisation. Do not claim isolation merely because the repository has a new name. If access cannot be separated, this design is blocked; use an eligible protected repository arrangement instead. Owner GitHub authentication and account recovery remain trusted.

Controller changes are authored/reviewed as credential-free source in GSiS, then installed by the owner through GitHub's web editor/upload. Agents do not need controller write access to supply or review code. Before every controller change, owner suspends deployment credential availability and verifies the reviewed tree digest. Re-enable only after installation/readback. Never grant an agent a broad write token to automate this step. GitHub web editing is acceptable for the small controller, but an unverified paste is not evidence of the reviewed tree.

| Authority | Owner and permitted access |
| --- | --- |
| Product code and its CI | Existing GSiS repository; may produce candidate code, cannot authorise a controller deployment or read its secrets. |
| Deployment workflows, validator, uploader, lock and receipt rules | Release repository, owner-installed exact reviewed controller revision. No dynamically imported product deployment scripts. |
| Source read | Fine-grained expiring token restricted to `helper-gsps/gsis`: Contents read, Actions read and Pull requests read as required by provenance checks. No source write or controller rights. Stored only in release repository. Source fetch uses API archive or checkout with credential persistence disabled. |
| Cloudflare access | Dedicated v1 staging token in the controller's staging environment. Never use a global API key or production deployment token. Scope to a separate v1 staging account where feasible; otherwise prove actual token resource limits and obtain owner acceptance of any account-wide exposure before setup. A `gsis-v1-` prefix is application validation, not a Cloudflare permission boundary. |
| v1 integration secret | New v1-only `GSIS_SECRET` in controller staging environment. Existing source-environment value is not read/exfiltrated to copy it. At separately approved setup, owner enters a fresh replacement and removes the unused source copy after verification; nothing has deployed yet. This does not rotate production or provider tokens. |
| Provider credentials | Absent from controller and deployment environment; no seven provider references in either deploy path. No repository/org inherited provider values used. |
| School/resource configuration | Owner-maintained controller configuration, versioned and hashed; no staff data. Credential values excluded from configuration and receipts. Bootstrap identity configuration private and access limited. |

No protected-environment feature is assumed. The controller environment's main-only restriction remains useful if supported, but owner-exclusive access must work without required reviewers. Private Actions can consume billable minutes beyond the owner's allowance; this proposal does not authorise billing changes or promise zero operating cost.

## Candidate and approval contract

A candidate is schema version 1 with `sourceRepository`, full `sourceSha`, source CI workflow identities/run IDs/attempts, exact-head review record path and commit, `controllerSha`, `prepareRunId`, immutable artifact ID and SHA-256, configuration SHA-256, migration file hashes, target account/resource map digest, created time and expiry. Target is fixed to isolated v1 staging; production is not a selectable input.

Preparation uses a fresh hosted runner, read-only GitHub permissions and no deploy secrets. Fetch exact source SHA, verify it is on source main, require successful exact-SHA product and full-suite checks from the expected workflows, and record how the review names that SHA. If merge produced a different SHA, require fresh CI/review coverage for that result; do not transfer PR-head approval silently. API denial, missing review, ambiguous checks, missing artifact or malformed evidence blocks preparation. Text parsing of an advisory review is not proof of an independent reviewer: owner verifies the linked record before dispatch.

Build source in this unprivileged job. Upload immutable candidate output and a bounded manifest. Do not reuse source build caches in the privileged job. The candidate is valid for 24 hours and one deployment operation. The owner manually approves its exact digest through deploy inputs. Any source, configuration, migration, artifact or controller change requires a new candidate and approval. Controller SHA must match the preparation SHA and current selected controller main; advancing unrelated source main does not change the pinned approved source.

Deployment validates run repository/workflow/event, run attempt, source/head bindings, expiry and all digests using GitHub API data, not filenames or owner-supplied URLs alone. Download only the named artifact from the named successful preparation run. Do not accept an artifact merely named after a SHA. No arbitrary source repository, artifact URL, shell text, service name, target environment or CLI argument is accepted as input. Owner actor and exact input tuple are preserved in the workflow event/receipt.

## Privileged execution and data handling

Use a fresh runner separate from preparation. Install pinned controller dependencies from the controller lockfile before exposing deployment credentials. Checkout controller code at its full commit with persisted credentials disabled. No source `npm` scripts, build hooks, actions, shell files, package installation or `scripts/v1/deploy.mjs` execute with secrets.

Treat downloaded product output as data. Enforce a manifest schema, exact nine-service inventory, maximum 100 MiB archive/500 MiB expanded/5,000 files, no traversal, links, duplicate paths, unexpected executable/configuration files or remote references. Verify every file hash before use. Upload prebundled Worker modules and static assets with build disabled; migration SQL is intentionally applied only to the approved isolated owner database and its exact bytes are included in approval. Generate Wrangler configuration from controller-owned templates plus validated owner configuration. Do not trust source-supplied Wrangler configuration, build commands, routes or bindings. Do not execute uploaded Worker code on the credential-bearing runner.

Retain actual D1 UUID/name and R2 private-access checks, eight distinct owners, nine named Workers, approved Service Bindings, disabled cron/sender/webhook ownership and no production routes. Configuration cannot point at production merely by renaming a resource. First installation must use separately provisioned, approved empty staging stores. No automatic resource creation or existing-school migration belongs to this controller's initial scope.

The only credentials exposed to the mutation step are the staging Cloudflare token and v1 secret. Source-read credentials and unrelated GitHub tokens must not be exported to Wrangler. Controller uses fixed commands and paths, subprocess argument arrays and secret stdin, not shell interpolation. GitHub masking is a fallback, not permission to print secrets. Tests must prove config hooks cannot execute and output does not include credentials. A dependency compromise of trusted controller tooling remains a risk; pin actions and locked packages and review controller updates.

The existing `v1-deploy.yml` must become a non-deploying notice linking the controller before P1 can close. Removing just provider lines leaves the Cloudflare credential exposure unresolved. Seven provider references are removed as part of that change. Existing production workflows/settings are untouched; never delete shared production credentials to make the source repository safe. Inventory inherited source credentials, then ensure no v1 deployment path uses them. Direct source-workflow activation is not an accepted fallback.

## Concurrency, receipt and recovery

Use one constant controller workflow concurrency group for v1 staging with `cancel-in-progress: false`. Revalidate candidate and deployment history after obtaining the execution slot; never rely on queue order. Run-attempt replay is denied. A second dispatch for an already reserved candidate returns the existing operation status and performs no new write.

Use the controller repository's GitHub Deployments records as the operation ledger, with a stable operation ID derived from controller repository ID, preparation run ID and fixed target. Trusted controller code has Deployments write permission; preparation has no such permission. Record actor, exact approval tuple, run/attempt IDs, source/controller/config/artifact/migration digests and timestamps before Cloudflare mutations. State transitions are `reserved -> applying -> verified`, or `failed-before-write` / `outcome-unknown`. Sequential execution plus a fresh ledger check prevents two workflow dispatches from reserving the same candidate; GitHub's API is not claimed to provide a cross-service transaction or unique-key compare-and-swap.

GitHub concurrency is not a durable Cloudflare fencing token. Cancellation, runner death, failed receipt writes or an interrupted mutation can leave a remote operation running. An unfinished reservation blocks all later staging deployments until reconciliation. A separately owner-dispatched read-only reconciliation checks the previous run is terminal, queries actual Worker versions and D1 migration state, and records a known or unknown result. Never retry an uncertain mutation just because the runner stopped. If provider state cannot establish a settled result, remain blocked for owner/operator investigation. No automatic resume or rollback on unknown outcomes.

Record per-owner migration results, deployed Worker version IDs, configuration digest, secret names only, and readback outcomes. Partial deployment is possible across nine Workers/eight databases. Never claim all-or-nothing or cross-D1 atomicity. Rollback is a newly approved candidate; database compatibility and receipts must be examined first. Before deployment, removing the proposed controller has no school-data effect.

Candidate artifacts expire after 24 hours for approval. Propose 90-day private evidence/artifact retention subject to the account's supported limit and owner acceptance; retain minimal deployment metadata in GitHub Deployments and a repository handoff, without secret values or staff records. Deleted/expired evidence cannot support a fresh deployment. It requires a newly prepared candidate. Controller evidence does not close F5 or replace application recovery requirements.

## Alternatives considered

| Alternative | Decision |
| --- | --- |
| Same-repository manual dispatch, confirmation phrase, actor check or issue-comment approval | Rejected as the sole protection: a writer can modify the workflow, and shared model identity defeats actor-only attribution. |
| Same repository plus enforced protected branches | Potentially viable if all workflow/ref/secret access is proven constrained. Current branch-protection API is inaccessible and environment reviewer section absent; not a verified solution. |
| Private owner-only release repository | Recommended, conditional on proving agent/app/token exclusion. Browser-only, no Enterprise reviewer dependency, small trusted deployment component. |
| Public deployment controller with free required-reviewer protection | Rejected for this proposal: introduces public metadata/log risks and private-source credential handling. Could be designed separately, not silently make GSiS public. |
| Enterprise-backed environment required reviewers | Strong supported alternative if the owner wants that managed gate and accepts its cost/account arrangement. No upgrade authorised. |
| Owner's local Wrangler | Rejected: conflicts with school-machine and browser-only requirements. |
| Cloudflare automatic Git deployment | Rejected as a direct replacement: automatic source pushes do not provide this exact candidate approval, migration ordering or receipt/recovery contract. |

## Exact proposed implementation ownership and allowlists

**This design PR changes only** this document and its [task](../../coordination/tasks/v1-browser-deployment-design.md). No implementation is included.

If approved, use one separately claimed implementation task in GSiS, with precisely these proposed paths:

- `.github/workflows/v1-deploy.yml` — remove executable deployment/provider references and display the controller link.
- `docs/v1/accelerated-delivery/OPERATIONS.md`
- `docs/v1/accelerated-delivery/RELEASE.md`
- `docs/v1/accelerated-delivery/VERIFICATION.md`
- `docs/coordination/tasks/v1-browser-deployment-controller.md`
- `scripts/v1/release-controller/README.md`
- `scripts/v1/release-controller/prepare.yml`
- `scripts/v1/release-controller/deploy.yml`
- `scripts/v1/release-controller/reconcile.yml`
- `scripts/v1/release-controller/package.json`
- `scripts/v1/release-controller/package-lock.json`
- `scripts/v1/release-controller/candidate.mjs`
- `scripts/v1/release-controller/deploy.mjs`
- `scripts/v1/release-controller/receipt.mjs`
- `scripts/v1/release-controller/config.schema.json`
- `tests/v1-release-controller.mjs`

Codex owns this bounded code, Claude reviews its exact head, ChatGPT coordinates v1. Product services, T1A/T1B contracts, root CI/dependencies, production coordination, schemas and live data remain outside scope. Any additional implementation path requires a separate scope decision.

The owner installs the reviewed controller files into the new private repository, mapping the three `.yml` files to `.github/workflows/`, the six package/module/schema files to the root, and README to `README.md`. Owner adds `config/staging.json` containing the validated non-secret resource map. These are the proposed eleven controller repository paths; repository creation, app access selection, variables/secrets, Cloudflare account/token/resource setup and credential transfer are separate external actions requiring explicit setup authorisation. They are not performed by this design or implicitly allowed by an implementation PR.

## Required implementation and browser acceptance tests

| ID | Evidence required before accepting the replacement |
| --- | --- |
| B01 | Owner uses only GitHub web UI to prepare and approve an exact candidate; hosted runner performs tooling. Observe actual staging receipts and version readback only after separate staging authorisation. |
| B02 | Product writer and coding-agent credentials cannot read controller secrets, edit controller files or dispatch either workflow. An all-repositories app grant fails setup. Shared owner login alone never counts as access separation proof. |
| B03 | Wrong actor, alternate branch/tag, API dispatch by non-owner, rerun attempt, repository_dispatch and source push/PR events cannot deploy. |
| B04 | Changed source SHA, controller SHA, target/configuration, artifact ID/digest, migration hash, expired candidate, cancelled/failed CI or missing review evidence fail before any mutation. |
| B05 | Source main advances during preparation/deployment: pinned approved source remains fixed; changed controller/config invalidates candidate. No check-then-checkout mutable ref. |
| B06 | Malicious source build scripts attempt to read Cloudflare/GSIS secrets: none available. Malicious Wrangler hooks, symlinks, traversal, oversized archive, forged manifest, unapproved routes and bindings are rejected in the privileged job. |
| B07 | Canary provider secrets at repository scope never reach either v1 deploy path. Test all seven names. Existing production workflows and tokens remain unchanged. |
| B08 | Duplicate dispatches and replays yield one reserved operation. Concurrent different candidates serialize; cancelled/replaced queued runs cannot inherit approval. |
| B09 | Crash before first mutation, after one D1 migration, after a Worker upload and before receipt write: unfinished/unknown operation blocks further deployment; read-only reconciliation preserves operation identity. Simulate a remote call completing after runner death. |
| B10 | Production D1 UUID disguised with v1 label, duplicate owners, public R2, wrong account, sender/webhook/cron takeover and mismatched actual resource identity all deny before mutations. |
| B11 | Partial rollout, expired read token, Cloudflare denial, ledger API outage and artifact deletion have explicit failed/unknown outcomes. No fabricated success or blind rollback. |
| B12 | Source code, job logs, summary, artifact and receipt scanning finds no secret values. Exact approved controller tree and package hashes match what the owner installed through the browser. |
| B13 | Reconciliation run cannot mutate Cloudflare or resume deployment. Fresh approval is required for rollback/recovery writes. Loss of retained evidence blocks reuse. |
| B14 | Canonical build/no tracked drift, runner discovery and full Node/LORD CI at implementation head; relevant product regression and exact-head Claude review. Test actual GitHub permission boundaries, not only mocked actor checks. |

All B01-B14 are **Not tested** by this documentation task. Future synthetic tests alone cannot prove hosted access isolation, credential handling or Cloudflare recovery. Current product CI at PR139 does not cover the controller.

## Rollout order without a merge/deployment circular dependency

1. Review and explicitly accept this proposal, then separately authorise the bounded controller implementation and owner setup. No live resource action follows automatically.
2. Implement/review the controller and change PR139's existing deployment workflow to the non-deploying notice through its owning Codex branch. That advances PR139 and needs new Claude review/CI. The future task must coordinate that overlapping workflow path with the existing product claim, not open a competing implementation edit.
3. Install the controller without Cloudflare credentials and test its GitHub access boundary using a harmless candidate fixture already on source main. These permission/negative tests do not require merging product code or deploying anything. Owner separately verifies secret placement; no secret value is copied to product source.
4. Close P1 only on the explicit accepted replacement plus the required access/source-path evidence. The owner may then separately authorise the reviewed PR139 merge. A merged source SHA must obtain the exact CI/review coverage required by the candidate contract; use browser-triggered verification if main does not automatically run those workflows.
5. Owner separately authorises isolated resources, credentials and first staging deployment. Run B01 and actual Cloudflare recovery tests there. Permission tests before merge do not establish hosted product acceptance. Production remains out of scope.

## Decision and remaining gates

Ask the owner to accept the concrete trust model and browser flow after Claude reviews this document: owner-exclusive private release repository, explicit dispatch as approval, no coding-agent controller access, no provider injection, and proposed evidence retention. This approval is distinct from implementation, external setup and staging. If access isolation cannot be proven, stop and return to the eligible protected-repository option; do not weaken the model silently.

P1 may close only after: owner accepts this replacement; independently reviewed implementation disables source-repository v1 deployment; controller access separation and source-credential exposure checks pass; browser-only negative permission tests demonstrate the boundary; controller tree/configuration and v1 secret placement are verified. Report any Cloudflare permission scope broader than isolated staging for explicit owner acceptance. No claim of Enterprise-equivalent protection is made.

Removing provider references resolves R1 only after implementation and verification. Owner acceptance of this design alone resolves neither R1 nor P1. Initial staging, migrations and resource provisioning remain separately authorised actions. F5 **OPEN**; official T1B-01/T1B-02 and unperformed runtime UAT **Not tested**. Hosted performance and school acceptance remain open. Muse keeps v0.9.9* production coordination.
