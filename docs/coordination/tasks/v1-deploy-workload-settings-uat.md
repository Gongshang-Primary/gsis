# Deploy Workload Settings UAT log

- **Status** Claimed on 23 November 2026, 11:43 SGT
- **Builder** Codex
- **Reviewer** Muse at the exact head
- **Branch** `codex/v1-deploy-workload-settings-uat`
- **Base before claim** `4fa2b60dcd177204e16155864418c2c54910529e`
- **Owner request** Log Workload Settings entering edit mode on arrival and explain how the subject list is populated, including the apparent absence of IMP.
- **Exact scope** This task record and `docs/v1/DEPLOY_WORKLOAD_SETTINGS_UAT_2026-11-23.md`.
- **Verification** Compare the screenshot with deployed v1.10 and pinned v0.9.9y sources. Run a synthetic case for load subjects and countable activities. Record acceptance checks and any unresolved hosted facts.
- **Limits** Documentation and read-only source investigation. No product edits, deployment or live data actions.

## Evidence

The accepted claim is `5119a9b97f6ae5e69acbf9cc588b056848a9f27f`. The dated [UAT log](../../v1/DEPLOY_WORKLOAD_SETTINGS_UAT_2026-11-23.md) records DEP-23-004 and DEP-23-005. Source blob parity and synthetic subject/activity probes passed at the pinned v0.9.9y and v1.10 revisions. `TZ=Asia/Singapore node tests/imp-nonteaching-ui.cjs` passed at the exact deployed v1.10 source. The hosted activity and authoring requirement remain open. Muse reviews this documentation at its exact PR head.
