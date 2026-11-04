# lord-contacts-sync-daily: LORD GSiS Contacts sync once a day at 02:03; stop sync starvation blocking WhatsApp

- Status: authorised (owner 4 Nov 2026: "codex work but sync contact list every 24h at 2.03 am"); lane L (LORD backend), Codex
- Branch: codex/lord-contacts-sync-daily
- Reviewer/model: Claude
- Files: lord-suite/Source/backend/Code.gs (GSiS bridge, WhatsApp send guard, triggers, setup/upgrade notes), OVERLORD/LORD admin status text, lord-suite tests

## Incident (4 Nov 2026)
- OVERLORD: WhatsApp notifications 10:25 SGT "Confirmed failure", detail UNCLASSIFIED_FAILURE. Meta side healthy (all lord_*_v18 APPROVED, number linked; Roster WhatsApp sent the same morning).
- Cause: `gsisRequireFreshContacts_` refuses every provider send unless `LORD_GSIS_CHECK.contactsCheckedAt` is within 300000 ms. The minute trigger `syncLORDGSiSReferences` uses `tryLock(250)` (scheduled path) and logs `{"event":"lord-reference-sync-deferred","code":"GSIS_SYNC_DEFERRED"}` when the ScriptLock is busy (owner manual run 10:48:14). On a busy morning it is starved, Contacts goes stale, all sends fail. The error code is not classified, so OVERLORD shows "check the execution log".

## Owner ruling
Sync the Contacts/Deploy reference copy **once every 24 h at 02:03 SGT**. The owner accepts that a Contacts change (deactivation, new staff, changed mobile) reaches LORD at the next 02:03 run or an admin manual refresh, not within minutes.

## Build
1. Trigger: replace the every-minute `syncLORDGSiSReferences` trigger with a daily one: `ScriptApp.newTrigger('syncLORDGSiSReferences').timeBased().atHour(2).nearMinute(3).everyDays(1).inTimezone('Asia/Singapore')`. Apps Script runs it within about 15 minutes of 02:03; document that. Provide an idempotent editor function `installLORDDailyContactsSync()` that removes the minute trigger and installs the daily one; `enableLORDGSiSBridge` installs the daily trigger, not the minute one.
2. The daily run waits for the lock (e.g. `waitLock` up to 30 s), never `tryLock(250)`; on GSIS_SYNC_DEFERRED/BUSY it retries up to 3 times within that run.
3. Freshness: `gsisRequireFreshContacts_` and `gsisSourceStatus_` accept a check up to **26 h** old (constant, one place). Older than 26 h: before refusing a send, run one waiting sync; if it succeeds, send.
4. Manual refresh: OVERLORD admin "Refresh suite data" (suiterefresh) remains the immediate path after a Contacts change; label it so ("Sync Contacts now").
5. Classify `GSIS_CONTACT_UNAVAILABLE` / `GSIS_SYNC_*` in `maintenanceFailureReason_`: show "Contacts copy not synced since HH:MM. Use Sync Contacts now." instead of UNCLASSIFIED_FAILURE.
6. OVERLORD status: show last Contacts sync time and next scheduled run.
7. Tests: daily trigger installed and minute trigger removed (idempotent); send allowed at 25 h, refused-then-synced at 27 h; deferred lock retries; classification text; no change to consent/revocation checks other than the window.
No deploy; owner pastes Code.gs and runs `installLORDDailyContactsSync()` once.

## Addendum (4 Nov 10:50): lock starvation evidence
Owner ran `enableLORDGSiSBridge` 10:48:59; the source fetch completed, then the publish step failed at 10:49:47: "Lock timeout: another process was holding the lock for too long" (Code.gs:433 withWriteLock_ ← 7196 referenceLock ← 7226 syncLORDGSiSReferences_). The ScriptLock is held for more than 30 s at a time.
Likely holder: `processSecondaryQueue_` (minute trigger, and again from `checkAndSendOverdueTelegramAlerts` every 5 min) keeps the ScriptLock while it runs `scheduleTeacherWhatsApp_()` (reads every Bookings row, event rows, sessions, GSiS snapshot) and `recoverWhatsAppForceClose_()`, before even claiming tasks.
Add to this task:
8. Run `scheduleTeacherWhatsApp_` and `recoverWhatsAppForceClose_` outside the ScriptLock (compute first, then take the lock only to write queue records, rechecking state), so no background job holds the lock for more than a few seconds.
9. Log lock hold time per background job (LORD_TIMING) and test that the queue never holds the lock across a full Bookings scan.

