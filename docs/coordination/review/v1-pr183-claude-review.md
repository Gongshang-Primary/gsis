> **Superseded on 16 Nov 2026.** This approval was written before the owner decided the open point. The owner then answered "no. only published versions": with a publication in force, a saved draft must not reach Roster. The verdict at `9d6db12` is now **changes requested**. See `v1-pr183-184-claude-review.md`, section "Owner answers on #183". Do not merge `9d6db12` on the strength of the approval below. Note added by Claude session `session_01L5sZ14xpe864PwuPQKyrDF`; the text below is unchanged.

# v1 — PR #183 review (Roster workload copy; Deploy no longer locked by Roster), Claude

Project: **v1**. Model: Claude (v1 review session). Reviewed 16 Nov 2026 (Asia/Singapore).

| Item | Value |
|---|---|
| Head reviewed | `9d6db12e` |
| Base | `7198f193` |
| Own diff | 2 commits, 16 files, +346/−51 |
| Verdict | **Approve** (advisory; owner merges) |

## Evidence I produced

Worktree at the exact head, `npm ci` (root and `v1/`), `TZ=Asia/Singapore`, Playwright Chromium. Ten focused programs pass: roster-workload-snapshot, roster-workload-recovery, roster-workload-browser, roster-estimated, roster-service, roster-capacity, roster-accounting, deploy-storage, deploy-venues, migration-packaging. `npm run build` and `scripts/v1/build.mjs` succeed, no drift. Merge-tree with current main clean. All paths are v1 except one added row in `OWNER_DIRECTIVES.md` recording the owner's decision.

Not run by me: the full product suite and full Node/LORD (owner reports two shards green, the rest running).

## What changed

Owner directive (16 Nov), recorded in this PR: "Roster holds it own temporary version, Deploy saves/publishes/republish updates Roster's in-force version."

1. New Roster table `roster_workload_snapshots`: one current workload copy per school and date, digest-identified, 1 MiB limit, additive migration `0005`.
2. Each workload-dependent Roster read or operation refreshes the copy from Deploy. The update is compare-and-set on the revision read **before** calling Deploy, so a late, older response cannot overwrite a newer copy; unchanged content keeps its revision.
3. Roster commits check their local copy's revision and digest atomically with the allocation; each run records the exact copy it used.
4. Deploy no longer takes or checks planning pins for Roster, and publication fencing ignores Roster pins (including stranded older ones). Layout, Venues and other consumers keep their fences.
5. Deploy's workload source re-reads its pointer, candidate versions and selected revision before answering and refuses with `WORKLOAD_SOURCE_CHANGED` if any moved. A present publication must verify; corruption cannot fall back to an unpublished estimate.

## Assessment

This removes a guard **by owner decision**, and the trade-off is stated honestly: a Roster run can use a consistent but slightly older copy while a Deploy save finishes; the next Roster read picks up the change. Saved unpublished edits stay labelled estimated and never become verified weekly R. That matches the directive and is a reasonable design: Deploy authors, Roster reads a copy, neither blocks the other.

The one changed existing test (`roster-estimated`) replaces "Roster pins Deploy" assertions with "no pins taken" and "run records its workload copy identity". That fits the new design and is not a weakening.

## Note

The owner directive row is written by Codex inside an implementation PR. That is acceptable here because it is reviewed with the code it governs, but the owner should confirm the quoted wording is theirs before merging.

F5 OPEN. Official T1B-01/T1B-02 and unperformed runtime UAT: Not tested.
