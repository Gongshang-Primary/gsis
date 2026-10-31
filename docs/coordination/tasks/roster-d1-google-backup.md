# roster-d1-google-backup: once D1 is the Roster record, keep Google as a live backup and allow a safe switch back

- Status: implemented; full Node/LORD verification pending at the published head.
- Owner/model: Codex (builder), Claude (architect and reviewer)
- Reviewer/model: Claude
- Last updated (Asia/Singapore): 31 Oct 2026 13:55
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

## Implementation decisions

- PR #19 is folded into this row. Native Google operations and register readers recognize its manifest/core/monthly format; single files remain single while Google is authoritative. Oversized individual JSON entries use a verified fragment extension, preserving exact ordering and bytes.
- A transactional revision outbox and immutable D1 generation cover both operational scopes, receipts and durable report transport. Bounded pages are copied to private Google staging, with immutable models, audit objects and source workbooks copied separately. A complete generation manifest is the commit point.
- The Worker never loads the complete Roster. Google materializes one native document/part stage per call. Old D1 staging rows are culled only after newer verified generations exist; current and recent proofs remain retained.
- Switch-back stops new work, waits for existing work, pauses both D1 scopes, verifies the final generation and installs all native pointers before clearing the Google fence. Failed preflight resumes D1; a lost final acknowledgement reuses the original release identity. No release operation was run against live services.
- Existing stale D1 environment flags remain insufficient to change routing. A read-only primary check must prove both imported scopes, their stored roots and matching activation history before the D1 route is admitted. Google remains the selected record in the current legacy/imported state.
- Both #32 follow-ups are included: production locks end before the frozen source upload, and new import files use the private `Roster import files` child folder. Existing root-folder captures remain readable.
- Native restoration retains provider uncertainty, SMC/peer choices, inbox data, planning leases, command receipts and source workbooks. Release refuses unresolved transport or peer/instruction work that cannot safely be handed over.

## Verification and handoff gate

Local first integration rebuilt all 18 components. Focused storage, mirror-core, client, backend, native replay and UI checks passed. Production-size checks exercise 30M-character split documents, a 14M-character mirror and the 16M-character import fixture. Real workerd/D1 measurements are recorded under `docs/coordination/review/roster-d1-mirror-runtime.json`.

Full Node and LORD verification is still pending. The PR will be opened only after both pass at the exact published head. Browser-dependent checks run in repository CI; no browser installation or live deployment was used here.

Owner's follow-up order: after this PR is ready, continue #19 cleanup, #30 and #29 without waiting for Claude's review. Each retains its own branch/review and owner merge decision.

Final local checks: 13 focused compatibility/integration programs passed, plus the 14M end-to-end native restoration fixture. The fresh workerd/D1 run processed 15,290,116 source bytes in 40 pages, sampled 71,901,074 bytes peak isolate memory, and 144.498 ms maximum sampled CPU. These are synthetic local runtime measurements; live Google timing remains an owner rehearsal gate.

Integrated current main `5c202c0bcaffcfccb06b656802907771762ae01f`, preserving the v0.9.9d label update and new D1 design rule. Implementation and verification remain scoped to this Row D1 PR.
