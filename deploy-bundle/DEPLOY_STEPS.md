# GSiS v0.9.9r owner deployment steps

Model: Muse. Build only; not deployed. Reviewer: Codex at the exact source and bundle heads in the release-record PR. The owner decides whether and when to deploy. Do not treat this document as live verification.

## Provenance and scope

- Source main: `db57e3ef42888a8ca7dff158c4fdfda037a838de`.
- Tested r label/source: `405a516c37ebd9ae20ac7cf54feff13729057658`, also in `COMMIT.txt`. Label in `LABEL.txt`: `0.9.9r`.
- Previous deployed q source: `7fa63d234eecd40735545eb4c7b7bfb50f6b1744`; rollback bundle: `deploy/2026-11-10-v0.9.9q`, artifact commit `1b37ab8818dcf90b0f9610398bc5989c92d72b69`. **r supersedes the deployed q**: q was deployed from its bundle on 10 Nov and never merged, so main never got the q label; r contains everything q had plus #111 and #112.
- Owner bundle branch: `deploy/2026-11-11-v0.9.9r`. Build did not cross midnight SGT.
- Build/source checks passed at label head `405a516` with no diff (canonical build re-run at the label head). The complete local npm-test run (1045/1045 current Node programs and 40/40 LORD programs, exit 0, with GSIS_BROWSER_EXECUTABLE, ROSTER_TEST_CHROMIUM and LORD_TEST_CHROMIUM all set to the Playwright chromium-1234 path, TZ=Asia/Singapore and NODE_NO_WARNINGS=1) was at the label head `405a516`. Full CI at the label head is recorded in the release PR. Bundle payload/archive/checksum verification is recorded in the release PR; a separate full-suite run at the later artifact-only bundle commit is not claimed.
- Runtime source and bundles contain every merge since the p label commit 0bb7033: all five merges below. The r functional changes are #107, #109, #111 and #112 only; #106 is the baseline p release-publication merge, not a new r change. No merge is omitted. Intervening task/review records remain in history. #108 is still an open draft (approved) and its product changes are not included; an inherited approval document is not that implementation. #103 is still an open draft and its product changes are not included.
- This is a code/label release, not a database migration, authority cutover, queue activation or provider/template activation. No migration file changed since p. Preserve existing flags, URLs, bindings, queue/database/bucket identities and Google authority/routing. Do not apply repository example configuration as replacement live settings.

## What changed since p

| Merge commit | Included history |
| --- | --- |
| `c2c492c62133d73b3bcde8f78da0baaf0793996b` | Merge pull request #106 from helper-gsps/codex/release-v0.9.9p — baseline p release publication, not a new r change |
| `03782ca3d89b0464b90cce2a2dc9da3169b3793a` | Merge pull request #107 from helper-gsps/codex/gsis-secret-consolidation-roster-deploy |
| `7e78799e9c210a6b713d11ef6a541d372d1135f7` | Merge pull request #109 from helper-gsps/muse/assign-relief-export-baseline-adhoc |
| `0f51376dd03acea520288f12d4d851f4c7290c4b` | Merge pull request #111 from helper-gsps/codex/roster-intake-instruction-drafts-drain |
| `3e6368432f5bd6158d9ba7dbef8ba171ed1a7728` | Merge pull request #112 from helper-gsps/muse/assign-relief-export-stapler-format |

