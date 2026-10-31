# roster-d1-google-backup: once D1 is the Roster record, keep Google as a live backup and allow a safe switch back

- Status: claimed; implementation in progress. Owner authorised Row D1 on 31 Oct 2026.
- Owner/model: Codex (builder), Claude (architect and reviewer)
- Reviewer/model: Claude
- Last updated (Asia/Singapore): 31 Oct 2026 14:00
- Branch: codex/roster-d1-google-backup
- Base SHA: 396546d0546293cdb9e682fe3b282257e2495df8
- PR: none
- Files/domains owned: roster-update/public/edge-roster.js and edge-store.js (outbox on commit), a scheduled mirror lane (operations or notification Worker, or the Roster Pages Worker cron), backend/RosterEdgeMigration.gs (new mirror and release operations), Roster edge setup page, backend/RosterOperations.gs read/commit path (split layout), tests.
- Out of scope: running the switch (owner, see roster-d1-cutover runbook); LORD/Deploy.

## Background
- PR #8 (merged) imports the Roster into D1 at mode `imported`. Activation (`activate` in edge-roster.js) fences Google: Apps Script property `ROSTER_EDGE_AUTHORITY=d1` makes `rosterEdgeAssertLegacyWrite_` refuse every legacy write. From then on Google's Roster files stop changing.
- There is no way back today without losing D1 changes: no D1-to-Google copy and no unfence operation.

## Required
1. **Mirror outbox:** every committed D1 revision for scopes `roster` and `roster-register` is recorded in the same D1 transaction (revision number, time), so nothing can commit without being queued.
2. **Mirror lane:** a scheduled job (every minute, coalescing) sends the latest committed state to a new Apps Script operation `edgeMirror`. It writes only if the incoming D1 revision is newer than the last mirrored revision (stored in Script Properties). This operation is exempt from the legacy-write fence but accepts only signed Worker calls carrying a D1 revision.
3. **Split Google files (owner go 30 Oct):** the single `Roster operations.json` is already about 16M characters and grows about 1.5M a day, so one backup file cannot work. The mirror writes a split layout in a `Roster operations` folder:
   - `manifest.json`: schema, D1 revision, and for each part its file ID, character count and digest. Written last; it is the commit point.
   - `core.json`: settings, current state and anything not dated.
   - one file per month for dated collections (day records, audit, outbox history), for example `2026-10.json`. Base the split on the collections `storageReport` (PR #17) shows as largest.
   - Each part stays under 8M characters; if a month exceeds that, split it again by half-month. Report the largest part on the setup page.
   - Write only the parts whose digest changed. Old part files are trashed only after the new manifest is saved.
   - `Roster register.json` and the other snapshot parts follow the same rule if any exceeds 8M.
   - Reuse PR #8's chunking in reverse so the Worker never holds the whole Roster.
3b. **Depends on roster-operations-split-files.md** (built first, own PR): the mirror writes that layout, and `release` relies on the legacy split read path it adds.
4. **Lag visibility:** edge setup page and D1 job health show "Google backup: revision N, X minutes behind". Alert the Admin if behind more than 10 minutes during school hours (threshold from settings, not code).
5. **Switch back (`release`):** an Admin operation that (a) pauses D1 writes, (b) waits until the mirror reaches the current D1 revision, (c) verifies the manifest digests equal D1's, (d) clears the fence property, (e) tells the Admin to set the Pages variable `ROSTER_EDGE_AUTHORITY=legacy`. Refuses if any step cannot be proven.
6. Google remains read-only for users while D1 is the record; the mirror is the only writer.

## Acceptance
- Unit: each D1 commit creates exactly one outbox entry; a crash between commit and mirror leaves the entry for the next run.
- Mirror: two quick commits → one coalesced write at the newer revision; an older revision never overwrites a newer one.
- Production-size fixture (~14 MB): mirror within Worker memory/CPU limits (same method as PR #8 runtime evidence).
- Release: refuses while lag > 0; after catch-up, the manifest digests equal D1's and legacy writes work again on the split layout.
- Split: a 30M-character fixture round-trips (write split, read back, byte-identical); a change to one day rewrites only that month's part and the manifest; a crash before the manifest write leaves the previous manifest valid.
- Legacy without a manifest behaves exactly as today; `splitOperations` keeps the old file.
- Nothing changes while mode is `legacy` or `imported` (no mirror traffic before activation).

## Owner scope and implementation contract (31 October)

- Fold PR #19's split read/write implementation into this task; do not activate split storage while Google is authoritative.
- Mirror an immutable generation of both operational scopes, their receipts and native object references. Record revisions transactionally, coalesce mirror work, and publish a complete Google generation only after verification.
- Release quiesces and pauses all D1 writers, requires exact revision/digest catch-up, installs verified native pointers, then clears the Google fence. No live switch or configuration change is authorised in this task.
- Include #32 follow-ups: release script/notification locks before source upload; keep source/checkpoint/part files in a Roster import files child folder.
- #29 and #30 remain paused. Canonical code and generated copies, offline fixtures, System Health and edge setup are in scope. Claude reviews the exact head; owner merges.
- Claim is published on this task branch because automatic approval review previously rejected direct main claim updates. No PR is opened before the full Node and LORD suite passes.