## Addendum 2 (4 Nov 11:00): owner reconfirms; user-facing lock contention
Owner: "i want lord to hold its own contact details for 24h and update 2.03 am" (same ruling as above). Owner reports many negative user reports today.
diagnoseLORDBackgroundWork 10:58: estimatedPropertyBytes 165,339 (limits 350k warn / 400k admission), 328 properties, 140 receipts, 159 queue tasks, 29 uncertain tasks, queue_reconciliation warning.
10. Bug: `deliverWhatsAppAlert_` and `deliverTeacherWhatsApp_` call `checkpointWhatsAppSend_` (deliveryPending) BEFORE `sendWhatsAppTemplate_` runs `gsisRequireFreshContacts_`; a freshness refusal leaves deliveryPending, so the task becomes "unknown" (29 today) although Meta was never called. Check freshness/config before the checkpoint; a pre-provider refusal clears the checkpoint and is a retryable failure.
11. Property-store reads under the lock: `setBoundedRuntimeProperty_`, `pruneRuntimeProperties_`, `pruneSecondaryTasks_` and `noteMaintenanceFailure_` call `props.getProperties()` (whole store, 328 keys) on most writes, several times per task. Read once per lock hold and pass the snapshot; keep the capacity check exact.
12. Full-sheet reads inside the lock on user saves: `createBookingBatch_` (all Bookings), `ensureNoOpenLoanForCart_` (all Sessions), `findBookingConflict_`, `prepareEvidenceUploads_` manifest write. Bound them (date-filtered TextFinder or a day index) and measure lockHeldMs.
13. User experience on contention: a lock timeout must return a clear "LORD is busy, your request was not saved, retrying" and the client retries with the SAME clientRequestId (idempotent), never a new one.
14. Report LORD_TIMING lockWaitMs/lockHeldMs p50/p95 per action before and after, from a fixture with the background queue running.
Priority for today's relief: 2, 8, 10 first (stop sync starvation and the queue holding the lock), then 11-13.

## PR A claim (4 Nov 2026, owner priority change)

- Status: claimed; Model: Codex; reviewer: Claude at the exact PR head.
- Base: main `437d68a0a606dab4dcfdb5a5a11571b32d807ba8`.
- Branch: `codex/lord-contacts-sync-daily`.
- Scope: items 1–3, 5, 8 and 10 only; canonical LORD Code.gs, focused LORD tests, runner registration and this record. Queue preparation runs outside ScriptLock; writes recheck persisted state under the lock. Measure fixture lockHeldMs before and after.
- Checks: daily trigger idempotency, waiting sync/retries, 25 h/27 h freshness, safe classification, queue scans outside lock, concurrent queue rechecks, retryable pre-provider refusal, consent/revocation and provider uncertainty, canonical build, full Node and LORD suite.
- Deferred: items 4, 6, 11–14 and wider LORD migration; no frontend changes, production execution or deployment.
- Owner upgrade: paste Code.gs, publish the existing deployment, then run `installLORDDailyContactsSync()` once. The daily Apps Script trigger runs approximately 02:03 SGT, within about 15 minutes.

## PR A implementation and verification

- Status: implementing; Model: Codex; Claude reviews the published exact head. No deployment or live data/provider calls.
- The claim-only main ref update was rejected by automatic approval review because this turn authorises a draft task PR. The claim is recorded on this branch instead; main remains unchanged.
- Daily trigger: the installer replaces all sync-handler triggers with one 02:03 Asia/Singapore daily trigger. Enable uses the same installer. Apps Script scheduling is approximate, within about 15 minutes.
- Waiting sync: 30-second lock waits, initial attempt plus at most three DEFERRED/BUSY retries; no source call or freshness renewal on an exhausted busy lease. A send attempts one waiting recovery when its copy is unhealthy or older than the single 26-hour constant.
- Queue: Bookings/Event Log/reference preparation runs outside ScriptLock. Both enqueue paths recheck the durable key and current capacity inside a short property-write lock. Existing claim, acceptance, consent/revocation and uncertainty safeguards remain.
- Delivery: config and Contacts preflight precede recipient lookup/checkpoint. The final sender guard tags only failures before the provider call; those clear this attempt's checkpoint and retry. Provider timeouts and old unknown records retain uncertainty and never auto-resend.
- Safe diagnostics reconstruct Contacts/sync text from the last successful Contacts check time; no raw error or recipient enters the public detail.
- New offline program: 19/19 checks passed, including actual provider-boundary sends, stale and disabled refusal, final checkpoint cleanup, revocation/mobile changes, concurrent enqueue deduplication, retries and daily-trigger idempotency. Existing bridge 23/23 and contention checks passed.
- Timed fixture: 500 Bookings rows; 159 queued tasks, including 29 uncertain and one runnable audit. Identical simulated Sheet/property latencies before and after. Baseline total lockHeldMs 45042, longest hold 45036; after total 10, longest 6; after LORD_TIMING agrees with measured ownership. The 45-second full Bookings scan remains outside the lock. These are deterministic fixture timings, not live performance evidence.
- Canonical builds: `TZ=Asia/Singapore npm run build` (18 components) and `python3 lord-suite/tools/prepare_first_time.py`; root LORD backend and first-time backend template regenerated from Source/backend/Code.gs.
- Local full Node/LORD attempts encounter missing Chromium; browser checks are not passes. Exact-head GitHub full-suite and all LORD checks remain mandatory before review handoff.

## PR A upgrade and rollback

Owner only: paste `lord-suite/Source/backend/Code.gs` into LORD Apps Script, publish the existing deployment, then run `installLORDDailyContactsSync()` once. No deployment performed by Codex. Retain existing settings, deployment URL, queue receipts and unknown outcomes. Rollback needs the prior Code.gs and restoration of its old reference-sync trigger; never delete uncertainty/receipt records.

## PR A handoff

Next: complete whole-branch advisory and exact-head full CI, open draft PR naming Claude and its head, then continue minimal allocation single-flight and #68. Items 4, 6 and 11–14 stay outside this PR.
