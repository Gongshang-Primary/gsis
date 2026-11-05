# roster-drive-outputs-bridge-error: Drive writes fail with ROSTER_BRIDGE_ERROR on v0.9.9n (live, 6 Nov)

- Status: claimed (owner on v0.9.9n, 6 Nov ~06:00, outputs disabled to stop alerts); Codex; lane R; priority 1 (blocks backups and daily outputs)
- Reviewer/model: Claude

## Evidence (Claude, D1 read-only + owner's Apps Script checks)
- After enabling (05:4x), every Drive write fails: `gsis_backup_ledger` excel 2026-11-06 (05:40:51, 05:44:51) and 2026-11-20 (05:42:30) `failed · ROSTER_BRIDGE_ERROR`; full backup 05:41:41 stuck `running`. Files were built and stored in R2 (e.g. 930,916 bytes raw workbook).
- Apps Script Roster GSiS executions: doPost runs at the same times **Completed** in 3-7 s with **no log**, so the request reaches Apps Script and is refused as a handled error (not an exception).
- Script Property `ROSTER_EDGE_AUTHORITY` = `d1` (OK). Owner ran a read-only diagnostic in the editor: `rosterDriveOutputGuard_` passes for daily and backup; Roster, Daily Relief and Backups folder metadata correct (parents and names match).
- Remaining suspects: (a) `rosterDriveOutputPrivacy_` scanning every unzipped workbook XML part and rejecting Office schema URLs or other strings as "private links" (regex on `https?://…` with `#`, `?token=`, `/external|private`); (b) the date/FINAL rule; (c) Drive upload HTTP failure; (d) something in `rosterDriveOutputsDispatch_` before the step.
- The alert "Roster Drive outputs need Admin attention: daily-output-failed:2026-11-06" reached the duty SMC by WhatsApp at 05:45; with one alert per date, a backlog of dates would send many messages.

## Required
1. **Record the real reason**: the Worker must store the Apps Script error message (sanitised, max 300 chars) and Google code in `gsis_backup_ledger.error`/manifest and job-health diagnostics, and show it in the ledger page and System Health. Never only "ROSTER_BRIDGE_ERROR".
2. Reproduce with a realistic workbook from the existing renderer and fix the root cause. If it is the privacy scan: scan only cell text/shared strings (and the TXT), not Office XML namespaces/relationships; keep the URL/JWT/credential rules for user-visible text; test that a normal workbook passes and a cell containing a private link is refused.
3. Stuck `running` full backup: expire after its lease and retry; never leave `running` indefinitely.
4. Alerts: one SMC/Admin alert per kind per day (e.g. "Daily Drive outputs failing: N dates"), not per date; no alert while the feature is disabled.
5. Tests: realistic workbook passes the writer end to end (fake Drive); error text reaches the ledger; stuck run recovers; alert dedupe.
6. Canonical build; full CI; exact head. Ships as v0.9.9o with #84 (and the Codex Contacts PR if ready).

## Codex claim (6 November 2026, Asia/Singapore)

- Owner/model: Codex; reviewer: Claude; lane R; priority 1.
- Branch: `codex/roster-drive-outputs-bridge-error`.
- Base: `65f82acceb90e3a1aa44fadac301cc39923444c1`.
- Scope: real Drive writer/privacy guard; backup and daily-output ledger, leases and alerts; signed bridge error projection; ledger/System Health UI; focused tests; canonical generated copies; task and changelog.
- Acceptance: realistic renderer workbook through fake Drive writer; private cell/TXT rejection; sanitised Google message/code in ledger and health; expired-run retry; per-kind/day alerts and disabled silence; canonical build and full Node/LORD CI.
- Owner's priority-1 instruction authorises this bounded work while #84 awaits review and #83 remains separate. No edits to allocator priority or Contacts work.
- Out of scope: deployment, live Drive/D1 writes, authority/config changes, notifications, release-label assembly and merging. Intended release is v0.9.9o with #84; owner merges after Claude review.

## Bug (owner 6 Nov ~06:10): Admins receive the duty-SMC message
Owner: "faizal received messages from WhatsApp meant for those on duty for assigning relief smc, but his name isn't checked in the SMC duty roster".
Evidence (D1 outbox): the Drive outputs alert at 2026-11-05T21:49:37Z (05:49 SGT) went as `smc_alert` / template `smc_attention` to the 8 duty SMCs of 6 Nov **and** all Admins (Faizal, Vivian (AE), Jay, Eric …). The template opens "you are on SMC relief duty at … on <date>", wrong for Admins not on duty. Faizal is correctly not on the 6 Nov duty list.
Required (same PR):
6. Operational/system alerts (Drive outputs, backups, restore drill, job health) go to **Admins only**, never to duty SMCs, using an Admin wording (no "you are on SMC relief duty"; e.g. "GSiS system alert for Admin: …"). Use an approved Admin template if one exists; otherwise use the existing generic template without the duty sentence, and list the new template text for Claude to submit to Meta.
7. Duty-SMC alerts (allocation/coverage issues) go only to that date's duty SMCs (plus Admins only where the existing rule explicitly says so, and then with Admin wording).
8. Tests: a Drive failure alerts Admins only with Admin wording; a coverage issue alerts the duty list only; an Admin who is not on duty never receives "you are on SMC relief duty".
