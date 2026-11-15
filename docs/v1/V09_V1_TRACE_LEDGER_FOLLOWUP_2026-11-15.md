# GSiS v0.9 to v1 trace ledger: follow up scan

Model: Claude. Date: 15 November 2026 (Asia/Singapore). Status: advisory. It grants no merge, deployment, migration or live data authority.

Read this with [the first ledger](V09_V1_TRACE_LEDGER_2026-11-15.md). Where the two disagree, this file wins, because it used real requests.

## 0. What changed in the method

The first ledger searched for names. This scan ran the product.

| Item | Value |
| --- | --- |
| Code scanned | PR 175 head `77e30ee` (contains PR 160 to 174) |
| Not scanned | PR 176, which moved to `5e44fdf` during this scan |
| Runtime | The real v1 Workers and D1, booted locally with `tests/v1-product/suite.mjs` (Miniflare) |
| Caller list | Every API path, operation, action and view found in the **built** v1 browser assets (`scripts/v1/build-web.mjs` output), joined with `v1/web/parity.json` |
| Requests sent | 305 probes, each as POST and as GET, through the real gateway, as a synthetic Global Admin |
| Data | Empty synthetic school. No real data. No hosted site |

**How a result is read.**

1. **Absent:** the service answers "unknown operation" or "unknown route" for both methods. A made up name gets the same answer.
2. **Reached:** the service accepted the name and then asked for a proper payload or an operation ID. A handler exists.
3. **OK:** the service returned data.
4. **Error:** the service answered 503 on an empty school.

**Limits.**

1. An empty payload proves that a handler exists. It does not prove that the handler is correct.
2. Requests were sent straight to the gateway. The shared browser adapter `client.js` was checked by search only: none of the Absent names below occur in it.
3. A screen may hide a control by role or by a config flag. "Called by" means the name is in the built file, not that a user can reach it.
4. Probes ran as Global Admin. Permission errors for normal staff are not covered.

## 0a. Corrections to this file from PR 178

The operation probe in PR 178 (`bf2067c`) sends calls through the real browser transport. Where it disagrees with Section 2, the probe wins. See `docs/coordination/review/v1-pr178-claude-review.md`.

1. F13 `sysFields`: false alarm. It is a response data field, not a route.
2. F16: not a call. The names are in a copied model file only.
3. Added to F10: `archiveColdOutput`. Added to F04: `cancelPendingNotifications`. Both are called by a built screen and have no handler.
4. F09 `/backup-ledger` is called with `read`, `verify` and `restore`. All three are missing.

## 1. Corrections to the first ledger

| First ledger row | Correction |
| --- | --- |
| A08 `roleTruthTable`, `saveRoleTruthTable` | **False alarm.** Only the v0.9 Pages Worker has these routes. No browser file calls them |
| A09 `landmark/*` | **False alarm** for the same reason. `campus-map` and `layout-reference` stay: see F12 |
| A12 `offload`, `membership`, `save-admin-table` | **False alarm.** No browser caller. `sysFields` stays: see F13 |
| A14 Layout `unit/rename` | **False alarm.** No browser caller |
| A05 peer mail (3 operations) | **Downgraded.** Not called by any built screen. The callers were in pages the build omits |
| A06 `recordRecoveryCheckpoint`, `recoverVenuesSync`, `retryBackgroundJob` | **Downgraded** for the same reason |
| A01 `renewStaplerLock` | Not in the built assets. `acquire` and `release` are, and are confirmed Absent |
| A11 Deploy `batchCells` | **False alarm.** All 43 Deploy edit operations have a handler |
| A19 "19 Roster operations absent" | Now **8 confirmed by request and called by a built screen**, plus 5 routes. See Section 2 |

## 2. Confirmed gaps: a built screen calls it, the server has no handler

These are the items a user can hit. Each was proven by a real local request unless marked "static".

