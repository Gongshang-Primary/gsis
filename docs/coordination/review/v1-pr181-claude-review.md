# v1 PR #181 review (Job 3, Roster unblock), Claude

Project: **v1**. Model: Claude (session `session_01L5sZ14xpe864PwuPQKyrDF`). Reviewed 16 Nov 2026 (Asia/Singapore). Advisory; the owner authorises merges.

| PR | Head | Base | Size | Verdict |
|---|---|---|---|---|
| #181 Roster locks, baseline mapping and estimated allocation | `8b15cb2d3c79717828ab66a8359e30522f82b901` | `a1606c2` (main) | 28 files, +1,072/−187, 9 commits | **Approve to merge.** One condition before the estimated path is used on the hosted site (C-1). One rollback condition (C-2) |

## Method and its limit

Full read of every changed file under `v1/services/`, `v1/allocator/` and `v1/web/shared/`, plus the allow-list change and the one existing test that was edited. I ran the full product suite at the exact head. I did not read every line of the seven new test programs.

## Evidence I produced

Worktree at `8b15cb2`, `npm ci` (root and `v1/`), `TZ=Asia/Singapore`, Chromium path set, Node 22:

1. `node scripts/v1/test.mjs`: **104 of 104 product programs pass.**
2. Probe allow list: exactly two entries removed, `acquireStaplerLock` (F01) and `releaseStaplerLock` (F02). The probe passes inside the suite, so both now have handlers and no new gap appeared.
3. The one existing test edited (`tests/v1-product-roster-service.mjs`) gained a case and lost none. It is stricter.

Not verified by me: CI at this head; canonical build drift; the hosted site. The package asks for Node 24.15 or later.

## What it does, checked against the owner directives of 15 Nov

1. **Stapler lock (F01, F02).** `acquireStaplerLock`, `renewStaplerLock` and `releaseStaplerLock` map to the existing lease. The lease holder is now the actor plus the browser tab, so two tabs of one person conflict correctly. The Stapler permission check still runs inside the lease. Stapler saves must hold the exact fence, checked before and inside the transaction.
2. **Baseline mapping (H02, B04, B05).** A source label maps to up to 32 rooms. A label may stay unmapped; the baseline then reports `unmappedVenueLabels` and `occupancyComplete: false`, and the screen shows a warning. Name bridges are returned for automatic teacher matching. This is "accept, store and flag".
3. **Estimated allocation (B08, G01, G02).** Used only when no Deploy publication pointer exists. If a pointer exists and the publication is missing or corrupt, that is still an error. Estimated figures are never captured as observed quota records. The allocator reports `usable` and `verified` separately.
4. **Automatic publication stays blocked** unless workload is verified (`WORKLOAD_UNVERIFIED_AUTOPUBLISH_BLOCKED`). Manual publication is allowed and carries the evidence in its payload.
5. **The label ships in the same PR:** a banner on the allocation, candidates, availability and capacity views naming the source version and revision, and "Estimated workload" in the export headers.
6. **The new Deploy route is closed to everyone but Roster** (`/internal/roster-workload`, `SERVICE_DENIED` otherwise).

No authority, capability or revision check was weakened.

## Conditions

### C-1 (medium, before the estimated path is used on the hosted site): version selection can guess the wrong year

`v1/services/deploy/roster-workload.mjs` picks one saved version: not deleted, date range covers the day, newest by creation time. A version with an empty `from` or `to` covers every day. The hosted site holds two saved versions (2026 and 2027, per Run B). If their ranges are empty or overlap, a November 2026 relief day may be calculated from the 2027 plan. The banner names the version used, so the error is visible, but only to a reader who checks it.

Before use: confirm on the hosted site that exactly one saved version covers each current date, by setting the date ranges. Follow-up fix: when more than one version covers the date, do not choose. Return workload as unavailable and say why.

### C-2 (low, rollback): the baseline format is one-way

Baselines saved with multi-room arrays cannot be read by the earlier build. The PR's own rollback note says so. Do not roll back after the first multi-room save without an export of the baselines.

## Findings for follow-up (not blocking)

### F-1 (medium, design): Deploy edits are now refused while Roster holds a saved plan

`protectPlanningChange` puts every Deploy planning save behind the source-change protocol on `planning:<version>`. While a Roster allocation holds a pin on that version, a Deploy save returns 409 `SOURCE_CHANGE_PENDING`. That is correct while the Roster operation is live. But it is the same mechanism that left operations "prepared" in Run B (B-R01, B-D03). A Roster operation that never settles can now block ordinary Deploy editing. Add a bounded release for pins whose operation never reached commit, and a clear message on the Deploy screen naming what is holding the plan.

### F-2 (low): unmapped rooms mean Venues cannot see that occupancy

An unmapped label keeps the timetable usable, but Venues gets no occupancy for it and could accept a booking in a room that is in use. The warning says "review venue mapping before publication". Consider blocking publication of occupancy, not of the baseline, while labels are unmapped. Owner to choose.

### F-3 (info): G03 is not addressed

`currentDuty` on an empty school still needs a check that it returns an empty answer and not a server error. I did not find a change for it in this PR. Confirm, or carry it to the next job.

## Merge

May merge to main now. Not deployed. No hosted conclusion follows from this approval.
