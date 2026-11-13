# GSiS v1 isolated product release record

This is a reviewable isolated implementation, not an authorised production release. The owner authorised building and testing the full product. Merge, Cloudflare provisioning, live migration, real notifications and production cutover still require their applicable explicit authority. Historical approvals of library or planning work do not substitute for the current product's exact-head review and evidence.

The source baseline is `27fa498657965169b9d971a9caabc33c8b19bc69`; the controlling accelerated specification is v1.1 at `f39b671ac6da3f389c58345ce4f5c035f1cb3f65`. Implementation branch: `codex/v1-product`. The exact release candidate head, tested head and CI outcomes are recorded in [VERIFICATION.md](VERIFICATION.md) and the bounded product PR. Do not treat the earlier claim commit or requirements commit as an implementation test result.

## Artifact inventory

[build.mjs](../../../scripts/v1/build.mjs) produces `deliverables/v1/product/` from the current checkout. Generated artifacts are separate from tracked production outputs.

| Artifact | Contents and purpose |
| --- | --- |
| `manifest.json` | Exact source commit, dirty-tree flag, school identity, runtime compatibility date, nine service identities and SHA-256/byte inventory for every packaged file; `productionDeployed:false` |
| `web/worker.mjs`, `web/wrangler.json` | Unified same-origin gateway, internal-route denial, security headers, assets and owner Service Bindings |
| `web/assets/` | Copied/adapted Contacts, Deploy, Roster, Calendar, Layout, Venues, LORD, OVERLORD and STARLORD frontends, Core administration/shared adapters, asset provenance inventory |
| `<owner>/worker.mjs` | Bundled Core, Contacts, Deploy, Roster, Calendar, Venues, Layout or LORD owner implementation |
| `<owner>/wrangler.json` | Isolated Worker identity, own DB/R2 bindings, explicit cross-owner/named capability bindings, scheduler definition and non-secret school settings |
| `<owner>/migrations/0001_owner.sql` | Shared receipt/admission/outbox schema plus that owner's versioned schema; source migrations remain under `v1/migrations/` |
| `GSiS-v1-local-build.tar.gz` | GitHub build artifact containing the generated `product/` tree and `evidence/` results/screenshots, named by the workflow's exact source SHA |
| Exact-commit repository source archive | Source, tests, specifications present at that commit, build scripts, dependency locks and notices; obtain from GitHub at `manifest.sourceCommit`, not a moving branch |

The topology has eight domain databases, eight private artifact buckets and one gateway in addition to the eight domain Workers. The allocator is a replaceable pure module included with Roster; it does not introduce another authoritative database. Runtime compatibility is pinned to `2026-08-06`, matching the locked local Workers test runtime. The v1 deployment tool dependency is separately locked in `v1/package-lock.json`. Source/vendor licences and attribution remain with the repository and copied assets; no third-party skill repository is included.

A dirty-tree build is development evidence only. An accepted release artifact must identify the reviewed commit and must not claim an uncommitted tree is that commit. Retain the downloadable source and build artifacts with the exact-head verification record.

## Reproducible preparation

Use Node 24.15 or later within the supported Node 24 line and the repository lockfiles. These commands build and test locally; they do not deploy:

```sh
npm ci
TZ=Asia/Singapore npm run build
TZ=Asia/Singapore node scripts/v1/test.mjs --list
TZ=Asia/Singapore node scripts/v1/test.mjs
TZ=Asia/Singapore node scripts/v1/build.mjs
TZ=Asia/Singapore npm test
```

The product runner discovers `tests/v1-product-*.mjs`. Its actual outcomes, browser executable setup, canonical no-drift evidence and full Node/LORD results must be taken from VERIFICATION.md. Listing a command here is not evidence that it passed. Browser tests require the locked Playwright Chromium installation or an explicitly recorded compatible executable.

`.github/workflows/v1-build.yml` builds the production baseline to check for drift, runs the isolated product suite, generates the product and uploads the exact-SHA artifact. `.github/workflows/v1-deploy.yml` is a separate owner-triggered workflow using the protected `gsis-v1-owner-approved` environment. It requires the literal isolated-deployment confirmation, an approved school configuration and already provisioned isolated resources. It does not silently provision them. Read OPERATIONS.md before any authorised deployment run, including service-binding bootstrap requirements and recovery from a partial run.

