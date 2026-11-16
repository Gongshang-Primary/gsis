# v1 PRs #183 and #184 review, Claude

Project: **v1**. Model: Claude (session `session_01L5sZ14xpe864PwuPQKyrDF`). Reviewed 16 Nov 2026 (Asia/Singapore). Advisory; the owner authorises merges.

| PR | Head | Kind | Verdict |
|---|---|---|---|
| #183 Deploy stays editable while Roster uses its own workload copy | `9d6db12edf510a34a19516e901e9fb9531b703e4` | code, 16 files, +346/−51, one additive migration | **Code approved. Merge only after the owner confirms the new directive row (O-1) and chooses on O-2** |
| #184 Central Google backup file service plan | `688e2aef42f3c552645cd7e1d65df1b5b410d9fa` | design document, 2 files | **Approve as document.** No implementation is authorised by it |

Main at review time: `3c80c02`.

## #183

### Evidence I produced

Worktree at `9d6db12`, `npm ci` (root and `v1/`), `TZ=Asia/Singapore`, Chromium path set, Node 22:

1. `node scripts/v1/test.mjs`: **107 of 107 product programs pass.**
2. Full read of every changed file under `v1/services/` and `v1/migrations/`.
3. The one existing test edited (`tests/v1-product-roster-estimated.mjs`) swaps the Deploy-pin assertions for "no pins" plus a check that the run keeps the exact local workload identity. That follows the design change; it does not weaken an authority or revision check.

Not verified by me: CI at this head; canonical build drift; the hosted site; the migration applied to a real D1. The package asks for Node 24.15 or later.

### What it does

1. Roster keeps a local workload copy per school and date (`roster_workload_snapshots`, new additive table, 1 MiB bound). It is refreshed from Deploy on each workload-dependent request and guarded by local revision and digest inside the Roster transaction.
2. Deploy no longer takes or checks planning pins on save, Contacts acceptance or delete. Publication fencing ignores Roster pins, including pins stranded before this change, and refuses new ones (`WORKLOAD_SNAPSHOT_REQUIRED`). Layout, Venues and other consumers keep their fences.
3. A present publication is always verified first. A missing or corrupt publication is still an error, never a reason to fall back.
4. Allocation runs record the workload copy's revision and digest.

This removes the concern in my #181 review F-1: a stuck Roster operation can no longer block Deploy editing. Current identity, authority, revision and idempotency checks are unchanged.

### Owner confirmations needed before merge

**O-1. The PR adds an owner directive row that I cannot verify.** `OWNER_DIRECTIVES.md` gains a 16 Nov row quoting the owner: "Roster holds it own temporary version, Deploy saves/publishes/republish updates Roster's in-forc version". The row says it supersedes the older rule that unpublished Deploy data never reaches Roster, for this workload projection. The owner did not say this in the session I can see. A builder writing a directive that reverses an earlier owner rule needs the owner's direct confirmation of the wording and of the reversal.

**O-2. Side effect of the rule as written.** After a publication exists, a saved draft edit to the same Deploy version makes Roster's workload "estimated" until the next publish (`roster-workload.mjs`: the published contract is used only when the saved revision equals the published working revision). While estimated, automatic publication is blocked and weekly R is not captured. So an ordinary draft save in Deploy can stop Roster's next automatic publication with no warning on the Deploy screen. Options for the owner:

1. Keep as written (drafts are visible to Roster at once; Deploy planners must republish promptly).
2. Roster keeps the last published workload until the next publish; drafts reach Roster only when no publication exists.

Either way, the Deploy screen should say when a saved draft differs from the publication Roster is using.

### Findings for follow-up (not blocking)

1. **F-1 (low, speed):** every workload-dependent Roster request, reads included, now calls Deploy, may recompute the whole workload from the saved document, and may write a row. Measure it on the hosted site. Consider refreshing only when Deploy's version revision or publication pointer has changed.
2. **F-2 (low):** two concurrent Roster requests that see different Deploy states can fail a read with 409 `ROSTER_WORKLOAD_CHANGED`. Make it retry once inside the service.
3. **F-3 (carried):** #181 C-1 still applies. With no publication, the newest saved version covering the date is chosen; versions with no date range cover every date.
4. **F-4 (deployment):** the new table needs its migration applied before the Roster Worker that reads it is deployed.

## #184

A design record. It changes no code and activates nothing. I read it against the existing backup modules it cites.

### What is sound

1. Backups move behind one Apps Script file adapter, asynchronous and off the save path. It states that a Google or script outage must never stop an ordinary save, and lists a test for that.
2. Each application still owns its data and export rules. Apps Script only reads and writes bounded registered files; no SQL, no roles, no notifications.
3. Durable intent before every external write; "acknowledged" is not "verified"; a timeout is "unknown" and is reconciled against the same file ID, never retried into a second file.
4. Freshness is by content, not age. No automatic deletion. REIGN archives stay immutable.
5. Old and new writers never run together for one dataset.

### Points the owner should know

1. **This brings Apps Script back.** The v1 goal was to remove the Google middle layer. The plan keeps it out of every user-facing path, which is consistent with that goal. It stops being consistent the moment anything a user waits for depends on the script.
2. **The script endpoint must accept anonymous requests.** A Worker cannot sign in as a Google user, so the web app must be reachable by anyone and the request signature is the only gate. The plan specifies body signing, expiry, intent binding and a derived key. It correctly makes the Workspace web-app access setting a precondition. Add an explicit replay rule: an operation ID already completed returns its stored result and performs no file action.
3. **It is not a restore plan.** It yields readable workbooks and recovery files. It does not show a full owner database restored and brought back into service. That gap stays open.
4. **Core has no readable dataset yet.** The plan says so. Account and access-grant records would have no readable backup until that is designed.
5. **The Drive folder ID is already public** in five places on main, including a code default (`v1/runtime/drive-backup.mjs`). An ID gives no access by itself. Confirm the folder is not shared by link: the Contacts workbook holds names, mobile numbers and birth dates.
6. Apps Script limits (six-minute executions, daily quotas, payload size) are named as acceptance gates, not assumed. Keep it that way.

### Quiet mode

The plan records the owner decision to remove the quiet-mode control in v1 (follow-up ledger F08) and to keep notification quiet hours. Remove the probe allow-list entry in the same change that removes the caller.

## Evidence limits

No hosted conclusion follows from either verdict. F5 remains open. Runtime UAT remains not tested.
