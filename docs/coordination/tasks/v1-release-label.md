# v1.01 release label

Model: Codex. Coordinator: ChatGPT. Reviewer: Muse at the exact head. Status: deployed as v1.01; runtime UAT pending. Branch: `codex/v1-release-label`. Base: `252e88c7dd820c87fee1b445a697e7290b1ca1fb`. Updated: 16 November 2026 (Asia/Singapore).

Owner authority: the 15 November instruction to increment v1 releases, starting with v1.01, and the 16 November instruction "deploy v1.01". The visible label was still missing from current main. This bounded presentation change completes that release requirement; protocol/schema versions and v0.9 labels remain independent. Muse reviews the exact implementation head before it is merged. Release approval exists, but deployment still needs passing candidate checks, verified backups, resolution of the existing Contacts Memberships readiness condition and the protected GitHub environment approval.

## Exact scope

1. `docs/coordination/tasks/v1-release-label.md`
2. `v1/release.mjs`
3. `scripts/v1/build-web.mjs`
4. `scripts/v1/build.mjs`
5. `v1/web/overlays/index.html`
6. `v1/web/overlays/admin/index.html`
7. `tests/v1-product-v09-frontend-parity.mjs`
8. `tests/v1-product-release-label.mjs`

Main, remote branches and actual open PRs refreshed before claiming. PRs185–190 are merged; the sole open PR182 is the separate v0.9 hotfix and does not overlap these paths. No unreviewed product base.

## Implementation and acceptance

One v1-owned release constant supplies v1.01 to existing app chrome, the landing page, Toolbox and build evidence beside the exact source SHA. Use the existing release normalizer rather than a new collection of source text patches. Ensure the LORD-family screens have a visible header label as well as a document title. Preserve asset URLs, inline scripts, historical text, protocol versions, data and all application behavior.

Verify the actual built browser views, existing parity negative cases, canonical build/no generated drift, runner discovery, exact scope and required Node/LORD and product/package CI. Synthetic local data only. No code change to authentication, authority, persistence, migrations, provider behavior or infrastructure. Any unsupported screen must fail the label test rather than be silently omitted.

## Handoff

Record exact head, tests, visible changes and omissions in the PR. Q01–Q02: explicit release scope, central source of truth. Q03–Q05: presentation/build metadata only; no new dependency or mutable state. Q06–Q07: checks and Muse review pending. Q08: no deployment in this implementation task; deployment remains separate. F5 OPEN; official T1B-01/T1B-02 and unperformed hosted/runtime UAT Not tested.


## Implementation and verification

One `RELEASE_LABEL` in `v1/release.mjs` now supplies `v1.01`. The existing DOM-location release normalizer changes only current chrome text, fills explicit empty home/Toolbox markers, and adds small visible LORD/OVERLORD/STARLORD header labels. Initial document titles receive the same label. Existing view-specific runtime titles (for example Venues) remain unchanged; the visible release remains in application chrome. The product manifest records the label beside its exact source SHA; all nine Worker configurations carry the same display label and existing SHA. API, Calendar transport, schemas, cache query strings, historical content and v0.9 source remain unchanged.

- Q01–Q02: the exact eight claimed paths only; central v1-owned label, using the existing normalizer rather than another collection of legacy source patches.
- Q03–Q05: presentation and build metadata only. No authentication, permissions, persistence, data, provider or migration change; no dependency added.
- Q06: `TZ=Asia/Singapore GSIS_BROWSER_EXECUTABLE=/usr/bin/chromium node tests/v1-product-release-label.mjs` passes through the actual built browser, nine local Workers and synthetic D1 session. It verifies home, Toolbox and all nine application chrome labels at desktop/narrow widths, initial titles, product manifest and every Worker label/SHA. Its first pre-implementation assertion failed on the missing home release label. Early test-harness runs exposed concurrent-page shutdown masking errors and selection of a hidden Contacts login label; the final test uses sequential pages, waits for route cleanup and selects visible chrome. The new title check also found unlabeled initial Roster titles, which the normalizer now handles.
- Existing `TZ=Asia/Singapore node tests/v1-product-v09-frontend-parity.mjs` passes, including future v0.9 label variants and byte-preservation checks for inline scripts, attributes, asset query versions, comments and historical notes. `TZ=Asia/Singapore npm run build` passes all 18 canonical components without generated drift. Syntax and whitespace checks pass. Product discovery includes the new test (114 programs). Full product and required Node/LORD CI have not been run locally for this change; exact-head CI will supply those results in the PR.
- Q07: Muse exact-head review pending. Visible changes are the `v1.01` labels and small LORD-family header labels; no new controls.
- Q08: no deployment or live operation occurred. The owner has now required completion of Deploy Memberships publish-back before deployment; that separate implementation is a release prerequisite. This label PR alone does not release the deployment gate. F5 OPEN; official T1B-01/T1B-02 and unperformed hosted/runtime UAT remain Not tested.

