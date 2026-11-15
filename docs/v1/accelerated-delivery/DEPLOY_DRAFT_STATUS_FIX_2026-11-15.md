# UAT019 — saved-draft venue controls

Model: Codex. [Task and exact scope](../../coordination/tasks/v1-deploy-draft-status.md). Claude independently reviews the implementation PR's exact head. Status: implemented with focused verification; full exact-head results in the PR, Claude review pending; not merged or deployed.

## Report and cause

The owner's uploaded `GSIS_FRONTEND_UAT_LEDGER.md`, SHA-256 `c4c0cb8786eced24b5ef3143c7d113369ddaf81dcba8728e27fb0a2a34c5a0f8`, reports UAT019: the Venues page says “Choose an unpublished planning version” even when the selected v1 version is a saved draft. This report is distinct from the publication-metadata failure addressed by PR160.

At source base `bef1ac8c1d5e310a3468b92b72da38d59e49aeb1`, the copied legacy frontend's `canClearVenueAssignments()` checks status `planning`; the v1 bootstrap uses `draft`. The v1 builder now translates that one eligibility check. Keep the backend's native state vocabulary and leave the production v0.9 frontend unchanged.

## Boundaries and expected behaviour

- Current Admin capability is still required; impersonation cannot enable it.
- A published version or a draft carrying a previous publication remains ineligible.
- Preview and cancellation make no writes. Confirmation adds the existing clear operation to the local draft; only the normal explicit save persists it.
- Clear affects assignments, preserving the room, class, teaching-group and teacher identities. Existing owner-side revision, lease, permission and recovery contracts remain responsible for commit.

No data repair, catalogue refresh, publication, schema migration, provider/configuration change or new dependency is included. No cross-D1 transaction is introduced. The ledger's historical cloning permissions are not new permission to read or modify live school data.

## Verification and handoff

The built mobile-width browser reproduced the disabled-control failure before the fix. Six corrected browser/actual Worker groups pass, including preview/cancel with zero writes, an explicit saved clear with identities preserved, published/previous-publication restrictions, non-Admin controls and read-only impersonation. Canonical build has no tracked drift; unchanged Core/Contacts tests pass (12 programs/56 cases), and both existing runners discover the new test. The task records focused commands and fixture corrections. The PR records the exact tested commit, full Node/LORD/product outcomes and CI URLs; any missing results remain pending. These synthetic checks do not certify the owner's live version or data.

Rollback reverts the v1-only build adaptation; no data or schema rollback is needed. The previous defect then returns. Claude's exact-head review and the owner's merge/deployment decision remain outstanding. F5 remains OPEN; official T1B-01/T1B-02 and unperformed runtime UAT remain **Not tested**.
