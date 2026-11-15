# Contacts save recovery — UAT004

Model: Codex. [Task and seven-path scope](../../coordination/tasks/v1-contacts-save-recovery.md). Claude independently reviews the exact implementation head. Status: implemented with focused verification; full exact-head results in the PR; not merged or deployed.

## Evidence and scope

The owner's uploaded `GSIS_FRONTEND_UAT_LEDGER.md` (SHA-256 `c4c0cb8786eced24b5ef3143c7d113369ddaf81dcba8728e27fb0a2a34c5a0f8`) reports a catalogue-rejected Contacts save whose original operation could not be confirmed and whose draft stayed locked. The original live operation is not inspected or retried by this task. Later staff migration does not establish its outcome.

Source inspection found two related outcome defects: grid replay/lookup dereferences a successful result on an aborted receipt, and explicit recovery discards the actual result of the commit-versus-abort race. The v1-built grid also needs to distinguish terminal rejection from uncertainty without discarding the user's local draft.

This fix reuses Contacts' existing durable receipts, operation binding and owner-side fence. It does not change catalogue validation, direct-authority editing, accepted SMC/EO/School Leader policy, identity linkage or import scope. Those remain separate tasks and readiness gates.

## Outcome contract

| Durable evidence | Browser behaviour |
| --- | --- |
| Original committed receipt | Finish that save once using its original result/mapping. A lost response does not justify creating another person. |
| Original terminal-not-committed receipt | Retain every local draft value, release the settled attempt and explain that it did not save. A corrected save is a new explicit operation. |
| Prepared, absent, unavailable or unconfirmed receipt | Keep the original operation ID and frozen payload. Do not claim cancellation or unlock replacement writes merely because a request failed. |
| Commit wins while recovery requests abort | Return the actual committed receipt; do not report the abort request as an abort outcome. |
| Abort wins | Preserve the terminal receipt and fence; the old writer cannot commit afterwards. |

Recovery UI covers the current retained grid attempt. It must not fabricate server-stored drafts or offer a general operation-history editor. Existing imports consume the same durable terminal receipt through their existing recovery control. Actor/school checks, digest binding, current permissions and read-only impersonation remain in force.

## Verification and handoff

Focused verification passed: seven actual Worker/D1 groups and eight built-browser groups, including both recovery races, durable Worker restart, original-result recovery, import session recovery and late responses after logout. Unchanged Core/Contacts contracts passed 12 programs/56 cases; existing product/UI and parent UAT019 regressions passed. Canonical build has no tracked drift; both runners discover the new tests (76 product/1,175 Node). The task records commands and harness corrections. Internal review additionally reproduced an account-clear event during the final recovery-render await; a post-await context/attempt check prevents restoring the previous account’s operation reference. Full exact-head Node/LORD/product CI and final commit results are recorded in the PR; missing results remain pending. Worker restart proof does not claim that an ordinary grid draft survives a browser crash.

The parent is the frozen UAT019 compatibility branch at `1f4121a6b54de6f9973934992fea395fdc3cab81` ([PR161](https://github.com/helper-gsps/gsis/pull/161)). The accepted Contacts claim `2c396391186a342a0c42c41d961aba30832baf54` was merged into the child before implementation. Its own diff is limited to seven paths; parent code remains separately reviewable.

A separate shared-client pending-map cleanup remains tracked: a terminal receipt lookup can leave the original endpoint-keyed failed-save entry counted against the existing bound. This patch does not change that shared client or hide the limitation.

Rollback restores the prior code and its recovery limitation. It cannot undo a committed save. No schema, configuration, provider, migration or live-data change is included. F5 stays OPEN. Official T1B-01/T1B-02 and unperformed runtime UAT remain **Not tested**. Independent review and owner merge/deployment decisions remain separate.
