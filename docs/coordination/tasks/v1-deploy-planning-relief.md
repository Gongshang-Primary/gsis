# Deploy planning relief calculation

- **Status** Claimed on 23 November 2026, Asia/Singapore
- **Model** Codex
- **Reviewer** Muse at the exact head
- **Branch** `codex/v1-deploy-planning-relief`
- **Base before claim** `73356724f7824ddd75f2290c279b75cb6bb61698`
- **Owner request** Make R calculate in Deploy for the selected saved planning version, following DEP-23-002 and DEP-23-003.
- **Exact scope** This record, the Deploy bootstrap and derived-row protections in `v1/services/deploy/service.mjs`, `v1/services/deploy/planning-relief.mjs`, v1 table hooks in `scripts/v1/build-web.mjs`, `v1/web/shared/deploy-relief-ui.js`, and `tests/v1-product-deploy-planning-relief-browser.mjs`.

Replay the existing formula on version-owned teachers, assignments, load, offload and relief settings. Expose the estimate by exact saved version/revision alongside the accepted-evidence R in Ledger and Stats. Keep numeric zero, incomplete-input reasons and complete-category averages. Pending edits must identify the save needed and must never show an estimate for the wrong revision.

The preview is a read-only Deploy projection. Existing Contacts acceptance, publication, Roster entitlement and write contracts remain authoritative. Scope excludes live edits, deployment, v0.9 source and the published calculation engine.