## Claim closure and integration — 16 November 2026

[Merged PR #191](https://github.com/helper-gsps/gsis/pull/191) by merge commit [8d1f0c6](https://github.com/helper-gsps/gsis/commit/8d1f0c6029a4fb23a937276d47c70341ecad661f), preserving reviewed head `8627746695a9a3fc60c74cc566cbf2df52fa5532`. Muse approval is in [the review record](../review/pr191-muse-review.md), published on main at `3110b315ec164b64d93e80e4ecb7fe839bbfb14a`. [Full Node/LORD CI](https://github.com/helper-gsps/gsis/actions/runs/43810465334) and [product/package CI](https://github.com/helper-gsps/gsis/actions/runs/43811771561) passed at that exact head. Earlier failures and their disposition remain in the review and PR; this closure does not erase them.

Clean mechanical merge; no hand edits to reviewed product/test files. Q06–Q07 complete for this implementation. The implementation claim is closed. Deployment remains pending final combined-source CI, fresh private backups and the existing protected GitHub environment approval. No deployment, hosted migration, staff-data write, credential change or provider activation has occurred in this integration. F5 OPEN; official T1B-01/T1B-02 and hosted/runtime UAT Not tested.

### v1.01 release integration inventory

| PR | Reviewed head | Merge commit | Purpose |
| --- | --- | --- | --- |
| #192 | `a29c861203ee045f2a2c40028688a43602f4a522` | `0b51ad288422861efea9e8b55241fe243c2bf995` | Memberships edit/import/publish-back prerequisite |
| #191 | `8627746695a9a3fc60c74cc566cbf2df52fa5532` | `8d1f0c6029a4fb23a937276d47c70341ecad661f` | v1.01 label |
| #193 | `d491d40379cf5dd6f5444d894988ee6663d21da2` | `90103db0a82d5106c6b7b87fdf3e6e4a59e79f63` | Deterministic Roster toolbar test |

The final merged product/test/build paths match the previously tested provisional combined tree `2b9f62b2e23eb836ebae9f525cb12335904be752`; only documentation differs. The actual combined main SHA still requires its own full Node/LORD and product/package runs. Expected discovery is 117 product programs and 1,218 Node programs.

The owner has already authorised deployment and selected completion of publish-back first. That implementation prerequisite is now merged and reviewed. This does not fill the school's missing Memberships: owner-reviewed entry/import and publication remain necessary before relying on membership-based workload calculations. No values are inferred or populated.

The older deployment checklist pins an earlier source; reconcile its inventory for this release: three additive migrations since deployed `26bbccd229962700409bb6e9c80b1e9bec170d20` — Core `0005_drive_connection.sql`, Contacts `0005_membership_publications.sql`, Roster `0005_workload_snapshot.sql`. All three passed separate real local Wrangler upgrades from the deployed migration chains, preserving existing schema/indexes and synthetic rows/history/receipts; the canonical upgrade check separately covers LORD. Fresh private backups of all eight D1 owners, especially Contacts immediately before schema-2 writes, remain required before hosted apply. Preserve referenced R2 objects and baseline export/rollback evidence. No generic restore or schema rollback is authorised.

Deploy through the existing protected `main` workflow with provider credential upload false. Preserve `SEND_OWNER=v0.9`, `WEBHOOK_OWNER=v0.9`, disabled scheduler, inactive Drive/helper integrations, retention deletion false and the existing v1 secret. Run B authenticated workflows, N-1 Roster save latency and actual Memberships data readiness remain unperformed; public routing/authentication-boundary checks alone cannot close them. No new owner release permission is needed, but GitHub's required-reviewer approval remains an external platform step.

### Protected deployment queued — 16 November 2026, 17:53 SGT

Final candidate: [`8e85f3055b34b3262cde926efa7dc06c8fcf1a3b`](https://github.com/helper-gsps/gsis/commit/8e85f3055b34b3262cde926efa7dc06c8fcf1a3b). Both required runs passed at that exact SHA, attempt 1: [Node/LORD 43840493381](https://github.com/helper-gsps/gsis/actions/runs/43840493381), all 1,218 selected Node programs across four shards plus 40 LORD programs per shard; [product/package 43840497861](https://github.com/helper-gsps/gsis/actions/runs/43840497861), 117/117 product programs, canonical build without tracked drift, nine Worker dry runs and local LORD upgrade check. Artifact `14214051721`, `gsis-v1-8e85f3055b34b3262cde926efa7dc06c8fcf1a3b`, SHA-256 `fa327a3d7d6c1c2b81156369a6029fde8b495b0694aa06e456bdde3ef9e9b0c4`.

Preflight confirmed all nine hosted Workers still at `26bbccd229962700409bb6e9c80b1e9bec170d20`, the existing origin/resource/service bindings and inactive integration flags. All three new migrations are absent from the hosted ledgers. All eight R2 buckets remain private; their complete metadata inventory contains six objects, 2,256,979 bytes, unchanged from the earlier inventory. ETags/custom digests were recorded, not checked against object contents; this inventory is not an R2 backup.

Fresh full application-schema/data SQL exports for all eight D1 owners are retained privately, with resource identities, export bookmarks, UTC timestamps, SHA-256 digests, table counts and migration ledgers. Each downloaded SQL file imported into isolated local SQLite and passed integrity/foreign-key checks and schema/ledger comparison. Cloudflare's internal `_cf_KV` metadata is omitted by its export and excluded from the comparison; no application table is excluded. Initial export polling failures and the verifier's initial internal-table mismatch are retained in private evidence; only completed, verified exports count. Total SQL bytes: 14,500,365. Contacts was exported last and verified at `2026-11-16T09:53:20.524659Z`, before dispatch. Private verification manifest SHA-256: `7ef9374da4c5a81963477aaef85c3dc911ef4f5c6479d248f354b4899b0cbd7a`. Current Cloudflare Time Travel bookmarks are available for all eight owners. These are separate database snapshots, not a cross-D1 atomic backup; no hosted restore was performed. SQL, signed download URLs and private metadata are not published in Git.

[Deployment run 43843849886](https://github.com/helper-gsps/gsis/actions/runs/43843849886) was dispatched at `2026-11-16T09:53:31Z`, with `confirmation=DEPLOY ISOLATED V1` and `upload_provider_credentials=false`. Its resolved head is exactly the tested candidate above. The run is **waiting for the owner's GitHub environment approval**; no deployment or migration has started. No bypass or model self-approval was attempted. GitHub environment-variable reads return HTTP403 and browser tools are unavailable, so stored source configuration was not independently read; live settings and source defaults were checked, and the workflow will validate the owner-configured environment before applying it.

Next: owner approves this specific protected run; monitor all migrations/uploads, verify nine Worker SHAs/labels/bindings/flags and public routing/authentication boundaries, then record actual completion in `docs/coordination/DEPLOYMENTS.md`. On partial failure, reconcile completed steps before considering retry. The owner's post-release Memberships entry/publication and all authenticated Run B checks remain pending. F5 **OPEN**; official T1B-01/T1B-02, hosted recovery and runtime UAT **Not tested**.

### Deployment completion verified — 16 November 2026

Protected run `43843849886` succeeded at 18:07:13 SGT on `8e85f3055b34b3262cde926efa7dc06c8fcf1a3b`. All nine Workers, three additive migrations, unchanged resource/service bindings and inactive integration flags were verified. Public smoke checks passed 16/16 at 22:57:57–22:58:01 SGT. See [the deployment record](../DEPLOYMENTS.md#16-nov-2026-180713-sgt-v101-deployed). No authenticated UAT, hosted restore or provider-send result is claimed. F5 OPEN; official T1B-01/T1B-02 and runtime UAT Not tested.
