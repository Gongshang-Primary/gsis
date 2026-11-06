# venues-muse-ownership: Muse owns Venues (viewport, backend, and the Roster→Venues feed check)

- Status: assigned to **Muse** (owner 6 Nov ~09:05: "the venues-viewport is less time-sensitive, let muse handle entirely"); lane Y (Venues part). Claude reviews each PR at its exact head; owner merges.
- Reviewer/model: Claude

## Scope Muse owns
- `venues-viewport/public/` (frontend), `backend/DeployVenues.gs`/Venues Apps Script backend (`Venues_Backend_v0.9.9.gs` generated), Venues tests and docs.
- Roster-side Venues code (`backend/RosterVenues.gs`, Roster edge venues sync in `roster-update/public/edge-roster*.js`, `public/edge-venues-fence.js`) is lane R: Muse may read and propose; any change there needs Claude's OK first (one-line message in the PR), because Roster is live on D1.

## Open items, priority order
1. **Roster→Venues feed on D1 (check first).** Since the D1 fresh start (5 Nov 23:10) the Worker job `venues-sync` reports `SKIPPED` every run (latest 6 Nov 09:05); before that it failed with VENUES_FENCE_PENDING (46 times on 5 Nov). Find out whether Venues occupancy now receives Roster's D1 timetable/relief at all, why it skips, and what Venues shows for 6 Nov. Report findings in this file before changing code.
2. **#67 "stale" false alarm**: the Venues status "stale" is treated as pending, raising VENUES_FENCE_PENDING when the fence is clear (seen 4-5 Nov). Fix so only a real pending token alerts.
3. Venues design spec follow-ups: docs/superpowers/specs/2026-10-25-venues-design.md (owner to prioritise later).
4. Recovery note: tasks/roster-venues-fence-after-rollback.md (read for history).

## Rules
One PR at a time (finish or pause the Stapler teacher-search PR first, or ask the owner which first). Rebase on current main; canonical build at the final head and commit regenerated bundles (gate: no diff); full CI; exact head SHA; Model: Muse.
