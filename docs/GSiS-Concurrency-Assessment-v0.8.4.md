# GSiS v0.8.4 concurrency assessment

Recorded: 21 October 2026, Singapore time. Status: source assessment and release design. A moderate Apps Script ownership split was subsequently requested for the v0.8.4 package. No production timings, live cutover, workbook split or live data change were performed for this assessment.

The large combined Deploy source file is not the concurrency boundary. The shared Apps Script project lock is. Moving functions into several `.gs` files or workbooks does not change that lock scope.

## Current ownership and evidence

Source locations below refer to the released v0.8.3 baseline, commit `c2ee2d73e0dd3ee75ade4c93760aa4f68ea21e45`, so they remain reproducible as v0.8.4 adds code. The named canonical functions are the useful pointers in later versions; generated combined files can have different offsets.

| Boundary | Evidence and effect |
| --- | --- |
| Source packaging | The v0.8.3 baseline `DEPLOYMENT.md` describes one combined Deploy backend serving Deploy, Layout and Roster. Several source files within that same project would still share its script lock. The v0.8.4 deployment guide now describes the separate Roster artifact. |
| Apps Script project | `backend/Code.gs:692`, `dispatch_()`, acquires `getScriptLock()` for Deploy writers. `backend/RosterOperations.gs:345`, `rosterOperationsDispatch_()`, uses the same lock service for Roster writers. Inbox mutations and dated lease writes also use it. Contacts and Calendar are documented as separate web apps with their own lock domains. |
| Workbooks | `backend/LayoutRepository.gs:10`, `layoutRepositoryId_()`, already chooses a separate Layout workbook. Its mutation functions still acquire the Deploy project script lock. Splitting Sheets alone therefore does not isolate these writes. |
| Roster operational state | `backend/RosterOperations.gs:32`, `rosterOperationsState_()`, reads the Drive file `Roster operations.json`. At line 40, `rosterOperationsCommit_()` serializes the state and replaces that file's whole media body. A surgical logical edit is not a partial physical Drive write. |
| Baselines and register | `backend/Roster.gs:188`, `rosterIndex_()`, reads a separate register; `rosterCommit_()` replaces it. Timetable model files and original workbooks are separate from the operations document. |
| Inbox | `backend/RosterInbox.gs:2` and `:12` read and replace the independent `Roster WhatsApp Inbox.json`. `rosterInboxDispatch_()` at line 59 and `rosterInboxServiceDispatch_()` at line 90 still acquire the Deploy project lock. Separate storage has not yet provided separate writer scheduling. |