| ID | Module | Operation or route | Called by (built file) | Proof | What breaks |
| --- | --- | --- | --- | --- | --- |
| F01 | Roster | `acquireStaplerLock` | `roster-stapler-ui.js` | 404 | Opening a Stapler plan for edit |
| F02 | Roster | `releaseStaplerLock` | `roster-stapler-ui.js` | 404 | Leaving a Stapler plan |
| F03 | Roster | `contactCreate` | `roster-operations-ui.js`, `roster-stapler-ui.js` | 404 | Adding a relief contact from Roster |
| F04 | Roster | `deliveryReview` | `roster-delivery-review-ui.js` | 404 | Delivery review panel |
| F05 | Roster | `dismissDeliveryIssues` | `roster-delivery-review-ui.js` | static | Dismissing delivery issues |
| F06 | Roster | `resolveAbsenceIntake`, `retryAbsenceIntake` | `roster-operations-ui.js` | 404 | Absence intake review |
| F07 | Roster | `statisticsRPercent` | `roster-statistics-ui.js` | 404 | R percent statistics. `parity.json` says "replaced"; the old call is still in the screen |
| F08 | Roster | route `/quiet-mode` | `roster-operations-ui.js` | 404 | Quiet mode switch |
| F09 | Roster | route `/backup-ledger` | `backup-ledger.html`, `backup-ledger.js`, `roster-settings-ui.js` | 404 | Backup ledger page and its settings link |
| F10 | Roster | route `/edge/archive` | `archive.js`, `roster-operations-ui.js` | 404 | Archive page |
| F11 | Roster | routes `/whatsapp/media/*`, `/whatsapp/reports/*` | `roster-inbox-ui.js`, `roster-delivery-review-ui.js` | 404 | Inbox media and delivery reports |
| F12 | Deploy | routes `/campus-map`, `/layout-reference`, `/commands` | `deploy/app.js`, `deploy/index.html` | 404 | Campus map view in Deploy, Layout reference, queued cell commands. `/commands` may be behind a config flag |
| F13 | Deploy, Contacts | route `/sysFields` | `deploy/app.js`, `contacts/app.js` | 404 | System fields read |
| F14 | Calendar | routes `/calendar-changes`, `/calendar-changes/delta`, `/calendar-jobs` | `calendar/app.js` | 404 | Change awareness and the job status strip. Likely flag gated; confirm the flags are off in v1 config |
| F15 | LORD | route `/auth/relief` | `lord/assets/app.js` | 404 | Relief teacher sign in path |
| F16 | Roster | `confirmTimetableReconcile`, `migrateStaplerPlans`, `publishDaily` | `roster-operations-model.js` | static | Names are in the copied model file. Confirm whether any control still sends them |

**Absent with no built caller (low risk, clean up later):** `peerMailReview`, `reviewPeerMail`, `sendPeerMail`, `recordRecoveryCheckpoint`, `recoverVenuesSync`, `retryBackgroundJob`, the three `timetablePreparation*` operations, Roster `/system-health`, LORD `/jobs`, Layout `/unit/rename`.

**Replaced on purpose (old name Absent, new native screen exists):** OVERLORD `backgroundpreview`, `backgroundapply`, `backgroundack`, `adminGrant`; Contacts `kp`.

## 3. Operations with a handler (probe result per module)

| Module | Kind | OK | Reached | Absent | Error | Note |
| --- | --- | --- | --- | --- | --- | --- |
| Roster | operations | 21 | 15 | 17 (8 with a built caller) | 3 | Error rows are in Section 4 |
| Roster | routes | 2 | 4 | 5 with a built caller | 0 | `profile`, `read`, `external`, `upload`, `update`, `remove` exist |
| Deploy | routes | 6 | 8 | 4 | 0 | |
| Deploy | edit operations | static | 43 | 0 | 0 | Every edit name has a handler in `model.mjs` or `service.mjs` |
| Contacts | routes | 6 | 7 | 1 | 0 | Reads must be GET. `/diy` gave "not found" for both methods with no parameters: not judged |
| Calendar | actions | 4 | 28 | 0 | 0 | All 32 actions have a handler |
| Calendar | routes | 2 | 1 | 3 | 0 | |
| Venues | read operations | 4 | 1 | 0 | 0 | |
| Venues | command operations | 0 | 14 | 0 | 0 | All 14 commands have a handler |
| Layout | routes | 1 | 1 | 0 | 2 | Errors are "no snapshot yet" on an empty school |
| LORD, OVERLORD | actions | 7 | 15 | 0 real | 0 | |
| LORD, OVERLORD | routes | 3 | 1 | 1 | 0 | |

**Reading.** Calendar, Venues, LORD, Layout and Deploy edits are complete at the handler level. Roster is the module with real holes. Every "Reached" row still needs a browser run with a proper payload.

**Roster views** (`report`, `entry`, `duties`, `intake`, `allocation` and others) could not be judged this way. `/read` returns 200 for any view name, including a made up one.

## 4. Empty school behaviour (real requests)

