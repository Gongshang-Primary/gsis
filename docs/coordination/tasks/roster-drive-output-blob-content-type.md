# roster-drive-output-blob-content-type: Drive daily outputs fail — blob built with a null content type

- Status: implementing — fix complete; full local suite and CI pending.
- Owner/model: Codex
- Reviewer/model: Muse
- Last updated (Asia/Singapore): 6 November 2026
- Branch: codex/roster-drive-output-blob-content-type (from owner-specified b5bd6f0)
- Base SHA: b5bd6f0c766f62513dc75bbf0c4263f2aa5e3326
- Current head SHA (or PR head; avoid self-referential commit hashes): (none yet)
- PR: (none yet)
- User-authorised scope: pass a content type when building blobs from bytes in backend/RosterDriveOutputs.gs (4 sites below); tighten the test fakes so they reject a missing content type; add a regression test that fails on current code and passes after the fix.
- Files/domains owned (include generated outputs): backend/RosterDriveOutputs.gs, generated Roster_Backend_v0.9.9.gs, backend/Code.gs and Deploy_Backend_v0.9.9.gs (canonical build copies required by WORKFLOW), tests/helpers/roster-daily-drive.cjs, tests/roster-drive-writer.cjs, one new regression test.
- Out of scope: full backups (BACKUP_OBJECT missing cached timetable part in R2; BACKUP_LEASE_EXPIRED assembly past the 15-minute lease) — separate work, not fixed by this change. No live flag changes, no deployment, no live data.
- Acceptance checks: regression test fails on current code and passes after; full Node suite green (TZ=Asia/Singapore); canonical build leaves no diff; draft PR only after full CI is green, naming Muse as reviewer at the exact head SHA.

## Decisions and changes

Diagnosis (Muse, 6 Nov 2026, from user-supplied Roster-backup-ledger.csv, 146 records) — no fix started, diagnosis only.

Root cause, verified by code reading: `backend/RosterDriveOutputs.gs:124`, in `rosterDriveOutputDaily_`:

`const bytes=Utilities.ungzip(Utilities.newBlob(Utilities.base64Decode(p.data))).getBytes();`

`Utilities.newBlob(byteArray)` with no content-type argument creates a blob with a null content type, and `Utilities.ungzip` throws "Blob object must have non-null content type for this operation". The payloads are fine; Drive is fine.

Ledger: 144 failed, 1 running, 1 verified. 119 ROSTER_DRIVE_OUTPUT rows are this one error in 10 languages; all 48 log rows and 71 of 80 excel rows fail this way; every failed row has bytes_raw and a digest but an empty drive_file_id — nothing ever reached Drive. The only success ever is a continuity Sheet write (f2bb925b, verified 16:39:41 SGT, 333 records) that uses the Sheets API, no blob — proving bridge, auth and Drive/Sheets all work.

#87's ROSTER_BRIDGE_ERROR was the mask, not the cause: the 9 rows with that error (05:40–05:50, all excel) are the same failure before #87's error propagation went live.

Fix (daily outputs only): pass the content type when building blobs from bytes, at 4 sites in `backend/RosterDriveOutputs.gs`:
- Line 124 (daily ungzip): `Utilities.newBlob(Utilities.base64Decode(p.data), 'application/x-gzip')`.
- Line 61 (gzip-audit log values, in `rosterDriveOutputPrivacy_`): `'application/x-gzip'`.
- Line 66 (excel privacy scan, in `rosterDriveOutputWorkbookPrivacy_`): `Utilities.unzip(Utilities.newBlob(bytes, 'application/zip'))`.
- Line 76 (full-backup verify, in `rosterDriveOutputVerify_`): `'application/x-gzip'`.

Lines 55, 89, 96 are safe (string blobs / getBytes only) — leave them alone.

Also tighten the test fakes: `tests/helpers/roster-daily-drive.cjs` and `tests/roster-drive-writer.cjs` implement fake ungzip/unzip with no content-type check, so the local suite passes while live fails. Make them throw unless the content type matches, and add a regression test through the strict fakes. Reference: the repo's own test `tests/contacts718-roster-performance.cjs:74` models real `ungzip` as throwing unless the content type is `application/x-gzip`.

Flag contradiction (unresolved, for the owner): the handover says Drive backups/daily outputs are disabled, but both jobs gate on D1 config flags and the attempts from ~15:02 SGT only happen while the flags are on — the live flags were on from about 15:02. Worth checking who or what turned them on. Do not change any live flag in this task.

## Verification

Diagnosis evidence: ledger analysis (146 records) plus code reading of `backend/RosterDriveOutputs.gs` and the two test fakes, re-verified by Muse 6 Nov 19:13 SGT (all four sites confirmed in the file). No fix run, no live check. Exact command, tested commit, outcome and evidence for the fix to be recorded here by Codex. Explicitly list checks not run.

Live verification (owner-gated, after deploy): enable daily outputs once and watch `gsis_backup_ledger` for excel/log rows with status `verified` and a drive_file_id.

## Review

Reviewer/model: Muse. Review at the exact head; record evidence (CI run ID, local test counts, build-no-diff) in `docs/coordination/review/pr<N>-muse-review.md`. Advisory review is not human approval.

## Deployment

Not deployed unless supported by explicit environment/version/time evidence. State staging and production separately.

## Handoff

Codex: claim, create branch `codex/roster-drive-output-blob-content-type` from main b5bd6f0, implement the four sites plus the strict fakes and regression test, run the build and the full suite locally, open a draft PR only after full CI is green. Full backups stay separate work after this. No secrets or private school data.

Claim: Model: Codex. No open PRs returned by GitHub at claim time. Owner explicitly selects b5bd6f0 as implementation base, overriding the default accepted-claim base. This claim alone is published to current main; it will be carried onto the implementation branch.

## Implementation evidence (Model: Codex)

- Claimed on main at eca0d9c; implementation branched from the owner-selected b5bd6f0.
- Added gzip/ZIP MIME types at precisely the four specified sites. Safe string/getBytes blobs are unchanged.
- Both fakes retain blob content types and reject decompression with a missing or wrong type. The daily helper also preserves ZIP entry names in the third newBlob argument.
- New `tests/roster-drive-blob-content-type.cjs` exercises daily audit and workbook upload/readback, workbook private-link rejection, nested compressed audit privacy and backup digest/count verification, plus strict fake rejection.
- Before the source fix, `TZ=Asia/Singapore node tests/roster-drive-blob-content-type.cjs`: 1 passed, 4 failed with missing gzip content type. After: 5/5 passed. `TZ=Asia/Singapore node tests/roster-drive-writer.cjs`: passed.
- `TZ=Asia/Singapore npm run build`: passed; canonical generation copies the same four changes to all three backend bundles. No hand edits to generated files.
- Full local Node/LORD suite running; CI will run on this branch push. Historical comparisons retain the runner's existing exclusions and are not claimed as passes. No live checks, configuration changes or deployment.
- Rollback: revert this PR and regenerate backend copies. Full backup object assembly and lease failures remain a separate task. Muse reviews the exact final head; owner merges/releases.