Google documents `getScriptLock()` as scoped to the script, regardless of user. `getDocumentLock()` returns no lock in a standalone script or web app, so it is not a drop-in named-workbook lock for these endpoints. Reference checked: [Apps Script LockService](https://developers.google.com/apps-script/reference/lock/lock-service).

## Lock windows to measure and shorten

These are structurally identifiable costs, not measured production bottleneck rankings.

1. Generic `rosterOperationsDispatch_()` acquires its lock before reading the latest operations state, constructing the authoritative context, reconciling, applying the command and committing. `rosterOperationsContext_()` can read the baseline register/models, subject catalogue and Deploy quota data within that window. Preserve fresh dependency checks while moving reusable preparation outside it.
2. Deploy `dispatch_()` calls `syncPublishedCatalogues_()` and `syncLayoutPublication_()` before its writer `finally` releases the lock. The former calls the Contacts API; the latter reads and writes the separate Layout workbook. A durable handoff with explicit retry and completion state could shorten this cross-service lock window without claiming that a partial publication completed.
3. `rosterInboxServiceDispatch_()` builds current Contacts and duty context after acquiring the lock for ingest and preparation. Move independent authority/reference reads before the lock where safe, then recheck the locked Inbox records and relevant duty dependencies before committing.
4. Baseline upload inside `rosterDispatch_()` holds the lock while writing the model file and archived XLSX, before updating the register. Immutable staging outside the lock is a candidate, provided receipt identity, orphan cleanup and the final register comparison remain correct.

Existing good patterns should be retained. `rosterOperationsPreparedDispatch_()` at line 295 and `rosterScheduledDispatch_()` at line 617 prepare major allocation work outside the lock, then verify references and dependencies against the latest state before committing. `rosterDailyEmploymentMailDispatch_()` at line 589 sends email between the claim and settlement locks. Most ordinary reads do not acquire the writer lock; reconciliation and pending-write recovery are exceptions.

## Measurement and staged recommendation

1. Use existing `deployLock_()` and `deployUnlock_()` instrumentation (`backend/Code.gs:1428` and `:1429`) to compare `lockWait`, `lockHold`, `roster.context`, preparation and commit durations by operation. Measure cold and warm reads separately, plus real morning contention, timeouts, transferred bytes and operations-document size. Local tests cannot establish Google service latency.
2. Shorten the demonstrated lock windows first. Preserve atomic domain decisions, expected revisions, idempotent receipts, uncertain-save recovery and the audit trail. Client caching and compression improve different costs and do not remove the server commit lock.
3. If measured contention still warrants a service split, give the Roster operational backend its own Apps Script project and exclusive ownership of its register, operations document, receipts, publication state and notifications. Keep Deploy/Layout under their current owner; expose verified published quota and catalogue data through a narrow read contract. Contacts and Calendar already have separate ownership. This first partition does not require a spreadsheet split.
4. Consider an independently owned Inbox service only if its traffic justifies another boundary. It already has a separate document but needs a clear duty/authority read contract. Do not split assignments, absence facts, receipts and notification intent across independent writers merely to increase apparent parallelism.

Two Apps Script projects must not independently replace the same operations JSON: their separate script locks would not coordinate. A migration needs one writer at a time, verified routing, preserved identifiers and rollback rules. No live migration is included or claimed by this assessment.

## v0.8.4 package ownership design

The requested moderate split uses separate fixed-role Deploy and Roster Apps Script artifacts. Deploy retains Deploy and Layout ownership. Roster owns its register, baseline uploads, operational document, Inbox, dated leases, notification service and audit exports. `backend/BackendRole.gs` supplies the role gate; its Roster activation requires both `ROSTER_WRITER_ENABLED=true` and `ROSTER_OWNER_SCRIPT_ID` equal to the executing project ID. A copied Roster project is disabled until explicitly configured. The Deploy artifact rejects Roster routes and Roster mutations.

This stage retains the existing Drive file and folder identities. It also retains read access to the published Deploy workbook for quotas, subject groups and personal calculations. Those reads use the existing pending-commit and revision checks in `backend/Relief.gs`, including `reliefGuard_()`. Roster must not recover or write a pending Deploy transaction. This is a writer ownership split, with a documented published-data read dependency; it is not a claim that the applications are storage-independent.

Separate project locks also change the cross-application consistency boundary. A Deploy publication can complete after Roster's final manifest check and before its operational commit. An overlapping Roster operation therefore uses its verified, version-bound published snapshot; the next read or planning cycle detects newer Deploy inputs. The existing pending-commit and manifest checks remain, but they do not guarantee the latest Deploy publication at the exact instant of a Roster commit. Atomicity within the single Roster owner and operations document is unchanged.

The package cannot deactivate historical web-app versions or stop executions already in flight. A live cutover must pause callers and scheduled work, install the guarded Deploy artifact, disable every older unguarded deployment that can still write the shared Roster files, remove old triggers, and verify old executions have finished before enabling the new Roster owner. All Roster browser, notification, private-link, Inbox and audit service traffic must then use that one owner. Preserve the existing data identifiers, receipt history and private-link signing configuration. Rollback must pause and drain the active owner before enabling another; two writers must never overlap.

The split removes the shared project-lock boundary only after correct deployment and routing. It does not remove Roster's own commit lock or turn a whole-file Drive write into a partial write. Validate the build and cutover contract before activation, then measure morning lock wait and hold times to establish the actual effect.

Use [ROSTER_BACKEND_CUTOVER_v0.8.4.md](ROSTER_BACKEND_CUTOVER_v0.8.4.md) for the installation and single-owner cutover sequence.
