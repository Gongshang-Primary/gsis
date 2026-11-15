# v1 PR #178 review (operation probe, Job 2 / T07), Claude

Project: **v1**. Model: Claude. Reviewed 15 Nov 2026 (Asia/Singapore). Advisory; the owner merges.

| PR | Head | Base | Size | Verdict |
|---|---|---|---|---|
| #178 Detect missing browser API dispatch | `bf2067c` | `77e30ee` (#175), sibling of #176 | 3 files, +1,093, test and task record only | **Approve.** Mark ready |

## Evidence I produced

Worktree at `bf2067c`, `npm ci` (root and `v1/`), `TZ=Asia/Singapore`, Node 22, Chromium path set:

1. `node tests/v1-product-operation-probe.mjs`: **pass**. 399 probes, 29 known missing, 121 scripts parsed.
2. **Mutation, missing direction:** I removed the `acquireStaplerLock` allowance. The program failed with "Unallowed missing handler". Restored.
3. **Mutation, stale direction:** I added an allowance for `saveAbsence`, which has a handler. The program failed with "Stale allowance". Restored.
4. Scope: three paths, as claimed. No product, build or workflow change. No overlap with #176.
5. Privacy: no email or phone-like strings added.

Not verified by me: CI at this head; the other 93 product programs at this head (unchanged from #175, which I did not rerun here).

## What it does well

1. It fails in both directions: on a new missing handler, and on an allowance that is no longer needed. The allow list can only shrink honestly.
2. It also fails on an allowance that no call site matches ("Undiscovered allowance").
3. Each allowance must name one domain, one concrete path, a ledger row and a reason.
4. It sends requests through the real browser transport, not straight to the gateway. That is stronger than the scan in the follow-up ledger.

## It corrects the follow-up ledger

1. **F13 `sysFields` is a false alarm.** It is a data field in a response, not a route. Codex was right to leave it out.
2. **F16 is not a call.** The three names are in a copied model file only.
3. **Two more real gaps found:** `archiveColdOutput` (archive confirm) and `cancelPendingNotifications` (delivery review cancel). I accept both: the stale check proves they are missing.
4. `/backup-ledger` is called with three operations (`read`, `verify`, `restore`), all missing.

The follow-up ledger now carries a correction note that points here.

## Notes (not blocking)

### N-1 (low): run time is close to the suite limit

The passing run took 28 s here. `scripts/v1/test.mjs` stops each program at 45 s. A slower CI runner may hit that. Watch the first CI runs; split the program or raise its own bound if it gets close.

### N-2 (low): 15 call sites are built at run time and are only reported

The probe lists 15 places where the operation name is not a literal (Calendar 4, Roster 11). They are printed, not checked. A new dynamic call can hide a missing handler. Pin the list of 15 in the allow file and fail when it grows.

### N-3 (info): the ledger pattern is fixed at F01 to F16

A gap found later needs a new ledger row and a pattern change. That friction is intended and acceptable.

## Merge order

After #175. Then rebase onto main and rerun, as the PR states. Job 3 may start only after #176 has landed or the owner says otherwise.
