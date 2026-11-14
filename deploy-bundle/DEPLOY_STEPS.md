# GSiS v0.9.9w owner deployment steps

Model: Muse. Build only; not deployed. Reviewer: Codex at the exact source and bundle heads in the release-record PR. The owner decides whether and when to deploy. Do not treat this document as live verification.

## Provenance and scope

- Source main: `47a6cefbbd92cdb0dad3e1138d640eba7234a28b`.
- Tested w label/source: `1ce87fe80749aa458b1f7faf83434aa65b6cec02`, also in `COMMIT.txt`. Label in `LABEL.txt`: `0.9.9w`.
- Previous deployed r source: `405a516c37ebd9ae20ac7cf54feff13729057658`; rollback bundle: `deploy/2026-11-11-v0.9.9r`, artifact commit `38b353b6e4495750119f5c31f2b8d5b592e7f57c`. **w supersedes the deployed r and the built s, t, u and v**: r was deployed from its bundle on 11 Nov and never merged, so main never got the r label; s, t, u and v were built but never deployed; w contains everything v had plus #38, #42, #46, #47, #48, #58 and #60.
- Owner bundle branch: `deploy/2026-11-14-v0.9.9w`. Build did not cross midnight SGT.
- Build/source checks passed at label head `1ce87fe` with no diff (canonical build re-run at the label head). The complete local npm-test run (1095/1095 current Node programs and 40/40 LORD programs, exit 0, with GSIS_BROWSER_EXECUTABLE, ROSTER_TEST_CHROMIUM and LORD_TEST_CHROMIUM all set to the Playwright chromium-1234 path, TZ=Asia/Singapore and NODE_NO_WARNINGS=1) was at the label head `1ce87fe`. Full CI at the label head is recorded in the release PR. Bundle payload/archive/checksum verification is recorded in the release PR; a separate full-suite run at the later artifact-only bundle commit is not claimed.
- Runtime source and bundles contain every merge since the p label commit 0bb7033: all twenty-one PR merges below. The w functional changes are #107, #109, #111, #112, #114, #115, #116, #108, #121, #123, #124, #127, #130, #38, #42, #46, #47, #48, #58 and #60; #106 is the baseline p release-publication merge, not a new w change. No merge is omitted. Intervening task/review records remain in history. Main merges #118, #119, #120, #125, #128, #129, #133 and #134 are v1-lane or docs-only and do not affect the v0.9.9* bundle. #103 is still an open draft and its product changes are not included.
- This is a code/label release, not a database migration, authority cutover, queue activation or provider/template activation. No migration file changed since p. Preserve existing flags, URLs, bindings, queue/database/bucket identities and Google authority/routing. Do not apply repository example configuration as replacement live settings.

## What changed since v

| Merge commit | Included history |
| --- | --- |
| `05ff0f1f8b3d6a470b4189dd8ed8197b582ba699` | Merge PR #38 (inactive staff excluded from new relief/delivery) at d23672c |
| `25977404c9bf4ef8f2f3c7d2bd5182a3c9ca54aa` | Merge PR #42 (import preparation fixed work-item totals) at c5a5975 |
| `2215b2ee8074e4d387f50d712c5fbfc2965f5a25` | Merge PR #46 (zero-quota calculations) at 72f1406 |
| `49be897adb2b70ceab0b08fced1cf0c74ab44e19` | Merge PR #47 (cumulative R% statistics table) at 4b66444 |
| `b7d4142995c424639a7cb322122fc0a3954f337b` | Merge PR #48 (timetabled occupancy wording) at 98283d6 |
| `92e0bcb4cf98ea22c1787dd1d6fe0ab68e63efa1` | Merge PR #58 (D1 activation smoke harness) at addcaaa |
| `88588e958afff6c57fb8ee4dbedda5f7972537c3` | Merge PR #60 (roster-import label in System Health) at 5dc0f5c |