## Configuration and provider boundaries

`v1/config/school.example.json` contains synthetic placeholders, not deployable school credentials or resource IDs. `scripts/v1/prepare-deployment.mjs` checks owner-supplied isolated database/bucket identities and keeps sender, scheduler and webhook ownership inactive for the initial deployment. The generated configuration must resolve every service binding, private store, Google client/domain/origin and required provider destination before the corresponding runtime check can pass.

The backend integration secret is named `GSIS_SECRET`. The [13 November owner decision at `66e922f`](https://github.com/helper-gsps/gsis/blob/66e922f34307fd1f29f36f19d2f993c1114d99b4/docs/coordination/review/pr139-claude-review.md) requires a new v1-only value, different from production, stored as a secret of GitHub environment `gsis-v1-owner-approved` and shared only across v1 Workers. It authenticates service membership, never a browser actor or staff privilege. Provider credentials stay unset in v1 until separately approved cutover, including verification that repository/organisation secrets are not inherited. At that cutover, existing WhatsApp and Telegram tokens are reused unchanged; migration does not require provider-token rotation. Provider-required webhook secrets, Google credentials and email credentials retain their separate verification purposes. GitHub is the deployment source for the v1 secret; a Cloudflare-only change is overwritten on redeployment. Do not put secret values in configuration JSON, source archives, browser assets, screenshots or logs. Follow OPERATIONS.md for protected `main`-only deployment and removal of bootstrap identity settings after the first Admin sign-in.

The following are separate operational verification items, not implied by local synthetic adapters:

- Google school sign-in, account linkage, initial administrator setup and current permission checks.
- Google Calendar and Drive destinations, service-account/API access, readable export readback and unknown-outcome reconciliation.
- Existing approved WhatsApp templates/business configuration, Telegram destinations, email provider/audience checks and provider webhook verification.
- Scheduled work and final audience revalidation under the intended owner switches.
- Isolated D1/R2 backup and full-suite restore rehearsal, safe retention capacity and administrator recovery.
- Browser-only school installation, migration rehearsal, permission-negative UAT, latency/scale observations and final production hostname/deep-link cutover.

## Review and release gates

Before calling the artifact releasable, record the precise PR head/base and changed-file inventory; complete the required Q01–Q08 evidence; obtain Claude's independent review of that exact head; check CI and full regressions at the reviewed candidate; resolve material findings; and complete the applicable runtime UAT and owner acceptance. Any code change advances the head and requires review of the new head.

The separately inspected PR138 aSc reference at `d573748e95addfa4dc10cb359e2ecf609d60ef0d` does not certify application import. Existing local Draft-format export and settings persistence are preserved; mixed-subject partition overrides, existing-template preservation and new queued structural/page work remain unsupported or separately scoped. Installed-aSc import/generation/reimport/round-trip acceptance is **Not tested**; see the concrete disposition in PARITY.md.

F5 stays **OPEN** until durable recovery is demonstrated and its evidence reviewed. Synthetic contract tests alone do not close it. Official T1B-01/T1B-02 and all unperformed runtime UAT remain **Not tested**. No local run proves a live provider outcome, a physical LORD return, actual school data migration or production readiness. PARITY.md records implemented surfaces and explicit gaps without converting initial-screen browser checks into complete workflow coverage.

## Rollback and recovery implications

Before deployment, reverting the isolated source and discarding generated artifacts affects no production data. After an eventual isolated deployment, disabling new routes/senders/schedulers and returning users to the unchanged operational system is a configuration action that requires the applicable owner authority. A failed isolated deployment can leave some schemas or Workers updated; retain its exact log/artifact and reconcile rather than claiming automatic rollback.

After any authorised live v1 writes, a code rollback is not a data rollback. Preserve immutable publications, Contacts/authority evidence, operation identities, field acceptance audits, provider identities and outbox uncertainty. Restore only to isolated empty owner targets; verify destination bytes/records, fence restored unfinished writers, reconcile unresolved pins and dispatch outcomes across the suite, and keep activation disabled until that work is complete. Never infer a cross-D1 transaction or resend a provider message solely because an older backup says it was queued.