- #107 consolidates Roster/Deploy transport to GSIS_SECRET-only. New helpers `backend/RosterDeployApiSecret.gs` and `shared/roster-deploy-api-secret.js` read GSIS_SECRET only and fail closed (503 `GSIS_SECRET_INVALID`) on missing/invalid values (32–8000 printable ASCII). Roster browser-session derivation now uses GSIS_SECRET. No legacy transport name is read by Roster/Deploy code. Contacts/Calendar were already consolidated in p; this release does not change them.
- #109 narrows Assign Relief Export Excel and the Drive daily file to baseline-named plus ad hoc relief teachers, selected day only, with Stapler formatting restored (header-line legend, green/blue colours) and absence reasons hidden in the download — including reasons already embedded in imported timetable lessons (fixed at f70cbe0, regression test `tests/roster-assign-relief-export-privacy-import.cjs`).
- #111 makes the scheduled received-report drain process retained edge instruction/peer drafts even when attendance transport is idle, and after forwarding fresh reports. Reuses the existing bounded, idempotent processor and preserves timetable-ID/parity review fences. Synthetic regression covers seven retained drafts, fresh capture, both scope mismatches and repeated no-op ticks. The live seven 10 Nov absence reports' instruction receipts should progress from 'pending' after deploy; that recovery is owner verification, not a build claim.
- #112 routes Assign Relief Export Excel through the Stapler screen-export path when a usable baseline is available: filename "<date> Stapler - Teachers TTb saved <date> <time>h.xlsx", sheets "Teacher Summary" and "Class POV", A1 "Teacher Summary · <date> · Current Stapler plan", weekday row, "Start / End" row, "Teacher" row with period numbers, teachers from row 6. It also hides absence reasons on every retained weekday, including non-selected weekdays' baseline cells (fixed at 1102d2e, regression test `tests/roster-assign-relief-export-privacy-weekday.cjs`). Without a usable baseline it falls back to the relief-workbook layout.
- #108 (edge-queue P1, Deploy) is approved but NOT merged and NOT in r. The edge queue is not enabled by this release; Deploy remains direct.
- **Full backups are NOT fixed by this release.** Missing R2 timetable parts (`BACKUP_OBJECT`) and assembly beyond the 15-minute lease (`BACKUP_LEASE_EXPIRED`) remain separate failures. A daily-output success is not proof of full backup or restore.

## Artifact inventory and classification

The historical handover folder is named `optional-label-only/`. In r it carries only unprefixed label-only frontend updates; there are no `REQUIRED_`-prefixed files, because Contacts, Calendar and LORD have no product changes in r and their backends are byte-identical to p's and omitted.

| Artifact | Owner target / classification |
| --- | --- |
| `1_Roster_Backend.gs` | Required Roster Apps Script backend, includes #107 (GSIS_SECRET-only), #109 (dailyExport scope), #111 (drain wiring is Worker-side; backend unchanged by #111) and #112 (export path is frontend-side; backend unchanged by #112). |
| `2_Deploy_Backend.gs` | Required Deploy Apps Script generated backend, includes #107 and #109 (shared roster-operations). |
| `3_Roster_Frontend.zip` | Required existing Roster Pages site, includes #107 (session derivation, secret helper), #109 (export fix), #111 (drain wiring) and #112 (Stapler-format export). |
| `4_gsis-roster-notifications_worker.js` | Required existing notification Worker, includes #107 (GSIS_SECRET-only helper) and #111 (drain wiring). |
| `5_gsis-operations_worker.js` | Required existing operations Worker, includes #107 and #109 (shared roster-operations, secret helper) and #111 (drain wiring). |
| `6_Deploy_Frontend.zip` | Required existing Deploy Pages site, includes #107 (GSIS_SECRET-only helper). |
| `optional-label-only/Contacts_Frontend.zip`, `Calendar_Frontend.zip`, `LORD_Frontend.zip`, `Layout_Frontend.zip`, `Venues_Frontend.zip`, `OVERLORD_Frontend.zip`, `STARLORD_Frontend.zip` | Optional r label/asset-query updates on their corresponding existing Pages sites. No product change required there. |
| `emergency/EdgeAuthorityTools.gs` | Byte-identical prior emergency tool; preserve separately in Roster Apps Script. Do not run authority-changing functions for this release or an ordinary code rollback. |
| `COMMIT.txt`, `LABEL.txt`, `SHA256SUMS.txt`, `DEPLOY_STEPS.md` | Provenance, integrity and owner runbook. SHA256SUMS covers every other delivered file, including these notes, but not itself. |