| ID | Request | Answer | Meaning |
| --- | --- | --- | --- |
| G01 | Roster `availability` | 503 `PUBLICATION_UNAVAILABLE` | Assign Relief cannot list who is free until Deploy has a verified publication. This is first ledger row B08, now proven. The owner decision of 15 Nov (allow "estimated") applies here |
| G02 | Roster `candidates` | 503 `PUBLICATION_UNAVAILABLE` | Same |
| G03 | Roster `currentDuty` | 503 `ROSTER_RULE_REJECTED` | A read fails with a server error where an empty answer is expected |
| G04 | Layout `public/campus`, `export` | 503 `SNAPSHOT_UNAVAILABLE` | Expected before the first import. The screen should say "import first", not show an error |
| G05 | Venues `piece` | 409 `SOURCE_CHANGED` | Needs a manifest first. Normal |

A 503 tells the copied v0.9 screen "the server is down, retry". For G01 to G04 the true message is "a prerequisite is missing". Return a clear non retry answer.

## 5. Values the screens test for that no service produces

Found by comparing every status, state, phase, outcome and kind value the built screens compare against with every string in the matching v1 service. Local UI states such as "loading" are left out. These are candidates, not proven faults.

| ID | Module | Value the screen expects | Likely meaning |
| --- | --- | --- | --- |
| E01 | Roster | status `checking`, `processing`; outcome `review`, `already-current` | Absence intake states from the v0.9 queue. Linked to F06 |
| E02 | Roster | stage `notify` | Publish then notify stage |
| E03 | Calendar | state `NEEDS_ATTENTION`, `CAPTURE_UNKNOWN`; kind `job`, `reconcile` | v0.9 Calendar job queue states. Linked to F14 |
| E04 | Calendar | status `valid`; mode `recurring` | Check the event validation and series paths |
| E05 | LORD | status `RETURNED WITH ISSUE` | Return with issue shows differently, or never |
| E06 | LORD | kind `customActivity` | Custom activity purpose on a booking |
| E07 | OVERLORD | kind `booking_email`, `whatsapp_alert` | Background work list. Replaced by native panel; remove the dead branches |
| E08 | Deploy | kind `Other non-teaching` (table key) | Reporting row label not produced by the service |
| E09 | Contacts | kind `membership`, `offload`, `sysFields` | Admin table kinds. Linked to F13 |
| E10 | Deploy | status `planning` versus `draft` | Already known (UAT019, PR 161). Kept here as the pattern example |

## 6. Messaging and schedules

**WhatsApp templates.** v0.9 defines 23 template contracts in `notification-worker/template-contracts.json`. 21 are referenced somewhere in v1 or in the shared Roster code. Two are not:

| ID | Template | State in v1 |
| --- | --- | --- |
| M01 | `relief_manual_review` | No reference |
| M02 | `relief_final` | No reference |

A reference is not proof of sending. Provider delivery is "Not tested" for every module.

**Schedules.**

| v0.9 job | v0.9 timing | v1 |
| --- | --- | --- |
| Roster notifications, critical | each minute | Roster `scheduled`, each minute |
| Roster daily cleanup | 18:15 UTC daily | Not found as a separate job. Verify inside Roster `scheduled` |
| Roster audit export | every 5 minutes | Not found as a separate job. Verify |
| Calendar jobs | each minute | Calendar `scheduled`, each minute |
| Venues jobs | each minute | Venues `scheduled`, each minute |
| LORD overdue alerts | time trigger | LORD `scheduled` exists. Timing differs (first ledger A18) |
| LORD reference refresh | 02:03 daily | LORD daily reference refresh exists. Verify the hour |
| LORD secondary queue | time trigger | Covered by outbox drain. Verify |

All eight v1 owners run one cron, each minute. Any v0.9 job with its own clock time must be checked inside that one handler.

## 7. Things v1 has no tool for

| ID | Gap | Evidence | Effect |
| --- | --- | --- | --- |
| T01 | No v0.9 to v1 migration tool | `scripts/v1/` has build, deploy and verify scripts only. Run B moved data by hand and by direct D1 writes | A second school, or a rerun, repeats the manual work and its risk |
| T02 | No initial register import for Venues | First ledger A15 | Blocks Deploy publication and Roster baseline on a new install |
| T03 | No bulk import for Calendar events | First ledger A16 | Same |
| T04 | Offline BURROWS tool absent | `v1/services/roster/exports.mjs` sets `offlineToolAvailable: false` | Offline continuity for Roster is export only |
| T05 | aSc export never tested in the aSc application | `applicationTested: false` in the exporter; `PARITY.md` | Timetable export may not import |
| T06 | No push channel | No WebSocket or Durable Object in `v1/` | Two users see each other's edits only on the next poll |
| T07 | No request level operation probe in CI | This scan had to be built by hand | Missing handlers are found by users, not by tests |

