# Queued v1 changes: native Roster and central Google backup adapter

- Status: Q1 queued; Q2 revised by owner to direct Drive API, no Apps Script, private Shared Drive and helper@gsps.edu.sg. Documentation checks and updated-head CI/review are recorded below. No product implementation or activation.
- Owner/model: Codex. Coordinator: ChatGPT v1. Independent reviewer: Claude, exact head.
- Updated: 16 November 2026, Asia/Singapore.
- Original source main: `404fe6d043e7c22eba2a3070cbfdbedb544112cd`; refreshed main for this revision: `f22f730f5da243baf16d14834289652ef1425c3a`.
- Source: owner's latest changelog instruction, after the independent Roster workload-copy correction and absence acceptance simplification.
- Branch for Q2: `codex/v1-central-google-backup-plan`.
- Exact Q2 documentation scope: this task record and `docs/v1/core/CENTRAL_GOOGLE_BACKUP_PLAN.md`. No product ownership is claimed over either current implementation.
- Coordination: this remains the same claimed two-path documentation PR184, not another implementation PR or a change to the save-lock/absence pipeline. Refreshed open PR182 (`592fac9982b8935b1d14b8bbff500a1af78aa2c7`) and PR183 (`9d6db12edf510a34a19516e901e9fb9531b703e4`) retain their previously inspected file inventories, disjoint from these two paths. No other model's work or main review record is edited.

## Q1 — Native D1 Roster does not require migration quiet mode

Owner: “v1 roster should not need a quiet mode since everything is native D1”. Inspect the v1-built screens and authoritative operation paths, trace every inherited quiet-mode check to its purpose, and remove the Google migration prerequisite and obsolete controls in a separate bounded v1 change. Do not change the v0.9 migration/Google-first lane.

Preserve native D1 transaction/revision guards, durable request identities, uncertain-outcome recovery, necessary editing leases and provider notification controls. A provider-sending pause or security gate must not be silently removed under the name of migration quiet mode. Existing data and configuration are not changed by this queued request. Prove native saves and recovery through the actual built browser/Worker/D1 before claiming completion.

## Q2 — One Core-managed direct Google Drive API service

Owner's latest decision, 16 November: **“no appscript”**; the [provided destination](https://drive.google.com/drive/folders/1HJDMM-_88cuKwL7-HyQO08pgeAdEtb3k) is a **private Shared Drive, not public**; the designated backup account is **helper@gsps.edu.sg**. This replaces the earlier Apps Script transport instruction and the reviewed design at `688e2aef42f3c552645cd7e1d65df1b5b410d9fa`. Use Core → Google Drive API directly, retaining central orchestration and the approved file/folder rules. No Drive reads/writes, credentials, sharing change, OAuth setup, backup activation or storage cleanup is authorised by this documentation edit.

The named address is a dedicated Google Workspace user, not Google Cloud IAM service-account JSON. Use its server-side offline OAuth authorization, renewable access tokens and protected backend credential storage. Do not introduce domain-wide delegation or ask the owner to choose another identity. The identity/privacy statements come from the owner; actual sign-in capability, OAuth policy and drive permissions have not been inspected.

The plan must reconcile the existing Core backup contract and adapters, then specify:

1. Core owns backup orchestration, destination routing, bounded direct Drive API I/O and System Health status. Each application retains its D1/R2 data and export/import schema. Reuse the existing direct upload/verification adapter; there is no script project, endpoint, trigger or fallback application database.
2. Reuse the approved folder structure: Calendar, Contacts, Deploy, Roster, LORD, and Layout and Venues, with further logical subdirectories where needed. Registered root/child folder IDs and the actual Shared Drive ID must be verified during separately authorised setup. Keep the destination private; folder sharing remains owner-managed.
3. Human-readable files, mostly Excel and compatible with frontend import. Preserve source/schema identity and checksums alongside readable data. Retain the agreed sortable naming convention, for example `2026 11Nov 14 170000`, using Asia/Singapore time and time only where necessary.
4. At most one current file per logical dataset per Singapore day; same-day updates overwrite that logical file. Avoid duplicate files after retries or lost responses by using a stable dataset/day operation identity and durable result reconciliation. Multi-file completion must be explicit, not an unsupported atomic Drive transaction claim.
5. Backup can lag D1/R2 and catch up independently. The 23:50 daily freshness check compares content/source revision; months-old files are fresh if the underlying data is unchanged. Surface freshness, lag, failure and recovery in Admin System Health only.
6. Use the direct reader for explicit restore/import verification and download, with allowlisted school/drive/folder/file ownership. Browser users do not receive backend credentials. Specify helper-account consent/token renewal, internal authentication, operation identity, bounds and unknown/final/retryable outcomes. Reuse existing v1 secret separation; `GSIS_SECRET` is not Google authorization, and existing `GOOGLE_SERVICE_ACCOUNT` support does not implement Workspace-user offline OAuth.
7. Keep Google retention owner-controlled: direct deletion in Drive is permitted by the existing owner decision, but automatic deletion remains unapproved. D1/R2 prune policy is separate; a readable backup alone is not proof that authoritative storage can be deleted.
8. Identify the smallest migration from current per-owner Google adapters to the central interface, including how queued backups and existing file IDs remain recoverable. Do not implement this migration as part of planning.