Venues backend, Contacts backend, Calendar backend and Calendar job Worker are byte-unchanged from p source and intentionally omitted. There is no `7_Venues_Backend.gs` because the conditional handover requirement is not met. Do not replace an unchanged backend just to change a frontend label.

## Before deploying: owner-only checks and private preparation

1. Check out the exact reviewed bundle commit named in the release PR, not the moving main branch. In `deploy-bundle/`, run `sha256sum -c SHA256SUMS.txt`. Require every file to match. Keep the old q bundle and existing deployment/version IDs for rollback.
2. Privately capture current settings, flags, bindings, deployment URLs, crons and previous versions for each changed app. Preserve all existing state, pending request IDs, receipts and uncertain jobs. Do not export secret values or school records into this branch or the PR.
3. Align GSIS_SECRET privately before switching the Roster/Deploy code: the same operator-selected value (32–8000 printable ASCII, no spaces) must exist at both ends of each Worker/backend pair (Worker environment and Apps Script Script Properties). Roster Pages, Roster Apps Script, Roster notification Worker, Roster operations Worker, Deploy Pages and Deploy Apps Script must agree, and active Roster/Deploy service peers must use that same effective credential for their paired calls. The new Roster/Deploy code does not use legacy transport names as fallback — a mismatched or missing GSIS_SECRET fails closed (503) instead of falling back. Do not rotate credentials as part of this build. (GSIS_SECRET was already aligned for q; if q is live and aligned, no re-alignment is needed for r.)
4. Keep CALENDAR_SESSION_SECRET unchanged and independent from GSIS_SECRET. Keep external-link rotation keys, provider credentials, existing URLs and bindings. Retain legacy transport configuration names until the matching new code is live on both ends and owner verification passes; removing them early breaks rollback or unmigrated peers. Contacts/Calendar code is unchanged in r and keeps its q behavior.
5. The owner attributes the earlier Contacts 401 to Apps Script deployment lag. Save alone does not update the `/exec` deployment. Contacts is not changed in r; if its deployment is touched, update the existing deployment to a new version and explicitly verify Contacts entry afterward. Do not treat this release as an independent diagnosis/config fix.

## Deploy order: owner executes, builder does not

1. Roster Apps Script: paste `1_Roster_Backend.gs` into the existing main source file, retain the existing separate emergency tool, Save, then Deploy > Manage deployments > edit the existing deployment > New version > Deploy. Record the previous version privately. Keep the same deployment ID/URL, execution identity and access policy.
2. Deploy Apps Script: apply `2_Deploy_Backend.gs` through the same new-version procedure on its existing deployment.
3. Complete each backend/Worker pair in the controlled rollout window with aligned GSIS_SECRET; a mismatched intermediate pair is not verification. Roster and Deploy pairs must both be aligned before either is switched.
4. Deploy `4_gsis-roster-notifications_worker.js` and `5_gsis-operations_worker.js` to the corresponding existing Workers with all existing bindings/secrets/settings retained. Preserve existing Queue producer/consumer wiring. The operations Worker gains no new route, cron or authority flag from this release.
5. Deploy Pages archives to their existing sites: `3_Roster_Frontend.zip` and `6_Deploy_Frontend.zip`. Do not upload a backend `.gs` as a Worker or a frontend ZIP to the wrong site.
6. Optionally deploy the seven unprefixed label-only frontend ZIPs. Sites left on their old optional frontend keep the old header; that is not a missing required product update. Hard-refresh changed sites and confirm the intended r label; preserve open drafts/request identities rather than clearing app storage to hide a mismatch.

### Crons and manual settings

