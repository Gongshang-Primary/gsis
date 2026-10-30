# roster-operations-split-files: store Roster operations as split Google files, removing the 16M cap

- Status: approved, priority (owner 30 Oct 2026: "yes, raise cap first", then build split read path as its own PR before D1)
- Owner/model: Codex (builder), Claude (architect and reviewer)
- Reviewer/model: Claude
- Last updated (Asia/Singapore): 30 Oct 2026 17:00
- Branch: codex/roster-operations-split-files
- Base SHA: current main (b836f30 or later)
- PR: none
- Files/domains owned: backend/RosterOperations.gs (read, commit, new Admin operation), Roster Admin UI for the conversion, generated backends, tests.
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
