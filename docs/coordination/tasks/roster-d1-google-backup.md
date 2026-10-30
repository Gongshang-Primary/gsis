# roster-d1-google-backup: once D1 is the Roster record, keep Google as a live backup and allow a safe switch back

- Status: approved, priority (owner 30 Oct 2026: "prioritise the list for D1 authoritative for roster")
- Owner/model: Codex (builder), Claude (architect and reviewer)
- Reviewer/model: Claude
- Last updated (Asia/Singapore): 30 Oct 2026 11:00
- Branch: codex/roster-d1-google-backup
- Base SHA: current main
- PR: none
- Files/domains owned: roster-update/public/edge-roster.js and edge-store.js (outbox on commit), a scheduled mirror lane (operations or notification Worker, or the Roster Pages Worker cron), backend/RosterEdgeMigration.gs (new mirror and release operations), Roster edge setup page, tests.
- Out of scope: running the switch (owner, see roster-d1-cutover runbook); LORD/Deploy.

## Background
- PR #8 (merged) imports the Roster into D1 at mode `imported`. Activation (`activate` in edge-roster.js) fences Google: Apps Script property `ROSTER_EDGE_AUTHORITY=d1` makes `rosterEdgeAssertLegacyWrite_` refuse every legacy write. From then on Google's Roster files stop changing.
- There is no way back today without losing D1 changes: no D1-to-Google copy and no unfence operation.

## Required
1. **Mirror outbox:** every committed D1 revision for scopes `roster` and `roster-register` is recorded in the same D1 transaction (revision number, time), so nothing can commit without being queued.
2. **Mirror lane:** a scheduled job (every minute, coalescing) sends the latest committed state to a new Apps Script operation `edgeMirror` that writes Google's `Roster operations.json` and `Roster register.json` (and transport/inbox/intake parts the snapshot owns). It writes only if the incoming D1 revision is newer than the last mirrored revision (stored in Script Properties), using the existing atomic file-commit path. This operation is exempt from the legacy-write fence but accepts only signed Worker calls carrying a D1 revision.
3. **Size:** reuse PR #8's chunking in reverse (parts, digests, one final commit) so the Worker never holds the whole Roster; stay under the 16,000,000-character operations file cap and report clearly if near it.
4. **Lag visibility:** edge setup page and D1 job health show "Google backup: revision N, X minutes behind". Alert the Admin if behind more than 10 minutes during school hours (threshold from settings, not code).
5. **Switch back (`release`):** an Admin operation that (a) pauses D1 writes, (b) waits until the mirror reaches the current D1 revision, (c) verifies Google's digest equals D1's, (d) clears the fence property, (e) tells the Admin to set the Pages variable `ROSTER_EDGE_AUTHORITY=legacy`. Refuses if any step cannot be proven.
6. Google remains read-only for users while D1 is the record; the mirror is the only writer.

## Acceptance
- Unit: each D1 commit creates exactly one outbox entry; a crash between commit and mirror leaves the entry for the next run.
- Mirror: two quick commits → one coalesced write at the newer revision; an older revision never overwrites a newer one.
- Production-size fixture (~14 MB): mirror within Worker memory/CPU limits (same method as PR #8 runtime evidence).
- Release: refuses while lag > 0; after catch-up, Google digest equals D1 digest and legacy writes work again.
- Nothing changes while mode is `legacy` or `imported` (no mirror traffic before activation).
