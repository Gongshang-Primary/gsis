# Fortnight editor save and navigation — UAT014

Model: Codex. [Claim and four-path scope](../../coordination/tasks/v1-deploy-fortnight-editor.md). Independent exact-head reviewer: Claude. Implemented with focused checks; full exact-head suites/CI pending. Not merged or deployed.

## Reproduced defect and change

Changing a lesson-block count and restoring its original value before blur left the reused editor's global dirty flag true. Nothing was queued, Save/Discard were hidden, and navigation could refuse indefinitely. Remarks had the same problem. A native invalid number input could also be interpreted as a blank.

The v1 build adapter now compares raw Fortnight inputs with the current projected values. Reversion clears the local dirty state, while unrelated staged edits remain. Valid input uses the existing queue on change, blur or explicit Save; decimal, negative, excessive and native bad-input values remain editable with a useful error and cannot be submitted as blank. Remarks retain their existing length bound.

The existing workspace save bar exposes Fortnight Save/Discard controls. Stable buttons prevent an input blur from replacing the very button being clicked. Raw-only Discard is explicit and performs no save. Reversing a staged field removes only that field's queued edit. Other pages retain their original controls.

The existing queue still owns submitted operations. An uncertain flight retains its operation ID, payload and lock. Same-version tab navigation remains allowed with the content inert; version changes and sign-out keep the original guards. This task does not repair or change the separate B-R01 durable-save recovery contract. A generic HTTP error is not newly presented here as durable cancellation proof.

## Verification

The new built-browser test failed on the original 2→3→2→Tab sequence before the fix. Six groups now pass, including remarks reversal, a reverted staged field alongside an unrelated edit, valid focused/narrow-keyboard Save, invalid inputs, raw-only Discard, unchanged uncertain-flight retry/navigation and denied-write draft retention/read-only controls. The test runs the built app and native queue with explicitly synthetic transport; it is not a Worker durability test or hosted UAT.

Independent focused rerun passed. Existing PR161 venue controls pass six groups and Contacts recovery passes eight. Canonical build has no tracked generated drift. Both runners discover the new test: 77 product / 1,176 Node. Parent builder code is byte-for-byte unchanged outside the new helper and its call. Full exact-head evidence and commands are recorded in the task/PR; missing results remain pending.

The child starts from Contacts recovery `175f34e55cc3152a60ef0a6865c3bcfb55ab27c5` (PR163, itself based on PR161). Main claim `57c9223b532d5bf6c84ef6b5ffdb79059a5e3cc1` was merged before implementation. The already-existing main clear-authority claim is inherited unchanged; it is not an extra implementation edit.

Rollback restores the input/navigation defect without a schema or data rollback. No v0.9 source, server contract, configuration, migration, provider, live-data operation, merge or deployment changed. The original browser incident remains unverified. F5 remains OPEN; official T1B-01/T1B-02 and unperformed runtime UAT remain **Not tested**. Next deployment label remains v1.01 under the separate version task.
