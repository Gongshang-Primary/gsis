# GSiS v0.9.9p owner deployment steps

Model: Codex. Build only; not deployed. Reviewer: Muse at the exact source and bundle heads in the release-record PR. The owner decides whether and when to deploy. Do not treat this document as live verification.

## Provenance and scope

- Source main: `1bddd5fd526ccc1abe4fed3c2cea5b489cb174ae`.
- Tested p label/source: `0bb7033a9b2bdd953ddb5434660e2a391d960251`, also in `COMMIT.txt`. Label in `LABEL.txt`: `0.9.9p`.
- Previous deployed o source: `d667c11dbb1c4441fb34d0e2578a866874ad7fcc`; rollback bundle: `deploy/2026-11-06-v0.9.9o`, artifact commit `ec7a1f4f18a6efbd4e9d8d3efbb3b51bdf9cdd90`.
- Owner bundle branch: `deploy/2026-11-08-v0.9.9p`. Build did not cross midnight SGT.
- Build/source checks passed at this exact label head with no diff. Complete local npm-test rerun passed: 1041/1041 current Node programs and 40/40 LORD programs, exit 0, with ROSTER_TEST_CHROMIUM and LORD_TEST_CHROMIUM both set to /usr/bin/chromium, TZ=Asia/Singapore and NODE_NO_WARNINGS=1. Full CI run [42485689449](https://github.com/helper-gsps/gsis/actions/runs/42485689449) passed all five jobs at that source head. Bundle payload/archive/checksum verification is recorded in the release PR; a separate full-suite run at the later artifact-only bundle commit is not claimed.
- Runtime source and bundles contain every merge since d667c11: all 11 PR merges and all four branch-sync merges below. No merge is omitted. Intervening task/review records remain in history. #103 is still an unmerged draft and its product changes are not included; an inherited partial-review document is not that implementation.
- This is a code/label release, not a database migration, authority cutover, queue activation or provider/template activation. No migration file changed since o. Preserve existing flags, URLs, bindings, queue/database/bucket identities and Google authority/routing. Do not apply repository example configuration as replacement live settings.

The initial local suite passed 1041/1041 Node programs but stopped at a LORD browser test because its separate LORD_TEST_CHROMIUM variable was unset. The failed program then passed with the installed browser; final validation above records the complete rerun with both browser variables. No source or assertion changes were made to bypass the failure.

## What changed since o

| Merge commit | Included history |
| --- | --- |
| `09ca3071d46d5a848157599b3250e109cace21a2` | Model: Muse / Merge main 5e1738e into lord-return-collection-scroll |
| `787810f5f39af707d5a29610075b7d9d5c3c6550` | Merge pull request #94 from helper-gsps/muse/venues-muse-ownership |
| `71e11f12c841adc7dba710e9da3b3196075547ea` | Merge pull request #97 from helper-gsps/codex/review-pr94-venues-findings |
| `f72d744d3c34f839337b9fbff4e9c56ddc618d93` | Merge pull request #95 from helper-gsps/codex/whatsapp-remaining-v2-contracts |
| `999c1a4ab085a95ae79af214dad77dbff541509d` | Merge pull request #98 from helper-gsps/muse/lord-return-collection-scroll |
| `390662268efda013a70d6ca34601d36ec4e2abfd` | Merge pull request #96 from helper-gsps/codex/roster-intake-overlap-message |
| `152740727c8731ece90e6b4875540bc558837b94` | Model: Codex / Reconcile main claim and latest intake fixes |
| `5cc4408c70de69b4cb24c790ce85390758c4ba7c` | Merge pull request #100 from helper-gsps/codex/roster-drive-output-blob-content-type |
| `47ff233b3f0c283d9f3062bfb280c8e2792a520e` | Model: Muse / Merge main 0214363 into Stapler teacher-search branch (CHANGELOG conflict resolved, both entries kept) |
| `ccbe4a90aa51a9edad1b851b90e787ed74036bda` | Merge pull request #99 from helper-gsps/muse/stapler-add-tile-teacher-search-rebase |
| `4da2fa85f86142a9a5a2ec6e16a084dcf7133702` | Model: Codex / Merge main 0890f05 into D1 parity inventory |
| `27527f5cbf1d8754bd51a3a65175bec6535d8d82` | Merge pull request #101 from helper-gsps/codex/roster-d1-parity-sweep |
| `772d42411c0a2962f970347a04c26bf6e4c186b8` | Merge pull request #102 from helper-gsps/codex/gsis-secret-consolidation |
| `d3600690da00fce95257560b9d08fc16933bac62` | Merge pull request #104 from helper-gsps/codex/gsis-secret-consolidation-calendar-rebase |
| `ff44f9c2b731150a7b6e091cfbaf32914573ab7f` | Merge pull request #105 from helper-gsps/codex/edge-queue-design-note |

- #100 supplies explicit gzip/ZIP blob content types for Drive daily-output decompression and workbook privacy checks. The delivered o Roster backend lacks those types; p includes them. This is the point of the release, subject to owner verification below.
- #96 adds D1 intake overlap/review outcomes; #99 adds Stapler teacher search; #98 improves LORD collection/return long-scroll behavior. #95 captures WhatsApp v2 contracts, without enabling message/template routes.
- #102 Contacts and #104 Calendar require GSIS_SECRET-only transport. #94/#97, #101 and #105 carry findings/review, parity inventory and design documentation; #105 does not implement or activate the proposed edge queue.
- #90 Deploy-to-Contacts publish reporting/retry is retained from o, not newly introduced. An applied Deploy publish and an applied Contacts catalogue remain separate outcomes.
- **Full backups are NOT fixed by this release.** Missing R2 timetable parts (`BACKUP_OBJECT`) and assembly beyond the 15-minute lease (`BACKUP_LEASE_EXPIRED`) remain separate failures. A daily-output success is not proof of full backup or restore.

## Artifact inventory and classification

The historical handover folder is named `optional-label-only/`. In p it also carries explicitly `REQUIRED_`-prefixed product updates. Those files are mandatory; only the unprefixed files there are optional label refreshes.

| Artifact | Owner target / classification |
| --- | --- |
| `1_Roster_Backend.gs` | Required Roster Apps Script backend, includes #100. |
| `2_Deploy_Backend.gs` | Required Deploy Apps Script generated backend. |
| `3_Roster_Frontend.zip` | Required existing Roster Pages site. |
| `4_gsis-roster-notifications_worker.js` | Required existing notification Worker. |
| `5_gsis-operations_worker.js` | Required existing operations Worker. |
| `6_Deploy_Frontend.zip` | Required existing Deploy Pages site. |
| `optional-label-only/REQUIRED_Contacts_Backend.gs` | Required Contacts Apps Script backend for #102. |
| `optional-label-only/REQUIRED_Contacts_Frontend.zip` | Required Contacts Pages Worker/frontend for #102. |
| `optional-label-only/REQUIRED_Calendar_Backend.gs` | Required Calendar Apps Script backend for #104. |
| `optional-label-only/REQUIRED_Calendar_Frontend.zip` | Required Calendar Pages Worker/frontend for #104. |
| `optional-label-only/REQUIRED_Calendar_Job_Worker.js` | Required existing Calendar job Worker for #104; retain its database, bindings and schedules. |
| `optional-label-only/REQUIRED_LORD_Frontend.zip` | Required LORD Pages frontend for #98 long-scroll/collection behavior. #103 assertions follow-up is absent. |
| `optional-label-only/Layout_Frontend.zip`, `Venues_Frontend.zip`, `OVERLORD_Frontend.zip`, `STARLORD_Frontend.zip` | Optional p label/asset-query updates on their corresponding existing Pages sites. No product change required there. |
| `emergency/EdgeAuthorityTools.gs` | Byte-identical prior emergency tool; preserve separately in Roster Apps Script. Do not run authority-changing functions for this release or an ordinary code rollback. |
| `COMMIT.txt`, `LABEL.txt`, `SHA256SUMS.txt`, `DEPLOY_STEPS.md` | Provenance, integrity and owner runbook. SHA256SUMS covers every other delivered file, including these notes, but not itself. |

Venues backend and LORD backend are byte-unchanged from o source and intentionally omitted. There is no `7_Venues_Backend.gs` because the conditional handover requirement is not met. Do not replace an unchanged backend just to change a frontend label.

## Before deploying: owner-only checks and private preparation

1. Check out the exact reviewed bundle commit named in the release PR, not the moving main branch. In `deploy-bundle/`, run `sha256sum -c SHA256SUMS.txt`. Require every file to match. Keep the old o bundle and existing deployment/version IDs for rollback.
2. Privately capture current settings, flags, bindings, deployment URLs, crons and previous versions for each changed app. Preserve all existing state, pending request IDs, receipts and uncertain jobs. Do not export secret values or school records into this branch or the PR.
3. Align GSIS_SECRET privately before switching the Contacts/Calendar code: the same operator-selected value must exist at both ends of each Worker/backend pair (Worker environment and Apps Script Script Properties). Calendar Pages, Calendar Apps Script and Calendar job Worker must agree. Active Contacts/Calendar service peers must use that same effective credential for their paired calls; still-unmigrated Roster/Deploy/Venues/LORD code retains its existing setting names and behavior. Do not rotate credentials as part of this build.
4. Keep CALENDAR_SESSION_SECRET unchanged and independent from GSIS_SECRET. Keep external-link rotation keys, provider credentials, existing URLs and bindings. Retain legacy transport configuration names until the matching new code is live on both ends and owner verification passes; removing them early breaks rollback or unmigrated peers. The new Contacts/Calendar code does not use retained names as fallback.
5. The owner attributes the earlier Contacts 401 to Apps Script deployment lag. Save alone does not update the `/exec` deployment. Update the existing deployment to the new version below and explicitly verify Contacts entry afterward. Do not treat this release as an independent diagnosis/config fix.

## Deploy order: owner executes, builder does not

1. Roster Apps Script: paste `1_Roster_Backend.gs` into the existing main source file, retain the existing separate emergency tool, Save, then Deploy > Manage deployments > edit the existing deployment > New version > Deploy. Record the previous version privately. Keep the same deployment ID/URL, execution identity and access policy.
2. Deploy Apps Script: apply `2_Deploy_Backend.gs` through the same new-version procedure on its existing deployment.
3. Contacts Apps Script: apply `REQUIRED_Contacts_Backend.gs` to its existing deployment. Calendar Apps Script: apply `REQUIRED_Calendar_Backend.gs` to its existing deployment. Complete each backend/Worker pair in the controlled rollout window with aligned configuration; a mismatched intermediate pair is not verification.
4. Update the existing Calendar job Worker from `REQUIRED_Calendar_Job_Worker.js`, retaining `CALENDAR_JOBS_DB`, backend URL, schedule and feature flags. Do not apply a new schema, create a new database or enable continuation/push flags. Preserve `CALENDAR_SYNC_CONTINUE` and Calendar change-push flags at their currently approved values.
5. Deploy `4_gsis-roster-notifications_worker.js` and `5_gsis-operations_worker.js` to the corresponding existing Workers with all existing bindings/secrets/settings retained. Preserve existing Queue producer/consumer wiring. The operations Worker gains no new route, cron or authority flag from this release.
6. Deploy Pages archives to their existing sites: `3_Roster_Frontend.zip`, `6_Deploy_Frontend.zip`, `REQUIRED_Contacts_Frontend.zip`, `REQUIRED_Calendar_Frontend.zip`, and `REQUIRED_LORD_Frontend.zip`. Do not upload a backend `.gs` as a Worker or a frontend ZIP to the wrong site.
7. Optionally deploy the four unprefixed label-only frontend ZIPs. Sites left on their old optional frontend keep the old header; that is not a missing required product update. Hard-refresh changed sites and confirm the intended p label; preserve open drafts/request identities rather than clearing app storage to hide a mismatch.

### Crons and manual settings

- Do not change live settings as part of building this release. The owner compares the preflight snapshot after each Worker deployment.
- Notification Worker source reference has five UTC cron expressions: `* * * * *`, `15 18 * * *`, `2-57/5 * * * *`, `1-59/2 * * * *`, `0-58/2 * * * *`. Preserve the existing approved live schedule; if it differs, investigate before changing it. Do not duplicate triggers or paste sample `[vars]` values over live flags.
- Calendar job Worker example has the existing minute cron `* * * * *`; retain the actual approved schedule and database. Do not enable optional background sync or change push as a side effect of this code update.
- Preserve `WHATSAPP_ENABLED`, menu/diagnostic/inbox/template settings and provider credentials. #95 is contracts, not approval to enable templates/buttons. Check existing Meta approval separately before any owner-chosen activation.
- Preserve `ROSTER_EDGE_AUTHORITY`, `DEPLOY_EDGE_AUTHORITY`, backend fences, recovery flags and Google authority for existing Google scopes exactly as currently approved. This build does not hand over any authority, turn on the proposed edge queue or run migrations. Do not invoke `edgeAuthorityRollbackToLegacy` during routine release/rollback.
- Keep full-backup configuration unchanged. Daily-output enablement below is one explicit owner verification step, separate from full backups.

## Checks after owner deployment

1. Verify sign-in and entry for Contacts and Calendar. Contacts must load through its newly deployed Apps Script `/exec` version without 401. If it fails, stop and compare the paired deployment versions/effective credentials privately; do not paste secret values into logs or the PR. Calendar sessions must retain their independent signer.
2. With approved staging/test data, check Roster/Deploy reads and a safe owner-approved save/receipt, intake overlap Review report on D1, Stapler teacher search, LORD collection/return scrolling, Calendar save/job receipt and current status. Do not create real bookings/messages/absence changes just to test a release. Existing uncertain writes are checked by their original IDs, never blindly resubmitted.
3. Verify Deploy publish reports its Contacts and Layout outcomes separately. A successful Deploy save is not proof that Contacts catalogues updated. Use the existing fenced Contacts retry only for the same confirmed publication, with owner-approved data.
4. **Drive verification, the release goal:** after all required components are deployed, the owner enables daily outputs once in System Config using the existing Daily Relief/Allocation Audit folders and home-base settings. Let the existing scheduler process the controlled attempt; inspect the Admin backup-ledger screen or an owner-authorized read of `gsis_backup_ledger`.
5. Require an excel row and a log row for the controlled attempt with status `verified` and a nonempty `drive_file_id`. Confirm the expected private Daily Relief workbook and Allocation Audit file exist with the expected date/content. A queued/running row, a Sheets-only continuity result or a failed row with no file ID does not pass. This is the evidence that #100 worked after deployment; no such evidence is claimed by the builder.
6. If a daily row fails, retain its receipt/request ID and sanitized code, inspect System Health, and return daily outputs to the owner-approved prior setting until investigated. Do not keep retrying or delete ledger evidence. If rows verify, the owner decides whether daily outputs remain enabled; record that live decision outside the build PR.
7. **Do not claim full backups work.** Missing R2 timetable parts and the 15-minute assembly lease are separate unresolved failures. Do not start a full backup or restore as the daily-output smoke test, and do not mark backup acceptance based on excel/log rows.

## Rollback

1. Stop a rollout on mismatched deployment/version/authentication or unverified output. The owner restores any temporary daily-output setting to its captured prior state and retains failure/receipt evidence. Do not clear pending jobs or assume a timeout means no write happened.
2. Restore each affected backend and paired Worker/Pages deployment to the captured previous o versions together. Retain both canonical/legacy credential configuration and CALENDAR_SESSION_SECRET so the matching previous pair can authenticate. Recheck active service peers after rollback. No secret rotation, authority flag/fence toggle or data restoration is implied.
3. Restore notification/operations/Calendar-job Workers to their captured previous deployments while preserving current durable queues, bindings, crons and provider settings. Restore required/optional Pages sites only where changed. The rollback bundle's numbered Contacts/Calendar files differ from this p layout; choose by app name, not number alone.
4. If p has already created new intake, receipt or pending journal state, obtain an owner/Muse compatibility check before reverting the affected runtime. Preserve original identities and uncertain outcomes. Do not force an old reader to process unrecognized state, delete D1/Drive data or run a full restore to reverse code.
5. Re-verify app entry, source route, receipt recovery and System Health. A code rollback returns to o, which still lacks #100; daily Drive outputs remain unverified until a working code version is deployed. No rollback has been executed by this build.
