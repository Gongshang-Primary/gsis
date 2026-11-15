# Deploy venue-clear permission parity

Model: Codex. [Claim and four-path scope](../../coordination/tasks/v1-deploy-clear-authority.md). Independent reviewer: Claude, exact head pending. Not merged or deployed.

## Existing contract

The reused Deploy interface allows clearing venue teacher assignments only for an Admin on an eligible unpublished draft. PR161 repairs its native `draft` status check. That interface restriction is insufficient by itself: the v1 save service previously allowed any current `deploy.edit` caller to submit the same edit directly or inside a mixed batch.

This is an existing source permission, not a change to the general SMC/EO capability policy. At source `26bbccd229962700409bb6e9c80b1e9bec170d20`, `backend/Code.gs` lines 1108/1127 requires Admin and line 1128 restricts publication states. Section 4.2 of the accelerated specification at `f39b671ac6da3f389c58345ce4f5c035f1cb3f65` preserves operation-specific permissions.

## Bounded design

The service must enforce Admin for every clear edit and reject prohibited publication states before any batch mutation. Other edit operations retain their current capabilities. Current actor/school validation, preview restrictions, admission, expected assignment state and immutable operation receipts remain required.

The owning Deploy D1 transaction must protect the full loaded version revision and publication state. Existing prepared publication documents identify the affected version. A matching prepared publication remains blocking unless its operation is durably terminal-aborted; an absent or uncertain operation outcome is not cancellation. A publication still computing before its durable payload exists competes through the version revision check. The service must not claim cross-D1 atomicity.

A retry of an already committed clear returns its original result. It must not perform another clear against a later publication or revision. Rejected mixed batches must not save their otherwise permitted edits.

## Evidence and handoff

Implementation is complete. Twelve actual local Worker/D1 groups pass: direct and mixed non-Admin denial, valid Admin clear and immutable replay, active/prior-publication restrictions, prepared/orphaned/terminal-aborted outcomes, exact school/version scope, stale expected state/revision, preview/revoked capability, and three publication/clear races. The original defect was reproduced before the service change. Unchanged parent Deploy and six browser groups pass; Core/Contacts pass 12 programs/56 cases. Canonical build has no tracked drift and both runners discover the new test (76 product/1,175 Node). The task retains harness failures and commands. Full exact-head suites/CI and Claude review remain pending until the PR records them.

This child starts from frozen PR160 at `ab24739203f3bcc03c5b7e6c96f8fa2144a84654`. Accepted main claim `af58de2b95e82c8b7ad35ae1e6c1a4c820744199` was merged before implementation. The child owns only the four named paths. The merge also carries the already-existing main claim records for UAT019 and Contacts recovery; they are inherited unchanged, not additional implementation changes. Parent changes require child revalidation.

Rollback restores the previous permission gap; no schema or data rollback is required, and reverting cannot undo saved operations. No live clear, publication, migration, provider activation or configuration change is authorised. F5 remains OPEN. Official T1B-01/T1B-02 and unperformed runtime UAT remain **Not tested**. The next deployed version remains v1.01 under the separate release-label task.