- Do not change live settings as part of building this release. The owner compares the preflight snapshot after each Worker deployment.
- Notification Worker source reference has five UTC cron expressions: `* * * * *`, `15 18 * * *`, `2-57/5 * * * *`, `1-59/2 * * * *`, `0-58/2 * * * *`. Preserve the existing approved live schedule; if it differs, investigate before changing it. Do not duplicate triggers or paste sample `[vars]` values over live flags.
- Preserve `WHATSAPP_ENABLED`, menu/diagnostic/inbox/template settings and provider credentials. This release does not enable templates/buttons. Check existing Meta approval separately before any owner-chosen activation. The 10 November SMC WhatsApp silence is a separate open incident; this release does not claim to fix it.
- Preserve `ROSTER_EDGE_AUTHORITY`, `DEPLOY_EDGE_AUTHORITY`, backend fences, recovery flags and Google authority for existing Google scopes exactly as currently approved. This build does not hand over any authority, turn on the proposed edge queue or run migrations. Do not invoke `edgeAuthorityRollbackToLegacy` during routine release/rollback.
- Keep full-backup configuration unchanged. Daily-output verification below is one explicit owner verification step, separate from full backups.

## Checks after owner deployment

1. Verify sign-in and entry for Roster and Deploy. Roster must load through its newly deployed Apps Script `/exec` version without 401. If it fails, stop and compare the paired deployment versions/effective GSIS_SECRET privately; do not paste secret values into logs or the PR. Deploy sessions must retain their existing derivation.
2. With approved staging/test data, check Roster/Deploy reads and a safe owner-approved save/receipt. In Assign Relief, Export Excel must produce the Stapler layout (filename "<date> Stapler - Teachers TTb…", sheets "Teacher Summary" and "Class POV", A1 "Teacher Summary · <date> · Current Stapler plan", weekday row, "Start / End", period numbers, teachers from row 6), list baseline-named plus ad hoc relief teachers only for the selected day, and show no absence reason in the download. Stapler teacher search (from p) must still work. Do not create real bookings/messages/absence changes just to test a release. Existing uncertain writes are checked by their original IDs, never blindly resubmitted.
3. Verify Deploy publish reports its Contacts and Layout outcomes separately. A successful Deploy save is not proof that Contacts catalogues updated. Use the existing fenced Contacts retry only for the same confirmed publication, with owner-approved data.
4. Check the 10 Nov absence reports' instruction receipts: the seven reports that sat at 'pending' ("Relief instructions are being checked") should progress after the scheduled drain runs (to 'applied', or 'needsReview' if a timetable scope changed). If any report is still 'pending' after a drain cycle, stop and diagnose before treating the release as verified.
5. Daily outputs were verified live under p (excel/log rows `verified` with drive_file_id from 9 Nov). No daily-output code changed in r. If the owner re-checks, require an excel row and a log row with status `verified` and a nonempty `drive_file_id`. A queued/running row, a Sheets-only continuity result or a failed row with no file ID does not pass.
6. **Do not claim full backups work.** Missing R2 timetable parts and the 15-minute assembly lease are separate unresolved failures. Do not start a full backup or restore as the daily-output smoke test, and do not mark backup acceptance based on excel/log rows.

## Rollback

1. Stop a rollout on mismatched deployment/version/authentication or unverified output. The owner restores any temporary daily-output setting to its captured prior state and retains failure/receipt evidence. Do not clear pending jobs or assume a timeout means no write happened.
2. Restore each affected backend and paired Worker/Pages deployment to the captured previous q versions together. Retain GSIS_SECRET and legacy transport configuration names so the matching previous pair can authenticate (q Roster/Deploy code reads GSIS_SECRET first and falls back to legacy names). Recheck active service peers after rollback. No secret rotation, authority flag/fence toggle or data restoration is implied.
3. Restore notification/operations Workers to their captured previous deployments while preserving current durable queues, bindings, crons and provider settings. Restore required/optional Pages sites only where changed.
4. If r has already created new intake, receipt or pending journal state, obtain an owner/Muse compatibility check before reverting the affected runtime. Preserve original identities and uncertain outcomes. Do not force an old reader to process unrecognized state, delete D1/Drive data or run a full restore to reverse code.
5. Re-verify app entry, source route, receipt recovery and System Health. A code rollback returns to q, which still lacks #111/#112; the Stapler-format export and the intake-drafts drain revert with it. No rollback has been executed by this build.
