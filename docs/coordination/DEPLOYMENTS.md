# Deployments and live configuration

What is live, when it changed and how to roll back. Record every production deployment and every live setting change. "Reported" means stated by the owner; "verified" means checked by a model with the evidence named.

## 17 Nov 2026, 06:40:10 SGT: v1.02 deployed

Model: Codex. Owner instructed "merge and deploy", then "deploy, 195 done". [Protected run 43971528994](https://github.com/helper-gsps/gsis/actions/runs/43971528994), attempt 1, succeeded at exact source [`d5c8899aeb867448ad7399f9925f46ac11371380`](https://github.com/helper-gsps/gsis/commit/d5c8899aeb867448ad7399f9925f46ac11371380). The live site is https://gsis.gsps.edu.sg. PR194 supplies the Deploy role Membership matrix and audited SMC/EO/School Leader publication through Contacts; PR195 advances the display label to v1.02. Global Admin grants remain separate.

- Reviewed and merged unchanged: PR194 head `9b3e90c48d8820933fa3866ccce8d003bfc9d5ab`, merge `37dbdd438017156e8f2455aef453c5ded5406fbc`; PR195 head `bb43c9344cc58dd6b48a7ca2d1ac45eb4387068e`, merge/deployed source above. Muse's exact-head approvals are in [PR194 review](review/pr194-muse-review.md) and [PR195 review](review/pr195-muse-review.md). Both merge comparisons differed from their approved heads only by the respective review document.
- Final-main CI passed at the deployed SHA: [Node/LORD 43967338294](https://github.com/helper-gsps/gsis/actions/runs/43967338294), 1,221/1,221 Node programs and 40/40 LORD checks in each shard; [product/package 43967343394](https://github.com/helper-gsps/gsis/actions/runs/43967343394), 120/120 programs, canonical build without drift, nine Worker dry runs and local migration verification. Artifact `14278850465`, SHA-256 `04b1126a7d482fafc5dd35fcb368124362cf85cb84b15a3d6f1d4cf899714538`.
- Fresh full SQL exports from all eight D1 owners were downloaded privately and imported into isolated local SQLite. Integrity, foreign keys, schema/columns/indexes/constraints and migration-ledger comparisons passed. Contacts was exported last and verified at 06:35:15 SGT, before dispatch at 06:35:35. Total SQL: 11,440,420 bytes; verification-manifest SHA-256 `15755af0aa242045ff0ba23e377465da5c7c0dcb97119fc56da9ddf237d54a4e`. Recovery bookmarks are retained privately. These are separate snapshots, not a cross-D1 atomic backup or a tested hosted restore. No SQL, signed URLs or staff records are published.
- GitHub retained required reviewers, main-only deployment and administrator bypass off. The integration's standard approval POST returned HTTP403; GitHub then recorded `songwee` approving the environment. The protected job started at 06:36:57. Provider credential upload stayed false. Contacts `0006_authority_publications.sql` applied at 06:37:28; seven other databases required no migration. Seventeen uploads covered nine Workers; only secret name `GSIS_SECRET` was uploaded. Secret values were not read or independently compared.
- Post-deployment metadata at 06:41:14 confirmed all nine Workers at the exact SHA and v1.02, unchanged resource/service bindings and safety flags, and exactly the expected Contacts schema/ledger addition. All eight R2 buckets remain private. Sender/webhook owners remain v0.9; scheduler disabled; Google/Drive integrations inactive; retention deletion false. No provider or Google activation, prune, import or staff permission publication was performed.
- Public checks passed 16/16 at 06:41:00–06:41:04: home, nine apps and Admin initial titles, Deploy slash redirect, configured public Core endpoint, unauthenticated session rejection and internal-route denial. The public `deploy-ui.js`, `deploy-publication.js` and `workbooks.mjs` files also matched the released source byte for byte. These checks used no login or staff records and made no application writes.

Authenticated Run B UAT, N-1 Roster save latency, hosted restore and actual school Memberships entry/publication remain unperformed by this release. F5 **OPEN**; official T1B-01/T1B-02 and runtime UAT **Not tested**. Preserve additive schemas, immutable publications, field frontiers, history, audit and receipts on recovery; an older binary alone is not a safe rollback after newer authority writes. Full ordinary deployment-tag/catalogue publish-back remains separate from the reviewed matrix/authority slice. See [release task](tasks/v1-release-v102.md#deployment-completion--17-november-2026).

## 16 Nov 2026, 18:07:13 SGT: v1.01 deployed

Model: Codex. Owner authorised `deploy v1.01`, required Memberships publish-back first, and approved the protected GitHub job. [Run 43843849886](https://github.com/helper-gsps/gsis/actions/runs/43843849886) succeeded at exact source [`8e85f3055b34b3262cde926efa7dc06c8fcf1a3b`](https://github.com/helper-gsps/gsis/commit/8e85f3055b34b3262cde926efa7dc06c8fcf1a3b). Reviewed PR192, PR191 and PR193 were merged without product hand edits. The detailed CI, reviews, artifact digest and private pre-deployment backup evidence are in [the release task](tasks/v1-release-label.md#protected-deployment-queued--16-november-2026-1753-sgt).

- Exact-head CI passed 117/117 product programs, all 1,218 Node programs across four shards and 40 LORD checks per shard; canonical build, nine Worker dry runs and local migration checks passed. All eight private full application D1 exports passed local import/integrity/schema/ledger checks before dispatch, with Contacts last. These are separate owner snapshots; hosted restore remains Not tested.
- Three additive migrations applied: Core `0005_drive_connection.sql`, Contacts `0005_membership_publications.sql`, Roster `0005_workload_snapshot.sql`. Five owners reported no migrations to apply. Seventeen uploads covered nine Workers. Provider credential upload stayed false.
- Read-only post-deploy verification confirmed all nine live Workers at the exact source and `v1.01`, the existing origin, database/bucket identities and full named-entrypoint service graph. Sender/webhook ownership remains v0.9; scheduler disabled; Drive/helper flags absent; retention deletion false. Only secret name `GSIS_SECRET` is installed. No provider, Google integration or prune activation occurred.
- Public smoke checks passed 16/16 at 22:57:57–22:58:01 SGT: home, nine apps and Admin returned 200 with v1.01 initial titles; `/deploy` redirected to `/deploy/`; public configuration was configured; cookie-free session returned 401; both internal probes returned 404. These checks did not sign in, inspect staff records or perform writes. Metadata queries verified the three migration ledgers and four new tables with zero rows written.
- Memberships still require owner-reviewed entry/import and publication; the code did not populate staff facts. Runtime/authenticated Run B UAT, N-1 save latency and hosted recovery remain **Not tested**. F5 **OPEN**; official T1B-01/T1B-02 **Not tested**. Preserve additive schemas, immutable publications, history, receipts and Memberships frontiers on any separately approved recovery; an older binary alone is not a safe rollback after newer writes.

## 15 Nov 2026, 06:55:04 SGT: reviewed v0.9 integration deployed to v1

Owner instruction: “merge and deploy, i approve”. Codex merged [PR154](https://github.com/helper-gsps/gsis/pull/154) at `591fb3ed587239ae2de309c0a15eca782f838d74`, then [PR155](https://github.com/helper-gsps/gsis/pull/155) at exact tested/deployed main SHA [`26bbccd229962700409bb6e9c80b1e9bec170d20`](https://github.com/helper-gsps/gsis/commit/26bbccd229962700409bb6e9c80b1e9bec170d20), without hand edits. The approved heads are `344141ac413eca2478518c92d7b3c17d671c17a4` and `a37869acd1ebf4e85a9a9f8f29741fe96214531f`; [Claude's exact-head review](https://github.com/helper-gsps/gsis/blob/29915fbe6a33329bf7f9bf1a998aca9aaf33bd52/docs/coordination/review/pr154-155-claude-review.md) is recorded on main. The update preserves v1 labels while reusing updated v0.9 frontend source, and integrates dated ad hoc relief eligibility without changing Contacts employment status or general messaging authority.

- Combined-main CI passed at the exact candidate, attempt 1 and `TZ=Asia/Singapore`: [full Node/LORD run 43649420498](https://github.com/helper-gsps/gsis/actions/runs/43649420498), 1,172/1,172 Node programs (293 per shard), 40/40 LORD checks in each of four shards; [product run 43649422660](https://github.com/helper-gsps/gsis/actions/runs/43649422660), 73/73 programs, canonical build/no tracked drift, nine Worker dry runs and local migration-upgrade checks. Artifact `14134904913` has SHA-256 `d5e6b6015307db0bab8d86c0465824204de35578ab5019f9b81a57f3dbc32a75`.
- [Deployment run 43650254322](https://github.com/helper-gsps/gsis/actions/runs/43650254322), attempt 1, **succeeded at 06:55:04 SGT** on the exact deployed head. Dispatch was at 06:51:24 with `confirmation=DEPLOY ISOLATED V1`, `upload_provider_credentials=false`. The integration's approval POST returned HTTP403 despite `can_approve=true`; the owner reported browser approval and the protected job started at 06:53:06. The apply step started at 06:53:24; uploads finished at 06:55:00. No bypass was used.
- Workflow results: all eight owner D1 checks reported `No migrations to apply`; 17 uploads covered nine distinct Workers, and nine bulk-secret uploads installed only `GSIS_SECRET`. Resource-identity validation passed, with no deployment error. No provider credentials, staff import, backup/prune action or provider activation were involved.
- Read-only checks before and after deployment: all nine Workers moved from `889669aef44cebbfd22e7aba8ca9ab95dc21f67e` to exact `26bbccd229962700409bb6e9c80b1e9bec170d20`. The approved origin, all 16 D1/R2 binding identities, service graph, sender/webhook owners `v0.9`, scheduler disabled, Drive flag absent, retention deletion false and only `GSIS_SECRET` among secret names are unchanged. Bootstrap settings remain present; cleanup is pending and no grant/authentication records were read. Environment metadata confirms required reviewers `helper-gsps`/`songwee`, self-review allowed, administrator bypass off and `main` only. Raw configuration reads returned HTTP403; the workflow's validation passed.
- Public checks passed at 06:57:18–06:57:22 SGT: home, nine apps and Admin returned 200; `/deploy` redirected 308 to the exact slash URL; Core config returned 200/configured; cookie-free session returned 401; both internal-route probes returned 404. All 16 checks passed. Four Roster JavaScript assets returned 200/`text/javascript` and matched the tested-head build byte counts/SHA-256 hashes recorded in [the product task](tasks/v1-product.md#reviewed-v09-integration-15-november-2026). Initial Node-fetch requests all failed with `ECONNREFUSED` before HTTP; the same 20 checks passed using `curl -q` through the supported proxy, without application changes. This failed transport attempt is not application-defect evidence. No authenticated runtime result is claimed.
- This release adds no schema migration. Preserve existing D1/R2 data and operation/recovery journals on rollback. The owner's release instruction supersedes the earlier no-merge/no-deploy task limits for these two reviewed PRs only; provider activation, Drive/pruning actions and v0.9 takeover remain outside this release.
- F5 remains **OPEN**. Official T1B-01/T1B-02, hosted durable recovery, real provider delivery and unperformed runtime UAT remain **Not tested**. The four-path documentation scope, exact source references and remaining gates are recorded in [the existing product task](tasks/v1-product.md#reviewed-v09-integration-15-november-2026).

## 14 Nov 2026, 22:42:49 SGT: reviewed v1 change queue deployed

Owner authorised “after CI, deploy. i authorize.” and approved the protected GitHub environment job in the browser after the integration's approval request returned HTTP403. Model: Codex. [Deployment run 43605950624](https://github.com/helper-gsps/gsis/actions/runs/43605950624), attempt 1, succeeded at exact main/deployed SHA [`889669aef44cebbfd22e7aba8ca9ab95dc21f67e`](https://github.com/helper-gsps/gsis/commit/889669aef44cebbfd22e7aba8ca9ab95dc21f67e). This updates the existing https://gsis.gsps.edu.sg prototype with the reviewed PR145–152 queue; it does not transfer v0.9 production authority. The final merges were PR148 at `bb2a54a87ba6c85b24aa914badfca0df9189d78c` and PR151 at the deployed SHA.

- Pre-deployment exact-head CI: [full regression run 43605031249](https://github.com/helper-gsps/gsis/actions/runs/43605031249) passed 1,166/1,166 Node programs across four shards and 40/40 LORD checks in each shard; [product run 43605033485](https://github.com/helper-gsps/gsis/actions/runs/43605033485) passed 69/69 programs, canonical build/no tracked drift and generated Worker validation. Both tested the deployed SHA with `TZ=Asia/Singapore`.
- Workflow inputs: `confirmation=DEPLOY ISOLATED V1`, `upload_provider_credentials=false`. Existing resource-identity/configuration validation passed. Seventeen pending additive migrations applied: `0002-drive-backup.sql` and `0004_storage_cleanup.sql` in each of eight owner D1 databases, plus LORD `0003_reign_archive.sql`. Seventeen Worker uploads covered nine distinct Workers: eight owners first without service bindings, then all eight with the full graph plus web. No stores were deleted or imported.
- Post-deploy read-only Cloudflare settings checks verified all nine Workers report the exact deployed SHA and `PUBLIC_ORIGIN=https://gsis.gsps.edu.sg`; `SEND_OWNER`/`WEBHOOK_OWNER` remain `v0.9`, `SCHEDULER_OWNER=disabled`, `DRIVE_BACKUP_ENABLED` is absent and `RETENTION_DELETE_ENABLED=false`. Full service bindings were restored; each owner has one D1 and one R2 binding, and web has neither. Only `GSIS_SECRET` is installed as a secret name. Provider upload stayed off; no backup, prune, provider send or webhook activation was performed. Existing v0.9 resources/routes were unchanged.
- All 16 public HTTP checks passed after success: home and `/contacts/`, `/deploy/`, `/roster/`, `/calendar/`, `/layout/`, `/venues/`, `/lord/`, `/overlord/`, `/starlord/`, `/admin/` returned 200; `/deploy` returned 308 to `/deploy/`; `/api/core/config` returned 200/configured; cookie-free `/api/core/session` returned 401; `/internal/probe` and `/api/core/internal/probe` returned 404. These are routing/configuration/authentication-boundary checks, not authenticated user journeys.
- Pending: bootstrap email/subject settings remain on all nine Workers. Remove them from the GitHub configuration source and deploy the approved cleanup as documented in [OPERATIONS](../v1/accelerated-delivery/OPERATIONS.md); no cleanup was performed and the durable Admin grant was not inspected. GitHub environment-variable reads returned HTTP403, so source configuration was not independently inspected. F5 stays OPEN; hosted durable recovery, official T1B-01/T1B-02 and unperformed runtime UAT remain Not tested. N-1 Roster save-latency measurement is pending. Drive retention remains an owner choice; no automatic deletion was activated.
- Rollback: retain the additive schemas, D1/R2 data and recovery/audit journals. Restore previous reviewed Worker code only after schema/data compatibility checks and owner approval; code rollback does not undo migrations or accepted writes. Do not delete stores or move v0.9 traffic. Detailed commands/evidence and the documentation-only handoff are in [the existing task](tasks/v1-product.md#reviewed-change-queue-deployment-14-november-2026).

## 14 Nov 2026, approximately 14:52 SGT: isolated v1 prototype deployed and routed

Owner explicitly authorised merge, deployment and hostname attachment; then approved the GitHub environment job in browser. Model: Codex. Reviewed PR139 head `686af2fc803d9d035020d364705dbfae0b3be32f`; deployed merge SHA `f1a5d32fdca3154ebb30d5c4fd8f6a9501185d03`. [Successful deployment run](https://github.com/helper-gsps/gsis/actions/runs/43568056552).

- Live prototype: https://gsis.gsps.edu.sg, gateway `gsis-v1-gsps-web`; eight owner Workers and isolated D1/R2 stores use prefix `gsis-v1-gsps`. Existing v0.9 routes/resources unchanged.
- Verified all nine Worker settings: exact deployed SHA, correct origin, scheduler disabled, sender/webhook owners v0.9, only GSIS_SECRET secret name. No provider credentials installed.
- HTTP checks: home and Contacts/Deploy/Roster/Calendar/Layout/Venues/LORD/OVERLORD/STARLORD pages 200; public Core sign-in configuration 200/configured; unauthenticated session 401. Initial urllib checks gave 403, later curl checks passed; cause not established. These checks do not prove authenticated browser journeys.
- Pending: owner first Admin sign-in, durable grant confirmation, remove bootstrap settings from GitHub source and all Workers through approved configuration deployment. No staff-data import. F5 OPEN; official T1B-01/T1B-02 and unperformed runtime UAT Not tested.
- Rollback: if the prototype must be withdrawn, detach only this v1 hostname after owner instruction. Do not delete databases, buckets, grants or receipts, and do not redirect v0.9 traffic. Code rollback does not reverse D1 migrations or subsequent accepted writes. No temporary authority or messaging switch was enabled.

## 31 Oct 2026 14:06 SGT: v0.9.9d (main 5c202c0), reported by owner

Bundle `deploy/2026-10-31-v0.9.9d`. Same six components. Adds resumable D1 import preparation (PR #32) and immutable allocation audit versions.
- Owner checks: Roster and Deploy headers v0.9.9d; Assign Relief, System Config, Storage, LORD, Calendar load.
- D1 job health 14:06 (verified by Claude): all jobs idle; only peer-mail (known) and one webhook failure in the last 45 minutes.
- Rollback constraint: once a v0.9.9d import starts, keep the Roster backend at v0.9.9d or later.
- Next: owner rehearsal import (explicit restart of the failed 31 Oct session).

## 31 Oct 2026 10:07 SGT: v0.9.9c (main ef037a2), reported by owner

Bundle `deploy/2026-10-31-v0.9.9c`. Deployed the same six components as v0.9.9b (Roster and Deploy backends and frontends, both Workers). Adds nightly cold-output archive (PR #28).
- Owner checks (31 Oct): Roster and Deploy headers v0.9.9c; Prune records now Storage with Archive now; Assign Relief, System Config, LORD and Calendar load.
- **Rollback constraint:** after the first archive run (first evening 16:00 to 24:00 after deploy, i.e. 31 Oct evening), never roll the Roster backend back to v0.9.9b or earlier; it cannot read archived items.
- D1 job health 10:07 (verified by Claude): last hour only peer-mail (known, 46), one webhook and one notifications timeout before the deploy.

## 31 Oct 2026 ~05:00 SGT: v0.9.9b (main 6eb943f), reported by owner

Bundle `deploy/2026-10-31-v0.9.9b` (branch, folder `deploy-bundle`; SHA256SUMS inside). Deployed: Roster backend, Deploy backend, Roster frontend, gsis-roster-notifications, gsis-operations, Deploy frontend. Not deployed: optional label-only zips for Contacts, Layout, Calendar, LORD, OVERLORD, STARLORD, Venues (still show v0.9.9).
- Owner checks (31 Oct): header v0.9.9b, System Config loads, published chip, SIUE fields, LORD and Calendar load: all yes. All 12 held absence reports retried and cleared.
- Live setting: Apps Script "Roster GSiS" Script Property `ROSTER_OPERATIONS_MAX_CHARS=24000000` (set 31 Oct ~04:30; an earlier entry in Cloudflare variables has no effect).
- D1 job health 05:09 (verified by Claude): intake, allocation, notifications, inbox, webhook idle since ~05:03. peer-mail still fails each minute (changelog entry 31 Oct).
- Storage report 04:47: 16,079,661 of 24,000,000 characters.
- Rollback: Apps Script previous versions; Pages and Workers previous deployments (30 Oct bundle 6bb4844).

## 30 Oct 2026 evening: bundle 6bb4844 (v0.9.9a label), reported by owner
Backends and Workers deployed first; the first two frontend uploads failed (raw-folder zips with unbundled `_worker.js`). Replaced by release-built zips the same evening and deployed. Lesson: frontend zips come only from the release build.

## Current production (best known, 29 Oct 2026 05:30 SGT)

Eighteen production components. "Reported" = stated by the owner; "verified" = checked by a model with the named evidence.

| # | Component | Build | Status and evidence |
| --- | --- | --- | --- |
| 1 | Roster backend (Apps Script) | 0.9.9a-importfix, SHA-256 `2a8a81b2…fb20d` (includes latest-wins) | Reported 29 Oct ~05:03 |
| 2 | Roster frontend (Pages, roster.gsps.edu.sg) | 0.9.9a latest-wins or the v0.9.9a label build | Reported; central review list visible in owner screenshot ~04:37; exact zip unconfirmed |
| 3 | Calendar backend | 0.9.9 | Reported 28 Oct |
| 4 | Calendar frontend | 0.9.9 | Reported 28 Oct; a queued save on 0.9.9 Worker code verified at 21:11 (D1 `calendar_jobs`) |
| 5 | Contacts backend | 0.9.9 | Reported 28 Oct |
| 6 | Contacts frontend | 0.9.9 | Reported 28 Oct |
| 7 | Deploy backend | 0.9.9 | Reported 28 Oct |
| 8 | Deploy frontend | 0.9.9 | Reported 28 Oct |
| 9 | Layout frontend | 0.9.9 | Reported 28 Oct |
| 10 | LORD backend | 0.9.9 | Reported 28 Oct |
| 11 | LORD frontend | 0.9.9 | Reported 28 Oct |
| 12 | OVERLORD frontend | 0.9.9 | Reported 28 Oct |
| 13 | STARLORD frontend | 0.9.9 | Reported 28 Oct |
| 14 | Venues backend | 0.9.9 | Reported 28 Oct |
| 15 | Venues frontend | 0.9.9 | Reported 28 Oct |
| 16 | `gsis-calendar-jobs` Worker | 0.9.9 | Verified: deployed code header reads "release 0.9.9" (read via Cloudflare API, 28 Oct ~21:10) |
| 17 | `gsis-operations` Worker | 0.9.9 | Reported; modified 28 Oct 21:04 SGT (modification time only, not version evidence) |
| 18 | `gsis-roster-notifications` Worker | 0.9.9 | Reported; modified 28 Oct 21:04 SGT (modification time only, not version evidence) |

The owner reported all 18 showing v0.9.9 on 28 Oct (version sweep).

## Log (newest first)

| When (SGT) | Change | Who | Rollback / revert-by |
| --- | --- | --- | --- |
| 29 Oct 05:07 | `GSIS_RECOVERY_MODE=false` on `gsis-roster-notifications` (pause ended) | Owner | Reported by owner; verified: D1 `gsis_job_health` shows received-reports 05:18, inbox 05:19, notifications 05:21, audit-export 05:22, allocation 05:23, peer-mail 05:23 |
| 29 Oct ~04:50 | `GSIS_RECOVERY_MODE=true` on `gsis-roster-notifications` (pauses all scheduled jobs) | Owner | Reverted 05:07 (row above) |
| 29 Oct ~05:03 | Roster backend 0.9.9a-importfix | Owner | Apps Script previous version |
| 29 Oct ~04:35 | Roster frontend 0.9.9a-latestwins (`85ccb4dc…923c`) | Owner | Pages previous deployment |
| 29 Oct ~04:05 | Roster frontend 0.9.9a-d1prep (`c454bc6e…ab10c`); R2 `gsis-roster-snapshots` bound as `ROSTER_TIMETABLE_SNAPSHOTS`; `ROSTER_D1_PREPARE=import` | Owner | Pages previous deployment; remove variable |
| 28 Oct ~21:04 | 18 components to 0.9.9 | Owner | Previous Apps Script versions / Pages deployments |

## D1 import status
Not imported. Three attempts on 29 Oct failed safely (absence queue, Roster changed during export, Worker response unreadable). D1 scopes `roster`, `roster-register`, `roster-references` remain `legacy`, revision 0, verified by query at ~05:06.
