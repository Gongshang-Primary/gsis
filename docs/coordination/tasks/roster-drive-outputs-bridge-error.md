# roster-drive-outputs-bridge-error: Drive writes fail with ROSTER_BRIDGE_ERROR on v0.9.9n (live, 6 Nov)

- Status: review preparation (owner on v0.9.9n, 6 Nov ~06:00, outputs disabled to stop alerts); Codex; lane R; priority 1 (blocks backups and daily outputs)
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

## Retired by Claude on owner instruction (6 Nov 08:02, "programmatically retire it first")
- D1 `gsis_roster_daily_outputs`: reset `failure_count`, `last_error`, `next_attempt_at` on 7 dates (5, 6 Nov at 2 failures; 16-20 Nov at 1) so the "daily-output-failed" warning that drives the WhatsApp alert is cleared and cannot re-fire on the next failure. The `gsis_backup_ledger` failure rows are kept unchanged (records).
- Both features remain disabled in System Config (`driveBackup.enabled=false`, `driveDaily.enabled=false`); no outbox alert jobs are queued.
- The 24 alert messages already sent (05:45 and 05:49) cannot be recalled. Open smcAlert records for 6 Nov stay as audit history.


## Implementation and reproduction (Codex, 6 November 2026)

The unmodified writer accepted a 919,742-byte workbook from the existing renderer (150 teachers, 17 periods). Its actual Office schema URLs did not trigger the guard. A metadata-only URL containing a fragment does reproduce the broad XML-scan false positive; the new guard scans parsed cell/shared-string values, decodes XML entities and joins rich-text runs. Private cell links and JWTs, TXT rules, backup privacy, folder/authority guards, stable file IDs and FINAL protection remain enforced.

The live refusal itself is not yet reproduced. Confirmed diagnostic losses are fixed: Drive HTTP errors discarded the Google reason; the JSON wrapper mislabelled transport exceptions; doPost replaced every Roster 503 with a generic message; Worker ledgers kept only the code. Authenticated output calls now carry a sanitised message and Google code through the real envelope, ledger error/manifest, job-health diagnostics, ledger UI and System Health. Messages and displayed errors are bounded to 300 characters; URLs, credential values, JWTs, email addresses, long identifiers and stacks are removed. Ordinary Roster errors retain their existing privacy projection.

Expired full/increment attempts are failed even while outputs are disabled, before schedule/backoff selection and retried even when a recent successful full would otherwise defer the next hour. Captured temporary items are cleaned; failed ledger evidence is retained and late completion cannot mark an expired attempt verified.

Daily alerts use one stable identity per kind and Singapore date, including uncertain queue-response retries. Daily failure count covers the full queue. Backup, continuity and restore-test alerts are grouped separately. Disabled settings are checked both before enqueue and against the current mutation state. There are no healthy/empty alerts.

## Verification and remaining gate

Canonical build: all 18 components rebuilt locally. Focused tests cover the real signed doPost/writer refusal, a realistic workbook, private-cell rejection, parsed rich text, ledger/health propagation, lease retry and late completion, alert identity reuse and disabled silence. The notification timer/D1/render/signed-bridge integration checks sanitised diagnostics in the actual job-health table. UI checks render errors as literal text.

Local Chromium installation returned an empty/truncated download. The local LORD run therefore stopped at its browser check; that is not a pass. Full Node/LORD verification must complete in GitHub CI before opening the review PR. No live requests, Drive writes, notifications, authority changes or deployment were used.

Base: accepted claim `0ac29a6510832493ae034c52f09a2461184dc112`, built from main tree `397b65866a990822527b11e39b2923324d0a3b06`. Direct Git authentication was unavailable, so the local source was refreshed through the GitHub connector and every tracked blob verified against that exact tree. Publishing uses the same connector and checks tree identity. Reviewer: Claude; owner merges. Release labels remain coordinator-owned for v0.9.9o with #84.

Next: full exact-head GitHub CI, Claude review, owner merge. After a separately authorised deployment, inspect the next retained refusal to identify any remaining live configuration/provider cause. Do not describe this as a live-verified incident fix.


## Review handoff

All 19 focused local programs passed, including the large restore-limit regression. The final disabled-expiry addition also passed the output-error, backup-job, backup and daily-queue programs. Both local canonical builds rebuilt all 18 components. No tracked build drift remains.

Implementation first published at `9ebda6a36ba6fb789a21981f9533f449f21a60a0`; follow-up adds expiry while disabled. The exact final head, full CI result and PR link are in the PR description/owner handoff. The locally reconstructed commits are not GitHub history; remote trees are hash-checked against the local tree. Claude reviews the complete final diff. No merge or deployment is authorised to Codex.

## Admin audience correction and current-main refresh (Codex, 6 November)

System alerts now use active Roster Admin IDs only and a separate system_alert contract. Coverage alerts retain the selected date’s duty list. Both Google and D1 claim/presend checks reject legacy Drive jobs carrying duty wording, removed/inactive Admin recipients and disabled outputs. Existing sent records remain audit history.

No approved generic Admin contract exists in the repository. The proposed gsis_system_alert_v1 body is in notification-worker/system-alert-template.proposed.json for Claude to submit; activation stays disabled until approval and live contract verification. This is a release dependency for WhatsApp system alerts. Ledger and System Health diagnostics do not depend on template approval.

Current continuation: canonical build passed all 18 components. Eleven focused programs passed, including Admin/duty separation through both eligibility implementations, the real timer/D1/renderer/signed fake-Drive path, template payload preparation with a synthetic approval fixture, provider-result settlement, retry recovery, and all 14 SMC schedule checks. No real notifications were sent. Full CI must pass at the newly published head; earlier green CI belongs to 29e0e16 only. Local checkout contains selected source/tests, so no full local-suite pass is claimed. Main product source was refreshed through a7b74aa; its later changes were coordination documents only.
