# roster-operations-split-files: store Roster operations as split Google files, removing the 16M cap

- Status: implementing (owner 30 Oct 2026: next approved changelog item; no deployment)
- Owner/model: Codex (builder), Claude (architect and reviewer)
- Reviewer/model: Claude
- Last updated (Asia/Singapore): 30 Oct 2026 17:00
- Branch: codex/roster-operations-split-files
- Base SHA: 6bb4844e5488c9566215f915df04617c9d7d735b
- PR: none
- Files/domains owned: backend/RosterOperations.gs (read, commit, new Admin operation), backend/RosterNotificationMaintenance.gs (existing raw reader/writer compatibility), Roster Admin UI and legacy edge routing for conversion, generated backends and Workers, tests, task/plan/changelog evidence.
- Out of scope: D1 mirror (roster-d1-google-backup.md builds on this); pruning (owner: "cannot prune. need to keep records").

## Background
- `Roster operations.json` is about 16M characters and grows about 1.5M a day. PR #17 lets the Admin raise the save ceiling to at most 24M; that buys days, not months.
- Every read and commit loads and rewrites the whole file, so it also gets slower as it grows.
- PR #17's `storageReport` shows which collections are largest. Use it to choose the split.

## Required
1. **Layout:** a `Roster operations` folder next to the current file:
   - `manifest.json`: schema, revision, and for each part its file ID, character count and digest. Written last; it is the commit point.
   - `core.json`: settings, current state and anything not dated.
   - one file per month for dated collections (day records, audit, outbox history), e.g. `2026-10.json`. If a month exceeds 8M characters, split by half-month.
2. **Read:** if a manifest exists, read it, then the parts, and assemble the same state object the code uses today. If no manifest exists, use the single file exactly as today.
3. **Commit:** write only parts whose digest changed, then the manifest. Old part files are trashed only after the new manifest is saved. Keep the existing lock, revision and conflict checks unchanged. The PR #17 ceiling applies per part, not to the whole.
4. **Conversion:** an Admin-only `splitOperations` operation, with a button on the existing storage report: converts the single file, verifies the split reads back byte-identical, then switches. The old file is kept, renamed `Roster operations (before split YYYY-MM-DD).json`, never deleted. Refuses if any check fails and leaves the single file in use.
5. **Undo:** an Admin-only `joinOperations` writes the single file again from the parts if it fits under the ceiling, otherwise refuses with the size.
6. **Visibility:** the storage report shows layout (single or split), number of parts and the largest part.
7. Caching (`roster-version-v2` key) keeps working; the manifest revision feeds the key.

## Acceptance
- A 30M-character fixture round-trips: split, read back, deep-equal and byte-identical after re-serialising.
- A change to one day rewrites only that month's part and the manifest (count Drive writes in the fake).
- A crash before the manifest write leaves the previous manifest valid and readable.
- Without a manifest, every existing Roster test passes unchanged.
- Conversion keeps the old file; undo refuses when too large.
- Full suite green in the main checkout. Regenerate bundles.

## Implementation decisions and coordination

The owner approved this specification and asked Codex to continue while deployment waits. Claude remains the exact-head reviewer. No open PRs were observed when claiming, and main includes #18. Publish this claim on the task branch in a draft PR because earlier automatic review rejected direct-main claims; do not retry a main write.

Use immutable replacement parts and update the active manifest last. Keep the active file ID in the existing ROSTER_OPERATIONS_FILE property; a new manifest is activated only after read-back verification. Preserve JSON field and record order, compressed plans, receipt identities, sent/uncertain outcomes and all operational records. Root revision belongs in the manifest so a dated change need not rewrite core.json.

Monthly parts over 8M characters split by half-month; larger halves use bounded record pages. Reject an individually oversized record before writing. A reader pinned to an older manifest retries if its superseded part becomes unavailable. Cleanup of superseded parts follows a confirmed commit and cannot change a saved result.

Conversion and join use the existing ScriptLock, verified Admin authority, revision and storage token checks, and a retained request ID. Keep the single-file backup. No automatic conversion, pruning, D1 activation or notification send.

## Current verification and handoff

Implementation not yet verified. Main has Claude's reported 878/878 Node and 38/38 LORD run at #18; Codex independently passed eight focused programs, syntax and byte-identical build there. The new branch must pass fresh regression, crash/retry/concurrency checks and the full suite before review. Plan: docs/superpowers/plans/2026-10-30-roster-operations-split-files.md.