- #38 excludes inactive Contacts staff from new relief allocation, ad hoc selection, peer eligibility and final WhatsApp/email delivery. Inactive teachers' saved duties and history stay, marked for review with an ` (inactive)` label; no automatic removal or refill. The allocator preserves manual, peer, published, protected and started duties. Daily employment settings can remove a retained ineligible recipient.
- #42 makes import preparation report a fixed work-item total and completed count separately from the step ordinal; legacy counters, checkpoint digests, mixed-version compatibility and immutable retained input are kept; progress/failure messages use the same projection in the setup UI.
- #46 makes My Calculations show the completed relief count and an explicit no-quota message when accumulated quota is zero; unknown history stays "Unavailable"; Google/D1 parity covers opening balances + later duties without double-counting pre-cutoff history; no duties fabricated.
- #47 adds the third Statistics table "Cumulative percentage of relief done R%" using the allocator's existing unrounded ranking key; confirmed opening balances + later completed/committed duties exactly once; last relief date limited to retained records; Admin/SMC-only Google and D1 reads; sorting/filtering/Excel export local; no allocation formula/policy changes.
- #48 applies approved timetabled occupancy and relief quota wording to Deploy and Roster calculations, statistics, help, tooltips and Excel headers; budgets, formulas, policy identifiers, data fields unchanged.
- #58 refreshes the tests-only D1 activation smoke harness; signed gateway freeze, immutable import and activation precede checks at t+0 and t+20; stale Contacts authority negative control fails, then current cron authority refresh restores operations; checks disabled allocator gating, rejects hidden cron failures; Deploy stays on Google.
- #60 restores the missing roster-import label in System Health so current import outcomes and retained failures are visible; Drive and Venues diagnostics stay; product change is one label-map entry.
- The v changes (#107, #109, #111, #112, #114, #115, #116, #108, #121, #123, #124, #127, #130) are carried unchanged and are described in the v bundle's `DEPLOY_STEPS.md` (`deploy/2026-11-13-v0.9.9v`). Full backups are fixed in code by #127 but NOT yet verified live.
- **Do not enable `system_alert` (APPROVED by Meta, id 1846305353057485) until the owner has seen one verified full backup (check the manifest `timings` and `missingCacheParts`) and one verified restore test.** A verified daily Excel/log row does not verify a full backup or restore.

## What changed since p (full merge inventory)

| Merge commit | Included history |
| --- | --- |
| `c2c492c62133d73b3bcde8f78da0baaf0793996b` | Merge pull request #106 from helper-gsps/codex/release-v0.9.9p — baseline p release publication, not a new w change |
| `03782ca3d89b0464b90cce2a2dc9da3169b3793a` | Merge pull request #107 from helper-gsps/codex/gsis-secret-consolidation-roster-deploy |
| `7e78799e9c210a6b713d11ef6a541d372d1135f7` | Merge pull request #109 from helper-gsps/muse/assign-relief-export-baseline-adhoc |
| `0f51376dd03acea520288f12d4d851f4c7290c4b` | Merge pull request #111 from helper-gsps/codex/roster-intake-instruction-drafts-drain |
| `3e6368432f5bd6158d9ba7dbef8ba171ed1a7728` | Merge pull request #112 from helper-gsps/muse/assign-relief-export-stapler-format |
| `9989142ec0e184b7bd4c6323abdf4d578563a2f1` | Merge pull request #114 from codex/edge-receipt-accepted |
| `15d3aa43f642d2763197f03b9c740529fe97200c` | Merge pull request #115 from codex/roster-relief-instructions-info-only |
| `6b77a742cc5c28373754637a67877a7a3536ede8` | Merge pull request #116 from codex/stapler-period-mass-apply |
| `009db6557276931e458419105565d8a1adaab990` | Merge PR #108 (edge-queue P1 Deploy) at 541bd25 |
| `56e381cc9b46cc73ffd1a52e7506ae9b7804ef55` | Merge PR #121 (LSE notice wiring) at 760b00b |
| `cdf8cd5f4ce0fdabd854f93417c278dc38bff5f8` | Merge PR #123 (Stapler mass-apply create-tiles) at e506e81 |
| `a7da2c260f5ad60baba77b598af778cd724a626b` | Merge PR #124 (period mass-apply Subject) at 196cac2 |
| `ccdcba3a58167c833553c412e5aa68d313e7aacd` | Merge PR #127 (full D1 backup fix) at 73d057b |
| `c9aec8b1ae2dd830e177bc48059a1bed2d788b0f` | Merge PR #130 (employment mail on D1) at 5a0fd06 |
| `05ff0f1f8b3d6a470b4189dd8ed8197b582ba699` | Merge PR #38 (inactive staff excluded from new relief/delivery) at d23672c |
| `25977404c9bf4ef8f2f3c7d2bd5182a3c9ca54aa` | Merge PR #42 (import preparation fixed work-item totals) at c5a5975 |
| `2215b2ee8074e4d387f50d712c5fbfc2965f5a25` | Merge PR #46 (zero-quota calculations) at 72f1406 |
| `49be897adb2b70ceab0b08fced1cf0c74ab44e19` | Merge PR #47 (cumulative R% statistics table) at 4b66444 |
| `b7d4142995c424639a7cb322122fc0a3954f337b` | Merge PR #48 (timetabled occupancy wording) at 98283d6 |
| `92e0bcb4cf98ea22c1787dd1d6fe0ab68e63efa1` | Merge PR #58 (D1 activation smoke harness) at addcaaa |
| `88588e958afff6c57fb8ee4dbedda5f7972537c3` | Merge PR #60 (roster-import label in System Health) at 5dc0f5c |

## Artifact inventory and classification

The historical handover folder is named `optional-label-only/`. In w it carries only unprefixed label-only frontend updates; there are no `REQUIRED_`-prefixed files, because Contacts, Calendar and LORD have no product changes in w and their backends are byte-identical to p's and omitted.

| Artifact | Owner target / classification |
| --- | --- |
| `1_Roster_Backend.gs` | Required Roster Apps Script backend. Changed since v (regenerated from the shared model at the w label head; includes #38 inactive-staff gating, #46 zero-quota calculations, #47 R% statistics, #48 wording, plus the v changes). Google frozen, do not deploy. |
| `2_Deploy_Backend.gs` | Required Deploy Apps Script generated backend. Changed since v (regenerated from the shared model at the w label head; includes #38, #42, #46, #47, #48, plus the v changes). |
| `3_Roster_Frontend.zip` | Required existing Roster Pages site, includes the v changes plus #38 (inactive-staff gating and delivery), #42 (import preparation totals), #46 (zero-quota calculations), #47 (R% statistics table), #48 (wording), #58 (smoke harness, tests only) and #60 (roster-import label in System Health). |
| `4_gsis-roster-notifications_worker.js` | Required existing notification Worker, includes the v changes plus the shared-model changes from #38 (inactive-staff delivery gating), #47 and #48. |
| `5_gsis-operations_worker.js` | Required existing operations Worker, includes the v changes plus the shared-model changes from #38, #42, #46, #47 and #48. |
| `6_Deploy_Frontend.zip` | Required existing Deploy Pages site, includes the v changes plus #42 (import preparation totals) and #48 (wording). |
| `optional-label-only/Contacts_Frontend.zip`, `Calendar_Frontend.zip`, `LORD_Frontend.zip`, `Layout_Frontend.zip`, `Venues_Frontend.zip`, `OVERLORD_Frontend.zip`, `STARLORD_Frontend.zip` | Optional w label/asset-query updates on their corresponding existing Pages sites. No product change required there. |
| `emergency/EdgeAuthorityTools.gs` | Byte-identical prior emergency tool; preserve separately in Roster Apps Script. Do not run authority-changing functions for this release or an ordinary code rollback. |
| `COMMIT.txt`, `LABEL.txt`, `SHA256SUMS.txt`, `DEPLOY_STEPS.md` | Provenance, integrity and owner runbook. SHA256SUMS covers every other delivered file, including these notes, but not itself. |

Venues backend, Contacts backend, Calendar backend and Calendar job Worker are byte-unchanged from p source and intentionally omitted. There is no `7_Venues_Backend.gs` because the conditional handover requirement is not met. Do not replace an unchanged backend just to change a frontend label.

## Before deploying: owner-only checks and private preparation

1. Check out the exact reviewed bundle commit named in the release PR, not the moving main branch. In `deploy-bundle/`, run `sha256sum -c SHA256SUMS.txt`. Require every file to match. Keep the old r bundle and existing deployment/version IDs for rollback.
2. Privately capture current settings, flags, bindings, deployment URLs, crons and previous versions for each changed app. Preserve all existing state, pending request IDs, receipts and uncertain jobs. Do not export secret values or school records into this branch or the PR.
3. Align GSIS_SECRET privately before switching the Roster/Deploy code: the same operator-selected value (32–8000 printable ASCII, no spaces) must exist at both ends of each Worker/backend pair (Worker environment and Apps Script Script Properties). Roster Pages, Roster Apps Script, Roster notification Worker, Roster operations Worker, Deploy Pages and Deploy Apps Script must agree, and active Roster/Deploy service peers must use that same effective credential for their paired calls. The new Roster/Deploy code does not use legacy transport names as fallback — a mismatched or missing GSIS_SECRET fails closed (503) instead of falling back. Do not rotate credentials as part of this build. (GSIS_SECRET was already aligned for q and r; if r is live and aligned, no re-alignment is needed for w.)
4. Keep CALENDAR_SESSION_SECRET unchanged and independent from GSIS_SECRET. Keep external-link rotation keys, provider credentials, existing URLs and bindings. Retain legacy transport configuration names until the matching new code is live on both ends and owner verification passes; removing them early breaks rollback or unmigrated peers. Contacts/Calendar code is unchanged in w and keeps its r behavior.
5. The owner attributes the earlier Contacts 401 to Apps Script deployment lag. Save alone does not update the `/exec` deployment. Contacts is not changed in w; if its deployment is touched, update the existing deployment to a new version and explicitly verify Contacts entry afterward. Do not treat this release as an independent diagnosis/config fix.
6. For #121, merge ONLY the `lse_notice` entry from `notification-worker/templates.activation.json` into the deployed `WHATSAPP_TEMPLATES_JSON` (notification/operations Workers + Roster Pages). Do not merge any other activation entry. Google stays frozen; do not deploy the regenerated Google artifacts.

## Deploy order: owner executes, builder does not

1. Roster Apps Script: paste `1_Roster_Backend.gs` into the existing main source file, retain the existing separate emergency tool, Save, then Deploy > Manage deployments > edit the existing deployment > New version > Deploy. Record the previous version privately. Keep the same deployment ID/URL, execution identity and access policy. Do not deploy the regenerated Google artifacts from #115 or #121; Google stays frozen.
2. Deploy Apps Script: apply `2_Deploy_Backend.gs` through the same new-version procedure on its existing deployment.
3. Complete each backend/Worker pair in the controlled rollout window with aligned GSIS_SECRET; a mismatched intermediate pair is not verification. Roster and Deploy pairs must both be aligned before either is switched.
4. Deploy `4_gsis-roster-notifications_worker.js` and `5_gsis-operations_worker.js` to the corresponding existing Workers with all existing bindings/secrets/settings retained. Preserve existing Queue producer/consumer wiring. The operations Worker gains no new route, cron or authority flag from this release. For #115, deploy the Notification Worker first, then the Operations Worker, then Roster Pages. For #121, the `lse_notice` activation entry goes into the deployed `WHATSAPP_TEMPLATES_JSON` at this step.
5. Deploy Pages archives to their existing sites: `3_Roster_Frontend.zip` and `6_Deploy_Frontend.zip`. Do not upload a backend `.gs` as a Worker or a frontend ZIP to the wrong site.
6. Optionally deploy the seven unprefixed label-only frontend ZIPs. Sites left on their old optional frontend keep the old header; that is not a missing required product update. Hard-refresh changed sites and confirm the intended w label; preserve open drafts/request identities rather than clearing app storage to hide a mismatch.

### Crons and manual settings

- Do not change live settings as part of building this release. The owner compares the preflight snapshot after each Worker deployment.
- Notification Worker source reference has five UTC cron expressions: `* * * * *`, `15 18 * * *`, `2-57/5 * * * *`, `1-59/2 * * * *`, `0-58/2 * * * *`. Preserve the existing approved live schedule; if it differs, investigate before changing it. Do not duplicate triggers or paste sample `[vars]` values over live flags.
- Preserve `WHATSAPP_ENABLED`, menu/diagnostic/inbox/template settings and provider credentials. This release does not enable templates/buttons except the `lse_notice` activation entry the owner merges at deploy time (see step 6 above). Check existing Meta approval separately before any owner-chosen activation. WhatsApp notifications were reported back working on 11 Nov; the earlier SMC silence cause is still unproven, and this release does not claim to fix it.
- Preserve `ROSTER_EDGE_AUTHORITY`, `DEPLOY_EDGE_AUTHORITY`, backend fences, recovery flags and Google authority for existing Google scopes exactly as currently approved. This build does not hand over any authority, turn on the proposed edge queue or run migrations. Do not invoke `edgeAuthorityRollbackToLegacy` during routine release/rollback.
- Keep full-backup configuration unchanged. Daily-output verification below is one explicit owner verification step, separate from full backups.

## Checks after owner deployment

1. Verify sign-in and entry for Roster and Deploy. Roster must load through its newly deployed Apps Script `/exec` version without 401. If it fails, stop and compare the paired deployment versions/effective GSIS_SECRET privately; do not paste secret values into logs or the PR. Deploy sessions must retain their existing derivation.
2. With approved staging/test data, check Roster/Deploy reads and a safe owner-approved save/receipt. In Assign Relief, Export Excel must produce the Stapler layout (filename "<date> Stapler - Teachers TTb…", sheets "Teacher Summary" and "Class POV", A1 "Teacher Summary · <date> · Current Stapler plan", weekday row, "Start / End", period numbers, teachers from row 6), list baseline-named plus ad hoc relief teachers only for the selected day, and show no absence reason in the download. Stapler teacher search (from p) must still work. Do not create real bookings/messages/absence changes just to test a release. Existing uncertain writes are checked by their original IDs, never blindly resubmitted.
3. Verify Deploy publish reports its Contacts and Layout outcomes separately. A successful Deploy save is not proof that Contacts catalogues updated. Use the existing fenced Contacts retry only for the same confirmed publication, with owner-approved data.
4. Retry the stuck 11 Nov Assign Relief save in its original browser: it should now confirm or re-send instead of throwing "Save confirmation is unavailable". A new save that goes unconfirmed in the first place is a separate known limit (45s timeout), not a failure of this fix.
5. Submit a new absence report with relief instructions and confirm it lands at once (no "being checked" hold), the note is visible in My Relief Duties, and the relief teacher receives one WhatsApp message. Check the seven 10 Nov reports' instruction receipts as well.
6. In a Stapler draft, click the down arrow at a period header in either view, set a venue/group/class, apply, and confirm only that period's lesson tiles change and one Undo restores the previous values. Then Save to online.
7. In a Stapler draft, use the row/column mass-apply and confirm the choice appears: "only write values to cells with tiles" changes only existing tiles, while "in empty cells, create tiles" fills empty cells with the dialog values and the picked teacher. A conflict rejects the whole apply with no partial fill, and one Undo removes every created tile. Then Save to online.
8. In a Stapler draft, open the period mass-apply dialog and confirm the Subject input is present with lesson-subject suggestions: a filled Subject updates existing tiles and created column tiles, and blank preserves existing subjects. Then Save to online.
9. Submit a fresh LSE absence report and confirm the duty SMC receives the dedicated LSE notice naming the absent teacher and date, and no "Emergency absence" message is sent for it. An edit or retry of the same LSE must not resend the notice.
10. Run one full backup and confirm it verifies: check the manifest `timings` and `missingCacheParts` in System Health. Then run one restore test and confirm it verifies. Do NOT enable `system_alert` until both have verified.
11. Confirm the first employment drain after deploy: the 12 old Daily Employment Update emails (6–12 Nov) are cancelled, and only today's email is sent. Check System Health for the drain report, the actual last sent time, and failed/uncertain counts.
12. Daily outputs were verified live under p (excel/log rows `verified` with drive_file_id from 9 Nov). No daily-output code changed in w. If the owner re-checks, require an excel row and a log row with status `verified` and a nonempty `drive_file_id`. A queued/running row, a Sheets-only continuity result or a failed row with no file ID does not pass.
13. **Do not claim full backups work until checks 10 and 11 pass.** Missing R2 timetable parts and the 15-minute assembly lease were the failures #127 fixes in code; only the live verified backup and restore prove it.
14. Confirm an inactive teacher cannot be picked for new relief or ad hoc selection, and final WhatsApp/email delivery skips inactive recipients; an inactive teacher's saved duties stay, marked with an ` (inactive)` label.
15. In Deploy import preparation, confirm the work-item total and completed count are fixed and separate from the step ordinal.
16. In My Calculations, confirm the completed relief count shows and the explicit no-quota message appears when accumulated quota is zero.
17. In Statistics, confirm the third table "Cumulative percentage of relief done R%" appears with the opening-balance-aware values.
18. Confirm the new timetabled occupancy and relief quota wording appears in Deploy/Roster calculations, statistics, help, tooltips and Excel headers.
19. In System Health, confirm the Roster import label appears with current import outcomes and retained failures.
20. **Do not claim the seven new changes work until checks 14–19 pass.**

## Rollback

1. Stop a rollout on mismatched deployment/version/authentication or unverified output. The owner restores any temporary daily-output setting to its captured prior state and retains failure/receipt evidence. Do not clear pending jobs or assume a timeout means no write happened.
2. Restore each affected backend and paired Worker/Pages deployment to the captured previous r versions together. Retain GSIS_SECRET and legacy transport configuration names so the matching previous pair can authenticate (r Roster/Deploy code reads GSIS_SECRET first and falls back to legacy names). Recheck active service peers after rollback. No secret rotation, authority flag/fence toggle or data restoration is implied.
3. Restore notification/operations Workers to their captured previous deployments while preserving current durable queues, bindings, crons and provider settings. Restore required/optional Pages sites only where changed.
4. If w has already created new intake, receipt or pending journal state, obtain an owner/Muse compatibility check before reverting the affected runtime. Preserve original identities and uncertain outcomes. Do not force an old reader to process unrecognized state, delete D1/Drive data or run a full restore to reverse code.
5. Re-verify app entry, source route, receipt recovery and System Health. A code rollback returns to r, which still lacks #108, #114, #115, #116, #121, #123, #124, #127, #130, #38, #42, #46, #47, #48, #58 and #60; the edge queue, the receipt fix, the info-only instructions, the period mass-apply, the LSE notice, the mass-apply create-tiles choice, the period mass-apply Subject, the full backup fix, the employment mail drain, the inactive-staff gating, the import totals, the zero-quota calculations, the R% statistics table, the wording and the health label revert with it. No rollback has been executed by this build.
