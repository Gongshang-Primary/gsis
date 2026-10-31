# roster-d1-cutover-freeze: freeze Google writers before the cutover snapshot, so activation cannot miss

- Status: approved, **top priority for the D1 path** (owner 1 Nov 2026 04:00 chose option A: finish the rehearsal, then build the freeze before cutover)
- Owner/model: Codex (builder)
- Reviewer/model: Claude
- Last updated (Asia/Singapore): 1 Nov 2026 04:05
- Branch: codex/roster-d1-cutover-freeze
- Base SHA: current main
- PR: none
- Lane: R (Roster core and D1), serial.

## Problem (evidence)
- Activation's fence (`edgeFence`, backend/RosterEdgeMigration.gs ~line 33) refuses unless `p.sourceDigest === rosterEdgeSnapshot_().sourceDigest`, i.e. Google is byte-identical to the import's capture.
- A real import takes well over an hour: rehearsal 3 (request f5f336a2…, v0.9.9e) needed 112 preparation steps before staging into D1.
- Background writers keep changing Google during that hour even on a quiet weekend: Worker crons (notifications claim, peer-mail, scheduled allocation every ~30 min, inbox, audit export), the nightly cold archive (16:00 to 24:00), and Apps Script maintenance. Any write changes the snapshot digest, so a fresh import is very likely stale by activation.

## Required
1. **Cutover freeze (Admin, edge-setup):** a new action "Freeze Google for cutover" that, under the Roster script lock:
   - sets a Script Property `ROSTER_CUTOVER_FREEZE` with actor, time and request ID;
   - makes every Google Roster writer refuse with a clear 423/503 "Roster is being moved; try again shortly" (user saves, intake processing, scheduled allocation, notification transport writes, archive, maintenance), without dropping queued Worker-side work (absence transport stays queued in D1 and is replayed later);
   - Worker background jobs see the freeze (via a cheap status call or a D1 flag) and skip Google writes, recording "skipped: cutover freeze" in job health.
2. **Import after freeze:** capture is allowed while frozen (it is a read), and the freeze guarantees the digest stays put until activation.
3. **Activation:** if frozen, activation proceeds as today (fence plus D1 active) and clears the freeze; the queued Worker work then drains to D1.
4. **Unfreeze without activating:** "Cancel freeze" returns Google to normal (for an aborted cutover), with audit.
5. **Timeout guard:** the freeze shows its age on edge-setup and in System Health; after 4 hours it raises an Admin alert (it does not auto-release).
6. Runbook update: `docs/v099/ROSTER_D1_CUTOVER.md` step 1 becomes "Freeze, then import".

## Acceptance
- With the freeze on: a simulated user save, intake run, scheduled allocation, notification claim and archive run each refuse or skip; the snapshot digest is unchanged across them.
- Queued absence transport is not lost; after activation it is applied to D1 exactly once.
- Cancel freeze restores normal writes.
- Activation after a frozen import succeeds; activation after an unfrozen, changed source still refuses (existing safety).
- Full suite (Node and LORD) green in the main checkout.