## 8. Test coverage shape

94 product programs exist at `77e30ee`.

| Area | Programs |
| --- | --- |
| Roster | 13 |
| Deploy | 11 |
| Calendar | 8 |
| LORD | 8 |
| Web (browser) | 8 |
| Contacts | 6 |
| Venues | 6 |
| Core | 3 |
| Layout | 2 |

Most programs call one service with data shaped for that service. `parity.json` records a browser pass for 7 of 183 operations. That is why 94 green programs and a blocked hosted migration exist together.

## 9. Full list of what still needs a browser run

Every "Reached" and "OK" row in Section 3 has a handler and no browser proof. The Roster list also takes the write names from the policy sets in `v1/services/roster/service.mjs`, because the screens build some of those names at run time. In priority order for daily school use:

1. **Roster:** `saveAbsence`, `reliefBatch`, `assign`, `unassign`, `autoAllocate`, `publish`, `notifyDaily`, `acknowledge`, `requestMutual`, `respondMutual`, `setDutySMC`, `saveStapler`, `confirmStapler`, `publishStapler`, `inboxReply`, `inboxAssign`, `inboxSetHandled`, `saveOpeningBalances`, `cancelAllocationRun`, baseline `upload`, `update`, `remove`.
2. **Venues:** `book`, `amend`, `cancel`, `decide`, `requestTransfer`, `decideTransfer`, `respond`, `saveClosure`, `saveGrant`, `saveVenue`, `saveRoomMetadata`, `saveRoomOwners`, `notificationDecision`, `sync`.
3. **LORD:** `bookingCreateBatch`, `bookingUpdate`, `bookingCancel`, `bookingRespond`, `loan`, `return`, `notificationPreferences`. **OVERLORD:** `bookingCreate`, `incidentResolve`, `reignClose`, `suiteRefresh`, `adminSettings`.
4. **Calendar:** `saveEvent` (one pass recorded), `deleteEvent`, `relocateEvent`, `saveParentSide`, `saveDayNote`, `saveLane`, `saveTag`, `deleteTag`, `saveColourRule`, `deleteColourRule`, `reorderColourRules`, `saveUrls`, `saveUser`, `saveYear`, `savePublicHolidays`, `generateYearStructure`, `publishVersion`, `pullBirthdays`, `startSyncYear`, `syncYearBatch`, `startCalendarWipe`, `calendarWipeBatch`, `archiveYearsPreview`, `archiveYearsCommit`.
5. **Deploy:** all 43 edit operations, plus `lease`, `publishReview`, `publish`, `acknowledgeNotices`, `versionNote`, `export`, imports.
6. **Contacts:** `save-data`, `save-diy`, `save-receipt`, `save-signature-settings`, `recalculate-data`, `recover-save`, catalogues.
7. **Layout:** `owned-data`, import preview and apply, export.

## 10. What Codex should do with this file

1. Treat Section 2 as the true "missing" list. Drop the rows named in Section 1.
2. Fix F01 and F02 first. Stapler cannot be edited without them.
3. For F03 to F16, decide per row: add the handler, or remove the control from the copied screen. A visible control that always fails is the worst state.
4. Fix G01 to G04 so a missing prerequisite is not reported as a server failure.
5. Check each E row in a browser. Fix the side that is wrong. Do not add a build patch where a service field can match the screen.
6. Add the probe as a CI program (T07): build the web assets, extract every operation name, send each to the local product, fail on "unknown operation" unless the name is on a reviewed allow list. This stops the class of fault for good.
7. Then work through Section 9 in order and write the true result into `parity.json`.

## 11. What this scan still does not prove

1. Behaviour on the hosted site. The hosted build was last verified at `26bbccd`, which is older than the code scanned here.
2. Correct results. A handler that exists may still compute the wrong answer or reject valid data.
3. Field level mismatches. Section 5 covers status style values only. The earlier `ext` versus `extension` kind of fault needs a per screen read and write comparison in a browser.
4. Permissions for normal staff, SMC and key personnel.
5. Provider delivery, Google sign in, Google Calendar sync and Drive export.
6. PR 176 at its new head.
