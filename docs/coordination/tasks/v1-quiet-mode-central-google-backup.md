# Queued v1 changes: native Roster and central Google backup adapter

- Status: Q1 queued; Q2 design written, documentation checks passed, exact-head CI and Claude review pending. No product implementation or activation.
- Owner/model: Codex. Coordinator: ChatGPT v1. Independent reviewer: Claude, exact head.
- Updated: 16 November 2026, Asia/Singapore.
- Refreshed main: `404fe6d043e7c22eba2a3070cbfdbedb544112cd`.
- Source: owner's latest changelog instruction, after the independent Roster workload-copy correction and absence acceptance simplification.
- Branch for Q2: `codex/v1-central-google-backup-plan`.
- Exact Q2 documentation scope: this task record and `docs/v1/core/CENTRAL_GOOGLE_BACKUP_PLAN.md`. No product ownership is claimed over either current implementation.
- Coordination: the owner's new planning request is independent of PR183's running verification. This separate documentation task does not start another implementation PR, change the save-lock/absence implementation order, or depend on an unreviewed product branch. Actual file inventories for open PR182 and PR183 have no overlap with these two paths.

## Q1 — Native D1 Roster does not require migration quiet mode

Owner: “v1 roster should not need a quiet mode since everything is native D1”. Inspect the v1-built screens and authoritative operation paths, trace every inherited quiet-mode check to its purpose, and remove the Google migration prerequisite and obsolete controls in a separate bounded v1 change. Do not change the v0.9 migration/Google-first lane.

Preserve native D1 transaction/revision guards, durable request identities, uncertain-outcome recovery, necessary editing leases and provider notification controls. A provider-sending pause or security gate must not be silently removed under the name of migration quiet mode. Existing data and configuration are not changed by this queued request. Prove native saves and recovery through the actual built browser/Worker/D1 before claiming completion.

## Q2 — Plan one Core-managed Apps Script file reader/writer

Owner directs all GSiS Google backups through a central, general-purpose Apps Script file I/O adapter, with logical subdirectories beneath [the approved GSiS v1 root folder](https://drive.google.com/drive/folders/1HJDMM-_88cuKwL7-HyQO08pgeAdEtb3k). This requests a plan; no Apps Script creation/deployment, Drive write, credentials, backup activation or storage cleanup is authorised here.

The plan must reconcile the existing Core backup contract and adapters, then specify:

1. Core owns backup orchestration, destination routing and System Health status. Each application retains its authoritative D1/R2 data and export/import schema. Apps Script performs authenticated, bounded file I/O; it is not a fallback application database or a second authority for staff, permissions or allocation.
2. Reuse the approved folder structure: Calendar, Contacts, Deploy, Roster, LORD, and Layout and Venues, with further logical subdirectories where needed. Verify mappings without inspecting live school file contents. Folder sharing remains owner-managed.
3. Human-readable files, mostly Excel and compatible with frontend import. Preserve source/schema identity and checksums alongside readable data. Retain the agreed sortable naming convention, for example `2026 11Nov 14 170000`, using Asia/Singapore time and time only where necessary.
4. At most one current file per logical dataset per Singapore day; same-day updates overwrite that logical file. Avoid duplicate files after retries or lost responses by using a stable dataset/day operation identity and durable result reconciliation. Multi-file completion must be explicit, not an unsupported atomic Drive transaction claim.
5. Backup can lag D1/R2 and catch up independently. The 23:50 daily freshness check compares content/source revision; months-old files are fresh if the underlying data is unchanged. Surface freshness, lag, failure and recovery in Admin System Health only.
6. Use the file reader for explicit restore/import verification and download, with allowlisted school/folder/file ownership. Browser users do not receive backend credentials. Specify authentication, request replay protection, operation identity, payload/time bounds, unknown outcomes and retriable vs final errors. Reuse the existing v1 secret separation; do not rotate provider tokens or weaken Google/Cloudflare permission checks.
7. Keep Google retention owner-controlled: direct deletion in Drive is permitted by the existing owner decision, but automatic deletion remains unapproved. D1/R2 prune policy is separate; a readable backup alone is not proof that authoritative storage can be deleted.
8. Identify the smallest migration from current per-owner Google adapters to the central interface, including how queued backups and existing file IDs remain recoverable. Do not implement this migration as part of planning.

## Next task boundaries

Q2 now produces the bounded design in `docs/v1/core/CENTRAL_GOOGLE_BACKUP_PLAN.md`, with exact source references, interfaces, recovery and proposed acceptance tests. Publish it through its own documentation PR for Claude's exact-head review. Q1 implementation remains queued after the current correction pipeline and needs a separate exact-path claim; neither item is added to PR183 or the absence PR. Questions to the owner are reserved for genuine policy, retention, account authority or deployment choices, not routine interface naming.

## Q2 design handoff

Accepted documentation claim: `2f9095e9ac0ada32c548ea9f922c7a6a3859c3fa`. The [central backup plan](../../v1/core/CENTRAL_GOOGLE_BACKUP_PLAN.md) records the narrow exception to direct-Google-API transport, authoritative owner export boundaries, folder mapping, one current file per dataset/day, Core/Apps Script authentication, durable intent and readback, bounded catch-up, the 23:50 content-based check, transition and rollback, no automatic retention deletion, and concrete future acceptance tests. Current exports are distinguished from unsupported imports and private full owner backups.

Read-only Q1 finding: the inherited Roster UI renders the switch and calls `/quiet-mode`; the current probe allowlist identifies that absent route as F08. Removing the v1 caller is queued; no native handler or pause is added. Notification quiet hours and storage/recovery guards remain separate.

Verification: `git diff --check` passed; a Python check resolved all 12 relative Markdown links across the two documentation files; exact changed-path/type inspection confirms documentation only. The reproducible link-check command is in the PR evidence. No application tests were invented for prose. Local build/Node/LORD/product suites were not rerun for this documentation-only change; automatic exact-head regression CI and its build result are recorded in the PR when complete. No hosted/provider or Apps Script tests have run. Repository ownership, simplicity, recovery and verification principles were applied; no skill package was executed or vendored.

Q01: accepted two-path claim and disjoint open-PR inventories. Q02-Q05: proposed ownership, error states, security/recovery and limits documented, not implemented guarantees. Q06: documentation links/scope/whitespace pass; exact-head CI pending. Q07: Claude exact-head review pending. Q08: implementation/activation not authorised by this plan. Next: review the plan, then claim small implementation packages separately; Q1 follows the existing correction pipeline.

No live Drive/Cloudflare reads or writes, notification sends, infrastructure, credential changes, merge or deployment. F5 remains OPEN. Official T1B-01/T1B-02 and unperformed hosted/runtime UAT remain **Not tested**.
