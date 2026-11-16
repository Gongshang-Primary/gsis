# v1.02 release label and deployment handoff

- Status: claimed; release label implementation and exact-head review pending.
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

Run the existing actual-built-browser release-label test, frontend parity test and canonical build without generated drift. Verify that the final PR contains exactly the four claimed files and that every other product path matches merged PR194. Run required exact-head Node/LORD and product/package CI; record commands, results, failures and omissions. Q01–Q05 are a bounded presentation/metadata change using the existing release mechanism. Q06 and Q07 remain pending until checks and Muse's new-head review complete. The feature review is not claimed to cover this subsequent label change.

## Deployment preparation

The latest verified live source is v1.01 at `8e85f3055b34b3262cde926efa7dc06c8fcf1a3b`, protected run `43843849886`. Only Contacts `0006_authority_publications.sql` is new since that release (SHA-256 `3c3f64da8662722344b2c59aafb21c4078b9fc8660cb7f0dd2914965f68e1c30`). The owner has authorised deployment; no new policy or deployment permission is requested.

Before applying the migration, obtain fresh private full D1 exports under a new release directory, verify local restore/integrity/foreign keys/schema/migration ledgers, and retain recovery metadata. Follow the existing eight-owner backup sequence with Contacts last; never reuse the prior release's verified SQL. Do not publish SQL, staff data, signed export URLs or credentials. Separate database snapshots are not cross-D1 atomic backup evidence. R2 metadata inventory is not an object backup; preserve referenced objects.

After review, merge the label PR, run both required suites at the actual combined main SHA, and dispatch only the existing protected `v1-deploy.yml` workflow from main with `confirmation=DEPLOY ISOLATED V1` and `upload_provider_credentials=false`. Verify the resolved run SHA. GitHub's required-reviewer approval remains a platform gate; do not bypass it. Preserve existing resources, origin, service bindings, separate v1 secret, `SEND_OWNER=v0.9`, `WEBHOOK_OWNER=v0.9`, disabled scheduler, inactive Drive/helper integrations and retention deletion false. No provider sends, Google activation or real-staff permission publication is authorised as a smoke test.

On partial failure, reconcile completed migrations/uploads before considering another attempt. After success, verify all nine Worker SHAs and v1.02 labels, bindings/flags, Contacts migration ledger and public routing/authentication boundaries, then publish deployment evidence. Deployment is not atomic. Retain new authority history/frontiers and reconcile marked publications before reverting older application code; no destructive schema rollback.

## Current result

PR194 is merged. The v1.02 label is not yet implemented, reviewed, merged or deployed. No fresh export, hosted migration, configuration change or deployment has been performed by this task. Hosted recovery, authenticated Run B workflows, N-1 Roster save latency and runtime UAT remain **Not tested**. Official T1B-01/T1B-02 remain **Not tested**; **F5 OPEN**.
