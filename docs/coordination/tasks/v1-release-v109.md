# v1.09 release

- Model: Codex
- Status: claimed on 20 November 2026 SGT
- Owner instruction: “merge and deploy”, then “deploy till git gate” after #237 was approved and merged. Use the standing full-release workflow and increment the v1 display label.
- Branch: `codex/v1-release-v109`
- Implementation base: `eadbf5e6a41a0277a2439159e46b3bd07ab2ff07`
- Previous live release: v1.08 at `c318d141df889490bde47124e6cfc79356eaab8f`. [Protected run 44624194656](https://github.com/Gongshang-Primary/gsis/actions/runs/44624194656)
- Exact scope: this record and the display label in `v1/release.mjs`. Open #182 and #242–244 stay outside this cut.

## Reviewed release contents

Includes the eleven merged PRs #230–232 and #234–241. Muse approved the merged heads for #230–232, #234–236 and #238–241. The owner authorised merging #237 at handoff head `be6d09516e611921436156186dcb5be943379229` after its reconciliation against #235. All 163 product programs passed at that head. Its six-file diff, canonical build, four local Roster checks and operation probe passed, and the merge preserves its exact tree. [Merged #237](https://github.com/Gongshang-Primary/gsis/pull/237) · [Exact-head product CI](https://github.com/Gongshang-Primary/gsis/actions/runs/44742807269)

The only new migration since v1.08 is the reviewed additive Core `0006_central_drive_orchestrator.sql` from #241. Its SHA-256 is `305e9f5cdb764df6b8c9b8ff682e818fcaa01ee8ff6c4797a5444e939f2cbbc4`. The two orchestrator activation switches remain off in the approved configuration. The release adds no provider credential upload or workflow changes. The standing 17 November directive covers the routine version label.

## Verification and rollout boundary

Run the canonical build and drift check, v1 build, dry-run and local migration checks, label and frontend parity checks, and exact-candidate Node/LORD and product CI. Verify the final main tree matches the tested candidate. Take eight fresh private, verified full D1 backups bound to final main, with Contacts last and no backup payloads disclosed.

Dispatch the existing main-only protected workflow with provider credential upload disabled, then hand off the run at `gsis-v1-owner-approved` as requested. Hosted authenticated UAT, provider delivery, Drive cutover and hosted restore require their own evidence. F5 and #212 stay open. Rollback is a separately authorised protected rollout.
