# Review: PR #100 — Fix Drive output compression blob content types

- Reviewer/model: Muse
- Reviewed head: `7b984092c56828f32b4ea3cdc881b3db40d310f7`
- Branch: `codex/roster-drive-output-blob-content-type`
- Task: `docs/coordination/tasks/roster-drive-output-blob-content-type.md`
- Verdict: **approve** at the exact head above. The owner merges.

## Evidence

- CI at the exact head: run 42213211941, all 5 jobs success (full-suite plus Regression shards 1–4), verified through the check-runs API on the head commit.
- Local, worktree at the exact head, `TZ=Asia/Singapore NODE_NO_WARNINGS=1`, Chromium `~/.cache/ms-playwright/chromium-1234/chrome-linux64/chrome`:
  - `tests/roster-drive-blob-content-type.cjs` (new) — PASS (exit 0).
  - `tests/roster-daily-edge.mjs` — PASS (exit 0).
  - `tests/roster-daily-writer.cjs` — PASS (exit 0).
  - `tests/roster-daily-workbook-writer.cjs` — PASS (exit 0).
  - `tests/roster-audit-backfill-edge.mjs` — PASS (exit 0).
  - `tests/roster-drive-output-envelope.cjs` — PASS (exit 0).
  - `tests/contacts718-roster-performance.cjs` — PASS (exit 0).
  - `TZ=Asia/Singapore npm run build` — PASS, `git status` clean (no generated diff).
- Fail-on-old-code check (my own): the new test file run in a worktree at main `eca0d9c` fails (exit 1, strict-fake assertion), so the regression test proves the fix. Codex's task record reports the same result in detail (1 passed, 4 failed before the fix; 5/5 after).
- The final head differs from the tested code head `1527407` only in the task record (19 lines); the product code is identical, and CI at the final head is green.
- Merge: `git merge-tree --write-tree --name-only origin/main HEAD` clean (tree `8f2ea0d866b3b5d43a8803be94ae267e17dbb6b8`); GitHub reports MERGEABLE / mergeStateStatus CLEAN at review time. Main at review time: `eca0d9c`.

## Scope — matches the task file exactly

- All four specified sites in `backend/RosterDriveOutputs.gs` pass a content type: line 61 gzip-audit (`application/x-gzip`), line 66 excel unzip (`application/zip`), line 76 full-backup verify (`application/x-gzip`), line 124 daily ungzip (`application/x-gzip`). The safe string/getBytes blobs (lines 55, 89, 96 and the non-gzip branch of line 76) are untouched.
- Both test fakes now retain the blob content type and reject decompression with a missing or wrong type (`ungzip` requires `application/x-gzip`, `unzip` requires `application/zip`); `setContentType` stores the value instead of discarding it. The daily helper preserves ZIP entry names in the third `newBlob` argument.
- New `tests/roster-drive-blob-content-type.cjs` (5 tests): strict-fake rejection, daily audit decompress + Drive readback, daily workbook decompress + cell scan + readback + private-link rejection, compressed-audit privacy validation, backup digest/count verification.
- Files are exactly the authorised set: `backend/RosterDriveOutputs.gs`, the three generated backend copies (`Roster_Backend_v0.9.9.gs`, `Deploy_Backend_v0.9.9.gs`, `backend/Code.gs`), the two test fakes, the new regression test, and the task file. The generated copies carry the same four changes and match the canonical build (no diff). No files outside the task scope, no secrets, tokens, private links or private school records.

## Live safety

- No D1 changes, no Roster state changes, no relief movement, no live flag changes, no deployment. The change only makes Apps Script decompression accept the blobs the Worker already sends.
- Full backups are not restored by this change: the verify site is fixed, but the missing cached timetable part in R2 and the 15-minute lease assembly problem are separate, and the task file and PR body both state that. Daily excel/log outputs are the ones this fixes.
- The flag contradiction from the diagnosis (handover says Drive outputs are disabled, but the ledger shows attempts while the flags were on) is still unresolved and is not changed by this PR; it needs the owner's check, not a code change.
- Rollback is as stated in the PR body: revert this PR and regenerate the backend bundles. No schema or configuration migration.

## Findings

- None blocking.
- Note: Codex's local full-suite evidence (1034/1034 Node programs, 40/40 LORD) was recorded in the task file; I ran the changed/new and directly affected test files locally and relied on the green CI run at the exact head for the full suite, which is the review gate.

## Release notes for the owner

Daily Drive outputs (excel and log) failed before upload because Apps Script received compressed blobs with no content type. This sets `application/x-gzip` at the three gzip sites and `application/zip` for workbook privacy scanning, and the test fakes now enforce those content types so the local suite cannot pass while live fails. Full backups still fail for their separate reasons (missing R2 timetable part, 15-minute lease) and stay separate work. After deploy, verify live by enabling daily outputs once and watching `gsis_backup_ledger` for excel/log rows with status `verified` and a drive_file_id.