## Next task boundaries

Q2 now produces the bounded design in `docs/v1/core/CENTRAL_GOOGLE_BACKUP_PLAN.md`, with exact source references, interfaces, recovery and proposed acceptance tests. Publish it through its own documentation PR for Claude's exact-head review. Q1 implementation remains queued after the current correction pipeline and needs a separate exact-path claim; neither item is added to PR183 or the absence PR. Questions to the owner are reserved for genuine policy, retention, account authority or deployment choices, not routine interface naming.

## Q2 design handoff

Accepted documentation claim: `2f9095e9ac0ada32c548ea9f922c7a6a3859c3fa`. The [central backup plan](../../v1/core/CENTRAL_GOOGLE_BACKUP_PLAN.md) now restores the direct-API transport prescribed by the accelerated specification. It retains owner export boundaries, folder mapping, one current file per dataset/day, durable intent/readback, bounded catch-up, the 23:50 content-based check, transition/rollback and no automatic deletion. It adds the specified helper-account authorization and private Shared Drive boundary; there is no Apps Script implementation package. Current exports remain distinguished from unsupported imports and private full owner backups.

Historical evidence only: Claude approved the earlier document at `688e2aef42f3c552645cd7e1d65df1b5b410d9fa` in main review commit `8bfd315f9cb7b1893e73cc24c7d2a70ea3f14b2d`. Regression CI run `43779364129` passed that old head (1,205 Node programs, 40 LORD programs on each shard, canonical builds). Neither that approval nor CI result covers this revised head. The updated document explicitly handles completed-operation replay without another file action and preserves the review's full-restore/Core-readable-dataset evidence limits. Apps Script endpoint requirements are superseded, not left as a second deployment option.

Read-only Q1 finding: the inherited Roster UI renders the switch and calls `/quiet-mode`; the current probe allowlist identifies that absent route as F08. Removing the v1 caller is queued; no native handler or pause is added. Notification quiet hours and storage/recovery guards remain separate.

Verification for this revision: all 13 relative Markdown links resolve; `git diff --check` passes; the diff is exactly the two claimed Markdown paths. Every Apps Script mention is historical or an explicit exclusion. Source comparison between original and refreshed main shows no change to the inspected backup/provider runtime files. The reproducible commands and actual updated-head CI status are recorded in PR184; updated-head CI is pending at this commit. No application tests were added for prose. Local build/Node/LORD/product suites were not rerun for this documentation-only revision. No hosted/provider/identity/permission test has run. Repository ownership, simplicity, recovery and verification principles were applied; no external skill package was executed or vendored.

Q01: accepted two-path claim, latest owner transport/account/privacy decisions and disjoint open-PR inventories. Q02-Q05: proposed ownership, credential isolation, error states, security/recovery and limits documented, not implemented guarantees. Q06: documentation checks and updated exact-head CI belong to this revision; see PR evidence, never inherit the old head's pass. Q07: Claude must re-review the new exact head. Q08: implementation/setup/activation not authorised by this plan. Next: updated design review, then bounded implementation and browser-only setup; Q1 follows the existing correction pipeline.

No live Drive/Cloudflare reads or writes, notification sends, infrastructure, credential changes, merge or deployment. F5 remains OPEN. Official T1B-01/T1B-02 and unperformed hosted/runtime UAT remain **Not tested**.
