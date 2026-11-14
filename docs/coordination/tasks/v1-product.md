# v1-product: complete isolated accelerated product

- Status: implemented; Claude approved isolated, undeployed code at `98cd5d8093c29af0c3f44919cdb73e47a8b49186`. The bounded review follow-up below advances the head and requires updated-head review. Exact-head verification outcomes are maintained in the PR and its evidence package. Owner implementation instruction 13 November 2026: “build product fully”.
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
- Excluded: merge, deployment, Cloudflare provisioning, live data/Contacts acceptance writes, migration execution, real provider sends or credential changes outside the explicit GitHub-only setup authorisation recorded below. The 13 November owner decision in the PR139 review supersedes the earlier production-shared secret wording: v1 gets a new, environment-scoped `GSIS_SECRET` distinct from production; provider credentials remain unset for v1 until separately approved cutover, when existing provider tokens are reused unchanged. Never infer actor identity from secret possession.
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

## PR139 review follow-up, 13 November 2026

- Current main/review reference: `66e922f34307fd1f29f36f19d2f993c1114d99b4`, [Claude review and owner P2 decision](https://github.com/helper-gsps/gsis/blob/66e922f34307fd1f29f36f19d2f993c1114d99b4/docs/coordination/review/pr139-claude-review.md). Main adds only that review record since the claim; merge-tree with the reviewed product head is clean. Relevant open v1 PR heads remain unchanged and disjoint. Continue the existing claim/branch/PR; no new implementation lane or allocation.
- Exact follow-up scope: `.github/workflows/v1-build.yml`, `docs/v1/accelerated-delivery/OPERATIONS.md`, `RELEASE.md`, `VERIFICATION.md`, and this task. No application, schema, dependency, production, authentication or reviewed T1A/T1B change.
- L2: pin `actions/upload-artifact` to `ea165f8d65b6e75b540449e92b4886f43607fa02`, verified against the upstream v4 ref and the successful reviewed-head CI log; action behaviour is unchanged.
- L1: add the post-first-sign-in operator cleanup, including removal from GitHub's configuration source and all generated/deployed Worker vars, preserving the durable bootstrap receipt/Admin grants. No first sign-in or live cleanup has occurred.
- P1/P2: document owner review, exact `main` branch restriction, environment-scoped credentials, the distinct v1 secret and absent provider credentials until cutover. Read-only GitHub inspection found no environments; repository-secret metadata access returned HTTP403, so inherited provider credentials cannot be ruled out from this connection. These are unresolved operator gates, not claimed settings changes.
- Skill use: no additional skill execution was needed for this action pin and operator-document correction; existing v1 engineering policy applied proportionately.
- Verification: canonical build, workflow pin/upstream check, clean generated output, bounded bootstrap-free build proof, documentation links/scope and exact-head product/full-suite CI are recorded in PR139. The approval and packages at `98cd5d8` remain evidence for that head only; the follow-up head needs Claude's review.

### Authorised GitHub setup attempt

On 13 November 2026 the owner answered “Authorize GitHub setup only” to creating `gsis-v1-owner-approved`, requiring owner account `helper-gsps` as reviewer, restricting deployment to branch `main`, and generating/storing a new v1-only environment `GSIS_SECRET`. This narrow authorisation excludes merge, deployment and provider credentials; no production setting is authorised.

`gh api --method PUT repos/helper-gsps/gsis/environments/gsis-v1-owner-approved` supplied the owner reviewer (user ID `349370590`) and custom branch policies. GitHub rejected it with HTTP403, `Resource not accessible by integration`. The subsequent environment list returned `total_count: 0`; creation did not succeed. No secret was generated or stored, no branch policy was created, and no remote setting changed. No available connector supports this environment mutation. This is a GitHub integration-permission blocker, not a rejected owner request or evidence of a GitHub-plan limitation. P1/P2 remain pending; an authorised connection with the required environment/secret API permissions, or owner setup in GitHub, is needed. Verify reviewer and exact-main branch protection before storing the secret. Merge and staging remain unauthorised.

## Owner-authorised deployment preparation, 14 November 2026

Owner instruction: “go 1”, referring to removal of seven provider-secret workflow references, third-party licence notice completion, exact-head verification and Claude review. Continue existing claim/branch/PR139; no merge or deployment authorised. Provisioning is a separate pending owner question.

- Refreshed main: `17226d5ca6c87f1a2b8520a7d394af12d72af351`; starting product head: `957d5f05489b3329bde43da8331462aaa6afc266`. Open PR actual-file overlap check found only this PR owns the deployment workflow/task; no other open PR owns the new Outfit notice path.
- Exact follow-up allowlist: `.github/workflows/v1-deploy.yml`, `contacts-update/public/signature-assets/OFL.txt` (licence text only), `docs/v1/accelerated-delivery/OPERATIONS.md`, and this task record. No production runtime, provider verification, dependencies, Core/Contacts contracts or generated output changes.
- Read main's PR139 Claude review including R1, current coordination records and v1 engineering policies. Claude remains independent exact-head reviewer.
- GitHub read-only verification: repository public; environment required reviewers helper-gsps/songwee saved with self-review permitted and custom branch policy. Screenshot still allows administrator bypass; owner asked to disable it. No settings changed by Codex.
- Owner accepts the eight publication-audit data categories as Official (Closed), harmless if publicly disclosed. This is disclosure acceptance, not a new open-source licence or credential disclosure authorisation.
- Skills: Cloudflare skill used for connected-account/resource capability inspection only. Existing engineering policies applied proportionately; no third-party skill vendored.
- Checks planned: workflow secret allowlist; upstream Outfit licence and embedded-font copyright comparison; canonical build/no tracked drift; product build with notice preservation; focused deployment test; full Node/LORD and exact-head CI. Runtime UAT remains Not tested; F5 OPEN.

Licence source: https://raw.githubusercontent.com/google/fonts/29e94d990c84a54f83644e7c43f42dfc9e1a4ac7/ofl/outfit/OFL.txt. Both bundled Outfit fonts embed the matching 2021 Outfit Project Authors copyright and SIL OFL 1.1 designation. The complete notice is added beside the fonts and copied by the existing v1 asset build. Existing KaTeX licence remains present.

### Preparation verification

- `TZ=Asia/Singapore npm run build`: passed; tracked changes remained limited to this follow-up allowlist, with no generated production drift.
- `TZ=Asia/Singapore node tests/v1-product-deployment.mjs`: passed actual-identity preflight, substituted production ID, duplicate stores and unreadable-resource negatives using synthetic providers.
- `TZ=Asia/Singapore node scripts/v1/build.mjs`: passed. Byte comparison confirms the complete Outfit OFL survives at `web/assets/contacts/signature-assets/OFL.txt`. Licence SHA-256: `c676351bf8576b9aba743cd5eaa8c0e7ee0d51f805d720447b4df4ddb6a2e416`.
- Workflow secret-reference assertion: exactly `CLOUDFLARE_API_TOKEN` and `GSIS_SECRET`; no seven provider references remain. `git diff --check`: passed.
- Full Node/LORD suite, all product programs and Worker dry-runs: exact-head CI pending; no earlier head's pass is attributed to this update. Claude updated-head review pending. Repository/PR evidence identifies the resulting SHA to avoid a self-referential task commit.
- Q01/Q02/Q03: bounded claimed scope and provider-inheritance fix checked; Q04/Q05: no transaction/concurrency/resource behaviour changed; Q06/Q07: focused/build checks pass, complete CI and independent review pending; Q08: no deployment/live verification, runtime UAT Not tested and F5 OPEN.
- Rollback before deployment: revert this follow-up; doing so restores inherited-provider-secret risk. Font notice addition changes no executable code. Historical release downloads are not rewritten; rebuilt packages carry the notice.

## Owner-authorised empty-store provisioning, 14 November 2026

Owner explicitly answered “create” to eight empty D1 databases and eight private R2 buckets in the connected account, with no deployment, migration, data import or paid-plan upgrade. This supersedes the earlier provisioning exclusion only for these sixteen stores. No other infrastructure operation is authorised.

Created 14 November 2026, 14:17–14:18 Asia/Singapore, in Cloudflare account `803fa9573f2829233f03e0c0290803d9`. Resource prefix: `gsis-v1-gsps`. D1 and R2 creation responses report APAC. Locations are placement, not a Singapore-only residency guarantee.

| Owner | Database and private bucket name | D1 database ID |
| --- | --- | --- |
| core | `gsis-v1-gsps-core` | `9052f79c-c08d-4750-9cc8-921aca085d75` |
| contacts | `gsis-v1-gsps-contacts` | `00229fd6-0b9e-4971-af9e-e2ce1a9850f8` |
| deploy | `gsis-v1-gsps-deploy` | `4e3e15fa-21d9-420c-b2b1-92947b58b059` |
| roster | `gsis-v1-gsps-roster` | `ece88c5d-7352-4604-9b3c-57afbe6ca2d9` |
| calendar | `gsis-v1-gsps-calendar` | `2a22aaf7-2512-4f58-86a8-ed9f5266db60` |
| lord | `gsis-v1-gsps-lord` | `26d05ebd-0e68-49a4-8319-57bb977574db` |
| venues | `gsis-v1-gsps-venues` | `a43aaed5-55d3-4b36-a958-3d80f1c053bd` |
| layout | `gsis-v1-gsps-layout` | `10b8a260-8197-413e-8d92-9f7c221cc740` |

Verification: re-listed all eight D1 databases (zero tables each); read each bucket's managed-domain and custom-domain settings (all eight `enabled:false`, all custom-domain lists empty). No SQL, migrations, object uploads, Workers deployment, routes, credentials, provider integrations or plan changes performed. Existing resources were not modified. Store provisioning is not a product deployment or runtime UAT. F5 OPEN; T1B-01/T1B-02 and unperformed runtime UAT remain Not tested.

The eight UUIDs above populate `GSIS_V1_SCHOOL_CONFIG.databases`; the names populate `buckets`. This inventory is not a complete deploy-ready school configuration: approved HTTPS origin, Google OAuth client/domain and verified bootstrap identity remain required. Do not dispatch the deployment yet. Resource removal would require a separate owner instruction and confirmation that the stores remain unused; none was deleted.
