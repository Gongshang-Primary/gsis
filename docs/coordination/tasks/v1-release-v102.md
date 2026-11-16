# v1.02 release label and deployment handoff

- Status: deployed as v1.02; authenticated runtime UAT remains Not tested.
- Model/owner: Codex. Coordinator: ChatGPT. Reviewer: Muse at the exact head.
- Updated: 17 November 2026, Asia/Singapore.
- Branch: `codex/v1-release-v102`.
- Base: main `37dbdd438017156e8f2455aef453c5ded5406fbc`.
- Authority: the owner's standing instruction to increment each deployment after v1.01, and latest explicit instruction, "merge and deploy", following Muse's approval of PR194 at `9b3e90c48d8820933fa3866ccce8d003bfc9d5ab`.

## Scope

Exact file allowlist:

1. `docs/coordination/tasks/v1-release-v102.md`
2. `docs/coordination/tasks/v1-deploy-role-membership-matrix.md`
3. `v1/release.mjs`
4. `tests/v1-product-release-label.mjs`

Increment the central display label to v1.02, make the existing test's success message use that label, and close the merged PR194 implementation claim. No application behavior, workflow, dependency, schema or v0.9 change. Main, remote heads and open PR files were refreshed before this claim. Only PR182 remains open; its v0.9 files do not overlap. No additional implementation work is allocated by this release task.

PR194 merged unchanged at `37dbdd438017156e8f2455aef453c5ded5406fbc`. Comparing that merge tree with the reviewed head shows only the added Muse review document; every product/test/build path is identical. Node/LORD run `43903146794`, product/package run `43903210291` and PR product repeat `43905830050` all passed at the reviewed head. Approval: [PR194 Muse record](../review/pr194-muse-review.md), main commit `92c591cc57b46a7ec8790f4d0723da0232596e56`.

## Acceptance and gates

Run the existing actual-built-browser release-label test, frontend parity test and canonical build without generated drift. Verify that the final PR contains exactly the four claimed files and that every other product path matches merged PR194. Run required exact-head Node/LORD and product/package CI; record commands, results, failures and omissions. Q01–Q05 are a bounded presentation/metadata change using the existing release mechanism. Q06 and Q07 completed through the checks and Muse review recorded below. The feature review is not claimed to cover this subsequent label change.

## Deployment preparation

The latest verified live source is v1.01 at `8e85f3055b34b3262cde926efa7dc06c8fcf1a3b`, protected run `43843849886`. Only Contacts `0006_authority_publications.sql` is new since that release (SHA-256 `3c3f64da8662722344b2c59aafb21c4078b9fc8660cb7f0dd2914965f68e1c30`). The owner has authorised deployment; no new policy or deployment permission is requested.

Before applying the migration, obtain fresh private full D1 exports under a new release directory, verify local restore/integrity/foreign keys/schema/migration ledgers, and retain recovery metadata. Follow the existing eight-owner backup sequence with Contacts last; never reuse the prior release's verified SQL. Do not publish SQL, staff data, signed export URLs or credentials. Separate database snapshots are not cross-D1 atomic backup evidence. R2 metadata inventory is not an object backup; preserve referenced objects.

After review, merge the label PR, run both required suites at the actual combined main SHA, and dispatch only the existing protected `v1-deploy.yml` workflow from main with `confirmation=DEPLOY ISOLATED V1` and `upload_provider_credentials=false`. Verify the resolved run SHA. GitHub's required-reviewer approval remains a platform gate; do not bypass it. Preserve existing resources, origin, service bindings, separate v1 secret, `SEND_OWNER=v0.9`, `WEBHOOK_OWNER=v0.9`, disabled scheduler, inactive Drive/helper integrations and retention deletion false. No provider sends, Google activation or real-staff permission publication is authorised as a smoke test.

On partial failure, reconcile completed migrations/uploads before considering another attempt. After success, verify all nine Worker SHAs and v1.02 labels, bindings/flags, Contacts migration ledger and public routing/authentication boundaries, then publish deployment evidence. Deployment is not atomic. Retain new authority history/frontiers and reconcile marked publications before reverting older application code; no destructive schema rollback.

## Pre-release implementation evidence

Claim published on main at `05370d2953c19501116db81bec2255bb0505f667`; this branch starts at that accepted claim. The implementation changes only the central constant from v1.01 to v1.02 and the existing test's success message to interpolate that constant. The two documentation records describe the release and close PR194. Every other product/test/build path matches merge `37dbdd438017156e8f2455aef453c5ded5406fbc` byte for byte. Visible change: existing release labels become v1.02; no new control or application behavior.

Local verification on this branch's implementation tree:

- `TZ=Asia/Singapore GSIS_BROWSER_EXECUTABLE=/usr/bin/chromium node tests/v1-product-release-label.mjs`: **Pass**, actual built home, Toolbox and all nine application chrome labels/titles at desktop/narrow widths; real local Workers/D1; manifest source SHA and every Worker label.
- `TZ=Asia/Singapore node tests/v1-product-v09-frontend-parity.mjs`: **Pass**, including future legacy label variants and preservation of scripts, asset versions and historical text.
- `TZ=Asia/Singapore npm run build`: **Pass**, all canonical components; no generated file changed.
- `git diff --check`: **Pass**. Exact-path and unchanged-product comparisons pass. Full Node/LORD and product/package suites passed through exact-head CI and again on final main, as recorded below; they were not rerun locally for this two-line change. No new test or assertion was needed.

At the initial implementation handoff, PR194 was merged and the v1.02 label was implemented but not yet independently reviewed, merged or deployed. No fresh export, hosted migration, configuration change or deployment had occurred at that point. Hosted recovery, authenticated Run B workflows, N-1 Roster save latency and runtime UAT remain **Not tested**. Official T1B-01/T1B-02 remain **Not tested**; **F5 OPEN**.

## Deployment completion — 17 November 2026

PR195 was approved by Muse at `bb43c9344cc58dd6b48a7ca2d1ac45eb4387068e`; review main commit `6a0763b68a81553d83f24757a9552b78569cc7bd`. It merged unchanged as `d5c8899aeb867448ad7399f9925f46ac11371380`. Final-main Node/LORD run `43967338294` and product/package run `43967343394` both passed. The protected deployment `43971528994` succeeded at **06:40:10 SGT**, following fresh verified private backups and the owner's recorded GitHub approval. This implementation/release claim is closed.

All nine live Workers report v1.02 and the exact deployed SHA. Contacts0006 is applied; all other schemas/ledgers and resource/service bindings are unchanged. Sixteen public checks and three released frontend asset comparisons passed. The full merge, CI, backup, workflow, metadata and public-check evidence is in [the deployment record](../DEPLOYMENTS.md#17-nov-2026-064010-sgt-v102-deployed). The [documentation claim](v1-release-v102-record.md) owns publication of this factual handoff; its review does not gate the already completed deployment.

No provider/Google activation, retention deletion, live staff edit or permission publication was performed. Public checks do not establish authenticated runtime behavior. F5 **OPEN**; official T1B-01/T1B-02, runtime UAT and hosted restore **Not tested**.
