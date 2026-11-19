# v1.08 release

- Model: Codex
- Status: claimed on 20 November 2026 SGT
- Owner instruction: “deploy current version first”. Use the standing full-release workflow and increment the v1 display label.
- Branch: `codex/v1-release-v108`
- Reviewed implementation base: `7ee2418988e3f61d6542b4f40c669fafe162f6ee`
- Previous live release: v1.07 at `05eedeee3c364609f879734d47026d2c718e74d7`. [Protected run 44447435095](https://github.com/Gongshang-Primary/gsis/actions/runs/44447435095)
- Exact scope: this record and the display label in `v1/release.mjs`. The open PRs #230 and #182 have disjoint scope.

## Reviewed release contents

[PR #229](https://github.com/Gongshang-Primary/gsis/pull/229) allows a shared Basic Name when new Deploy teacher registrations derive distinct TTb Names. Muse approved `fb3411a2ca3f3d584b286f64d185036d57ecfa9a` in [review record `8091c5bf`](https://github.com/Gongshang-Primary/gsis/blob/8091c5bfda88d7e2fadd61743a1902b9fb0a873f/docs/coordination/review/pr229-muse-review.md). The exact head passed Node/LORD and both product runs. The automatic merge into `7ee24189` preserves the reviewed product tree. The two browser-test fixture corrections are included. There are no v1 migration, deployment script, or workflow changes since v1.07. The 17 November owner directive covers the routine label increment.

## Verification and rollout

Run the canonical build, drift check, v1 build, nine Worker dry runs, local migration upgrade, and exact-candidate Node/LORD and product CI. Verify main's merge tree against the tested candidate and run the existing main-only protected workflow in `Gongshang-Primary/gsis` after eight fresh private verified D1 exports with Contacts last. Preserve the existing `gsis-v1-owner-approved` gate and dispatch with provider credential upload disabled. Keep backup data and recovery URLs private.

Confirm public release labels and deployed Worker metadata after the protected run. Keep hosted authenticated UAT, provider delivery, and restore separate. F5 and #212 remain open. Rollback is a separately authorised protected rollout of the prior source.
