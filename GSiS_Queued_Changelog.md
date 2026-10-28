# GSiS queued changes after v0.7.13

Baseline: GSiS_v0.7.13_Deployment.zip.
Baseline source: libfile_ed8f5cf0de188191a20e913b6a314b26.
Established: 19 October 2026, Singapore time.
Current authorised release: GSiS Suite v0.9, including all eight apps and the reviewed LORD integration. See the final v0.9 entry and VALIDATION.md. Chronological investigation and older release dispositions are retained below.

## Working rule

Log all change requests unless the user explicitly instructs implementation, commit or build. The user authorised “commit next version” on 19 October 2026. Items 001 to 005 are included in v0.7.14, based on the full v0.7.13 package. No live deployment is authorised by this release action. On 19 October 2026 at 15:34 Singapore time the user authorised the full v0.7.15 commit and build, including items 006 to 008. Later requests return to log only unless separately authorised. The user authorised the next version on 19 October 2026 at 21:01 Singapore time; v0.7.16 implements the queued scope recorded below.

## 001: Roster > Assign relief > Excel exports

Status: Implemented in v0.7.14. Local verification and release evidence are recorded in VALIDATION.md.

1. Change the existing Export Excel action to export a full summary of all teachers, using the offline Stapler Module 3 (Relief) format and style.
2. Include all teachers, including those with no relief assignment; do not restrict this summary to relief arrangements.
3. Preserve the current relief arrangements export as a separate button labelled exactly "Export relief excel".
4. Place both export buttons in the same existing export area on Assign relief.
5. Use the supplied Stapler_v4_3(3).html and Stapler_v4_3_Reference(3).md as the Module 3 reference. Its teacher workbook uses four rows per teacher: Subject, Class, Venue, Group. Preserve the reference layout, ordering, and formatting when implementing the full summary.

Acceptance: Export Excel produces the complete teacher summary in the reference format; Export relief excel retains the existing relief arrangements output.

## 002: Roster > Name Bridge > Combined search and selector

Status: Implemented in v0.7.14. Local verification and release evidence are recorded in VALIDATION.md.

1. Combine the timetable name search field and selector into one searchable dropdown.
2. Typing in the same field filters the available baseline timetable names; selecting a result sets the mapping.
3. Retain validation against baseline timetable names. Search text alone must not save an arbitrary name.

Acceptance: A user can search and select a valid timetable name in one field without a separate search box.

## 003: Automatic allocator > Teaching match and coverage priority

Status: Implemented in v0.7.14. Local verification and release evidence are recorded in VALIDATION.md.

1. Prefer an eligible relief teacher who teaches the same subject as the lesson requiring cover.
2. Next prefer an eligible relief teacher who teaches the same level as that lesson.
3. Treat these as preferences, not requirements that exclude otherwise eligible teachers. Their position relative to existing fairness preferences must be resolved when implementing; the requested relative order is subject before level.
4. Make maximum lesson coverage the overall, non user editable objective. Search alternative combinations and reassign tentative choices across lessons instead of locking in greedy first choices.
5. Relax subject and level preferences where needed to achieve full coverage when feasible. Retain existing hard eligibility constraints, availability, protected assignments, and explicit override requirements. Full coverage cannot be promised when no feasible allocation exists.
6. Interpret "permutate fuzzily" as exploring alternative eligible combinations and accepting weaker preference matches for better coverage; it does not authorise bypassing hard constraints or require random or exhaustive search.
7. Score each candidate allocation as a whole against the configured business rules. Among arrangements with equal maximum coverage, use the arrangement with the least deviation from those rules, respecting their configured priority order. Do not select an arbitrary full coverage permutation or merely optimise each lesson independently.
8. Keep hard constraints outside the deviation score: a better score cannot make an ineligible arrangement valid. The fixed objective order is eligibility, maximum coverage, then minimum business rule deviation. No numeric weights are agreed in this log.

Acceptance: Subject matches rank before level matches among otherwise comparable options. The allocator chooses a feasible full coverage arrangement over a partial arrangement with stronger teaching matches. Among equally covered alternatives, it selects the lowest deviation score according to business rule priorities. If full coverage is infeasible, it maximises coverage and exposes remaining uncovered lessons.

## 004: Roster > Stapler > Import Offline JSON

Status: Implemented in v0.7.14. Local verification and release evidence are recorded in VALIDATION.md.

1. Rename "Load legacy plan" to exactly "Import Offline JSON" in the existing toolbar. Update related import messages to use the same terminology.
2. Accept the supplied offline Stapler state formats, including v3.9 and v4.3 files marked stateType "plan". Also retain support for "relief". Offline Stapler uses the same complete state builder for both; the label is save intent, not a restriction on contents.
3. Match teachers by name, with safe name normalisation and saved Name Bridge mappings where necessary. Resolve current owners, source teachers, added teachers, suspension targets and any relief assignees to the correct GSiS staff identity. Do not depend on offline tile IDs matching GSiS IDs.
4. Present missing or ambiguous identities for explicit resolution; never guess similar names or silently omit them. The samples contain both "Oliver" and "Olivia". Do not assume they are the same person. Retain Admin control of saved name mappings and validation of imported names against the supplied source.
5. Interpret the embedded workbook, selected date, weekday, week sheet and period timings. Import only the selected day's plan even though the files hold tiles for both whole timetable weeks. Compare source lessons with the active GSiS baseline and report real discrepancies for resolution; do not overwrite the baseline merely to force acceptance.
6. Preserve current and original lesson details, moved lessons, newly created exam and operational duties, custom classes, class and teacher suspensions, and Card Pit placement. Both offline "teacher" and "class" locations are placed cards; "pit" is unplaced. Import or explicitly resolve custom class and venue values instead of dropping cards.
7. Preserve the recess arrangements in the RECESS exemplar. Its selected day contains 36 teacher-assigned "RECESS" cards, comprising 26 new cards and 10 edited original cards, plus seven "Duty (Recess)" cards. Preserve each current teacher assignment; do not convert these into unstaffed recess cards. Reconcile them with dated GSiS recess cards so an import neither duplicates recess nor silently replaces the saved plan with default recess timings.
8. Decode legacy source metadata from the embedded workbook when absent, following the offline loader's compatibility behaviour. Keep original lesson anchors separate from modified card fields.
9. Load into the existing draft and review/save workflow. Parsing or mapping failures must not partially replace the draft. Imported settings must not silently overwrite GSiS allocation policy, identities, publication state or notification state.
10. Use all five supplied files as required acceptance fixtures at the authorised build. Preserve Relief content when present; these five samples all have empty reliefAbsences, so they do not prove Relief assignment or Swap compatibility.

### Evidence inspected on 19 October 2026

All five JSON files parse successfully. Their stateType is "plan". A read-only call to the unchanged v0.7.13 importer with valid matching-date probe plans reproduced the same immediate rejection for every file: "Save the legacy Relief state and import that file." This proves the format gate fails; it is not an end-to-end check against the live baseline.

The current importer matches plan teacher names and timetable names, demands exact existing class/venue mappings, ignores the embedded workbook and customClasses/addedTeachers lists, and rejects Swap records. Compatibility needs more than a button rename or removing the stateType check.

| Required exemplar | Version | Date | Library identity |
| --- | --- | --- | --- |
| 2026 Oct 21 P5 Higher Mother Tongue Languages Paper 2 EYE - saved 2026 Oct 15 1126h.json | 4.3 | 2026-10-21 | libfile_74e889b1cf688191b0b6d6a01da9888b |
| 2026 Oct 22 EL EYE PP2_LC - saved 2026 Sep 28 1327h.json | 3.9 | 2026-10-22 | libfile_2d98b687b9ac81918d29061d01095b90 |
| 2026 Oct 22 EL EYE PP2_LC - saved 2026 Oct 16 2129h-RECESS.json | 4.3 | 2026-10-22 | libfile_3d583c3de0248191bd0b515a8b33aeb6 |
| 2026 Oct 23 Sci EYE - saved 2026 Oct 15 0828h.json | 4.3 | 2026-10-23 | libfile_053c3bc7005c8191bfdc935812d42bf5 |
| 2026 Oct 26 (older version) - saved 2026 Oct 18 1655h.json | 4.3 | 2026-10-26 | libfile_adfa8a7997608191b03a3fa1d2e00bf3 |

Reference files: Stapler_v4_3(3).html, libfile_9473c54d4ad88191ae093e44669d082a; Stapler_v4_3_Reference(3).md, libfile_b2d43abe8d08819187107f4fc72246a8. The Oct 26 filename says "older version", but the payload declares version 4.3.

Acceptance: Each exemplar imports into its corresponding dated draft after any necessary explicit identity/baseline resolution. Its placed cards, Card Pit, custom classes, suspensions and recess content match the offline plan. No silent data loss, no automatic publication and no identity guesses.

## 005: Layout > 3D Campus > Courtyard rail and rain shelter

Status: Implemented in v0.7.14. Local verification and release evidence are recorded in VALIDATION.md.

Reference: image(20261019-000305).png, libfile_3c8964b7d65c81918226843ca9161f16. Screenshot inspected. Use its annotations to identify the exact geometry; the selected Hall label alone does not establish the affected structure's block or level.

1. Remove the short transverse rail marked with the orange cross between the blue and yellow highlighted portions on the right side of the courtyard view.
2. Change the blue highlighted portion to a rain shelter that continues the yellow highlighted shelter. Match the adjacent shelter's roof form and alignment.
3. Scope the change to the marked rail and blue portion; use the yellow portion as the design reference.

Acceptance: From the screenshot's viewpoint, the crossed rail is absent and the blue portion visibly continues the yellow rain shelter.

## v0.7.14 implementation decisions

The saved allocator order survives frontend and backend updates when the same operational data store is retained. Existing four-rule orders gain subject matching followed by level matching at the end; Admin can reorder the business preferences. Eligibility, maximum coverage and whole-plan score comparison remain fixed. Bounded searches distinguish proved optimality from the best result found.

All five supplied examples passed parsing, source comparison, import and backend draft saving against baselines reconstructed from their embedded workbooks. A different live baseline still requires a matching source or an explicit correction. Imported swaps and incomplete/no-relief absence records are rejected with an explanation rather than silently omitted.

The changed rain shelter is Block B L2: x854 to 1056, z617 to 644. The marked transverse rail at x927 was removed. Adjacent Block A geometry remains intact.

## 006: Roster > Stapler > Import the final offline timetable for a suspended day

Status: Implemented in v0.7.14a for the five supplied timetable files. Scope corrected and confirmed on 19 October 2026 at 10:18 Singapore time; missing-teacher handling confirmed at 10:30 Singapore time. The user authorised a surgical v0.7.14a revision and commit at 10:33 Singapore time. Implemented and committed as 8588d19387933fbdfd20fcf1902fbd5e5ac16f58, tag v0.7.14a. Only Roster frontend and shared Deploy backend are versioned to 0.7.14a. Current release baseline is GSiS_v0.7.14_Deployment.zip, commit 7ae2cbf6a0a4778ef8d843766501341d3a58304c. This request revises the import approach in item 004; item 004 above remains the record of what shipped. This corrected scope supersedes the earlier 10:14 interpretation that excluded relief allocation.

Problem: The corrected screenshot image(20261019-020952).png shows "Offline JSON baseline differs (31)". Differences include class and venue details and missing source lessons. The user wants the final offline result, without requiring the offline source lessons to match the online baseline.

Purpose: This is a suspended timetable day. Teachers have already planned the replacement timetable in the offline Stapler tool and need to use that plan online. The imported final timetable is the working timetable for that date, not merely a display or export overlay.

### Confirmed behaviour

1. Take the JSON's final Relief output for each teacher as a dated working timetable in online Stapler. Use the selected date and corresponding day/week only. Use the final result as represented by offline Module 3, rather than replaying its editing history or comparing original lessons with GSiS.
2. Use that dated working timetable consistently for teacher summaries, Excel and relief allocation. Relief demand and teacher availability must reflect the imported final lessons, duties and free periods, subject to the existing absence and eligibility rules. The recurring odd/even baseline and other dates remain intact. Keep the saved allocation business rules unchanged.
3. Replace each matched teacher's whole day, including empty periods. Do not fill imported blanks with underlying baseline lessons. A teacher represented in the imported roster with zero final tiles still needs an explicit blank day; do not discover teachers solely from occupied tiles. A teacher entirely missing from the JSON roster retains the baseline timetable for that date and is taken as present by default. Missing from the file is not an absence report and does not make the teacher free during baseline commitments. Separately recorded online absences still apply under the existing absence rules; this import does not erase attendance records.
4. Match against validated TTB names. Resolve exact names and saved Name Bridge mappings automatically. Offer fuzzy candidates when necessary and require explicit confirmation for uncertain matches through the name resolution flow. Do not silently merge similar names or drop unresolved teachers.
5. Preserve each final tile's current teacher, period, Subject, Class, Venue and Group, including staffed RECESS and operational duties. Exclude unplaced Card Pit tiles from the final teacher summary.
6. Interpret "Relief output" as the final offline Module 3 result, not a requirement that stateType be "relief". The five supplied examples have stateType "plan" but contain the shared state. Saved offline absence decisions and swaps require attendance handling beyond the final-tile timetable projection. The surgical v0.7.14a patch rejects nonempty reliefAbsences before changing the draft; this extension is deferred for separate scope review. All five supplied files have empty reliefAbsences.
7. Online Stapler, the full teacher summary Excel and the relief allocator must use the same effective timetable for the selected date. Retain the existing draft review and confirmation workflow; importing must not silently publish or send notifications. The imported date and timetable source must remain clear. Existing online relief assignments need validation against the changed day, without silently duplicating or deleting them.

### Missing-teacher decision confirmed at 10:30

The user instructed: "entirely missing from JSON: remain at baseline, take as present". This resolves the outstanding question and replaces the proposed review requirement for missing teachers. Distinguish a baseline teacher entirely missing from the file from an imported teacher whose name is unresolved; uncertain name matches still require confirmation. A teacher present in the JSON roster with no final tiles has a blank day, as already agreed.

### Verification completed for v0.7.14a

Use the same five exemplar JSON files and offline references listed under item 004. Compare the imported online timetable, summaries and Excel with the final offline Module 3 output for the selected day. Verify that source class/venue/lesson differences do not block this import, whole-day blanks remain blank and identity resolution is explicit where needed. Verify that imported occupied periods affect availability, imported lessons generate the appropriate relief demand when their teacher is absent, and removed baseline lessons do not reappear as demand. Confirm that recurring baseline data, other dates and saved allocation rules are unchanged. Existing online relief assignments must not be silently duplicated or lost. The five examples have empty reliefAbsences, so they alone cannot establish correctness for saved relief assignments or swaps.

Also verify the two distinct cases: a teacher present in the imported roster with zero final tiles receives a blank day, while a teacher entirely missing from the roster retains the dated baseline and defaults to present. Baseline occupied periods must still block relief availability for missing teachers, and separately recorded online absences must remain effective.

Acceptance: After name resolution and the existing review/confirmation step, online Stapler, summaries, Excel and relief allocation use the selected suspended day's final offline timetable, including blank periods, with the baseline retained for teachers entirely missing from the JSON. Those missing teachers are taken as present by default, subject to separately recorded absences. The 31 source baseline differences shown in the screenshot no longer block this import. The recurring baseline remains intact. The targeted implementation is committed in v0.7.14a. No live deployment was performed.


## v0.7.14a surgical release and v0.7.15 carry forward

Release commit: 8588d19387933fbdfd20fcf1902fbd5e5ac16f58. Tag: v0.7.14a. Baseline: v0.7.14 at 7ae2cbf6a0a4778ef8d843766501341d3a58304c.

Only two deployment items changed: Roster_Frontend_v0.7.14a.zip and Deploy_Backend_v0.7.14a.gs. All other components remain at v0.7.14. GSiS_v0.7.14a_Changed_Items.zip contains these two items, deployment notes, changed source, the exact Git patch, an incremental repository bundle and verification evidence. It is not a full-suite rebuild.

Verification: 21 targeted Node scripts, including the syntax check for 42 Apps Script sources, passed. One real Chromium import test passed on desktop and at 390 px mobile width. All five actual JSON files passed against deliberately different online baseline lesson content. The final archive checksum, source, unchanged-component and asset checks passed. An independent review found no blocking issue. Thermonuclear was unavailable; it was not run.

The eventual v0.7.15 full package must start from this patch and include its code and tests. QUEUED_v0.7.15.md in the source records the carry forward. Normalise both 0.7.14 and 0.7.14a runtime labels to 0.7.15; do not let the old numeric-only bump script produce 0.7.15a by substring replacement. The full v0.7.15 package was subsequently authorised on 19 October 2026 at 15:34 Singapore time.

Remaining limitation: the supplied five timetable files contain no saved attendance decisions. Nonempty offline reliefAbsences, including swaps, remain rejected pending a separate review of attendance availability, uncovered demand and reconciliation with online assignments. All later change requests remain log-only unless implementation, build or commit is explicitly authorised.

## 007: Roster > Suspension timetable and dates > Slow loading

Status: Further canonical-validation work implemented in v0.7.16 under item 014. Production latency remains unmeasured.

Original status/history: Implemented for v0.7.15. Originally logged on 19 October 2026 at 14:18 Singapore time; implementation and full release authorised at 15:34. Local before and after measurements and verification are recorded in PERFORMANCE_v0.7.15.md and VALIDATION.md. Production latency is not measured.

User report: "suspension timetable / dates loading too slow". Loading times and the cause have not yet been measured.

1. Reduce the time to load the suspension dates list and to open the selected suspension timetable.
2. When implementation is authorised, measure the current loading path and identify the main delay before choosing a fix. Check repeated requests, unnecessary backend reads or plan processing, response size and rendering only where the measurements point.
3. Verify initial loading, repeat opening and switching dates. Preserve the correct date's current timetable, permissions, saved changes and editing locks.

Acceptance: Show measured before and after loading times under the same conditions for both the dates list and timetable. Improve loading without stale data or displaying one date's plan under another date. Implemented with one fresh lock metadata snapshot per date-list request and fresh timetable rendering before editing lock acquisition completes. Editing remains disabled until ownership is verified. No response cache was added.

## 008: Roster > Stapler > Imported suspended timetable does not persist

Status: v0.7.16 adds honest pending Save/Confirm states, exact retry recovery and safe diagnostics. Local persistence is verified; the previously reported installed failure remains open until deployment readback succeeds.

Original status/history: Reopened for diagnosis following the user's 19 October 2026 16:56 Singapore time report, "still cannot". The v0.7.15 request size fix remains implemented and locally verified; installed resolution is not established. The screenshot displays frontend v0.7.14a, and the deployed backend version is unknown. This follow up is logged only; no new code change, build or commit is authorised.

User report: "stapler import working but cant seem to save/confirm for the suspended timetable to stick around". Clarified on 19 October 2026 at 15:29 Singapore time: "save then refresh, its no longer present". The user confirms that import works, but after Save and a refresh the imported suspended timetable is gone. The original report did not establish whether Save displayed success or an error, nor the server response. The deployed response has not been captured. The local reproduction and fix are recorded below.

1. Make the imported timetable persist through Save and Confirm for the selected suspended date.
2. Save alone must retain the dated draft after refresh, without requiring Confirm. Confirm must then retain its confirmed state and make the same timetable available to summaries, Excel and relief allocation.
3. Verify persistence after reload, navigating away and reopening, and switching to another date then returning. Preserve the recurring baseline and existing absence records.
4. Capture the exact Save/Confirm result and check the deployed frontend/backend versions before attributing a cause. Trace the reported failure through the existing write, response and reload paths when diagnosis is authorised. Do not claim success until persistence has been verified.

Acceptance: First import one of the supplied JSON files, click Save without Confirm, refresh and reopen the same date. The saved draft must retain its final tiles and blank periods. Separately Confirm that draft, refresh and reopen the date again; the confirmed state must remain and relief allocation must use that saved day. Repeat the persistence checks after navigating away and switching dates. A failed operation must show a clear error rather than an apparent success. The signed backend request path reproduced a 400 Request too large rejection before any write. All five supplied imports crossed the old 600,000-character envelope limit. The saveStapler exception now permits a 2,200,000-byte signed payload while retaining the 1,900,000-byte plan guard, frontend limit, authentication, lease, revision and validation checks. Other operations retain their previous limits. All five examples now pass Save, fresh runtime readback before Confirm, date list, replay, Confirm and another fresh read through the actual storage functions with a disk backed Drive adapter. Injected write failures, lost acknowledgement and corrupt saved data remain visible errors. Chromium verifies that a rejected Save retains the imported draft and Unsaved changes marker. These tests establish the code defect and fix, not the exact response from the school deployment.


### Follow up at 16:56: pending save or confirmation

Screenshot inspected: image(20261019-085637).png, libfile_bb3d422dc9dc8191a90f570a8663c9ee. The screen shows GSiS Roster v0.7.14a, selected date 21/10/2026, "Draft saved", 100 teachers, 52 classes, 688 in Pit, "Retry pending operation", a disabled Confirm button and an editing lock held by the user.

Exact displayed error: "The Roster save could not be confirmed. Retry the same save. Retry the same operation to confirm it."

Read only source trace: roster.js api() and _worker.js rosterFailure() use this generic message for uncertain transport/backend failures, including network, timeout and invalid response cases. roster-stapler-ui.js mutate() retains the pending request in those cases. A normal 400 Request too large response clears pending, so the screenshot does not establish that the previous request size defect is still occurring. The behaviour is shared by v0.7.14a and v0.7.15.

The pending operation may be saveStapler or confirmStapler. Confirm first saves a dirty draft and then submits confirmation. The "Draft saved" label does not by itself prove a durable save. The static header identifies the loaded frontend HTML, possibly cached; it does not identify the backend serving the request.

Next evidence: establish whether both the Roster frontend and the existing Deploy web app deployment were updated to v0.7.15, and whether Save or Confirm triggered the message. If the problem remains on the updated pair, obtain the failed /api/operations request's operation, HTTP status, duration and diagnosticId, then match its Cloudflare roster-request-failed log. A successful response's data.timing.backendVersion can identify the backend. Avoid losing the current pending request before its outcome is established. Do not attribute a new root cause or report the installed issue resolved from the local test results.

## v0.7.15 release

The full package includes items 001 to 008, including the final timetable importer previously released as v0.7.14a. All five frontend and three backend labels are normalised to v0.7.15. Start from commit 8588d19387933fbdfd20fcf1902fbd5e5ac16f58; the release commit is identified by tag v0.7.15 and the packaged maintainer notes.

Ponytail and Pstack kept the fixes in existing owners and required reproduction through the real request and storage functions. Thermonuclear was found and used for this release. Independent correctness and code quality reviewers found no material issues in the changed scope. VALIDATION.md, RELEASE_SUMMARY.json and packaged evidence record the checks actually completed.

Nonempty offline reliefAbsences remain deferred for a separate scope review. No live deployment, data reset, timetable publication or staff message was performed. Later requests return to log only until the user authorises another implementation, commit or build.

## 009: Roster > System Config > Daily and consecutive period limits

Status: Implemented in v0.7.16: independent strict 9 total and 6 consecutive defaults, as recorded in the release decisions below.

Original status/history: Pending next authorised revision. Logged on 19 October 2026 at 17:25 Singapore time. Log only; no implementation, build or commit authorised. The treatment of these limits as hard caps or relaxable preferences remains to be confirmed.

User request: Add the two settings shown in 100435.jpg to Roster System Config and make them influence the automatic allocator. Reference inspected from the attached image. The user initially requested 10 daily periods, then changed the daily maximum to 9 on 19 October 2026 at 17:39 Singapore time. The current defaults are 9 daily and 6 consecutive periods, overriding the screenshot's daily example of 8.

| Setting | Default | Count |
| --- | ---: | --- |
| Max. Total Daily Periods per teacher per day | 9 | Lessons plus relief plus invigilation |
| Max. Total Consecutive Periods per teacher per day | 6 | Consecutive lessons plus relief plus invigilation |

1. Expose both values in Roster System Config under the existing Admin edit and SMC view permissions. Save them with the existing persistent allocation configuration so ordinary frontend/backend updates retain them. Apply defaults only when settings are absent; do not replace saved choices with defaults on deployment.
2. Both manual initiation of automatic allocation and scheduled automatic allocation must use the saved values. They must affect allocation decisions, not only appear in the interface.
3. Count the teacher's effective timetable for the selected date, using a confirmed suspended timetable where applicable, together with existing and proposed relief. Include imported invigilation in the count. Do not count the same occupied period twice because it appears in both a baseline and its replacement or in more than one projection.
4. Evaluate the complete proposed daily total and longest consecutive run. A proposed relief period may join two existing runs. Recompute the constraints when exploring alternative allocations rather than checking only how many relief periods were added.
5. Preserve existing timetable work, protected assignments and hard eligibility checks. These settings do not authorise deleting or moving existing work or changing manual assignment override policy.

Decision needed: Should automatic allocation treat 9 daily and 6 consecutive periods as hard limits, leaving lessons uncovered when no eligible arrangement fits, or may it exceed them as a scored preference to increase coverage? Recommendation: hard limits, because they are presented as maximum workload limits. This recommendation is not yet an agreed policy; reconcile it explicitly with the existing coverage first objective before implementation. The numerical revision to 9 does not answer this policy question.

Acceptance after policy confirmation: Missing configuration starts at 9 and 6; saved changes survive reload and ordinary redeployment; both automatic allocation paths use the selected day's effective timetable and proposed relief; boundary and joined run cases follow the agreed hard cap or relaxation policy. No allocator change has been implemented by this log update.

## 010: Roster > WhatsApp Inbox > Enable for the next version

Status: Implemented in v0.7.16: existing Inbox readiness, actionable setup guidance and local end-to-end checks. Production configuration and live activation remain installation checks.

Original status/history: Pending next authorised revision. Logged on 19 October 2026 at 17:39 Singapore time. User request: "for next ver enable whatsapp inbox". Log only; no immediate activation, build, commit or live message is performed.

Reference: attached 100445.jpg shows the WhatsApp Inbox for SMC/Admin in Roster v0.7.15, with the empty state "Incoming WhatsApp messages will appear here when Inbox is enabled." The page already exists. Read only inspection of docs/whatsapp-inbox.md and the existing implementation found no separate INBOX_ENABLED switch: this text is generic and does not establish which deployment setting or connection is missing. This screenshot establishes a displayed v0.7.15 frontend; it does not verify the backend version or resolve the separate Stapler save issue.

1. Make the existing Inbox operational for receiving new messages, reading conversations and voice notes, and authorised SMC/Admin replies from the existing shared school WhatsApp number.
2. Reuse the implemented conversation history, search, assignment, handled state, delivery status, text replies, approved template replies and private voice playback. Preserve staff authority, existing reply restrictions, message records and sender identity.
3. Verify and complete the deployment configuration and webhook connection. A version label or frontend upload alone is not evidence that messages are being captured or replies dispatched. Retain the existing settings and data store across code updates.

### Existing activation dependencies to verify

| Service | Required setup |
| --- | --- |
| Roster Pages | Matching frontend and worker; existing authenticated backend connection and ROSTER_SERVICE_SECRET; WHATSAPP_ENABLED=true; correct account and phone number IDs, app secret and verify token; the messages webhook connected to /api/whatsapp/webhook |
| Replies and voice on Pages | Existing API version and access token; private WHATSAPP_INBOX_MEDIA R2 binding for voice; template account access for approved template replies |
| Deploy and Contacts | Inbox backend, verified SMC/Admin directory, matching service secret and existing Drive access; preserve the automatically created ROSTER_INBOX_FILE pointer and its data |
| Scheduled notification Worker | Matching code, every minute schedule, existing backend connection and sender credentials; WHATSAPP_ENABLED=true and WHATSAPP_DIAGNOSTICS_ENABLED=false for normal dispatch |

WHATSAPP_MENU_ENABLED and ROSTER_AUTOMATION_ENABLED are not prerequisites for Inbox capture or queued replies. Do not change unrelated automation merely to enable Inbox. Optional WhatsApp duty alerts remain separate and require the dedicated approved gsis_inbox_new_message_v1 template and WHATSAPP_INBOX_ALERTS_ENABLED setting; core Inbox activation must not be presented as proof of alert approval or delivery.

Acceptance at authorised activation: Verify a new inbound message reaches its conversation, is retained after refresh and is visible only to authorised staff. Verify a new voice note can be played through authenticated private storage. Verify a controlled authorised reply is queued and dispatched with its resulting delivery status. Test retries and duplicate inbound events without duplicate records. This implementation captures new webhook events; it does not provide historical conversation import, and old missing messages must not be promised as recoverable.

No live webhook, credentials, account flags, storage or messages were inspected or changed during this log update. The current cause of the empty Inbox is unconfirmed.

## 011: Roster > Automatic allocator > Toggleable same subject preference at lowest priority

Status: Implemented in v0.7.16: same-subject preference has an independent switch and moves to lowest priority once.

Original status/history: Pending next authorised revision. Logged on 19 October 2026 at 17:49 Singapore time. Log only; no implementation, build or commit authorised.

User request: "for auto allocator add a new business rule of assign relief that teach same subject as absent teacher. allow toggle off/on and set lowest priority".

1. Add an on/off business rule that prefers an otherwise eligible relief teacher who teaches the same subject as the absent teacher. Use recorded teaching subject information to establish the match.
2. Place this preference at the lowest priority among the configurable business rules. Higher priority preferences take precedence; existing hard eligibility checks and the fixed maximum coverage objective remain ahead of all business preferences.
3. When enabled, include the preference in whole-plan scoring at that lowest priority. When disabled, it must have no effect on allocation scores or tie breaking. It is a preference, not a requirement that excludes teachers who teach other subjects.
4. Save the toggle and priority with the persistent allocator configuration, retaining saved choices across reloads and ordinary frontend/backend updates. Apply the setting consistently to user-initiated Auto-allocate and scheduled automatic allocation.
5. Reconcile this request with item 003, which already records matching the subject of the lesson requiring cover. Check whether matching the absent teacher's taught subject is the same preference in the existing model or a distinct comparison; do not score the same match twice. If the existing subject rule fulfils this request, extend it with the toggle and set its priority last. This latest lowest-priority instruction supersedes the earlier subject-before-level order for the rule fulfilling this request; the earlier item remains the historical record of what shipped.

The initial on/off default was not specified. Do not treat that as an agreed default or overwrite a saved choice. The unresolved hard-cap versus preference policy for the daily and consecutive limits in item 009 remains unresolved.

Acceptance: The rule is visible with an on/off control and the lowest business-rule priority. With equal coverage and equal higher priority scores, enabling it favours the matching teacher; disabling it removes that influence. The choice persists after refresh and ordinary redeployment, both automatic allocation paths honour it, and matching is not counted twice.

## 012: Roster > Automatic allocator > On/off toggles for all business rules

Status: Implemented in v0.7.16: independent switches for all six ranked preferences and both new workload limits.

Original status/history: Pending next authorised revision. Logged on 19 October 2026 at 17:55 Singapore time. User request: "add toggle to all business rules for auto allocator". Log only; no implementation, build or commit authorised.

1. Extend item 011's on/off control to every configurable automatic allocator business rule. Each rule has its own toggle under the existing Admin edit and SMC view permissions.
2. An enabled rule influences allocation according to its saved priority and settings. A disabled rule has no effect on allocation decisions, scoring or tie breaking. Retain its saved values and priority position so enabling it again restores them.
3. Preserve the relative priority order of enabled rules. The subject preference in item 011 remains at the requested lowest priority. Both user-initiated Auto-allocate and scheduled automatic allocation must use the same saved toggle states.
4. Persist toggle states with the existing allocator configuration so refreshes and ordinary frontend/backend deployments retain them. Define migration defaults explicitly at implementation; this request does not specify a new initial on/off state or authorise overwriting saved choices.
5. Include the configurable daily and consecutive workload rules requested in item 009 in this toggle design. Whether their enabled state acts as a hard cap or a relaxable preference still needs the earlier policy decision. A toggle does not answer that question.
6. Existing hard eligibility checks, availability, protected assignments and the fixed maximum coverage objective remain mandatory. These are not optional business preferences. If all business preferences are disabled, retain these fixed constraints and the existing deterministic tie handling without silently reapplying disabled preferences.

Acceptance: Every configurable business rule has an independent on/off control; disabling a rule removes its influence in both allocation paths, and enabling it restores its saved settings and priority. Verify individual toggles, mixed enabled rules and all preferences disabled. Choices survive refresh and ordinary redeployment, while fixed eligibility and coverage behaviour remain enforced.

## 013: Roster > Report own absence > Fast path for today and tomorrow

Clarification on 20 October 2026 at 00:28 Singapore time: the user meant system and interface loading time, not click count. Item 025 supersedes the original click-reduction interpretation below; item 024 restores the date and individual period controls. The earlier wording remains as implementation history.


Status: Implemented in v0.7.16: direct own-absence route, Singapore Today/Tomorrow/Both, Full day default and one submit.

Original status/history: Pending next authorised revision. Logged on 19 October 2026 at 18:23 Singapore time. User request: "optimise the fastest path from log in to report own absence for today and/or tomorrow". Log only; no implementation, build or commit authorised.

Goal: Reduce both user actions and waiting time between sign-in and a confirmed report of the signed-in teacher's own absence. Prioritise the phone workflow and support Today, Tomorrow or Both without requiring navigation through unrelated functions.

### Current flow evidence

Read-only inspection of the v0.7.15 source found that ordinary sign-in opens Home, with Report Absence as a primary tile. The report already defaults to the signed-in staff identity, so self selection does not need to be added again. The existing Start/End date range already supports both dates, using the same reason and period selection, with optional instructions for each date. It has no Today/Tomorrow/Both shortcuts. Dates initially use the current/session date and can retain a previous report date when revisiting; periods initially require selection. The main form action opens an instructions preview before the final Submit absence action, while the existing No relief instructions needed action can submit directly. The frontend handles a WhatsApp Inbox deep link but has no equivalent absence shortcut. The report already uses compact data and preloads today; unrelated baseline warming runs separately. Sources: roster-update/public/roster.js, roster-update/public/roster-operations-ui.js, shared/roster-operations.js, backend/RosterOperations.gs and roster-update/public/_worker.js. No production timings were measured.

### Proposed flow for the authorised revision

1. Make Report my absence immediately accessible after sign-in. Provide a direct shortcut that retains this destination through authentication, avoiding an unnecessary Home selection when the user opens the absence shortcut. Keep access to the rest of Roster.
2. Keep the authenticated staff identity prefilled. Present prominent Today, Tomorrow and Both date choices with the actual dates and weekdays. Resolve these in Asia/Singapore; Tomorrow means the next calendar date, not silently the next school day. Apply existing valid-date and timetable checks with a clear explanation for unavailable dates.
3. Keep the required reason and period selection in a compact form. Offer Full day and Partial day choices, using each selected date's effective timetable and permitted periods. The initial Full day default is proposed below and remains unconfirmed. Preserve the existing detailed reporting route and instructions for each date when needed.
4. Use one clearly labelled Submit absence action for the chosen date or dates. Show the selected dates, period scope and required details before submission. Preserve access to relief instructions and own arrangements, while avoiding an obligatory extra instructions screen when no instructions are needed. No relief instructions needed must still mean that relief may be required; it must not silently switch relief off.
5. Shorten the data-loading path as well as the form. Reuse the existing compact report and preload support, avoid duplicate reads and defer unrelated information. Check the session/profile, trusted Calendar and report dependencies before changing their sequence; do not remove required checks to reduce waits. Measure the current and revised time to usable form, user actions and time to confirmed save under comparable cold and returning sessions. Keep the current authentication and server validation.
6. Preserve absence type timing rules, duplicate/overlap checks, reporting permissions, audit, existing relief behaviour and exact retry handling. Reuse the existing date range submission for Both rather than introducing separate writes merely for a shortcut. Show Saved only after durable server confirmation for all selected dates. Keep entered details when a request fails or its outcome is uncertain, and retry the same request without creating duplicates.

Decision to confirm: Should Full day be selected by default, with an explicit Partial day option? Recommended for the fastest common path, provided the selected scope remains visible before submission. This is a proposal, not an agreed default.

Acceptance: A signed-in eligible teacher can report their own absence for Today, Tomorrow or Both through the direct route, without selecting their name or visiting unrelated pages. The common path has one clear final submit action, preserves optional detailed reporting, and confirms the actual saved dates. Verify phone usability, Singapore date rollover, existing reports, different timetables across the two dates and failed or uncertain saves. Record before/after actions and timings; no performance improvement is claimed until measured.

## 014: Roster > Suspended timetable > Persist validation and edit the canonical plan

Status: Implemented in v0.7.16: server-owned persisted validation and affected-content editing. Local timing results are mixed; no universal or production speed guarantee.

Original status/history: Pending next authorised revision. Logged on 19 October 2026 at 20:40 Singapore time. User reports that v0.7.15 is still slow when handling suspended timetables. This extends item 007; its earlier local improvements do not establish that the installed performance issue is resolved. Log only; no implementation, build or commit authorised.

User request: "for suspension, store validation once and then accept as canonical for purposes of editing, 0.7.15 is still slow dealing with suspended timetable".

Read-only evidence: shared/roster-stapler.js apply() validates the old and new plans, then roster-stapler-ui.js command() validates the result again. shared/roster-operations.js staplerView() rebuilds and validates the baseline even when a saved draft exists. Save, Confirm and their projections also repeat validation. Some per-object accounting caching and lazy plan decompression already exist, but these paths have no persisted revision-bound validation result. Context reads and durable writes remain separate costs. These findings establish repeated work, not its share of the user's observed delay.

1. Fully validate a newly accepted imported or created suspended timetable once, then persist the normalised dated plan and its server-established validation result together. Use that saved plan as the canonical source for editing. Reopening, switching views and rendering the unchanged saved revision must not repeat import interpretation, name matching or full-plan validation.
2. Bind the validation result to the exact saved plan revision/content, date and relevant schema/validation dependencies. A client-supplied validated flag is not authoritative. Retain the result across refreshes, new sessions and compatible deployments; a release number change alone must not force full validation again.
3. For subsequent edits, validate the changed data and affected timetable constraints, then save the new canonical revision with its updated validation result. Recheck related teacher, class and period conflicts where affected. Do not rerun unrelated checks over the entire plan for each edit or redraw.
4. Revalidate only when changed content or a relevant dependency requires it, or when validation metadata is missing or incompatible. Define this invalidation explicitly. Never reuse an older revision's validation for different content, and never rebuild accepted final tiles from the recurring baseline merely because the plan is reopened.
5. Keep authentication, current permissions, date eligibility, editing lease ownership, revision conflicts and durable save/retry checks active on the applicable requests. Confirm and saves of an operational plan must still check current absences, published relief and applicable workload constraints. Stored structural timetable validation does not replace these changing checks. The separate unresolved save/confirmation issue in item 008 remains open.
6. Keep draft editing distinct from Confirm. A saved draft remains the canonical editing source after refresh; its validation does not silently confirm or publish it. Summaries, Excel and relief allocation continue to use the appropriate confirmed dated timetable under item 006. Preserve its blank-day and missing-teacher rules.
7. Measure validation, plan reads, processing and rendering separately before and after the revision. Check initial acceptance, reopening an unchanged plan, individual edits, Save and Confirm using the five existing exemplar files. Repeated full validation is verified work to investigate, not an established production bottleneck; target the measured delays as well as storing validation.

Acceptance: An unchanged accepted revision opens and can be edited without full import/validation work repeating. A local edit checks affected constraints and persists a new validated revision. Relevant dependency changes invalidate only the necessary validation; stale, corrupt or incompatible data cannot be accepted through an old marker. Fresh sessions retain the plan and validation, concurrent edits still conflict correctly, and measured timings improve without changing the effective timetable or publication state.

## 015: Roster > Calculations > Personal workload, relief quota and relief done

Status: Implemented in v0.7.16: server-scoped personal Calculations with canonical weekly figures and completed-only recorded-quota percentage.

Original status/history: Pending next authorised revision. Logged on 19 October 2026 at 20:51 Singapore time. Log only; no implementation, build or commit authorised. The cumulative percentage's reporting period is proposed below for confirmation.

Reference: image(20261019-124943).png, libfile_752e745324088191bd2be19e50676ec6, inspected from the supplied local image. It shows Roster v0.7.15 with the account area marked in the top right header beside Refresh and Sign out.

1. Add a button labelled exactly "Calculations" in that top right account area. Make it accessible to signed-in teachers for their own figures and usable on a phone.
2. Open with the requested personal greeting: "Hi <name>, your weekly W_i = <value>, your relief quota R = <number> and your cumulative relief done is <%>." Use the authenticated staff name and actual applicable figures. Add plain labels for weekly workload estimate and weekly relief quota, and show the percentage's date range. Both W_i and R in the current Deploy model are periods per week; do not double or halve them because the timetable has odd and even weeks.
3. Follow with a short, teacher-friendly explanation of the same calculation used in Deploy > Relief Settings. Show the person's own numbers in a few steps. Keep the exact formula and a short glossary available under an expandable explanation. Use the actual saved settings and applicable published Deploy version, not hardcoded defaults or a second calculation implemented only in Roster.
4. Provide an authenticated, server-scoped summary for the signed-in teacher. Reuse the existing Deploy calculation and its detailed breakdown internally. The existing detailed export and school-wide Roster accounting are privileged; do not send all teachers' records to an ordinary teacher's browser and filter them there.
5. Load the detailed figures when Calculations opens, so this feature does not delay the fast absence-reporting path in item 013. Show the source version and as-of date. If a matching published calculation or trustworthy history is unavailable, explain what is unavailable rather than showing fabricated numbers or zeroes.

### Draft explanation for teachers

"Your weekly workload estimate, W_i, includes your teaching, preparation and marking, form teacher time, professional development, duties and other recorded work. It also includes an allowance for your role.

"We subtract this estimate from your weekly work budget. We then use the part of that balance that falls within timetable hours to calculate your weekly relief quota, R. Your employment type and any teaching cap also apply. We round the final quota down to a whole period, with a minimum of zero.

"This is a planning estimate based on your recorded work. It does not measure every hour you worked. Your quota helps us share relief work; your timetable availability still determines which lessons you can cover."

Present the person's calculation in this order: recorded work; teaching preparation/marking and role allowance; total W_i; balance after subtracting W_i from their work budget; timetable factor, applicable cap and final R. Explain school teaching demand per full time teacher in ordinary language when used in the role allowance. Do not describe that school figure as the individual's own average teaching load.

### Current calculation verified from v0.7.15

The current whole-week-v5 model uses:

`W_i = FTT_i + PD_i + Duties_i + Other_i + (1 + SIUE / 100) × (T_i + OF_i × T_avg)`

`R_i = floor(max(0, min(f_i × (B_i - W_i), C_i - FTT_i - T_i)))`

The C_i cap term applies only when that weekly cap exists. T_i is actual subject teaching; T_avg is school teaching demand divided by the eligible full time teacher count; OF_i is the applicable role offload; B_i is the person's weekly work budget; f_i is the timetable factor. The explanation must use the actual saved values. Code defaults such as 150% SIUE are not evidence of the live school's current settings. Sources: shared/relief.js, backend/Relief.gs and public/relief-ui.js.

### Cumulative relief done percentage

The existing annual utilisation percentage includes completed plus committed relief. Committed can include draft, published and future assignments. Reusing that figure under the label "relief done" would be misleading. Completed relief is separately recorded through completion confirmation, verified history or audited corrections; the passing of a lesson's time alone does not establish completion.

Proposed definition to confirm: confirmed completed relief this calendar year up to the displayed as-of date, divided by recorded accumulated weekly R entitlement through the current week, multiplied by 100. Use Singapore dates and label the period explicitly. This excludes pending and future assignments from the numerator.

Use the existing relief cost rules, not raw assignment counts; zero-cost, cancelled, superseded or duplicate records must not inflate the result. Use recorded historical weekly entitlements, including applicable excluded weeks, rather than multiplying today's R by elapsed weeks. Do not invent missing historical quotas. Show recorded coverage and incomplete/unverified history. Do not cap a valid result at 100%; when the denominator is zero or unknown, show a clear unavailable/not-applicable result and any known completed count. Sources: shared/roster-allocation.js, shared/roster-operations.js and backend/RosterOperations.gs.

Acceptance: An ordinary teacher opens Calculations and sees only their own valid W_i, weekly R and accurately labelled relief completion measure. The displayed inputs and result agree with the applicable Deploy calculation, and the explanation uses the teacher's actual values. Verify full time, 4/5, FAJT, offload, cap, zero quota, missing history and over-100% cases. The additional view must not add loading waits to login or absence reporting.

## 016: Roster > Home > Reorder icons and move divider after the first eight

Status: Implemented in v0.7.16: requested order and role-filtered eight-function first group.

Original status/history: Pending next authorised revision. Logged on 19 October 2026 at 20:58 Singapore time. User request: "reorder the icons. make the horizontal divider below 8 icons". Log only; no implementation, build or commit authorised.

Reference: image(20261019-125820).png, libfile_6707cdcc2c988191ad1046b8b1f175b3, inspected from the supplied local image. Red handwritten numbers specify this order, read left to right across each row:

| Position | Home icon |
| ---: | --- |
| 1 | Report Absence |
| 2 | Manage my absences |
| 3 | Assign Relief |
| 4 | Daily Notify |
| 5 | Manage school-wide absences |
| 6 | Manage Ad-hoc relief |
| 7 | Stapler |
| 8 | WhatsApp Inbox |
| 9 | Check Availability |
| 10 | Timetable |
| 11 | Daily Updates |
| 12 | Baseline Timetable |
| 13 | My Relief Duties |
| 14 | Recess Regression |
| 15 | SMC Duty Roster |
| 16 | Custom Notifications |
| 17 | Manage Absence Type |
| 18 | System Config |
| 19 | WhatsApp Readiness |
| 20 | Prune records |

Place the horizontal divider after position 8, WhatsApp Inbox, before position 9, Check Availability. With the screenshot's four-column layout, the first section has two rows of four icons. Preserve the same order and section boundary when the grid wraps on smaller screens.

Retain the existing role visibility, labels and destinations. For a user who cannot access some functions, show only their permitted icons in this order, with the divider between the permitted members of positions 1 to 8 and the remaining functions. Do not expose restricted functions or insert blank tiles just to reach eight. The Calculations button from item 015 belongs in the header account area.

Acceptance: The full authorised view follows all 20 marked positions, with the divider immediately after WhatsApp Inbox. The phone layout keeps the same sequence and grouping. Each role sees only its authorised functions and all destinations continue to work.

## 017: Roster > STAPLER > Display name expansion

Status: Implemented in v0.7.16: displayed name is exactly Suspended Timeable Advance PLannER; stable internal identifiers retained.

Original status/history: Authorised for v0.7.16 on 19 October 2026 at 21:01 Singapore time, together with "commit next ver".

Rename the displayed STAPLER title to exactly "Suspended Timeable Advance PLannER", retaining the user's spelling and capitalisation. Update the Home tile and planner headings consistently while retaining stable internal page keys, saved data and API identifiers. Use readable wrapping on narrow screens.

## v0.7.16 release authorisation and implementation decisions

On 19 October 2026 at 21:01 Singapore time the user authorised the next version commit. Start from the clean v0.7.15 release commit 3b5bc82b56b4db57f2443851c6226dee661642a0 and work through the queued requests, including the suspended timetable persistence/performance follow-up and items 009 to 017. Prepare a full v0.7.16 deployment package. This authorises implementation, local verification, packaging and commit; no live deployment or staff message is performed by this release action.

Three policy questions were offered before implementation; no answers were returned. The following recommended defaults are therefore explicit implementation decisions, not claims of user confirmation:

1. The 9 daily and 6 consecutive period limits are strict automatic allocation limits when their independent toggles are enabled. Count lessons, relief and invigilation as requested. Other occupied duties still affect availability. Keep existing manual override policy and fixed eligibility checks.
2. The fast own-absence form starts with Full day selected and offers an explicit Partial day option. The selected dates and scope remain visible before Submit.
3. Calculations shows confirmed completed relief this calendar year divided by recorded weekly quota accumulated through the current week. Exclude committed/future assignments, label the period and retain unknown-history/zero-denominator handling.
4. Existing ranked allocation preferences start enabled if no saved toggle state exists. Preserve saved states and priority ordering; migrate subject matching to lowest priority once for this requested change, then retain the existing configurable priority mechanism. The two new workload limits start enabled with defaults 9 and 6 when absent. Do not add toggles to unrelated absence-demand subject exclusions or fixed eligibility rules.

WhatsApp Inbox code and deployment readiness will be verified locally. Actual account credentials, webhook subscription, production bindings and delivery remain installation checks; do not claim live activation from a release build or a configuration-only check.


## v0.7.16 implementation and release verification

Implemented from v0.7.15 commit 3b5bc82b56b4db57f2443851c6226dee661642a0 under the 21:01 Singapore authorisation. Release reference: v0.7.16. The full deployment package carries all five frontends and three backends at v0.7.16, plus the notification Worker, source, repository history, manuals and evidence.

Items 009 and 011 to 017 are implemented. Item 010 includes the existing Inbox path, authorised setup checks and deployment instructions; production configuration and live delivery remain to be completed/verified. Items 007, 008 and 014 receive stored canonical validation, incremental editing and clearer pending Save/Confirm recovery. The original installed Save/refresh failure remains open until the matching deployed components pass school-store readback.

Validation: 386 current regression scripts passed across one full run and targeted reruns, including 29 Chromium scripts and parsing 48 Apps Script sources. Initial failures and rerun evidence are retained; ten fixtures were updated for intended contracts and runtime dependencies, and one unchanged held-response browser test passed in isolation. All five supplied JSONs pass integrated signed fresh-runtime persistence and browser editing/retry checks. Two independent Thermonuclear reviews found no material issue in the canonical feature scope; an additional 600-mutation validation comparison had zero mismatches. Package integrity, source parity, committed-tree, release tag/bundle and retained-asset checks form the final release gate.

The common own-absence path is reduced from three actions to one after sign-in and uses two fewer requests. Saved structural validation removes repeated full checks; local timing results vary, so no universal browser speed or production latency improvement is claimed. Full evidence and limits are in VALIDATION.md, PERFORMANCE_v0.7.16.md and RELEASE_SUMMARY.json.

No live deployment, school-data reset, timetable publication, production flag change or staff message is performed. Subsequent change requests return to log only until the user explicitly authorises another implementation, build or commit.


## 018: Roster > WhatsApp Inbox > Severe operational latency

Status: Pending next authorised revision. Logged on 19 October 2026 at 23:21 Singapore time. User report: "very very very slow to work with (changelog)". Log only; no code change, build or commit authorised.

Reference: image(20261019-152101).png, libfile_0fbfb9cc3fc48191845325b29f052a8b. Screenshot inspected. It shows the WhatsApp Inbox with all four local configuration groups marked Settings present and both inbound text messages, Inbox Test and Inbox Test 2, visible in the conversation. This confirms those messages reached the displayed Inbox; it does not measure delivery latency or establish that replies, voice playback or duty alerts work.

1. Treat the Inbox's severe perceived slowness as an unresolved live usability problem in v0.7.16, despite the passing local release tests.
2. Measure opening the Inbox, refreshing the conversation list, searching, selecting/loading a conversation, and acknowledging a queued reply separately. Record browser response, network calls and backend processing to identify which actions cause the user's delay; these individual bottlenecks are investigation targets, not yet established causes.
3. Reduce repeated or unnecessary reads and serial waits in the measured path. Keep the conversation usable while refreshing where safe, with clear loading, queued, failed and uncertain states. Preserve message drafts, selected conversation, scroll position and playing audio.
4. Keep current SMC/Admin authorization, private media, durable reply queuing, exact retry protection, message ordering and delivery-status meaning. Any cache must remain scoped and invalidated correctly; do not mask backend failures or claim a reply was sent before it was accepted or delivered.
5. Compare first-open and returning-session performance against the same measured baseline. Report action timings and request counts; do not claim a production improvement from synthetic timings alone. No numerical latency target has been agreed.

Operational activation progress: The user reports deploying the three v0.7.16 components, creating the private R2 bucket, binding WHATSAPP_INBOX_MEDIA and redeploying Roster. The displayed setup checks now pass, and incoming text is visible. Outgoing reply delivery, voice storage/playback and optional duty alerts remain to be verified. The earlier absence of visible real-time log events does not by itself establish a webhook failure.

Acceptance: Common Inbox actions respond promptly against a documented measured baseline, retain the working conversation state, and show accurate pending/error outcomes. Confirm that the two incoming test messages remain after refresh and that optimisations do not introduce duplicate, lost or unauthorized messages. Implement only after the user authorises the next revision.


## 019: Roster > Calculations > Slow loading, teacher explanation and KP queue policy

Status: Pending next authorised revision. Logged on 19 October 2026 at 23:26 Singapore time. User reports "roster:calculations load very slowly too" and supplies revised explanatory text. Log only; no code change, build or commit authorised. This follows item 015 and the live latency report in item 018.

### Loading performance

1. Measure time to open Calculations, the own-record calculation read and the relief-history read separately, including first-open and returning-session paths. Identify repeated reads, serial waits and large projections before choosing an optimisation. No live timings or root cause have yet been established.
2. Keep detailed Calculations lazy so it does not delay login or absence reporting. Improve the measured loading path while retaining current authority, own-record scope, published-version provenance, source-change detection and truthful missing-history states. Any reused calculation must be bound to the correct source and identity; completed-relief totals must remain current.
3. Keep the view responsive while loading and show an accurate progress/error/retry state. Record comparable before/after request counts and timings; no numerical response target or production gain is agreed or established yet.

### Requested teacher-facing explanation

Retain the existing five-step structure and use actual personal values rather than hardcoding the following supplied example. Prefer the term offload factor, explain the school teaching-demand figure, retain the optional exact formula, and use plain language.

User-supplied example:

1. **Start with your recorded work.** Teaching: 22 periods. Form teacher time: 5. Professional development: 2. Duties: 0. Other work: 0.
2. **Allow time for your role, preparation and marking.** Your offload factor is 30%. The school figure of 29.13 is total teaching demand divided by 84 eligible full time teachers. This school-wide average teaching load is a measure of how demanding the school programme is per full-time teacher. Across Singapore, teachers report an average of 150% for every period spend on teaching via the Subject Information Update Exercise (SIUE). Preparation and marking add 46.11 periods: 150% of your teaching plus role allowance.
3. **Your weekly workload estimate, Wi, is 83.85 periods.** This adds your recorded work, role allowance, preparation and marking.
4. **Find the balance in your work budget.** Your Full time budget is 84 periods. 84 - 83.85 = 0.15 periods.
5. **Apply the timetable share and any cap.** 0.15 × 0.714286 ≈ 0.11 periods. No weekly teaching cap applies to you. Round down to a whole period, with a minimum of zero. Your weekly relief quota, R, is 0 periods.

Interpretation and publication checks:

1. T_avg represents total school teaching demand per eligible full-time teacher; it is not the individual's own average load. Retain the current model's numerator and denominator definitions.
2. Explain the role allowance with the actual numbers when useful: 30% × 29.13 = 8.739 periods; 150% × (22 + 8.739) = 46.1085 preparation/marking periods; W_i = 5 + 2 + (22 + 8.739) + 46.1085 = 83.8475; final R is 0 after the timetable factor and rounding. Calculate with full precision and round display only. This example checks the supplied arithmetic; it does not verify the current live personal source values.
3. The statement that teachers across Singapore report a national average of 150% through SIUE is user-supplied proposed wording, not verified evidence. Check an authoritative source before publication. Without that support, describe 150% as the system's saved SIUE preparation/marking allowance, using the actual configured percentage, rather than asserting a national measured average.
4. Keep W_i and R in periods per week under the current whole-week-v5 model. Do not introduce a second formula or change quota mechanics solely to match rounded example text.

### Appointment holders and relief queue policy

User requests the explanatory statement: "Since this weekly quota already accounts for the offload factor given to appointment holders, there is no longer preferential back-of-queue treatment for KPs for relief duty." The original message ends with "KPsf"; context is interpreted as KPs.

1. Appointment offload is already represented in the quota calculation. Do not give KPs an additional automatic back-of-queue preference solely because they are appointment holders.
2. Inspect automatic allocation, scheduled allocation and manual candidate ranking for an explicit KP-specific deferral. Remove it if present; if no such rule exists, retain that behaviour and explain it accurately. This log does not claim that v0.7.16 currently contains such a deferral.
3. Preserve configured fairness/preferences, valid individual quotas, employment caps, availability, absences and protected assignments. Removing role-only preferential treatment does not require identical quotas or assignments for all teachers.

Acceptance: Calculations opens faster against a measured baseline, returns only the signed-in teacher's current valid data, and explains the existing formula with that person's actual values. The worked example agrees with canonical calculation output before display rounding. Published SIUE claims are sourced or clearly labelled as configured policy. KP status alone does not create a separate relief queue advantage. Changes await the next explicit implementation/commit instruction.


## 020: Roster > Home > Stapler tile title and description correction

Status: Pending next authorised revision. Clarified on 19 October 2026 at 23:29 Singapore time. Log only; no implementation, build or commit authorised. This corrects the Home tile interpretation of item 017 shipped in v0.7.16.

Reference: image(20261019-152842).png, libfile_b68b79f4bb588191aa3cba33c065559d. Screenshot inspected. Yellow highlights the tile's current long title; blue highlights its current description, Prepare and confirm a dated timetable.

| Tile area | Required text |
| --- | --- |
| Title, yellow highlight | Stapler |
| Description, blue highlight | Suspended Timeable Advance PLannER |

Replace the long Home tile title with Stapler, using that title case. Move the exact expansion Suspended Timeable Advance PLannER into the description in place of Prepare and confirm a dated timetable. Retain the user's spelling and capitalisation, including Timeable and PLannER. Preserve the icon, tile position, role visibility, destination and responsive wrapping. Stable internal route/API/data identifiers remain unchanged. This clarification is scoped to the two highlighted Home tile fields; it does not request another change to planner page headings.

Acceptance: The Home tile shows Stapler as its main label and Suspended Timeable Advance PLannER as the smaller description, matching the two highlighted areas. Implement on the next authorised revision.


## 021: Roster > Suspended timetable > Saved 21 October draft cannot open

Status: Pending investigation at the next authorised revision. Reported on 19 October 2026 at 23:33 Singapore time during the v0.7.16 follow-up. User asks whether to delete and retry, and explicitly requests logging. Log only; no code change, build, commit, reset or deletion authorised. Extends unresolved item 008 and canonical validation item 014.

Reference: image(20261019-153335).png, libfile_c636732c47348191a6f85a07349daa62. Screenshot inspected.

Observed UI evidence:

1. Error: "2026-10-21: Roster records could not load. Retry loading."
2. The suspension dates list still shows 2026-10-21, Saved plan Revision 1, Allocation readiness Draft, Access Planning available and Editing Available, with an Open planner action.
3. This establishes that the date-list projection can display a saved record while the planner load fails. It does not establish that the full plan payload is missing, corrupt or successfully readable, nor identify the failing backend stage. No diagnostic ID, response status or deployed backend version is visible in the screenshot.

Requested investigation:

1. Reproduce opening this existing saved draft without deleting or replacing it. Trace the failed planner read separately from the successful dates-list read, retaining the request status, timing, diagnostic reference and actual deployed versions.
2. Check saved-plan unpacking and proof compatibility, baseline/Calendar context reads, current operational checks, permissions/lease handling and response limits for the concrete failure. These are candidate paths to inspect, not established causes. Preserve the saved content and surface a safe actionable error instead of an unexplained generic failure.
3. Use a read-only refresh/reopen as the first retry. Do not treat deletion, reset or reimport as a proven remedy. Before any destructive recovery, preserve the stored dated plan and explain exactly which state would be removed; obtain explicit user authorisation where required.
4. Keep Save distinct from Confirm and publication. A listed Draft revision is not proof of allocation readiness or a confirmed timetable. Never silently substitute the recurring baseline or an empty draft for an unreadable saved plan.

Advice given: Do not delete the saved date yet. Revision 1 remains listed, so investigate the load failure while preserving that saved draft. One Refresh dates followed by Open planner is a safe read retry; stop repeated retries if the same error returns.

Acceptance: The same retained 2026-10-21 Revision 1 draft opens after refresh/fresh session with its complete saved final tiles and blanks. Failed reads retain the record and provide useful diagnostics. Any recovery must preserve data and be verified through actual deployed readback; local tests alone do not close the live issue.


## 022: Roster > Baseline Timetable > Baseline switch/save outcome unconfirmed

Status: Logged during v0.7.17 final verification on 19 October 2026 at 23:54 Singapore time. Read-only investigation completed; no additional functional baseline-switch change or production action is claimed. This new report remains open after the current release.

Reference: image(20261019-155348).png, libfile_8644e36bfa68819192a5b21b57ede1d2. Screenshot inspected. The current banner is 2026 T4 Post-PSLE wef 19 Oct. The saved timetable form also shows 2026 T4 (P6 Collapsed) from 20 Oct, with displayed validity 20 October to 20 November and 100 teachers. Displayed form values alone do not prove those dates are durable.

Observed error: "The timetable save could not be confirmed. Retry the same save." Reference: e45fe844-6bf0-49d5-96b9-7bcd94ac34a3. The pending-save panel exposes Retry the same save and other update actions are disabled. The screenshot does not establish which command was attempted, whether the register write committed, or which upstream stage failed.

The traced baseline route is rosterUpdate through current Contacts authority, script lock, register read, receipt check, register write and response. It does not read the operations document, quota, Calendar or compressed Stapler plans. The v0.7.17 Stapler gzip correction therefore does not establish a fix for this baseline-save incident. Disabled controls intentionally protect the uncertain request until its receipt is resolved.

Keep both baselines and retry the original request with its original ID. Receipt lookup occurs before revision rejection and confirms an already committed change without duplicating it. If the same error returns, inspect the matching reference and timestamp with the existing read-only showRosterDiagnostics() function. Investigate Contacts response, lock wait, Drive register read/write and timeout or lost response from concrete diagnostics; these are candidate categories, not established causes. Do not clear the pending state, delete a baseline or force a replacement to conceal uncertainty.

If the new baseline's 20 October start is already saved, normal date selection makes it current on 20 October, subject to other saved validity/priority rules. Activate today explicitly moves its start to the current Singapore date. Verify the authoritative saved entry before asserting either outcome.

Related investigation note: the immutable baseline-model cache also reconstructs an untyped gzip Blob. Cache decode errors fall back to the authoritative model read, so this can be a potential latency investigation but is not on the baseline update path and cannot explain this save failure. No unrelated Contacts compression change is included in v0.7.17.

Acceptance: confirm the original request's result without a duplicate change; verify the saved validity and active baseline for the intended Singapore date; unblock controls only on a known result. Any saved Stapler plan whose baseline then changes must retain its content and require the existing source review before confirmation.


## 023: v0.7.17 authorised release and local verification

The user authorised committing the next version and troubleshooting Stapler on 19 October 2026. Baseline: complete v0.7.16 at 60f7a92fe8b2e4604c8136ff000ae531e9c52ff6. Items 018 through 021 are implemented for local release; live operational acceptance remains open. Item 022 was reported during final verification and is logged separately.

The saved-plan reader restores gzip Blob metadata, preserves stored bytes/proof/revision, and reports safe failing stages. A permitted existing-plan read skips the unrelated quota fetch and school-wide profile/class reconstruction. Save and Confirm retain current validation, quota, lease and revision checks. No saved date is deleted, reset, reimported or silently replaced by baseline data.

Inbox accepted mutations return the current authorised conversation snapshot, removing an immediate second request. Unused duty-state reads and name lookups are removed; fresh authority, relevant duty checks, durable queue and exact retries remain. Refresh preserves drafts, focus, scroll and live audio.

Calculations removes one duplicate Deploy index check (three reads to two), projects only the signed-in teacher, and rereads current relief history each time. The explanation uses actual offload and configured SIUE values. Canonical weekly arithmetic is unchanged. No separate KP-only preference was found to remove. The Home tile now reads Stapler with the exact description Suspended Timeable Advance PLannER.

Local validation: 391 regression scripts passed across one full run and three targeted reruns correcting obsolete Home-title expectations. This includes 30 Chromium scripts and parsing 52 Apps Script sources. All five supplied offline JSONs passed fresh-runtime signed Save/read/list/replay/Confirm checks. Two independent final correctness and quality/security reviews found no material issue in runtime target 3cfc6d5e03cb95016aaf1b128adb9bd139642f18. The full-suite package preflight passed ZIP integrity, complete-code structure, preserved assets and source parity. Final commit/tag/bundle provenance is retained with the packaged verification reports.

These results do not prove the live production cause or latency. The exact retained 21 October Revision 1 draft must open after installing the revised Deploy backend web app and Roster frontend. The existing v0.7.16 notification Worker remains compatible. No live deployment, production flag change, school-data write or staff message was performed. Subsequent requests return to log only unless implementation/build/commit is authorised.

## 024: Roster > Report Absence > Restore visible dates and individual period selection

Status: Pending next authorised revision. Requested on 20 October 2026 at 00:25 Singapore time. Log only under the standing working rule; no implementation, build, commit or deployment is authorised by this request. This supersedes the date shortcut and Full day/Partial day presentation introduced under item 013, with the performance goal clarified in item 025.

Reference: image(20261019-162517).png, libfile_0682441f4c148191baef57249ce59e7a. Screenshot inspected. The user rejects the Report Absence layout with large Today, Tomorrow and Both controls, dates inside Other dates or relief options, and Full day/Partial day controls.

Requested revision:

1. Restore the previous Report Absence style, using v0.7.15 as the interface reference: show Start date and End date directly in the main form.
2. Show Absent periods directly as individual selectable period buttons with their start and end times. Do not require opening Partial day before periods can be selected.
3. Restore Select All and Clear periods. Restore explicit period selection rather than silently starting with Full day selected.
4. Replace the Today/Tomorrow/Both shortcut layout and Full day/Partial day controls with the restored date and period controls. Keep the selected dates and periods clear before submission.
5. Retain the existing date-range semantics: the selected period set applies to each date in the range, with the existing timetable and absence-type restrictions. Preserve authenticated staff selection, optional relief instructions and own arrangements, reporting permissions, duplicate/overlap checks, durable save confirmation and exact retry handling.
6. Keep performance improvements and the direct route into absence reporting where compatible with the restored form. This is an interface revision, not a rollback of the whole v0.7.17 release.

Read-only source reference: v0.7.15, roster-update/public/roster-operations-ui.js, drawReport. That form displays native Start/End date fields, an always-visible period picker, Select All and Clear periods, with no periods initially selected. No runtime source was changed while recording this request.

Acceptance: On opening Report Absence, the user can immediately set dates and choose individual periods without first using Today/Tomorrow/Both or Partial day. Select All and Clear periods operate visibly. Existing reporting and save checks remain effective. Implement only on the next explicit implementation/build/commit instruction.

## 025: Roster > Report Absence > Clarify shortest path as loading and response time

Status: Pending next authorised revision. Clarified on 20 October 2026 at 00:28 Singapore time. Log only; no code change, build, commit or deployment authorised. This corrects the interpretation of item 013 and complements the form restoration in item 024.

User intent: "shortest path from login to reporting absence" means reducing system and UI loading/waiting time. It does not mean fewer clicks, hiding period selection, replacing date fields with shortcuts, or defaulting to a full-day report. The former focus on reducing three actions to one did not establish that the user's performance goal was met.

Required scope:

1. Restore the previous visible date and individual period controls as specified in item 024. Use that workflow as the interface for performance work.
2. Measure elapsed time from successful authentication to a usable Report Absence form with correct teacher, dates and selectable periods. A quickly painted shell or loading indicator does not count as ready.
3. Measure waiting time when opening the form and changing the selected date, including loading and rendering that date's verified period choices.
4. Measure Submit absence through durable server confirmation. Keep this separate from initial form loading so a fast open cannot conceal a slow save.
5. Trace actual frontend requests, backend service reads and rendering work before choosing optimisations. Remove redundant or unrelated work from the required path; reuse or load data concurrently only where source freshness, current authority and dependencies permit it.
6. Preserve authenticated identity, current access checks, correct date/timetable/period data, absence rules, duplicate checks, optional instructions, existing records and exact retry handling. Do not display Saved before durable confirmation or hide required data merely to make the page appear faster.
7. Compare before/after timings for first and repeat visits in the same environment, including the phone workflow. Report measured waiting-time improvements separately from click counts. No numerical latency target or production speed gain has been established by this clarification.

Acceptance: The restored date and period form becomes usable sooner, date changes respond sooner, and save confirmation latency is measured and improved where the traced bottleneck permits. Evidence must show actual elapsed waiting times while preserving reporting correctness. Further simplification of controls solely to reduce clicks is outside this request. Implementation awaits an explicit implementation/build/commit instruction.

## 026: Roster > Whole service > Speed and reliability across concurrent users

Status: Queued for the next authorised implementation/commit under the standing log-first rule. Reported on 20 October 2026 at 00:42 Singapore time: "stapler loads too slowly too. everything in roster is too slow. refactor for speed and reliability across multiple users." Read-only source scoping completed; no runtime edit, build, commit or production change. Extends items 007, 018, 019, 021 and 025. Preserve the date and individual period interface requested in item 024.

Goal: Reduce elapsed loading, response and save-confirmation time throughout Roster, including login, Report Absence, absence management, baseline timetables, Stapler dates and planner, allocation, Calculations, Inbox and administrative views. Preserve every accepted update when staff and background jobs operate concurrently. Fewer clicks or an earlier loading shell does not establish success.

Grounded profiling targets in v0.7.17:

1. Shared Contacts work. Every Roster action traverses backend/Code.gs doPost and contacts_; operations and Inbox request the Roster directory. Contacts deploySnapshot_/contactPrefetchDirectory_ read authority and directory sheets. A supplied historical v0.7.16 Stapler request measured Contacts at 13.603 seconds within 27.686 seconds total. This is evidence for that request only, not a new absence-form timing or proof that every page has the same bottleneck. Separate service startup, sheet reads, directory construction and response time; reduce redundant projection and repeated work while retaining current access checks.
2. Request sequencing. roster.js load/checkFreshness, background baseline/absence warming and Inbox badge reads repeat shared service work. The Worker loads required Calendar data before its operational backend call. A saved Stapler open can be followed by another editor-lock request. Measure the actual request sequence; deduplicate, combine or defer compatible work without serving stale dates, permissions or source data.
3. Baseline model reuse. Roster.gs rosterModel_ silently falls back to Drive and full validation after a cache decode failure; large compressed entries bypass its cache. Its cached gzip Blob reconstruction has no explicit gzip metadata. Measure hits, size bypasses and decode failures before changing this path. The metadata gap is a compatibility candidate, not a demonstrated production cause. Retain v0.7.17's reduced saved-plan read work.
4. Shared write contention. RosterOperations.gs rosterOperationsDispatch_ holds the script lock across state loading, context/model/quota work, reconciliation and commit. Baseline updates, Inbox writes, scheduled allocation, notification processing and Stapler lease maintenance also use this same lock. Measure lock wait and hold time with concurrent users and background jobs. Prepare independent immutable reference data outside the lock only with current source/revision/authority checks at acceptance.
5. State size and I/O. rosterOperationsState_/rosterOperationsCommit_ read and replace the complete operations document, including compressed plans, audit, notification state, absences and relief. Lazy decoding already avoids inflating unrelated plans, but their compressed bytes still travel. Measure bytes and Drive time per operation. Reduce avoidable work first. If separating large plan payloads or independent state is justified, preserve an atomic authoritative revision/manifest and safe migration; splitting files alone does not remove the shared lock or guarantee consistency.
6. Confirmation and lease reliability. The gateway backend request budget is 25 seconds; browser operations can wait longer. A write can commit before an expensive response projection fails or arrives too late. Preserve the original request ID, actor and digest, and consider a lightweight authorised receipt confirmation before refreshing the full screen. Lease renewals share the save lock and Contacts path; keep them bounded while retaining dated ownership/session/fence checks. A temporary failure must retain local edits and must not admit a stale editor.

Implementation and acceptance requirements:

1. Record before/after time to usable screen, date/period readiness, Stapler list/open, durable save confirmation, lock wait/hold, request count, payload size and failures. Include first and repeat visits. Proposed load matrix: 1, 10 and 30 concurrent staff sessions with the existing scheduler/notification work running. Record median and slow-tail timings; do not invent a latency target or claim a live improvement from local fixtures.
2. Verify overlapping independent absence submissions retain every accepted report; stale shared edits produce explicit conflicts; same-date Stapler ownership remains exclusive; different-date editors keep their work through transient renewal failures; scheduler and manual allocation cannot overwrite newer state.
3. Verify lost responses and retries confirm the original committed result without duplicate absences, assignments, notices or sends. Keep absence/allocation acceptance, related audit and notification intent atomic. Do not show Saved before durable acceptance, discard a pending request, or extend timeouts as the sole fix.
4. Preserve saved business rules, current authority, source identity/version checks, date validity, canonical stored-plan validation, lease fencing, historical records and the restored form controls. Separate immutable reference reuse from mutable live authority and operational decisions.
5. Carry the baseline-save incident 022 and retained Stapler readback 021 as separate live acceptance cases. The new screenshot shows a Baseline changed state, not proof of a corrupt/missing plan or a successful full payload reopen.

Review basis: Ponytail and Pstack scoping principles, plus independent read-only latency, concurrency and Stapler-state inspections. The named Thermonuclear capability was not exposed in the available skill catalogue and plugin search returned no match; no claim is made that this named skill ran. No runtime changes or tests were performed for this log entry. The bottleneck candidates above are confirmed control flows, not measured v0.7.17 production contention incidents.


## 027: Roster > Stapler > Rename and delete saved plans

Status: Queued for the next authorised implementation/commit. Requested on 20 October 2026 at 00:42 Singapore time. Confirmed on 20 October 2026 at 00:50 Singapore time: Rename must support both editing the display name and changing the plan date. No record was renamed, moved, reset, archived or deleted.

Reference: image(20261019-164242).png, libfile_61617ebc15148191b2c7162888ac89c8. Screenshot inspected. The list shows 2026-10-21, Revision 1, Needs new plan, Baseline changed, Editing Available and Open planner. It exposes no Rename or Delete action.

Current structure: One active Stapler record is keyed by date; it has no display title/name. The current date control navigates between plans. The existing Reset action archives an old baseline-bound plan and creates a replacement baseline draft; it is not a single-plan delete. Generic Prune affects broader historical records and must not be reused as an unexplained Delete button.

Requested scope:

1. Add Rename and Delete actions for a selected saved plan in the suspension-date list, with corresponding saved-state feedback.
2. Confirmed: support both an editable display name beside the date and a Change date action. A name edit preserves the date, tiles, baseline reference and confirmation state. Changing date moves the selected plan while preserving its content, checks destination validity and refuses to overwrite an existing plan. Revalidate date/baseline/period dependencies, invalidate any confirmation that cannot carry forward, and preserve linked historical records. Clearly explain any restriction on a published or past plan.
3. Delete must identify the exact dated plan, show its Draft/Confirmed/published impact and require confirmation. Check current role, revision and editor ownership before accepting it. Keep the original request identity for uncertain outcomes and retries.
4. Define linked-state handling before implementation: confirmed timetable use, allocations, queued plan notices, access requests, active editing sessions and the date-list entry. Do not silently discard already published history, baseline timetables, unrelated absences or another user's work. Explain what timetable will apply after removal and require any resulting allocation review.
5. Prefer a recoverable delete with an audit record; this is a proposed implementation choice, not confirmed hard-delete semantics. Do not relabel the existing Reset or broad historical Prune action as Delete.

Acceptance: An authorised user can rename under the clarified meaning and delete the intended saved plan through explicit confirmation. Refresh shows the durable outcome. Stale tabs cannot restore or overwrite a removed plan, retries do not repeat effects, and dependent operational records remain consistent. The 21 October saved content must be preserved during troubleshooting until a specific deletion is intentionally confirmed.


## 028: v0.7.18 implementation and commit authorised

On 20 October 2026 at 00:50 Singapore time, the user confirmed both Stapler naming and date changes and instructed "commit next ver". This authorises implementing, testing, committing and packaging v0.7.18 from v0.7.17 commit 2ba81ff1a09d8e146da1987139b5a5980ab74ab1. Scope includes queued items 024 through 027 and continued investigation of the open baseline-save and Stapler readback cases. Production deployment, operational record deletion, school-data changes and staff messages are not performed by building the release. Record completed verification and remaining live acceptance limits in the release documents.


## v0.7.18 completion record

Items 024–027 are implemented and locally verified under the authorisation in 028. The restored absence form shows Start/End dates and timed individual period buttons with no initial selection. Loading work combines profile/report bootstrap, defers unused Home reads, shares identical in-flight reads, and retains current authority and source checks. An optional report failure leaves the verified session open with Retry. Durable absence receipt confirmation retains the original actor, request ID and payload.

Fresh Contacts directory preparation reduces instrumented metadata calls from 16 to 4 while retaining one live Sheets batch. The immutable baseline cache supplies proper gzip metadata. Notification Contacts waits move outside the shared write lock, followed by locked current-state checks; idle scheduler ticks avoid that lock. Lease renewal reduces property reads while retaining session/fence checks. Existing user context/allocation and the atomic document replacement still serialize.

Stapler now supports a saved display name, guarded Change date, recoverable Delete and Restore to the original vacant date. Moving preserves final content and archives its source; moved/restored plans are Draft and require Confirm. Occupied destinations, incompatible period/recess bindings, past dates and published history are protected. Retired plans cannot leave actionable peer/planning requests or eligible stale notices. Ordinary sponsorship retains its established pending Retry behaviour.

Validation: 399 regression scripts passed, including 31 Chromium scripts; 55 Apps Script files parsed. The initial eight failures and passing targeted reruns are retained. All five supplied JSON exemplars passed signed Save/readback/replay/Confirm. Full-size lifecycle persistence and a mobile dialog smoke passed. Two independent reviews examined runtime commit 777b81631ae6a6a0d229fbdad692daa935e729fc. Package integrity and final Git provenance are recorded with the release artifacts.

Live acceptance remains open for baseline-save incident 022 and existing Stapler readback incident 021. The 21 October Revision 1 plan must be opened and compared after installation; its date-list entry alone does not establish recovery. Controlled timing and deterministic 1/10/30-user interleavings are not production latency or simultaneous-client load measurements. No deployment, operational record deletion, data reset, timetable publication or staff message was performed during this release.

Minimal installation: complete Contacts backend, complete Deploy backend, then Roster frontend, keeping existing URLs/settings/data. The existing notification Worker remains compatible. The full package also carries the complete suite, committed source and repository history.

## 029: Roster v0.7.018a > Import the final offline Relief overlay

Requested and implementation authorised on 20 October 2026 at 05:42 Singapore time as a rapid surgical patch to v0.7.18. Exact requested version: **0.7.018a**. Future full-package merge target: **0.7.19**.

The supplied 21 October JSON saved on 19 October at 22:08 contains planning tiles plus separate Relief decisions. The v0.7.18 blanket rejection of nonempty reliefAbsences contradicts the requested final timetable overlay. Removing that rejection alone would discard the six saved relief placements.

The patch flattens the selected day's planning tiles and Relief output using the attached offline v4.3 export precedence: absence labels in all absent periods, covering teachers' final lessons, and swaps with the dropped lesson annotated on the absent teacher's row. Plan and Relief save labels both carry the complete state. Name matching uses verified timetable names, existing Name Bridge links and explicitly selected fuzzy candidates. A represented teacher's whole day replaces baseline, including blanks; teachers entirely missing from the JSON retain baseline and default presence. Import is atomic; clashes, absent recipients and stale saved coverage signatures are rejected without changing the draft.

Final cells retain their current teacher ownership. Import does not replay online absence reports, relief credit or notifications. Absence/dropped markers block availability but are excluded from teaching workload and new relief demand, including when an online absence record also exists. Unresolved offline decisions remain final summary annotations rather than automatically becoming online allocation tasks. Existing online operational records are retained. The minimal shared backend change is required to keep capped teachers' confirmation and allocation calculations valid; install both the Roster frontend and Deploy backend.

Acceptance evidence and exact checks are recorded in VALIDATION_v0.7.018a.md. Preserve the supplied original JSON and offline source files. No live deployment or school-data mutation is part of this patch build.

## 030: Roster v0.7.018a > Assign Relief readability

Requested during the active patch on 20 October 2026 at 05:44 Singapore time. Implemented in the same Roster frontend using the attached offline Stapler v4.3 Relief module as the visual reference. Larger period, lesson, teacher-name, workload and Assign text; white timetable cells; pale green candidate headings; yellow selection; red affected periods; teal resolved markers; orange relief tags; and readable hints against the dark assignment panel. Retain allocation behavior, period controls, search and keyboard access. Desktop and phone-sized real-browser checks cover rendering and assignment.

## 031: Planned v0.7.19 merge

Carry the complete v0.7.018a patch and its regression checks into v0.7.19. Start from the patch's tagged source, merge the shared Stapler, allocation and operations changes, synchronise generated browser/backend modules, and include the Assign Relief CSS. Do not rebuild the next full package from unpatched v0.7.18. This entry schedules the integration in the changelog; it does not authorise an immediate v0.7.19 build or deployment.

## 032: Roster > Save Stapler > Invalid signature

Status: Reported on 20 October 2026 at 07:42 Singapore time; queued for investigation. No new implementation or commit authorised.

User reported "roster:save stapler". The supplied screenshot image(20261019-234150).png shows "Roster could not load", "Invalid signature" and a Retry button. Screenshot inspected from its supplied local copy. This establishes the displayed authentication/signature error, not which service rejected the request or whether an earlier Save committed before the failed load.

Check which frontend and backend versions are actually deployed, whether both v0.7.018a items were installed, and the request-signing configuration between the deployed Roster service and its backend. Preserve existing timetable data and any unsaved draft while diagnosing. Do not delete or reset the plan, rotate secrets, replay a mutation or disable signature checks as a speculative fix. Obtain the failing request phase and diagnostic evidence without exposing secret values. Verify the durable saved revision separately from successful screen loading.

Acceptance: the authenticated Save and subsequent read succeed; refresh retains the intended plan; exact retries do not duplicate changes; signature validation remains enforced. Production cause and save outcome are not yet established.


### Item 032 clarification: imported-plan Save/Confirm only

On 20 October 2026 at 07:56 Singapore time, the user clarified that "Roster could not load / Invalid signature / Retry" occurs only when trying to Save or Confirm an imported JSON in Stapler. Treat this as a scoped imported-plan operation failure, not a demonstrated general sign-in or date-list failure. Deployment versions are still unconfirmed.

This makes a universal signing-secret mismatch less likely if other authenticated Roster requests succeed. Prioritise comparison of a successful ordinary request with the failing imported-plan request: exact signed payload bytes, JSON serialisation/escaping, Unicode encoding, request size and any size-dependent transport or request-building branches. These are hypotheses, not established causes. Identify whether Save itself, Confirm, or the follow-up read emits the signature error; a Confirm operation may not carry the full imported plan. Preserve signature enforcement and do not change secrets speculatively.

Reproduce through the deployed frontend/Worker/backend signing path with the supplied JSON, not only a test harness that signs its own request. Capture safe action/phase, payload length and matching digest diagnostics, excluding secret values and raw staff data. Verify the durable saved revision before retrying mutations. No implementation, build or commit is authorised by this clarification.

### Item 032 clarification: immediate Save failure

On 20 October 2026 at 07:58 Singapore time, the user answered that the error is immediate and no success message was seen. Record this as an imported-plan Save failure before visible success, rather than a confirmed successful Save followed by a Confirm-only failure. Prioritise tracing the Save request and its response. The observation alone does not prove whether a durable write occurred; inspect the saved revision before mutation replay. No code change or commit authorised.

## 033: Roster > Stapler > Faster date list

Status: Queued for the next authorised revision, targeted for v0.7.19. Requested on 20 October 2026 at 07:54 Singapore time. Log only; no code changes, build or commit authorised.

User reports the Stapler list of dates still needs to load faster. This repeats the performance concern in items 007, 018 and 026 and narrows the immediate target to opening and refreshing the saved-date list. The v0.7.18 local performance checks did not establish satisfactory live loading speed.

Measure time to a usable date list on first open, repeat visits and Refresh dates. Trace service reads, response size and rendering. Aim to return only the list metadata needed for dates, names, revisions and statuses; defer full timetable loading and validation to opening the selected plan where safe. Reduce redundant requests while preserving current permissions, correct saved state and concurrent-user updates. Do not equate an earlier loading indicator with a faster usable list or hide failures with a stale successful-looking list.

Acceptance: measured first-open and refresh latency improves, date/status information remains correct after Save, Rename, Change date, Delete and Restore, and concurrent changes remain visible. Keep this performance item separate from the unresolved Invalid signature incident in item 032. No numerical latency promise or production root cause has been established.


## 034: Roster/Stapler v0.7.018b surgical patch

Status: Implemented for the user's explicit “commit patch for roster/stapler-related” instruction on 20 October 2026. This supersedes the earlier log-only status of item 032 within this scope. Package only the Roster frontend and shared Deploy backend; carry forward v0.7.018a and merge both patches into v0.7.19. No live deployment is authorised or performed.

Confirmed source defect: the Worker forwarded a backend HTTP/envelope 401 to the browser, which interpreted it as an expired user session, cleared the editor and discarded the pending imported plan. Classify that upstream failure as a retryable service error with a safe reference, version and stage. Retain the current browser session, local plan and immutable pending Save command; genuine browser authentication failure still clears authenticated data.

For full Stapler Save and its receipt command only, sign ASCII-escaped JSON and explicitly use UTF-8 in the backend HMAC and HTTP transport. Decoding preserves all imported text. Preserve logical plan/request limits, the outer envelope bound and signature enforcement. Other requests retain their signed representation; review caught and prevented a wire-size regression for unrelated Unicode instructions. Include preverification rosterOperations diagnostic hints without trusting them for authority or dispatch.

Local checks passed with the supplied JSON and actual browser shell/Worker: import, upstream signature rejection without losing the draft, exact retry, a lost successful Save response, receipt replay with no duplicate write, Confirm, reopen, Start editing, Unicode edit, Save, Confirm and reopen. All 722 final cells match the offline oracle, with absent/covered labels and online-only baseline teachers preserved. See VALIDATION_v0.7.018b.md for the focused tests and their limits. No staff notifications, production records or secrets were changed.

Production cause of the original signature mismatch remains unconfirmed. The encoding boundary is hardened; this is not evidence that Google decoded the live request incorrectly. Install both items in the existing deployments, retaining /exec, then verify the actual suspended date. If the error remains, keep the plan and source JSON, share the reference and collect showRosterDiagnostics immediately; do not delete/reset data or rotate secrets speculatively.

Item 033 remains queued: the date-list path already reads metadata without plan decompression, quota calculation or baseline-cell loading. Live Contacts/Drive latency still needs measurement before a meaningful speed change.

Merge instruction for v0.7.19: start from tagged v0.7.018b, include the v0.7.018a final overlay/readability changes, the scoped signing/error-boundary changes, backend diagnostic owner and generated copy, and regression checks. Do not overwrite this patch with unpatched full-suite sources.

## 035: Stapler > Preserve imported suspended lessons despite workload rule exceptions

Status: Implemented in v0.7.018c under the subsequent explicit “commit patch” instruction on 20 October 2026, with v0.7.19 integration. The original flexibility request was logged without implementation under the standing change-request rule. The later instruction authorises this focused implementation, verification, commit and package; no live deployment is performed.

Evidence: image(20261020-002436).png shows a saved draft for 21 October 2026 and “Weekly employment cap cannot be verified ... Resolve the workload data before publishing.” This is a workload-validation rejection, separate from the signature failure addressed in v0.7.018b. The displayed read-only/edit-lock state is a separate condition.

Read-only source trace: shared/roster-operations.js validateStaplerCaps checks every teacher changed from baseline, including imported final placements. A configured cap with missing/unverified workload is a blocking 409; an increased workload above the cap is also rejected. The check runs at Confirm and on Save of an already-confirmed plan. An initial Draft Save does not run this cap check. Therefore changing only the initial import or Draft Save will not satisfy the request.

Required behaviour:

1. Treat the imported final offline timetable as the intended suspended-day plan. Preserve its lessons, teachers, periods and final annotations. Missing/unverified weekly cap data or an exceeded workload cap must produce a visible warning instead of blocking import, Save or Confirm. Extend this principle to comparable planning/business-rule exceptions that do not prevent representing the intended lesson.
2. Keep these imported exceptions valid after refresh, reopening and editing. Save/Confirm must not reapply the same blocking rule on unchanged imported placements, discard lessons, move them automatically or force the user to rebuild the offline plan. Record the exception against the relevant dated plan/teacher so it remains visible and reviewable.
3. Apply the confirmed imported schedule consistently to teacher summaries, Excel and availability used by online relief allocation. Teachers entirely missing from the JSON retain their baseline and default presence. Do not replay offline operational attendance, relief credit or notifications.
4. Preserve configured rules for newly generated online relief allocations, including the daily maximum of 9 and consecutive maximum of 6. The import exception must not become a global disabling of allocation limits. Count the imported schedule as actual occupancy/workload when deciding whether further relief can be added.
5. Keep teacher matching through timetable names and Name Bridge, and retain data-integrity checks needed to identify each lesson and its slot. Preserve unresolved content for review; do not guess a teacher, silently drop a lesson or report a complete import when placements are missing. Existing access, request-signature, revision and edit-lock checks remain in force.

The screenshot's “690 in Pit” does not establish that 690 imported lessons failed. Current importLegacy deliberately parks the represented teachers' original baseline cards in Pit and creates new grid cards for the final imported lessons. Verify the effective grid and exported teacher rows against the JSON, rather than treating Pit count as the number of missing lessons.

Acceptance: a suspended import with an unverified cap and one over the configured workload cap both Save, Confirm, reload and allow subsequent edits while retaining visible exceptions. Compare every final teacher/period cell and Excel row with the offline output, including blanks and teachers missing from JSON. New online allocation still respects its configured rules and cannot allocate into occupied imported periods. No production cause or success is inferred from the screenshot alone.


## 036: Roster/Stapler v0.7.018c surgical patch

The explicit “commit patch” instruction authorises item 035. Baseline is tagged v0.7.018b, commit 977713961ad7f2885ca008b4fa77724dfeb18c82. Only the Roster frontend and its shared Deploy backend require deployment. Both items retain the v0.7.018a final overlay/readability and v0.7.018b signing/recovery changes.

Imported final lessons now Save and Confirm with visible warnings when the weekly workload cap is unverified or exceeded. The server identifies eligible original-owner imported cards using validated immutable source data. Warnings are stored alongside the compressed dated plan and exposed through its authorised view. They survive refresh/reopening, update on Save/Confirm, and clear when workload data is repaired. Subject, class, venue and period edits to those imported cards retain the exception. No client bypass flag is accepted.

Teachers missing from JSON retain baseline and presence. New manual or transferred-in work retains cap checks; unrelated baseline edits retain the existing non-increasing workload rule. The imported effective timetable continues to supply summaries, Excel and relief availability. New online allocations still obey configured weekly, daily and consecutive limits and cannot use occupied imported periods. The patch does not replay offline absences, assignment credit or staff messages. Structural validity, name matching, signatures, authority, revisions, date leases and published history remain enforced.

Evidence: the old validator reproduced the Confirm rejection. New focused tests cover unknown/exceeded caps, Save/Confirm/fresh-runtime reload/edit, warning persistence and repair, original-owner edits, manual/Pit/transfer cases, unrelated baseline edits, forged provenance, reset and allocation limits. The supplied JSON retains all 722 final cells, 17 absent periods and 6 coverage placements against the independent offline export oracle. A real Chromium run verifies import, backend rejection without draft loss, exact retry after a lost successful response, no duplicate write, Confirm, reopen and edit/reconfirm. UI warning tests verify visibility and safe name rendering. See VALIDATION_v0.7.018c.md for exact scope and local limits.

Ponytail and Pstack guided the focused change. The saved Thermonuclear package was recovered and its two independent correctness/code-quality review workflows were run. Review corrected unnecessary work on ordinary draft saves and an unrelated baseline-edit regression before commit. No remaining material source finding was reported. Generated-file synchronization and package integrity are checked against the final committed source.

Install the Deploy backend first by updating its existing web app deployment at the same /exec, then install the Roster frontend. Reopen the actual suspended date, Save and Confirm, review the workload notes and verify the rows after refresh. No production success, deployment or latency improvement is claimed. Item 033 remains queued for measured date-list improvements; no broad speed refactor is included here.

Merge instruction for v0.7.19: start from tagged v0.7.018c and retain all three surgical patches, owner/generated model changes, warning UI, tests and release history. This log records the future integration and does not start an immediate full-package build.


## 037: Roster v0.7.018d > Review absence before the final submission

Status: Implemented under the user's explicit “patch and commit” instruction on 20 October 2026. Baseline is v0.7.018c commit 91f3d03e078352356975ca777bcde96079d755fe. Only the Roster frontend requires a new deployment; keep the existing v0.7.018c shared Deploy backend. Merge this patch into v0.7.19 with all earlier surgical patches.

Reference: image(20261020-010556).png, libfile_dcf991b132988191905b5a799a16b8df. Screenshot inspected. The highlighted top Submit absence action wrote the report before instructions. The lower saved instructions appeared inside a disclosure panel. The user requires a review action first and the write action only below relief instructions.

The first button is now “I'm not available in these selected periods”. It validates the selection and reveals the lesson periods and instruction fields without making a write. Relief instructions stay visible with no expand/hide wrapper. The No relief instructions button sits below the lesson rows and changes only local state; it preserves any entered text and can be reversed. Submit absence is the final action at the bottom and sends the selected dates, periods and instructions through the existing save command. Saved instruction settings also wait for their bottom Save.

Trace found another early-write route through preview Own arrangements. That option is now available after final submission, once a saved absence exists, with a clear draft-stage explanation. No new staged request system or backend change is introduced. Native start/end dates and individual period selection remain. The current absence rules, teacher eligibility, revisions, immutable pending commands and receipt replay protection remain enforced.

Local Chromium checks cover zero writes before final submission, separate notes for each date, rejection without draft loss, exact recovery after a lost response, no duplicate records, saved-only colleague arrangements and explicit saving of later instruction settings. A focused layout check covers 320/390/768/1280 pixel widths, including final submission and retry on a phone. Narrow teacher-picker overflow and floating feedback that could cover Submit were corrected. Report feedback now sits below the form and instructions, outside the frozen form, with pending retry brought into view.

The affected existing report, policy, eligibility, workspace and performance checks passed. The older Python browser script was migrated and syntax checked but not executed because its Playwright dependency is unavailable. The equivalent affected paths were verified in Node Chromium. See VALIDATION_v0.7.018d.md for the precise checks and limits.

Ponytail, Pstack and two independent Thermonuclear review passes were used. The focused design review used Awesome Design, Frontend Design Premium, Taste, UI UX Designer and Apple Design. No material review finding remains. Root completed the final feedback/retry visibility check. No live absence record, notification, deployment or school data was changed during this patch.

Install Roster_Frontend_v0.7.018d.zip only when the v0.7.018c backend is already in place. The source package includes this commit's changed files, patch and incremental history. Keep v0.7.19 integration based on tagged v0.7.018d, preserving the Stapler overlay, signing/recovery and workload-warning patches. The full release is still planned, not built by this instruction.


## 038: Roster v0.7.018e > Compact absence dates and move no-instructions choice

Status: Implemented under the user's explicit “patch commit” instruction on 20 October 2026. Frontend only, based on tagged v0.7.018d commit c32a7bb38478d6dac6974360678c3b9d0af42b40. Carry into v0.7.19.

References: image(20261020-012555).png (libfile_64d8af446e348191bb954981c1093cd8) and image(20261020-012617).png (libfile_e1fe9b4ebf548191ad99ca311991a77b). Both screenshots inspected. Their arrows request End date immediately beside Start date and No relief instructions beside the instruction section's Absence date selector.

The quick form's equal-width grid columns are replaced with content-sized columns. The same No relief instructions button is moved into the section heading before the lesson table. Its local toggle, text preservation, readonly/pressed state and handler are unchanged. The first review action still performs no write. Instructions remain visible and final submission stays below them. No backend change or additional deployment component is needed.

The focused Chromium suite passed new position checks and 320/390/768/1280 pixel fit checks, plus the existing no-early-write, dated note, final-save, validation recovery and exact receipt retry checks. Desktop and phone screenshots were inspected. Ponytail, Pstack and independent Thermonuclear correctness/code-quality reviews were used; the change follows the established five-skill design guidance. No material runtime finding remains.

Install Roster_Frontend_v0.7.018e.zip only and keep the v0.7.018c Deploy backend. The package includes all earlier frontend patches. No live deployment, report or staff message was performed. Integrate tagged v0.7.018e into the planned v0.7.19 full package.

## 039: Roster > Report absence > Faster selected-day timetable verification

Status: Queued for the next authorised revision, targeted for v0.7.19. Requested on 20 October 2026 at 10:34 Singapore time. Log only; no implementation, version bump, build or commit authorised.

Reference: image(20261020-014426).png, libfile_730cb5ac8194819180ce27424783a9ef. Screenshot inspected. The selected date is 21 October 2026. The highlighted message reads “Checking the selected day. You can select absent periods while the timetable is verified.” The “I'm not available in these selected periods” review button is disabled. The user asks to speed up this process, especially on suspended-timetable days. This is a wait for day verification within Report absence, distinct from the Stapler date-list delay in item 033. The screenshot does not establish elapsed time or a production root cause.

Measure the time from choosing dates to being able to review relief instructions, including first access, repeat access, date changes and ranges containing suspended days. Trace the actual service and rendering stages before choosing the fix. Prioritise reuse of the saved canonical, validated suspended timetable for its current revision; avoid repeating full plan validation or loading unrelated teachers/dates where unnecessary. Coalesce repeated requests and prevent superseded responses from replacing the current date selection. Any cache must respect permissions and detect timetable or suspension revision changes across users.

Use the confirmed effective suspended timetable for the selected day, retaining baseline behaviour for teachers entirely missing from the imported JSON. Do not speed up the screen by silently substituting baseline lessons, trusting a stale revision or skipping required validity checks. Preserve responsive date and individual-period selection, the existing review step without a write, always-visible relief instructions and final submission only at the bottom. Show an actionable retry if verification fails.

Acceptance: measured time until review is usable improves on ordinary and suspended days; repeated access avoids redundant work; date changes and another user's timetable update cannot produce stale lesson rows or premature readiness. Preview and final submission use the same correct dated timetable. No numerical latency target or frontend-only scope is assumed before tracing the delay.

## 040: Roster > Stapler import > Resolve names from Contacts and add missing contacts

Status: Queued for the next authorised revision, targeted for v0.7.19. Requested on 20 October 2026 at 11:17 Singapore time. Log only; no implementation, build, version bump or commit authorised.

Reference: image(20261020-030729).png, libfile_0b17afa931288191b74e712f831ad599. Screenshot inspected. Resolve Offline JSON names lists Raye, Olivia and Adzlin as missing and asks the user to choose verified timetable teachers. Its guidance currently requires baseline/Name Bridge corrections or creating a contact separately before importing.

Use the Contacts viewport as the authoritative source for the full name selector in suspended-timetable import. Exclude the SLs, MK and OSO staff categories using the recorded category data, not guesses from names. Do not restrict the list to teachers already present in the recurring baseline timetable. An otherwise eligible contact without a baseline timetable entry must be selectable and able to receive their imported final lessons for the suspended date.

Retain searchable selection, stable contact identities and explicit name resolution. Use exact names and saved Name Bridge links where valid; fuzzy matches remain suggestions requiring confirmation when uncertain. Do not silently merge people with similar names, create duplicate contacts or discard unresolved lesson content. Saved Name Bridge links must not change merely because an import-specific mapping is selected.

Provide an Add new contact action in the name-resolution flow. Use the existing Contacts creation and approval process, preserve the imported draft and completed mappings, then refresh the selector and continue the import when the new contact is available. Show any pending approval clearly. The request does not grant new Contacts editing rights or authorise automatically creating a person for every unmatched name.

Acceptance: every Contacts name outside the three excluded categories is available for resolution, including contacts absent from the baseline. Excluded categories are not offered. New contact creation can be completed through the permitted workflow without restarting the import or losing mappings. The resolved contact identity and final lessons survive import, Save, Confirm and reopening and appear correctly in the dated summaries, Excel and relief availability. Teachers entirely missing from JSON retain the previously agreed baseline/presence behaviour. The recurring baseline is not rewritten to accommodate a new dated participant.

## 041: Roster > Assign Relief > Responsive edits and bounded atomic saves

Status: Queued for the next authorised revision, targeted for v0.7.19. Requested on 20 October 2026 at 11:18 Singapore time. Advisory and log only; no implementation, build or commit authorised.

Reference: image(20261020-031741).png, libfile_04ebb5488dc4819197489161ad1c402f. Screenshot inspected. The selected relief period displays Saving… and the Clear assignment and No relief required actions appear disabled. The user reports that editing relief duties hangs at saving and asks whether atomic batching can help. A still image does not prove a deadlock, elapsed save duration or the cause of the wait.

Recommended direction for implementation review: use small atomic batches for related edits to the same dated relief plan, write only affected records and return a compact acknowledgement containing the committed revision and operation identity. Check existing batch/receipt support before adding another queue. Atomicity means the related state changes succeed together or none take effect; merely bundling browser requests does not establish that guarantee. Keep the transaction boundary explicit if records span different stores. Batching reduces repeated service calls but cannot by itself eliminate slow validation, lock contention, service latency or post-save reloads.

Keep unrelated periods and navigation responsive while marking affected edits as pending. Preserve queued edit order and allow only one in-flight mutation for the same dated plan from a client, with server-side revision/concurrency checks across users. Do not announce Saved until persistence is confirmed or show pending work to other users as committed. Avoid rebuilding or reloading the entire roster after a small duty edit where a correct affected-state response suffices. Do not introduce an extra manual Save step without separately agreeing that workflow.

Preserve the distinction between Clear assignment, which leaves a lesson needing cover, and No relief required, which removes its relief demand. Keep assignment changes and dependent status consistent, including during allocator runs and concurrent edits. Retain permissions and current publication/notification rules; a retry must not duplicate a mutation or staff message.

Replace an unbounded Saving… state with clear slow-response feedback and safe recovery. A timeout is an unknown outcome, not proof of failure: check the existing operation receipt/durable revision, then retry the same command only through the established deduplication path. Retain unsaved edits and show actual conflicts for resolution rather than overwriting another user's changes.

Acceptance: measure actual save latency and time during which controls are blocked for clear/no-relief edits on ordinary and suspended days. Verify ordered rapid edits, concurrent users, slow responses, rejected writes and a lost successful response. No partial related state, lost edits, stale overwrite or duplicate side effect; final state survives refresh. Proposed batching and frontend/backend scope remain subject to source tracing, not established by this screenshot.

Reference for the batching direction: Google Apps Script Best Practices recommends minimising external service calls and batching reads/writes: https://developers.google.com/apps-script/guides/support/best-practices (checked 20 October 2026). This supports the general direction, not a diagnosis of this installation.

## 042: Roster > Assign Relief > Offline-style tools and v0.7.19 release

Status: Implementation and next-version commit explicitly authorised on 20 October 2026 at 11:25 Singapore time. Release baseline is tagged v0.7.018e, commit 30558e7. Integrate all surgical patches 0.7.018a through e and address queued items 033, 039, 040 and 041 in the complete v0.7.19 package. Local implementation/build/commit only; no live deployment or operational write is authorised.

References: image(20261020-032218).png (libfile_3ef0fe6289208191ac03902b1f2edff2), image(20261020-032336).png (libfile_a34a8bca76c48191938ceeba6fda36f4), Stapler_v4_3(5).html (libfile_44283bc335f08191b302474884b958b5) and Stapler_v4_3_Reference(5).md (libfile_f9e811f2352c819194a8eecf63522bd8). Screenshots and offline Relief source/reference inspected.

Add Export Class POV, Absent Teachers and Relief Load buttons in Assign Relief. Use the offline Module 3 workbook/table structure. Put all three new buttons on the second action row immediately left of Refresh records. Reduce the existing publish/export row's button height, increase Refresh records height, and give both rows matching heights. Keep the existing Export Excel and Export relief excel actions.

Export Class POV uses the entire effective timetable for the selected date, including ordinary and confirmed suspended days, with classes as the point of view and teacher/subject/venue/group details. Preserve co-teaching and substitute current relief arrangements accurately, with clear no-relief and uncovered states. The offline exporter only includes suspension ranges; the online adaptation uses the complete effective day so ordinary-day exports and imported class lessons are not omitted.

Absent Teachers is a read-only table with absence periods, assigned/no-relief/unresolved counts using the same demand definition as the live cards. Relief Load is a read-only table of covering teachers, relief period count, periods and absent teachers covered. Derive totals from current assignments; do not confuse this view with annual cumulative quota utilisation or import historical offline relief credit.

Use Ponytail, Pstack, Thermonuclear correctness and code quality, Vercel review and Superpowers. Apply Awesome Design, Frontend Design Premium, Taste, UI UX Designer and Apple Design to the focused toolbar/dialog additions. Preserve established interface and architecture, authentication, saved configuration and retry semantics. Acceptance includes ordinary/suspended days, co-teaching, partial absences, empty states, current draft/published view and usable desktop/phone layouts.

### v0.7.19 implementation and release record — 20 October 2026

The explicit next-version commit request in item 042 authorises this full release over v0.7.018e (`30558e7`). Carry forward the full v0.7.18 package and all v0.7.018a–e surgical fixes. Earlier Pending/Queued labels remain historical; the implementation status below supersedes them for these items.

| Item | v0.7.19 result |
| --- | --- |
| 031 | Full-package merge includes final offline overlays, signing/recovery, imported workload warnings, and staged absence submission from v0.7.018a–e. |
| 033 | Preserve narrow fresh date metadata and current Contacts authority; reduce repeated configuration property reads from 12 to 4 per execution. No live date-list latency claim. |
| 039 | Compact suspended-day absence checks hydrate the selected teacher only. Preserve canonical final tiles, baseline/date/revision guards and rapid teacher/date-change protection. |
| 040 | Resolve against eligible Contacts without a recurring-baseline membership gate; exclude SLs, MK and OSO. Explicit fuzzy resolution and inline contact creation preserve draft/mappings. |
| 041 | Ordinary draft relief clears/no-relief changes retain atomic commands and durable exact receipts, acknowledge the save, then refresh candidate budgets. Read retry does not repeat a write. Published/special cover and active warning episodes retain full processing. |
| 042 | Add Export Class POV, Absent Teachers and Relief Load immediately left of Refresh records. Match both toolbar rows at 40px desktop and 44px mobile/touch. Preserve existing exports and publication controls. |

Class POV exports the full effective selected day, including ordinary/suspended lessons and current online coverage. Absent Teachers respects partial-day absence; Relief Load counts current online covering assignments. These views do not create attendance, relief credit, publication or messages.

Validation: 414 regression scripts and one package integrity script passed. Two independent Thermonuclear reviews and the Vercel scope review passed; the capacity-warning recurrence finding was fixed and tested. Initial results and four targeted test-environment/contract reruns are retained. Ponytail, Pstack and Superpowers were applied to scope, canonical ownership and verification.

Release reference: `refs/tags/v0.7.19`. Minimum installation from v0.7.018e: `Deploy_Backend_v0.7.19.gs`, then `Roster_Frontend_v0.7.19.zip`, keeping existing URLs and stores. Contacts v0.7.18 remains compatible. The full package includes source, verification and Git history.

Items 021 and 022 remain installed readback checks. Preserve the existing 21 October Revision 1 draft and uncertain baseline request. Production latency, simultaneous school-user throughput, the original live signature failure cause and WhatsApp delivery were not established by local tests. No production deployment, data reset, publication or staff message was performed.


## 043: Roster > Stapler > Date-list performance review for next version

Status: Reviewed and queued on 20 October 2026 against v0.7.19 (`2a0fffc`). User requested five code-review approaches and recommendations, including possible Contacts/Calendar changes. No implementation, build, commit or deployment authorised by this request. Tentative next full version: v0.7.20.

Applied Ponytail, Pstack, Thermonuclear independent correctness and quality reviews, Vercel and Superpowers. Detailed recommendations are in `GSiS_v0.7.20_Stapler_Date_Load_Review.md`.

Confirmed route: explicit `staplerDates` skips Calendar, model/quota reconstruction, plan decompression and reconciliation. It still requests the full fresh Contacts directory, reads/parses the complete operations document, reads the baseline register, projects date metadata and attaches one fresh lease snapshot. Reopening Stapler discards the completed list. These source findings do not establish which stage dominates current live latency.

Prioritise existing phase-timing capture; a trusted, explicit dates-only Contacts response and matching early backend context; reuse of the last same-user/session date list while refreshing; and removal of duplicate normalization/repeated per-date history scans. The Contacts projection needs fresh caller authority and eligible sponsor identities without unrelated personal/notification fields. Retain canonical identity validation and the fresh three-table read initially. Do not simply disable `rosterDirectory`, because the current authority contract requires it.

If measured Drive latency warrants it, evaluate batching the independent operations/register reads for known file IDs with discovery fallback and separate schema/error checks. A batch does not provide a cross-document snapshot. If total operations size remains dominant, separately design a revision-bound metadata/immutable-plan layout with a single committed generation and recovery. Do not introduce an independently written authoritative dates index.

Preserve fresh permission revocation, Contacts pending-save/coherent-read checks, baseline/revision checks and lease fencing. Cached lists are provisional display only; clear on identity/permission changes, invalidate after relevant writes, and disable stale mutation controls until verification. Distinguish initial loading, refresh failure and an actually empty list.

Calendar output is already compact/batched and is not requested by Load dates. Investigate it only for a separately measured selected-date opening delay. Contacts batching/one derivation, one lease snapshot and in-flight browser read coalescing already exist; do not count them again as new changes.

Validation evidence: source review and a synthetic Contacts fixture with artifact writes suppressed; current batch/derivation counts and revocation/recovery cases passed. No current production timings, simultaneous-user benchmark or live service changes. Acceptance: record initial/repeat/refresh median and tail timings under representative users; cover revoked access, ordinary/suspended dates, concurrent edits, changed baseline, leases, failures and retained-list invalidation.

## 044: Roster > Stapler > Resolve Offline JSON names individually

Status: Queued on 20 October 2026 for the next version; no implementation or commit requested. Reference: `image(20261020-043052).png` (`libfile_85dc169b31548191900fb464f148b286`), inspected.

Make the import/use-existing versus add-new choice specific to each unresolved name. Each row has its own existing-contact picker and Add new contact action. Prefill contact creation with that row's offline name; when creation succeeds, bind the exact returned canonical person ID to that row automatically. Preserve all other mappings and return focus to the originating row after creation or cancellation.

Bind pending creation/retry to an immutable origin: verified owner/session, import token, draft identity/date and source-row key, so another row cannot receive a prior creation result. Preserve that origin across resolver reopening and reload, which currently can resume without an import callback. Auto-map only while the originating import/draft remains current; otherwise reconcile creation without mapping or adding it to the current timetable. Preserve the original request ID/input on retry, existing permissions, eligibility exclusions (SLs, MK and OSO), duplicate checks and draft identity guards. Do not silently persist Name Bridge links.

Keep one final whole-file Import action after required names are resolved, followed by the established Save/Confirm flow. Resolving a row does not partially import or auto-save/confirm/publish the timetable. Adding a contact remains an explicit Contacts creation operation.

Source scope: `roster-stapler-ui.js` resolver `showNames()` currently has one global Add new contact button; `newTeacher()` needs an optional source-name prefill and a completion callback carrying `result.person`. Acceptance: mixed existing/new contacts across several rows, correct automatic selection, cancellation, duplicate rejection, delayed/lost responses, pending retry from another row, changed draft and no lost selections.


## 045: Roster > Timetable > Detect suspended dates and correct Calendar warning

Status: Investigated and queued on 20 October 2026 at 13:44 Singapore time against v0.7.19 (`2a0fffc`). User asks why Calendar is unavailable and wants teachers to see edited suspended-day arrangements automatically. No implementation, build, commit or deployment requested. Reference: `image(20261020-054414).png` (`libfile_4531ad7e32f48191a7a4872838704532`), inspected from the supplied attachment.

Confirmed cause: this screenshot is the main Timetable page, not Stapler's dates list. `roster.js:175–176` calls `localTimetable()`, which serves the immutable cached baseline or calls `/api/read` with `calendar:false` (`142–164`). Worker `137–141` therefore skips Calendar. `calendarNotice():337–341` treats the missing/not-requested result as “Calendar unavailable” and adds “Both week patterns are shown; no parity is assumed.” This message is not evidence of a live Calendar outage.

Separate confirmed integration gap: `/api/read` reaches `backend/Roster.gs:259–264`, which reads only the baseline register/model. It never checks operational Stapler records. Main teacher/class/TG timetable rendering, PDF and Excel use that same baseline model. Restoring Calendar alone will not display the suspended timetable on this page.

Requested next-version behavior: check the selected date for an eligible saved suspended timetable and show its date-specific edited arrangements automatically. Keep the reusable weekly baseline separate from this dated result. Add a small read-only effective-day response carrying date, source/status, baseline identity, source revision, period timings and authorized schedule cells. Reuse canonical server-side composition, not a second browser interpretation of the Offline JSON. Avoid making this display request rebuild quotas or the full relief-allocation context.

Preserve added teachers and exact imported final tiles, including intentional blank periods. Teachers genuinely absent from the imported JSON retain the corresponding baseline day. Apply changes only to the selected date, not every occurrence of that weekday or both week patterns. Screen, PDF and Excel must agree about the selected day's arrangements; clearly identify baseline weekly exports separately.

Publication decision: the existing contract keeps Confirm for allocation and Publish for teacher visibility. `readyStaplerPlan()` can use the confirmed/latest draft, but `dailyTimetable()` uses a daily publication snapshot or `record.published`. `tests/roster711-backend.cjs:140–152` explicitly checks that Confirm does not expose changes, Publish does, and later saved changes remain hidden until republished. Preserve this boundary by default. Ask whether the user intentionally wants ordinary teachers to see changes on Confirm instead; that would be a publication-policy change, not merely an automatic date lookup. Do not expose unconfirmed drafts.

Calendar-independent display needs a complete public dated source. Existing daily publication snapshots store changed teachers only; unchanged teachers can currently fall through to blank cells if Calendar parity/baseline context is missing. An in-memory source probe confirmed this gap and that a full `record.published` plan retains the unchanged teacher's original lesson. Use a revision-consistent full published plan/baseline alongside publication deltas, or another complete immutable public dated snapshot. Do not merely wire the existing `dailyTimetable()` response unchanged, guess parity, use the newest draft, or substitute a changed current baseline for the publication's original source. Validate date, baseline/period compatibility and source revision. Distinguish “no suspended plan” from “could not check.”

Keep explicit status states: baseline displayed while checking the date; suspended timetable found with publication/source revision; Calendar not requested; Calendar being checked; verified Calendar; actual Calendar failure. A genuine Calendar failure should not hide a complete validated public suspended-day snapshot. Display fallback must not mark the date verified or bypass Calendar, authority, revision, lease or other checks for allocation and writes.

Keep effective-day caching separate from baseline-ID-only model caching; include date, source baseline, revision and verified user/visibility scope. Invalidate after relevant publication/plan/baseline changes and reject late responses for another date/session. Existing ordinary `dailyTimetable()` access is own-teacher-only, whereas the baseline viewer lists all teachers: define the new schedule-only browsing contract explicitly rather than bypassing the former endpoint's staff-ID checks. Exclude private drafts, absence reasons, Contacts details and quota data.

For actual Calendar-enabled reads, retain safe failure classification/trace and measure elapsed Calendar time. Worker `138–142` currently discards the Calendar diagnostic object and leaves `calendarMs` at zero. This is separate from the screenshot's not-requested state.

Review: Ponytail, Pstack, Thermonuclear independent correctness/quality, Vercel and Superpowers. Evidence includes source trace, an in-memory lifecycle/fallback probe and a passing `tests/roster706-gateway.mjs`. No live Calendar check, production record read or timing benchmark was performed. The screenshot does not establish whether this date's plan is currently draft, confirmed or published. No production change or message was sent.

Acceptance: healthy Calendar and a real Calendar failure; cold/warm baseline caches; ordinary/suspended/no-plan dates; unconfirmed/confirmed/published plans; saved edits after publication; unchanged and added teachers; preserved blank periods; date changes and late responses; baseline/source mismatch; permission changes; screen/export consistency and no private-draft exposure.


### Item 045 clarification: immediate baseline with an inline background check

Queued on 20 October 2026 at 13:54 Singapore time. User requests perceived speed: show the last baseline immediately and a spinning circle inside the page while checking the database for a suspended timetable in force. No whole-page blur, blocking overlay or implementation/commit requested.

Display the cached baseline valid for the selected date and current verified user as soon as it is available. Use a small inline spinner with “Checking for a suspended timetable…” beside the timetable status. Keep the page readable and usable while the dated check runs. Clearly identify the visible content as the baseline while checking so it is not mistaken for the final day's arrangements.

When the authoritative check finds an eligible suspended timetable for the selected date, replace the displayed day automatically and update the source/status label. Preserve the selected teacher, date, field choices, scroll position and focus where possible. If no suspended timetable is in force, retain the baseline and remove the spinner. If the check fails, retain the visible baseline with “Could not check for timetable changes” and an inline Retry; do not report that no suspension exists. A failed check is not a successful no-change response.

Use only a baseline valid for the selected date, not an unrelated last-viewed date's timetable. If no suitable cached baseline exists, show a local loading state within the timetable area. Date or account changes must cancel or disregard obsolete responses. Keep mutable dated results separate from the immutable baseline cache and preserve existing visibility/publication rules; this clarification does not authorise exposing private drafts or change the unresolved Confirm-versus-Publish choice.

Use an accessible status announcement without moving focus; respect reduced-motion preferences. Keep export source/status consistent with the displayed data so an unverified baseline is not silently presented as the checked final daily timetable. This improves perceived responsiveness; item 043's actual service-latency work remains queued.


## 046: Roster > Assign Relief > Immediate editing with background atomic batches

Status: Queued on 20 October 2026 at 14:29 Singapore time. User requests this for every relief assignment: no immediate blocking save/whole-page blur after each change; make editing instant and use batched, atomic saving. No implementation, build or commit requested. Extend item 041 beyond the clear/no-relief acknowledgement changes already shipped in v0.7.19.

Update the displayed assignment immediately when the user assigns, reassigns, clears or selects No relief. Keep the page readable and usable, including continued editing of other assignments. Remove the whole-page blur/blocking overlay from these routine edits. Show a small inline spinner/status for pending work, clearly distinguishing “Saving…” from a server-confirmed “Saved”. Instant feedback must not imply the database has already committed the change.

Collect compatible edits into a short background batch after a brief pause, with a bounded maximum wait so continuous editing cannot postpone saving indefinitely. Preserve command order and existing assignment rules. Coalesce edits to the same target only where doing so has the same final meaning and does not discard required effects. Keep separate dates/source versions isolated unless an explicitly supported transaction covers them.

The backend must validate the complete proposed batch against fresh authority and current state, then apply the related assignments, revision, audit, receipts and any required notification intent in one commit. All changes in a batch succeed together or none do. This is one logical transaction, not parallel independent per-assignment writes. Retain capacity, availability, publication, baseline and other applicable business checks; do not trade correctness for perceived speed.

Use one immutable in-flight batch per affected state scope with a unique request ID and expected revision. New edits made while it saves remain in the next pending batch. A successful receipt clears only the acknowledged edits, never newer local changes. Retry an uncertain result using the same request ID and payload, preserving existing exact-receipt behavior and avoiding duplicated effects. After acknowledgement, advance the revision and validate/rebase remaining pending commands without silently overwriting another user's work.

On a conflict or rejected batch, retain the user's pending choices and show the affected assignments with a retry/resolve path. On a timeout or lost response, show the result as unconfirmed until reconciled. Do not silently revert to stale data, report a failed save as successful or leave the entire page indefinitely blocked. Refresh expensive summaries/candidate data in the background after the commit, with response-generation guards so older reads cannot overwrite newer local edits.

Publishing and exports that claim to represent saved/final arrangements must wait for or explicitly resolve pending edits. Leaving the page must not silently discard unconfirmed work. Preserve existing publication/notification policy; this request changes editing responsiveness and transaction handling, not when teachers are notified or drafts become public.

Follow-up at 14:30 Singapore time: user asks whether to reserve all operations until Publish, or for a recommendation. Recommendation is instant local editing plus background atomic draft batches, with Publish retained as the explicit release step. Do not defer all persistence until Publish: that risks loss on refresh and harder multi-user conflicts. Defer expensive whole-view recomputation and refreshes where safe, but retain the validations and revision checks needed for valid draft commits. Publishing must first confirm outstanding saves, revalidate the current draft and then release the intended version through the existing publication transaction. Draft saving must not itself publish or send publication notices. This is advice for the queued design, not a user-approved change to the separate Confirm-versus-Publish visibility policy in item 045.

Acceptance: rapid assignments and reassignments; repeated edits to one assignment; clears and No relief; edits made during an in-flight save; multiple users; rejected batches; lost successful responses and exact retries; date changes; publishing/export with pending work; refresh after acknowledgement. Verify immediate visible feedback, no whole-page blur, no partial batch commit, no lost newer edit, no duplicate side effect and persistence after refresh. Actual latency improvements require before/after measurements; no implementation or speed claim is made by this log entry.


## 047: Roster > System Config > Allow advance publishing

Status: Queued on 20 October 2026 at 14:31 Singapore time. User requests a settings toggle to allow publishing in advance. No implementation, build or commit requested.

Add “Allow advance publishing” to Roster System Config. Follow existing business-setting permissions: Admin edits, SMC can view. Proposed default is Off to preserve current release timing. Persist the setting in the existing configuration store so it survives refresh and frontend/backend deployments.

When enabled, an otherwise authorised publisher may publish the selected future date before the normal permitted publication window. When disabled, retain the existing publication timing restrictions. Enforce the setting on the server as well as in button availability. Clearly identify the selected date and publish the intended dated version, never today's records by mistake.

Retain all other publication checks, including fresh authority, valid date/source, compatible baseline, required confirmed plan, current revisions and complete acknowledged draft saves. Advance publishing is not permission to bypass validation or silently publish unconfirmed local edits. A batch still awaiting acknowledgement must be resolved before publishing its contents.

Preserve the publication snapshot boundary: future-date arrangements become available through the authorised dated timetable view once published; later draft edits require republishing before replacing that released version. Preserve existing notification controls and delivery timing. Enabling the toggle or choosing Publish Only must not itself send an early WhatsApp message or other notification.

Turning the setting off prevents further early publication but does not retract a day already published. Keep normal audit records for configuration changes and publication. Verify future-date rendering/exports, ordinary timing when Off, permissions, pending draft batches, conflicting edits, repeat publication and separation from notification actions. The date-aware timetable work in item 045 must also support an authorised future published day.


## 048: Full v0.8.0 release — 20 October 2026

Authorisation: “run by 5 coding skills to commit to next version. full pack next logical version number v0.8”. The package uses the existing three-part version convention, v0.8.0, based on v0.7.19 commit `2a0fffc`. This release record supersedes the earlier queued/no-implementation statuses for items 043–047 and the tentative v0.7.20 label. It preserves all earlier release history and unresolved live incidents.

Implemented scope:

1. Item 043: a signed dates-only Contacts response, early metadata-only Roster context and request-local indexes. Return visits render the verified same-session dates provisionally while current access is checked. Stale controls cannot start new mutations; an immutable uncertain-request retry remains available. Fresh authority, coherent Contacts reads, baseline and lease checks remain.
2. Item 044: each unresolved Offline JSON name has its own existing-contact selector and Add new contact action. The source name pre-fills creation, and the exact returned canonical ID resolves only its original row/session/import. Other mappings survive; stale callbacks cannot bind to another row or draft.
3. Item 045: the main Timetable shows its available baseline immediately with an inline check for a published suspended day. Published schedule-only projection includes unchanged teachers and intentional blanks, independent of Calendar when a full published day exists. Screen/PDF/Excel agree. Refresh retains the last verified same-date public view and selection; failure remains visible with Retry. Recognized offline absence reasons, including multiline reasons, become neutral Absent labels in the public projection; private stored content remains intact. Confirm stays allocation-only; Publish remains ordinary-teacher release.
4. Item 046: routine relief edits update locally at once and save in ordered background atomic batches. One immutable in-flight request keeps newer edits separate. Exact retries, current-source/revision checks, conflict review, session recovery and navigation/export/publish barriers protect pending work. Each batch commits the operational document and receipt once, or not at all. Published replacements/removals remain drafts until republished; no publication notices are sent by draft staging.
5. Item 047: persisted Admin-only Allow advance publishing, default Off. Enabling permits Publish Only for an otherwise valid future school date. Future Publish & Notify remains blocked; disabling the toggle does not retract existing publications.

Five coding approaches applied: Ponytail, Pstack, Thermonuclear, Vercel and Superpowers. Independent correctness and structural reviews use the same fixed release diff, followed by scoped verification of accepted fixes. `VALIDATION.md`, `RELEASE_SUMMARY.json` and the versioned verification archive record actual integrated results, review findings and resolutions. No production latency or live-delivery claim follows from local tests.

The complete package includes five frontend ZIPs, three complete Apps Script backends, the separate notification Worker, source, repository history, documentation and verification evidence. To receive all new Roster improvements, install Contacts backend, then Deploy backend, then Roster frontend, keeping existing URLs, secrets, stores, flags, media binding and cron. Older full-directory Contacts responses remain compatible but lack the smaller date-list payload.

No live deployment, data reset, school timetable publication or staff message is performed by this release work. The existing saved-plan readback and uncertain baseline-switch cases still require checks in the installed service.


## 049: Roster > Report Absence > No relief instructions saves immediately

Clarification on 20 October 2026 at 15:45 Singapore time: the user wants “No relief instructions” to save on click. The earlier interpretation of this as an unintended submission was incorrect. This clarification supersedes the earlier required-behavior and no-write acceptance criteria below. The prior frontend-only v0.8.00a authorisation applies. The original log and investigation are retained as history.

Status: Queued on 20 October 2026 at 15:28 Singapore time. User explicitly requested changelog only. No code change, build, version bump or commit is authorised by this report. Reported after delivery of v0.8.0; the installed version is not confirmed.

Reported behaviour: clicking “No relief instructions” also submits the absence form. Screenshot image(20261020-072746).png (libfile_21547d3e0a3c819180da0c8384a663b9), inspected, identifies the control beside the Relief instructions Absence date selector. The screenshot shows the control and review screen; the unintended submission is the user's report, not a reproduced trace.

Required behaviour: “No relief instructions” changes only the local instruction choice for the selected absence date. It must not submit an absence, invoke a save request, create a receipt or trigger notification intent. Retain selected dates and periods, entered instructions and the open review. Relief instructions remain visible. Only the final “Submit absence” action at the bottom may validate and commit the completed absence and instructions. This restores the previously agreed no-write review flow and does not change whether relief is required.

For the next authorised fix, check the button's form behaviour and event handling, including implicit submit defaults, click propagation and keyboard activation. Do not assume the root cause before reproducing it. Verify mouse click, touch, Enter and Space on this control produce zero save calls and leave the review open; verify the final Submit absence action still performs exactly one validated write and preserves retry protection.

Follow-up investigation, 20 October 2026: the user conditionally authorised a surgical v0.8.00a containing only changed deployment portions if 049 is frontend-only; otherwise it stays in the changelog. This supersedes the earlier log-only restriction only within that conditional scope.

Status after investigation: open, not reproduced in the delivered v0.8.0 source or package. No product code change, version bump, patch build, commit or live deployment was made. The control's behavior belongs to the frontend, but the evidence does not establish a frontend defect or a need for a backend change; this report is not marked fixed.

Evidence at v0.8.0 commit 567ddeacf164cd3aedf1fbfdecdc964818eeb298:
1. In roster-update/public/roster-operations-ui.js, drawInstructions creates the control with type="button" outside the absence form. Its handler only changes local instruction state and dirty state. setDirty has no save side effect. The bottom data-save-instructions handler is the sole caller of submitAbsence. The period-review form prevents normal submission and performs no write.
2. The existing Chromium checks tests/absence718d-flow.cjs and tests/roster-draft-absence-instructions-browser.cjs passed unchanged. They cover mouse and Space activation, draft and saved instructions, mobile layout, explicit bottom-only save and uncertain-response receipt recovery.
3. A separate scratch Chromium probe passed Enter, real touch tap at a 390-pixel viewport and double click. Each produced zero mutation requests and zero form submissions; the explicit bottom Submit absence then produced exactly one saveAbsence request.
4. All 58 files in Roster_Frontend_v0.8.0.zip match the released frontend source. The full deployment ZIP contains the same frontend ZIP and its source archive contains the same UI. UI SHA-256: f625c6a20a4943e2b504ea8c4f0b144cf01c2649ade89a06d055c9d8d01cc6d9.
5. Independent correctness and structural reviews found no alternate save path in the inspected controls or Roster wrapper. Ponytail, Pstack, Thermonuclear, Vercel and Superpowers review guidance was applied. No speculative event-cancellation change was made.

Next evidence needed: the version displayed by the affected installed Roster, followed if necessary by the loaded frontend asset version and request trace for the click. A stale deployment or cached script is a possibility, not an established cause. This local verification does not disprove the user's observed issue or establish the installed service's behavior. Keep 049 queued until it can be reproduced and a specific corrective change verified.


Delivery of clarified item 049, v0.8.00a: generated and locally committed as 4f9ba7ba3cdff57e91fde9fcd6fff8e9a4a53b29, tag v0.8.00a. The conditional frontend-only scope is satisfied. Only roster-update/public/index.html and roster-update/public/roster-operations-ui.js change at runtime. The gateway Worker, Apps Script backends, notification Worker and other frontends remain byte-for-byte unchanged from v0.8.0. The header shows v0.8.00a; the unchanged gateway's /api/config continues to report v0.8.0.

Clicking No relief instructions now changes the choice and immediately invokes the same save handler as the bottom action. New reports use saveAbsence; existing reports use saveInstructions. Preserve original toggle semantics and confirmation when entered text is marked not applicable. Instruction text stays intact. The ordinary period-review step remains local, written instructions still use the bottom Submit/Save button, and no new API or notification rule is introduced. Busy/pending protection prevents changing intent during a pending save; uncertain acknowledgements retain the exact receipt retry.

Verification: the new Chromium regression failed against the baseline because the shortcut sent zero saves, then passed with the patch. Mouse, touch, Enter, Space, repeated clicks during saving, text retention, rejected writes, existing records and lost-acknowledgement retries passed. Six adapted suites retained ordinary entered-instruction, permission, date and multi-day behavior. Independent Thermonuclear correctness and structural reviews found no material issue. Ponytail, Pstack, Vercel and Superpowers were also applied.

The full npm invocation reported 427/429 scripts passing. An unnecessary gateway version-label change caused the notification bundle parity check to fail; reverting that label restored exact gateway/bundle parity, and roster702-notification-setup.mjs passed on rerun. The remaining package.cjs check expects a new full v0.8.0 deployment archive and does not apply to this surgical package. The dedicated hotfix080a-package.py gate passed, verifying the exact committed files, preserved components, ZIP checksums, tag and incremental history. The full npm invocation is not represented as an all-green run. The historical Python browser scenarios were syntax checked but not executed; current Node Chromium tests cover the affected flows.

Deliverables: Roster_Frontend_v0.8.00a.zip for the existing Roster Cloudflare Pages project; GSiS_v0.8.00a_Changed_Items.zip containing that deployment item plus changed source, Git patch, incremental history, installation notes and validation. No backend redeployment is required. Merge this patch into the next full package. No live deployment, school absence submission or staff message was performed during preparation.


## 050: Roster > Separate publishing, notification and allocation by relief date

Status: Reviewed and queued on 20 October 2026, following the user's 16:35 Singapore request. Apply in the next authorised implementation/release. No product source changes, version bump, commit, build, live publication or staff message were made for this review.

Requirement: today's Publish and Daily Notify must work while tomorrow's automatic allocation runs from 16:00 at its configured intervals. Scope operations, pending work, conflict checks and visible status to the selected Singapore relief date. Multiple SMC users must not overwrite one another. Notification uses the selected day's published snapshot; allocation changes the selected day's draft; publication explicitly releases that day's reviewed draft. Future-date publishing and notification settings keep their existing meaning.

Review scope: v0.8.00a source at commit 4f9ba7ba3cdff57e91fde9fcd6fff8e9a4a53b29, including the backend dispatcher, shared allocation/operations modules, notification Worker and Roster UI. Applied Ponytail for the smallest coherent change, Pstack for root cause analysis, Superpowers for evidence and reproduction, Vercel for concurrency/retry/security boundaries, and independent Thermonuclear correctness and structural passes. These are existing source findings, not defects claimed to have been introduced by the frontend-only v0.8.00a patch.

Verified findings:

1. P1, false cross-date conflicts. `backend/Code.gs`, `rosterOperationsDispatch_` at line 3884, requires the global operations revision for both Publish and Notify. `rosterScheduledDispatch_` at line 4054 increments that revision for tomorrow's tick. A deterministic reproduction through the real dispatcher and the existing in-memory Apps Script adapter seeded today's publication, ran a 16:00 tick targeting tomorrow, then attempted today's Notify with its previously read revision. Today's publication and day revision were unchanged; global revision changed from 0 to 1; Notify failed with HTTP 409, "Relief records changed. Refresh before saving."
2. P2, scheduler bookkeeping causes avoidable conflicts. In the same reproduction allocation was paused, no assignments were saved and no notices were queued. The `actual` condition at line 4051 still includes `slot.optimise || slot.report`. Scheduler receipts must remain durable, but bookkeeping alone must not invalidate reviewed daily plans.
3. P1, slow work blocks unrelated users and dates. Backend user mutations at lines 3868 to 3902 and scheduler work at lines 4040 to 4054 hold the shared writer lock across context preparation, quota/model reads, reconciliation and computation. Notification claim/result paths need the same lock. `rosterOperationsCommit_` still replaces one complete operations JSON document, so simply introducing independent date locks would risk lost updates across dates, notification results and audit records.
4. P2, browser pending state is global. `roster-update/public/roster-operations-ui.js`, `pending`, `pendingBanner` and `mutate`, use one pending mutation across dates. An uncertain tomorrow command can disable today's actions in the same tab. Existing per-date draft ownership is a useful starting point; retain unresolved commands and route late responses back to their original user/date.
5. P2, publication errors are misleading. The UI's publish catch at lines 296 to 298 converts every HTTP 409 into "The allocation changed." It hides distinct backend failures for started periods and weekly cap verification/exceedance. Return and display specific conflict codes; only show allocation differences when that is the actual conflict.
6. P2, notification dispatch waits for allocation in the same tick. `notification-worker/index.js`, `scheduled`, awaits `scheduledRoster` and then employment mail work before `dispatchNotifications`. Shortening the backend lock alone leaves this orchestration delay. Separate independent dispatch work from slow allocation, preserving scheduler idempotency and notification claims. Do not parallelize unprotected writes to the shared document.

Smallest safe implementation direction:

1. Reuse the existing `dayRevisions[date]` and `dailyPublicationStates[date]` rather than add another datastore immediately. Publish must validate that day's reviewed allocation, Stapler revision, baseline and relevant policy inputs. Review all writers before treating `dayRevisions` as complete coverage; a bare day counter is not sufficient for every dependency.
2. Notify must validate the selected published snapshot and baseline without requiring tomorrow's draft or quota context. Add an explicit expected publication revision to the request and check it inside the commit, because the current global revision is the only broad stale-view guard and `notifyDaily` has no published-revision precondition. A changed publication gets a precise refresh/review response. Same-date unpublished draft changes alone must not prevent notification of the unchanged published snapshot.
3. Prepare slow reference inputs and allocation proposals outside the final writer lock. Under a short shared lock, reload the latest document, recheck relevant dependencies and the clock, apply only the intended changes to that fresh state, then persist once with its receipt, audit and notification intent. Never write back a stale whole-document copy. Recompute a stale proposal within bounded retries; preserve the original request ID for uncertain commits.
4. Keep weekly R, employment caps, confirmed Stapler workload and annual fairness as real shared dependencies. `shared/roster-allocation.js`, `balances` at lines 125 to 129, and `shared/roster-operations.js` at line 361 explicitly span dates. Revalidate them for allocation/publication, without making pure Notify depend on those calculations. Preserve existing access checks, period rules, morning cut-off, baseline verification and Admin policy controls.
5. Separate request ownership by user and relief date, with operation-specific dependencies on that date. Multi-date commands must cover every touched date. Show progress and retry status for the affected date only; prevent stale responses from replacing the page for another date. Keep exact request receipts, actor/digest checks, notification claim fencing and uncertain-send recovery. Distinguish queued, sent and confirmed delivery; do not promise exactly-once external WhatsApp delivery.
6. Measure reference-read time, allocation computation, commit-lock wait/hold time and response time separately. Start with the existing storage and a short final lock. Consider physical per-date storage only if measured document read/write cost remains a material bottleneck; that requires a deliberate migration for shared accounting and publication/outbox consistency.

Required verification before release:

1. Hold tomorrow's computation open; today's Notify and a still-valid Publish can finish before it completes, without losing either date's data or delivery callbacks.
2. Interleave two SMC users on the same date; reject stale publication/overlapping edits with a precise message while preserving saved drafts and retained local changes.
3. Change a relevant weekly workload, cap, baseline, Stapler plan or policy while computing; reject or recompute the stale proposal before it commits.
4. Retry an identical command after response loss; retain one durable intent and the original claim/receipt history. An uncertain external send is not blindly sent again.
5. Switch dates while saving; keep the original operation visible and recoverable, without disabling an independent date or rendering the wrong response there.
6. Confirm paused/no-change scheduler bookkeeping does not invalidate daily allocation or publication tokens. Verify current-day and next-day selection across Singapore midnight.
7. Check that Publish Only, Publish and Notify, individual Notify and scheduled dispatch use the correct day's snapshot; a same-day publication change must not silently send an unreviewed version.
8. Repeat bounded 1/10/30-user interleaving tests for this scope and record actual timings separately from correctness. Existing absence-concurrency tests do not establish cross-date publish/notify independence.

Validation completed for this review: source tracing plus the deterministic real-dispatch reproduction described above. Scratch evidence is `daily-isolation-review/evidence/tomorrow-tick-blocks-today.cjs` and its JSON result. No production latency measurement, real parallel platform load test or live delivery test was performed. The separate rule preventing ordinary publication of relief periods that have already started remains in force; date isolation does not remove it. No general late-publish override or test-message bypass was requested.


## 051: WhatsApp > Relief Planning Update > Readable absence names

Status: Queued on 20 October 2026 at 16:38 Singapore time. Formatting request only; no implementation, template submission, build, commit or message send performed.

Replace the long semicolon-separated teacher-and-period text with the absent-teacher count followed by one teacher name per bullet line. Omit the P0 to P16 lists from this planning message. Keep the coverage, uncovered-period and low-capacity summary as a separate paragraph; retain the greeting/date, draft-publication notice, review link and closing.

The user's example retained "5 absent teachers" but showed only three names. Treat that as a formatting illustration, not a request to hide Siti Fadhilah or Yusri. Derive the count and displayed names from the same distinct-staff set, preserve meaningful name qualifiers such as (MTL) and (FAJT), and do not filter teachers out merely because they currently have no relief demand.

Requested example, retaining all five original names:

```text
*Relief Planning Update*

Hi Song Wee, here is the relief planning update for 21 Oct 2026 (Wed).

5 absent teachers:
• Jannie
• Siti Fadhilah (MTL)
• Egwin
• Yusri
• Amelia (FAJT)

12 periods have planned cover; 0 uncovered. Low-capacity periods: None.

These allocations are drafts pending publication.

Review the plan here: https://roster.gsps.edu.sg/.

Thank you.
```

Implementation evidence: `shared/roster-operations.js`, `scheduledTick`, builds the period-heavy summary at lines 660 to 663; its source is bundled into the backend. The evening template `gsis_relief_evening_v1` uses summary parameter 3 in `notification-worker/template-contracts.json`. The Worker maps `data.summary` into that field without flattening line breaks. This is not a frontend-only change. The common generator also serves the morning summary; preserve the correct morning/evening heading and template route when applying the compact names format. Preserve structured absence fingerprints, suppression of unchanged repeats, notification timing, draft status and all stored absence periods.

Acceptance: zero, one and multiple absent teachers render with correct counts; each included teacher appears once; the five-teacher example includes all five; coverage figures remain accurate and separate. Respect the verified template field limit and make any shortened-list fallback explicit with a full-plan link. Before release, verify multiline parameter compatibility for the actual approved WhatsApp template and sender path; do not infer Meta acceptance merely from local string construction or weaken template validation. No current live template approval or delivery claim is made by this log.


## 052: Cross-API throughput, atomic save scope and concurrent-user reliability

Authorised on 20 October 2026: review the cross-API data waits, explore bulk compression and local decompression/manipulation, favour surgical/batched reads and atomic writes, apply five coding review skills, then commit. This authorisation covers implementation and the next full local release, v0.8.1, including queued items 050 and 051 and the v0.8.00a shortcut. No live deployment, school timetable publication or external message is part of this release work.

Implementation direction: remove unnecessary service round trips before adding a compressed wire protocol; keep existing compressed Stapler storage and authorized browser snapshot manipulation. Prepare allocation/context work outside the shared writer lock, then reread current state, revalidate relevant sources/dependencies and merge the intended changes under one final commit lock. Keep authoritative permissions, weekly limits, receipts, audit, notification claims and recovery. Separate date ownership in the browser and published-snapshot notification checks from unrelated draft work.

Item 051 choice confirmed during implementation: “Compact names now (Recommended)”. Remove the period lists and use one compact, single-line list of all distinct absent teacher names, preserving qualifiers. Exact bullet layout remains queued for a separately approved template revision. Counts and names use the same teacher set; a shortened long-list fallback must be explicit. No template submission or live send is authorised or performed.

Five review approaches: Ponytail, Pstack, Thermonuclear correctness and structure, Vercel and Superpowers. Final delivery and executed checks are recorded below when completed.


Delivery of 050–052 in v0.8.1: full release committed under tag v0.8.1, based on v0.8.00a. This supersedes the earlier queued status for item 050 and implements item 051 in the compact inline format selected by the user. The exact bullet-template layout remains queued; no new template approval or live send is claimed.

Changes: dated planning tokens and expected published revision; immutable pending work owned by user/date; truthful conflict/retry recovery; allocation/context preparation outside the final writer lock; source/shared-dependency revalidation and fresh-state merge preserving receipts, audit and notification callbacks; one authenticated evening Calendar batch instead of two serial calls; no Calendar call for pure Notify; independent notification dispatch. The underlying operations store remains one document with one final serialized write, not a distributed cross-service transaction. Existing rule limits, authority, published snapshot boundaries, cut-offs and uncertain-send recovery remain.

Compression was evaluated with synthetic bulk JSON and byte-exact decompression. It can reduce transfer bytes but does not remove remote startup/serial waits or shared-lock contention. v0.8.1 retains native compressed Stapler storage, narrow projections and local authorized-snapshot manipulation; it introduces no custom transport codec or database migration.

Verification: the full npm run reported 433/435 scripts passing; a real direct-render draft-flush regression was fixed, and an obsolete date-navigation expectation was replaced with retained-conflict/export checks. Both failures and four related browser suites passed the final scoped rerun. All 435 current scripts are verified across those runs; the original invocation is not labelled all-green. Eighteen backend checks include bounded 1/10/30-user allocation/notification/callback interleavings, exact receipt retries, source/policy changes and weekly-cap recomputation. Independent correctness and structural reviews found two additional UI recovery defects, both fixed and retested. Ponytail, Pstack, Thermonuclear, Vercel and Superpowers were applied. Final package/provenance evidence is included with the full release.

Required deployment order from v0.8.0 or v0.8.00a: Calendar backend, Deploy backend, Roster frontend, separate notification Worker. Contacts and other frontends need no functional redeployment for this scope. Preserve existing URLs, secrets, flags, private media binding, stores and cron. The full package includes all components, source, repository history, documentation and verification. Local tests do not establish production latency or live provider delivery. No live deployment, school-record mutation, publication, template submission or staff message was performed. Historical saved-plan readback and baseline-switch incidents remain installation checks.

## 053–057: v0.8.1b delivery record

Authorised on 20 October 2026: clear the current conversation's changelog, use Ponytail, Pstack, Thermonuclear, Vercel and Superpowers, commit the implementation and return only updated component deployables.

The complete accepted scope is recorded in CHANGELOG_v0.8.1b.md: immediate post-publication Notify and inline progress; precise subject families and TG exceptions with Tamil No Relief Required by default; acknowledgement for all changed published timetables; expiring private links without Google sign-in; and safe dynamic parameters across all existing WhatsApp templates, including detailed diagnostics and permanent-error retry handling.

Status: implemented in v0.8.1b; the current accepted queue is cleared. Historical entries remain as the audit record. The accepted compact inline absence format supersedes the older bullet-template mock-up; no template-body revision remains in this release queue. This release does not reopen ordinary publication after lesson start, submit new provider templates, change live settings, or send staff notifications.

Validation: 445/451 scripts passed in the full run; all six failures were corrected and passed the final scoped rerun with three related checks (9/9). All 451 scripts are verified across those runs. Independent correctness and structural reviews closed without unresolved material findings. Only Deploy backend, Roster frontend and the notification Worker are included as updated deployment components. See CHANGELOG_v0.8.1b.md, HOTFIX_v0.8.1b.md and VALIDATION_v0.8.1b.md.


## 058: Daily Notify delivery visibility and morning reliability

User report: an individual Notify to Song Wee did not arrive on WhatsApp; correct notifications must reach the affected teachers in the morning.

### Verified live evidence

Read the actual operational Drive document, timetable register and active baseline model. Inspected Deploy and Contacts through the Google Sheets skill. Operations revision 204 was last modified at 05:23:02 on 21 October. Findings describe that snapshot, not later delivery.

The latest individual notification was created at 05:07:21 on 21 October for today's publication revision 3. Its status was queued, with zero attempts and no provider message ID. Contacts resolves the same active staff identity and destination used by the job.

Current code holds ordinary teacher notifications from 21:30 until 05:45 Singapore time. The queued job is consistent with this hold. It can become eligible at 05:45, subject to successful dispatch, current publication and recipient checks; delivery is not established by this investigation. Quiet-hour rejection during claim leaves no visible hold reason. The UI says notifications were queued without exposing the next eligible time or the provider outcome.

An older individual test at 21:07:33 on 20 October is a separate job. Two attempts failed with META_132018; a third attempt became uncertain after the prepared-send lease expired. It has no provider message ID. Do not automatically resend this uncertain attempt or claim that it definitely did not send. The latest 05:07 job has not reached the provider, so that earlier error does not explain its present queue state.

All three 21 October publications used Publish Only, at 16:09:47, 16:15:35 and 20:12:13 on 20 October. Only three daily timetable jobs exist in the snapshot, all from individual Notify actions. The 05:30 scheduled message is an SMC planning summary. The scheduler drains existing jobs, produces SMC reports and creates eligible duty reminders; it does not create an initial daily notification for every affected teacher. Publish Only therefore does not currently establish a morning teacher notification batch.

### Queued requirements

1. Show the real queued count, quiet-hour hold and next eligible time, sending, provider accepted, delivered, failed and uncertain states. Keep acknowledgement as a separate status.
2. Use one durable notification identity per date, teacher and published timetable version. Reuse pending work; preserve exact-request retries; prevent duplicate delivery of an unchanged version; reconcile uncertain sends before retrying.
3. Recheck current recipient eligibility and the latest published timetable immediately before dispatch. Cancel superseded or no-longer-needed queued notices with an audit reason.
4. Verify the complete morning path from publication and recipient selection to provider delivery and acknowledgement. An SMC summary must never be presented as evidence that teacher notices went out.
5. If an automatic morning teacher batch is adopted, create missing notices from the latest published day only, catch up on later scheduler ticks, and show unresolved recipients by the operational deadline. Keep draft allocation and publication separate.
6. Confirmed by the user on 21 October 2026: explicit manual Notify actions bypass quiet hours and become eligible for immediate dispatch. This covers individual Notify, Notify All and an explicitly selected Publish and Notify action. Automatic notifications retain their agreed schedule, including the existing 05:30 SMC summary. Publication, affected-recipient checks, duplicate prevention and uncertain-send safeguards still apply; Publish Only continues to send nothing. This is an approved requirement for the next implementation, not a live setting change. A new automatic teacher batch still requires an agreed time; 05:45 remains a proposal, not an approved new schedule.

Acceptance includes an explicit click during quiet hours, a held request becoming eligible, missing/invalid Contacts data, an unapproved or invalid template, a transient failure, an uncertain prepared send, duplicate clicks, a missed scheduler tick, a superseded publication and a zero-recipient result. Verify Meta delivery with one authorised controlled send after installation; local checks alone do not establish delivery.

## 059: Correct affected-teacher detection against baseline and suspended overlay

User report: Song Wee's suspended timetable equals baseline and should not make him a notification recipient.

### Verified live evidence

Active Roster baseline: 2026 T4 (P6 Collasped) from 20 Oct, ID 1d28c523-809c-462d-b2e2-6ca5fbbc8328. The selected 21 October Stapler draft and published overlay are identical. All 17 of Song Wee's cells match the raw baseline, draft overlay and published timetable exactly, including subject, class, venue and group. This is not merely an apparent match in the screenshot.

The published teacher record has changed=false and updated=true, with restored rows for P3, P4 and P7. Roster retains differences from an earlier publication even when that earlier timetable was never notified. Earlier publications used Publish Only and there is no earlier-version timetable job for Song Wee. Both the individual button and Notify All accept this retained restoration row.

Current snapshot counts:

| Category | Teachers |
| --- | ---: |
| Listed in Daily Notify | 58 |
| Flagged changed from baseline | 55 |
| Differences only from class-list comma spacing | 17 |
| Identical to baseline, retained as restorations | 3 |
| Other current timetable differences | 38 |

The 17 formatting-only cases span 63 periods. Changing only class-list comma spacing, for example 4C,4H versus 4C, 4H, removes every difference in those cases; all other cell fields match. The source compares raw baseline arrays with normalized Stapler output. A local untouched-plan reproduction confirms this false positive. No broad case folding, alias guessing or class reordering was needed for the live finding.

Imported Stapler cards also receive new tile IDs, so unchanged cards can appear green with a grey baseline card. That display is not a reliable affected-teacher indicator.

### Queued requirements

1. Compare equivalent canonical timetable content on both sides. Use stable staff, class and teaching-group identities where available. Ignore presentation-only comma spacing while preserving genuine subject, class, group, venue, timing, duty and published instruction changes.
2. Use that shared comparison for the suspended overlay, Daily Notify display, individual Notify, Notify All, update notifications and any morning batch. Enforce eligibility again on the backend.
3. Exclude unchanged teachers from the default affected list and baseline-based Notify All. Song Wee's verified case must yield no new routine notification or pending acknowledgement merely because a previous unpublished-to-teachers revision differed.
4. Determine corrective updates from what the teacher was previously notified about, not simply the immediately preceding publication's updated flag. Preserve necessary cancellation, reassignment and return-to-baseline notices for teachers who received an earlier changed timetable. Handle uncertain delivery explicitly rather than assuming sent or unsent.
5. Recompute eligibility for existing published records as part of the fix. Avoid requiring a meaningless new timetable edit or erasing publication history. Old stored flags and fingerprints must not keep false recipients eligible after the code is updated.
6. Make unchanged imported cards appear unchanged; retain an accurate view of real changes and source details.

Acceptance: Song Wee's exact 21 October case is excluded; all 17 comma-spacing-only cases are excluded; substantive changes remain visible; a real notified assignment followed by cancellation still produces a correction; an unnotified draft/publication change restored to baseline produces no routine notice; genuine venue, subject, group, duty, time and instruction changes remain eligible. Unchanged repeated publication and resend must not reset valid acknowledgement.

## Investigation scope and implementation locations

Ponytail, Pstack, Thermonuclear correctness, Vercel and Superpowers systematic debugging were applied. Independent review and local data comparison confirmed the recipient findings. No tests were added to production source during this investigation.

Key locations: shared/roster-operations.js dailyPublication, dailyNotifyView, notifyDaily, publishDay, queueDailyNotices and scheduledTick; shared/roster-allocation.js schedule; backend/RosterOperations.gs notification claim/prepare validation; shared/roster-stapler.js import reconstruction and changes; roster-update/public/roster-operations-ui.js notification feedback and recipient display.

The operational state is one concurrently written Drive JSON document. Directly replacing it to hide a recipient would bypass the application's lock, receipt and audit process. The verified baseline itself is correct; changing spreadsheet lesson data would conceal the logic defect. No such source-data alteration was made.

Sources:

1. [Roster operations](https://drive.google.com/file/d/17RTyB7u6N8J03ueJKOUBu5NxWSlYugJu/view?usp=drivesdk), revision 204.
2. [Roster register](https://drive.google.com/file/d/1s6UfaBqvSWmIpVBDtW7HyknKCUUQ4fz4/view?usp=drivesdk), revision 5.
3. [Active baseline model](https://drive.google.com/file/d/166P4aPyz2lpsl0X1ff-ZtxwrbNS_FMKs/view?usp=drivesdk).
4. [Deploy workbook](https://docs.google.com/spreadsheets/d/1gXyYNbb8tHKDsb3Q3yepLEuc3cjsbbAsfLl7_XACfls/edit?usp=drivesdk), deploy_index.
5. [Contacts workbook](https://docs.google.com/spreadsheets/d/1mbKXkgL2L6OOud6aki8CgJsjReYRKxjlkMD3SdhudKI/edit?usp=drivesdk), contacts row 15.

Detailed raw evidence remains in the private local investigation folder; this changelog omits other staff names, phone numbers, signed private links and message bodies.


## 058–059: v0.8.1c delivery record

Authorised on 21 October 2026, Singapore time: “commit patch, with wider changelog for future merge into whole suite”.

The accepted manual notification and recipient fixes are implemented in v0.8.1c. Manual Notify bypasses quiet hours after all publication and recipient checks. Existing automatic timings are preserved. Durable request reuse, uncertain-send protection, dispatch rechecks, precise delivery states and real request counts replace the earlier ambiguous feedback. Acknowledgement remains a separate receipt.

Canonical timetable comparison suppresses presentation-only differences and never-notified restorations. Existing published records are evaluated without rewriting publication history or source timetable data. Earlier notified changes can still require a corrective notice. Imported Stapler cards and exports classify unchanged content correctly while retaining source records.

Validation: 446/455 scripts passed in the full run; all nine follow-ups passed in the final 29/29 scoped run. Both independent reviews closed. All 68 Apps Script source files and the exact two-component archive passed their final gates.

Only Deploy backend and Roster frontend require replacement. Retain the v0.8.1b notification Worker and all other installed components. Read HOTFIX_v0.8.1c.md, CHANGELOG_v0.8.1c.md, VALIDATION_v0.8.1c.md and SUITE_MERGE_v0.8.1c.md. The wider merge note records cumulative items 053–059, source generation, version compatibility and remaining live checks.

Items 058–059 are closed for the accepted implementation scope. The investigation entries above remain historical evidence. A new automatic morning teacher batch is not authorised or implemented; agree its timing separately, with 05:45 still only a proposal. Publish Only remains silent. No production deployment, live data repair or WhatsApp send was performed by the patch build.


## 060: Reusable private teacher notification links

Current lifetime requirement: item 064 below supersedes the early date-based expiry retained in this historical item. The seven-full-day policy is queued, not included in v0.8.1d.

Status: implemented in the v0.8.1d surgical patch over v0.8.1c, authorised by “surgical patch for item 060 too”. Verified locally; exact outcomes are recorded in VALIDATION_v0.8.1d.md.

User confirms the private teacher notification link works, but reports that it becomes inaccessible after the first opening. The requested change is repeated access throughout the existing validity period.

Opening, refreshing, reopening on another browser/device, or acknowledging the timetable must not consume or invalidate the signed link. Preserve teacher/date scope and existing time-based expiry: the earlier of seven days after issue or 23:59:59 Singapore time on the day after the timetable date. Acknowledgement remains idempotent and recorded separately from access. Genuine expiry, explicit revocation or a security boundary may still deny access with an accurate reason.

Original investigation requirement before changing lifetime rules: distinguish capability expiry, URL fragment handling, browser/session behavior, acknowledgement processing, publication updates and any external access policy. The user report established the symptom; subsequent investigation found fragment removal rather than server-side one-time use.

Acceptance: reopen the exact same valid link before and after acknowledgement, refresh repeatedly, and open it in another browser without signing in. Timetable access remains available; acknowledgement is not duplicated. The same link stops working only when an actual validity condition ends.


## 060: v0.8.1d delivery record

Authorised on 21 October 2026, Singapore time: “surgical patch for item 060 too”.

Investigation found no server-side one-time consumption. The private page removed the signed URL fragment and relied on tab-scoped session storage. Reopening a copied or bookmarked post-open URL in a fresh browser context, or refreshing when session storage was unavailable, could therefore lose access.

The page now retains the complete fragment and restores it when recovering a legacy stripped URL from that tab's existing storage. A different fragment creates a fresh document to separate teacher/date views and pending actions. Authorization errors clear displayed private data while allowing Refresh to revalidate the complete link with the server. Opening and acknowledgement do not consume the link.

Existing signature validation, teacher/date scope, public access without school sign-in, idempotent acknowledgement and expiry remain unchanged. Expiry is the earlier of seven days after issue or 23:59:59 Singapore time on the day after the timetable date. HTTP request URLs and referrers still omit the fragment; the existing API uses its bearer header. Expired links are not revived.

Only Roster frontend requires replacement. Retain Deploy backend v0.8.1c, notification Worker v0.8.1b and all other installed components. See HOTFIX_v0.8.1d.md, CHANGELOG_v0.8.1d.md, VALIDATION_v0.8.1d.md and SUITE_MERGE_v0.8.1d.md. The wider merge note carries items 053–060. The full run passed 455/456 scripts; the one backend-version test assumption was corrected and passed on follow-up. All 456 current scripts are verified across runs, with no unresolved material review findings. The frontend-only archive passed scope, source parity and hash checks. No live deployment, data alteration, automatic morning teacher batch or WhatsApp send was performed.

## 061: Faster private teacher timetable page

Status: investigated and queued after the item 060 patch instruction. Not implemented in v0.8.1d.

User request: “work to make private link faster.”

The private page assets total 19,944 uncompressed bytes. Code inspection found serial Calendar and Deploy service calls, followed by Contacts lookup, operational state loading, whole-school context construction and reconciliation while the shared writer lock is held. Acknowledgement then triggers another full view request. These are optimization candidates; no live cold or warm latency was measured and configured timeouts are not observed response times.

Implementation scope for the next authorised patch:

1. Measure first open, repeat open and acknowledgement response time. Separate Calendar, Deploy, lock wait, Contacts, state read and recipient projection timings without recording signed tokens, private URLs or teacher content.
2. Build a recipient-scoped read path from the existing published timetable snapshot, which already contains cells, baseline, periods, instructions and stable notice identity. Avoid rebuilding full-school planning data or fetching Calendar when the durable published record supplies the required display data. Retain a validated fallback for legacy records and mutual relief requests.
3. Reduce the shared lock's duration. Independent context may be fetched before locking, but do not simply remove the lock from the current view: reconciliation can write records. Preserve publication consistency and concurrent acknowledgement correctness.
4. Return the displayed daily projection for modern publications; avoid redundant weekly and unused overlay data. Existing immutable model caching already exists, so do not add a duplicate generic model cache.
5. After confirmed acknowledgement, return authoritative acknowledgement and publication identity so the matching notice can update without a full read. A new concurrent publication still requires review; failed or uncertain acknowledgement must never appear successful.

Acceptance: demonstrate before/after timings using the same fixture and authorised live conditions when available. Preserve the exact teacher/date scope, current published duties and instructions, pending versus acknowledged status, normal expiry, repeat access and error handling. Keep private API responses no-store. Any memory reuse must be limited to the exact capability and publication revision, cleared on invalid access and visibly distinguished from a newly verified server result. Do not show drafts or stale duties as the current publication.

Source locations: roster-update/public/_worker.js externalRoute; backend/RosterOperations.gs rosterOperationsService_, rosterOperationsContext_ and rosterPrivateTimetable_; shared/roster-operations.js dailyPublication; roster-update/public/external.js acknowledgement handlers.


## 062: WhatsApp private-link button

Current decision, updated by item 069: adopt two teacher notification buttons, View Detail and Acknowledge. Retain the existing in-text URL template in service until the replacement is approved and ready. The wording and replacement drafts are recorded under item 063; item 069 specifies the two-button behavior and top-page acknowledgement. The seven-template audit below remains future integration scope.

Status: investigated and queued after the item 060 patch instruction. No provider template was submitted, changed or activated.

User asks whether the long in-text private link can become a button because its appearance is intimidating. Use native WhatsApp URL buttons labelled “View Detail” and “Acknowledge” for timetable notifications, as updated by item 069, with the agreed message text asking the teacher to review and acknowledge. Mutual approval messages should use a matching action label such as “Review relief request”. Opening the button only opens the page; acknowledgement remains an explicit action there.

Meta documents URL buttons with a fixed approved prefix and recipient-specific suffix. The current seven private-link contracts are body-only: mutual_request, mutual_override, relief_assignment, relief_updated, relief_reminder, relief_urgent and stapler_timetable. The current approval matcher rejects additional components and the sender emits only body parameters. This needs coordinated contract and sender work, not a change to page styling.

Implementation scope for the next authorised patch:

1. Prepare new button-enabled template versions for all seven affected contracts. Retain existing approved versions until replacements are approved and ready. Remove the visible full private URL from the new message bodies and update their exact body parameter counts.
2. Extend notification-worker/template-contracts.json, the approval matcher, URL-button parameter validation and message construction together. Regenerate the Pages gateway contracts and separate notification Worker, and test both manual and scheduled dispatch paths.
3. Verify that the approved dynamic URL shape and WhatsApp mobile browser preserve the signed fragment exactly. Keep the school domain, recipient/date scope and original expiry. Do not substitute a public URL shortener or move a capability into a logged query/path to work around an unsupported shape. An alternative school-owned opaque redirect would need a separately reviewed scope and expiry design.
4. Continue the existing whitespace/line-break safeguards for body parameters; keep URL parameters separate and validate them without corrupting the signed token. Preserve truthful delivery status, durable notification identity, quiet-hour behavior and acknowledgement requirements.

Acceptance: the WhatsApp message displays a clear action button rather than the long token, reaches the correct teacher/date without sign-in, works repeatedly before and after acknowledgement until normal expiry, and does not acknowledge merely because it was opened. Verify on mobile WhatsApp after provider approval with an authorised test recipient before switching all affected notifications.

Official reference: https://whatsapp.github.io/WhatsApp-Nodejs-SDK/api-reference/types/button_parameter_object/ (Meta's archived SDK reference describes URL-button suffix behavior). The currently available WhatsApp template interface also supports URL buttons ending in a dynamic placeholder. Exact approval and fragment behavior still need validation; no current live template status was re-read during this investigation.

## 063: Timetable message paragraph and closing text

Status: replacement drafts prepared for review; not submitted to Meta, activated, implemented or committed. Item 061 remains queued. Item 062 is narrowed by the decision below to prepare the timetable and acknowledgement template first.

User decision on 21 October 2026, Singapore time: keep the existing in-text private URL template for now. Prepare a separate button-enabled template for the timetable and acknowledgement flow, and wait for Meta approval before use. Do not edit or replace the currently active template in place. Later refinement in item 069 adopts two buttons, View Detail and Acknowledge, and moves the page acknowledgement control to the first action row. The reference screenshot's text is not adopted.

The screenshot image(20261020-221536).png was inspected locally. Keep “Returned to baseline” with its lesson entry. Start a new paragraph before “Please open the private link”. Merge the existing view-timetable and acknowledgement instructions into that one paragraph. Remove the closing “GSiS Roster” and replace it with “Access https://roster.gsps.edu.sg for more info.” The screenshot's signed private link is intentionally not copied into this changelog or any submission example.

### Prepared replacement retaining the in-text URL

Candidate name: gsis_timetable_updated_text_v2. Language: en_GB. Proposed category: UTILITY. This name has not been checked against the live account and no provider template ID has been assigned.

The following is the complete proposed BODY, including its closing text. Paragraph breaks are fixed template text, not embedded in a dynamic parameter:

```text
*Your timetable for today has changed*

Hi {{1}}, your timetable for today, {{2}}, has updates.

Specifically, the changes are:
{{3}}

Please open the private link to view your updated timetable alongside your usual timetable and acknowledge this update:
{{4}}

Thank you.
Access https://roster.gsps.edu.sg for more info.
```

Body parameter mapping stays: {{1}} recipient name; {{2}} display date; {{3}} change details only; {{4}} complete signed private timetable URL. New-template change details must not carry the old appended acknowledgement instruction.

### Prepared replacement with two URL buttons

Candidate name: gsis_timetable_updated_button_v2. Language: en_GB. Category: UTILITY. This draft was submitted through MCP on 21 October as provider template 1009634445543507, with PENDING review state. See item 074 for the submitted contract and receipt.

```text
*Your timetable for today has changed*

Hi {{1}}, your timetable for today, {{2}}, has updates.

Specifically, the changes are:
{{3}}

Please use the buttons below to view your updated timetable alongside your usual timetable and acknowledge this update.

Thank you.
Access https://roster.gsps.edu.sg for more info.
```

Add two URL buttons, in order: “View Detail” and “Acknowledge”. Body parameters remain {{1}} recipient name, {{2}} display date and {{3}} change details only. Each button has its own URL suffix parameter carrying the same private timetable capability. Candidate view URL: https://roster.gsps.edu.sg/external.html#{{1}}. Candidate acknowledgement URL: https://roster.gsps.edu.sg/external.html?action=ack#{{1}}, opening/focusing the top acknowledgement control without submitting it. These URL contracts are drafts pending Meta acceptance and a mobile transport check; each button placeholder is separate from body {{1}}. See item 069. Use synthetic non-authorising examples for review, never real teacher links.

Opening either button displays the teacher's published timetable. It does not acknowledge receipt. The teacher uses the explicit acknowledgement control in the first action row on the page; the Acknowledge URL focuses this control, as specified by item 069. Signed teacher/date scope, repeat access and normal expiry remain unchanged. The public Roster link at the end is for general information and must not replace the teacher's private button destination.

### Approval and integration requirements

1. Keep the existing configured template and in-text URL in use. Prepare the timetable template first; the wider seven-template audit in item 062 remains recorded for future work.
2. Both new templates and fixed-text edits require Meta review before use. Obtain actual APPROVED status before activation. The repository's historical PENDING field is not a live approval check. A separate replacement avoids interrupting the currently used template during review.
3. Put the paragraph break and merged acknowledgement instruction in the approved fixed BODY. Preserve the existing normalization of dynamic fields; do not reintroduce newlines or tabs inside {{3}} to force the desired layout.
4. Update exact body hashes, body/button parameter counts, approved-component matching and sender construction together when implementation is authorised. Keep the final information line inside BODY unless an explicitly supported component contract is introduced.
5. The current sender infers a private capability from body-field names. A button contract must declare its private-link purpose explicitly even when the private URL is absent from body fields. Otherwise the button could incorrectly receive the general public Roster URL.
6. Handle existing queued summaries that already contain the generated acknowledgement sentence. Remove only the exact known generated suffix for the replacement template; preserve lesson text, old-template behavior, durable job identity and audit history. Do not mutate stored historical messages to hide duplicates.
7. Verify the inline draft produces one separate instruction paragraph and one information closing line. Verify the button draft reaches the exact teacher/date, keeps signed fragment bytes intact and supports repeated access before and after acknowledgement. Then validate the approved replacement with an authorised test recipient before switching routine sends.

Source evidence: shared/roster-operations.js publication notification construction appends the current acknowledgement sentence; notification-worker/template-contracts.json owns the fixed body and body hash; roster-update/public/_worker.js templateContractMatches, parameter sanitation and templateMessage own shape validation and private-link construction. Generated copies must follow their canonical sources in a later implementation.

Meta references checked for this preparation: https://developers.facebook.com/documentation/business-messaging/whatsapp/templates/overview and https://developers.facebook.com/documentation/business-messaging/whatsapp/templates/template-pausing/ . Templates must be approved before sending; editing and resubmitting a live template can make it unavailable while reviewed.

No live template creation, edit, activation, WhatsApp send, runtime code change or Git commit was performed for this request.


## 064: Resilient private timetable access for seven full days

Status: investigated and queued on 21 October 2026, Singapore time. No runtime implementation, commit or live deployment. This changes the lifetime requirement retained by item 060; the v0.8.1d delivery record remains historical.

User reports many expired private timetable links and requests repeated access, expiring only after seven days. Interpret this as a fixed 168 hours from the link's first issuance, not an indefinite or sliding lifetime.

Confirmed source evidence: `shared/roster-operations.js` function `expiry` caps access at the earlier of seven days or the end of the day after the timetable date. Notification jobs and ad hoc teacher links inherit that cap; Worker `templateMessage` uses the job's expiry when signing the URL. The v0.8.1d frontend preserves reusable fragments and there is no server-side one-use token consumption. Worker `externalRoute` currently groups signature, audience, configuration, malformed-token and genuine expiry failures into one invalid-or-expired response. No live evidence establishes which failure caused each reported incident, especially same-morning failures.

Queued requirements:

1. Give timetable-view capabilities a separate lifetime of first issuance plus seven full days, measured by server time. Persist issuance and expiry for the same link/notice identity so refresh, acknowledgement, send retries or reopening do not extend or shorten it. Early publication and delayed dispatch must not inherit an earlier send-job cutoff.
2. Preserve public access without sign-in, teacher/date scope, signed validation and repeated access across browsers. A later publication remains accessible through the valid teacher/date link and requires acknowledgement of the changed published content; opening alone never acknowledges it.
3. Keep notification delivery eligibility and mutual-request approval deadlines separate. The shared expiry helper also controls these operations; changing it globally would incorrectly prolong stale sends or approval actions.
4. Distinguish verified expiry from invalid links and service/configuration failures. Offer retry for recoverable failures and record safe reason codes without logging private URLs or tokens. Keep issuer/verifier origin and signing configuration consistent across deployments. Planned key rotation must retain verification for outstanding valid links or explicitly record revocation.
5. Retain the published data required to render a valid link throughout its seven-day window. Current past-date pruning can remove that data before access expires. Preserve acknowledgement and audit retention independently.
6. Address already-issued links deliberately. Changing new issuance does not alter signed legacy expiry. Prefer a bounded compatibility migration for correctly verified legacy duties links still within signed issuance plus seven days, after validating signature, audience, type and scope. Implement a clear policy/version boundary and coordinate gateway/backend checks. Never revive mutual approvals, invalid signatures, unavailable-key links or links older than seven days; provide a replacement-link path when recovery is impossible.

Acceptance: repeated opening before and after acknowledgement, refresh and fresh-browser access on days two through six, success immediately before the 168-hour boundary and rejection at it, unchanged expiry on retry, legacy migration, later publication, key consistency and data retention. Preserve independent stale-send and mutual-request guards. Investigate real incident reason codes after authorised installation rather than claiming the early cutoff explains every report.

Source locations: `shared/roster-operations.js` expiry, queue, externalLink and pruning operations; `roster-update/public/_worker.js` capabilityFields, createCapability, readCapability, externalRoute and templateMessage; `backend/RosterOperations.gs` external capability checks; `roster-update/public/external.js`; `WHATSAPP_SETUP.md` signing configuration.


## 065: SMC editing before and after timetable publication

Status: investigated and queued. No blanket publication lock was found; the reported production blocker is not yet isolated to one action or error.

Confirmed source evidence: SMC already has ordinary assignment and correction authority. Before a period starts, published relief can be replaced or removed through working draft records. Assign Relief disables editing once a period starts and points to an audited correction process. Independent backend assignment and publication guards also reject started draft periods. Stapler permits editing a published plan but requires a current revision and editing lease, and validates clashes with published/completed relief. Stale revisions, expired leases and actual conflicts can therefore block edits independently of publication status.

Queued requirements:

1. Let SMC edit, replace, remove and reassign through the same timetable workspace before or after publication. Present any real validation or concurrent-edit conflict directly, with a recoverable next step, rather than a generic published/read-only dead end.
2. Before a period starts, keep working replacements separate from the existing publication. For started/completed duties, expose a compact correction flow in the cell editor with actual teacher, completion state and a short audit reason. Preserve the original record, accounting and correction history.
3. Connect corrections to the effective working timetable and the publication flow. Existing `correctRelief` changes audit/accounting records only; simply exposing it inline would not update the teacher's timetable because publication still reads raw assignments. Handle past-date corrections deliberately rather than silently bypassing ordinary planning date checks.
4. Confirmed workflow under item 067: Save to online saves working changes; Let teachers see replaces the published snapshot. Keep the last publication available until replacement succeeds. Only changed published content should reset acknowledgement and affect notification eligibility. Saving or correcting alone must not send WhatsApp.
5. Preserve other users' edits and validate absence, capacity, source lesson identity and double-booking at commit. Keep local work recoverable after lease loss or a stale revision instead of requiring a full re-entry.

Acceptance: SMC replacement/removal before and after publish, edits spanning period start, started/completed correction with accurate accounting and publication, past-date correction, stale revision and expired/competing lease recovery. Verify both affected and unchanged teachers' publication and acknowledgement behavior.

Source locations: `roster-update/public/roster-operations-ui.js` Assign Relief controls; `shared/roster-operations.js` ordinary assignment operations, correctRelief, publishAssignments, dailyPublication, dailyTimetable and Stapler save; `backend/StaplerLeases.gs`; `roster-update/public/roster-stapler-ui.js` lease and save handling.


## 066: Export Excel from the local working timetable

Status: investigated and queued. The export dependency on saves/network is confirmed in source; the underlying live save failure has not been reproduced or diagnosed.

Confirmed source evidence: `exportRelief` first flushes draft saves and aborts if they fail or remain unconfirmed. It then always requests backend `exportDaily`; full teacher export also calls `localTimetable`, which can fall back to the network. Workbook generation itself already runs locally. Removing only the save flush would therefore not provide offline export.

Queued requirements:

1. Export Excel, Export relief excel and Class POV must use one immutable snapshot of the selected date's local working data captured when the user clicks. Export must not save, flush, refresh, verify online or make an implicit network fallback. Failed, pending or uncertain saves must not block it once the required local data is loaded.
2. Use the effective local allocation projection, including pending/inflight reassignment, cancellation, unassignment, No Relief, combination and uncovered cells. `projectDraft` overlays commands onto `allocationModel.assignments`; exporting raw `s.data.assignments` would miss those edits. Reflect each logical lesson once and preserve baseline, suspension and moved-lesson meaning.
3. Cache the complete export context and workbook dependencies during initial loading. Compact allocation reads do not currently include the precise Stapler plan expected by the teacher/Class POV writers; backend `dailyExport` builds it. Add a complete, revision-scoped local contract rather than guessing missing data on export. Clearly identify any missing prerequisite when a date has never been loaded.
4. Preserve existing workbook layouts and the existing exclusion of relief/custom instructions. Instruction export is not added by this request. Mark output as a local snapshot with selected date, snapshot time, last confirmed online revision and whether changes are unsynced or their save is unconfirmed. Never describe an unsaved local export as a saved or published plan.
5. Keep the snapshot isolated from edits and date navigation while the workbook is being generated. Reuse the existing client workbook writers and prevent background reads from disabling export when a complete local snapshot is available.

Acceptance: force all network requests to fail after loading and generate all three exports. Compare each with the displayed local projection after pending and failed changes, including grouped lessons and removals. Confirm export causes no writes, handles edits during generation without mixed data and preserves established instruction exclusions.

Source locations: `roster-update/public/roster-operations-ui.js` exportRelief, projectDraft and freshness; `roster-update/public/roster.js` localTimetable; `roster-update/public/roster-export.js`; `roster-update/public/roster-stapler-export.js`; `shared/roster-operations.js` dailyExport. Existing export tests document workbook contracts, not the requested offline capability.


## 067: Explicit Save to online with cell comparison and confirmed results

Status: workflow confirmed by the user on 21 October 2026, Singapore time, and queued for implementation. Save to online saves the shared working draft only. Let teachers see remains a separate action that makes the saved timetable official and visible to teachers. This decision does not authorise a code commit or deployment.

User asks whether all local changes should remain local until Save to online is pressed, with a cell-by-cell comparison showing what changed after success.

Label decision confirmed by the user: use "Save to online", "Let teachers see" and "Send WhatsApp" throughout this timetable workflow. These replace the action labels Update online, Publish/Publish Update and Notify respectively. Apply the approved wording consistently to equivalent buttons, menus, dialogs, tooltips, accessibility labels, action-related status messages and help text. Keep normal single spaces. Preserve individual, all-eligible and affected-since-last-publication recipient scopes; "all" must not become every teacher regardless of eligibility. Retained combined controls must name both actions and clearly show their recipient scope. No new combined operation or change to save, publication, acknowledgement or delivery rules is implied by this wording decision.

Plain-language explanation: Save to online shares the working draft with the planning team. Let teachers see releases the saved timetable to teachers. Until publication, teachers continue to see the previous published version. Send WhatsApp sends WhatsApp about the current publication; saving or publishing alone sends nothing unless an explicit combined Let teachers see and Send WhatsApp action is selected. This explanation describes the agreed future workflow, not a claim that it is already implemented.

Confirmed source evidence: Assign Relief already projects edits locally but automatically sends them after about 300 ms, with a maximum delay of 1.5 seconds. Restore, refresh, navigation and other mutation paths can also flush changes. Recovery uses sessionStorage for commands/anchors/inflight requests rather than a complete persistent base/local snapshot. Current retained-choice conflict review is two-way. Stapler edits locally until Save/Confirm but requires an online lease. Existing request IDs, durable receipts, revision checks and validated batches provide useful building blocks; adding a button alone cannot meet this workflow.

Recommended behavior:

1. Scope local editing to timetable planning, including Assign Relief and Stapler. Keep edits local until explicit Save to online. Remove implicit sends within this scope, including timer, restore, navigation, refresh and export triggers. Show local pending count, last confirmed online state and save progress. Absence reporting, acknowledgement, Send WhatsApp and other explicit actions retain their own semantics.
2. Persist the complete local draft and its last confirmed base, scoped to signed-in user, date, baseline and source identity, across refresh/reopen and reconnect. Retain unsent and uncertain requests. Warn clearly when browser storage is unavailable. Do not require an exclusive online lease merely to edit locally; validate and fence the commit when uploading.
3. On Save to online, compare originally loaded values, local choices and latest online values by stable lesson/cell identity. If local equals base, preserve online; if online equals base, apply local; if local equals online, report already current. If both changed differently, show Originally loaded / Your change / Current online with Keep mine / Keep online for each conflict.
4. Preserve unrelated online changes. Treat moves, combined/grouped lessons and linked source/destination cells as one logical change. Recheck the reviewed online revision at commit and validate the complete result for availability, double-booking, capacity and changed baseline/source context. A visual cell comparison alone is insufficient to prevent cross-cell clashes.
5. Validate an agreed working batch before committing it. Current reliefBatch has a 100-command limit and larger queues split across requests; any larger Save to online operation must either have a deliberate atomic transaction design or show confirmed partial results accurately. Do not claim all-or-nothing behavior across uncoordinated service writes.
6. After confirmed saving, show teacher/class, date, period and field with actual previous online value to saved value, actor/time, accepted revision and receipt. Separate Updated, Already current, Kept online and Needs review. Derive success from the server's committed result, not optimistic local state.
7. On timeout, preserve the exact request ID and query its durable receipt before retrying; never duplicate writes or mark uncertain results successful. Edits made while an upload is in flight remain pending after the earlier receipt arrives. Failed updates leave local export available.
8. Confirmed action sequence: edit locally, optionally export, Save to online, Let teachers see, then an explicit Send WhatsApp action. Let teachers see should identify unresolved local changes and require their deliberate update/review rather than silently flushing them. Saving alone should neither change the teacher-visible publication nor send WhatsApp. The user confirmed this distinction on 21 October 2026, Singapore time.

Acceptance: two SMC users editing different cells, the same cell and the same final value; allocator changes; linked/grouped moves; changed baseline; period-start and midnight boundaries; offline editing/export; full draft recovery; failure before commit and lost response after commit; edits during upload; queues over 100 commands; actual committed diffs and unchanged versus changed publication acknowledgement.

Source locations: `roster-update/public/roster-operations-ui.js` draft persistence, scheduling, flush and reconciliation; `roster-update/public/roster-stapler-ui.js`; `backend/RosterOperations.gs` day tokens, prepared transactions and durable receipts; `shared/roster-operations.js` reliefBatch and publication.

### Investigation and later deployment scope for items 064 to 067

The five review skills used were Ponytail, Pstack, Thermonuclear, Vercel and Superpowers. Three independent read-only investigations covered private-link expiry, published editing and local Excel export. Existing mocked tests `roster701-gateway-integration.mjs`, `roster083-external-ack-gateway.mjs` and `roster714-export-ui.cjs` passed during investigation. They exercise current behavior and do not verify these proposed changes or live service health.

Future implementation is expected to touch Roster frontend and Deploy backend, including generated shared copies. Item 064 also affects capability issuance/verification in the Pages gateway and generated notification Worker; include that deployable if its generated source changes. Items 065 to 067 alone do not inherently require a separate notification Worker update. Rebuild and return only actually changed deployables after explicit authorisation, with cumulative suite-merge notes. No code was committed, no package was built, and no live timetable, template, deployment or notification was changed for this changelog request.


## 068: Faster concurrent morning planning for SMC

Status: source investigation and recommendations queued on 21 October 2026, Singapore time. The user asks how to improve morning speed, concurrency and freedom to change allocations. These are proposed additions to items 061 and 064 to 067, not an instruction to implement, commit or deploy. The approved labels remain Save to online, Let teachers see and Send WhatsApp.

### Findings that set the priorities

1. Teacher private views and SMC saves share the script writer lock. `backend/RosterOperations.gs` rosterServiceDispatch_ takes it before the externalDuties path fetches Contacts, builds context and reconciles. This creates a contention path when teachers open morning links, even though their main purpose is to read a published timetable. It is a source-confirmed mechanism, not a measured diagnosis of each live delay.
2. Selected-day tokens already reduce global revision conflicts, but rosterOperationsDependencies_ still hashes almost the whole operational state for most prepared operations. Acknowledgements and records outside the affected planning scope can trigger preparation retries. Not every different-date record is irrelevant: weekly quotas and accounting can affect today's assignments.
3. Prepared relief batches, publication, notification and optimisation already calculate outside the writer lock. Some other high-traffic mutations, including new absences, instructions, corrections and Stapler writes, still construct context and reconcile while holding it. Operational persistence still replaces one complete JSON document. Separate date locks or concurrent replacements of that same document would risk lost updates.
4. The browser's checkFreshness skips refresh when operationsDirty is true. Keeping drafts local for longer under item 067 would therefore hide colleagues' saved changes unless shared-state refresh is separated from the local draft. Current periodic checks are about once per minute; faster polling of the same full read path would increase load.
5. Manual, published, completed and mutual assignments are already protected from automatic reshuffling. Auto-allocate is already fill-only, and scheduled reoptimisation ends at 06:29:59 Singapore time. Candidate ranking already runs locally. These features should be reused, not rebuilt or described as missing.
6. Let teachers see currently publishes the saved draft changes for the whole selected date, regardless of which SMC created them. Existing required human-change review is concentrated on first publication. With several planners, later release must also make colleagues' saved changes visible for review.

### Recommended order of work

1. Prioritise item 061's published snapshot read path. Validate the private capability and serve a consistent teacher-scoped published snapshot without holding the writer lock for ordinary viewing. Keep authoritative acknowledgement writes short, preserve publication identity and use a controlled legacy fallback. This improves both teacher access and SMC save availability.
2. Narrow each operation's dependency check to its actual planning inputs. Retain relevant teacher/period availability, the target changes, weekly accounting, quotas, rules, baseline and source identity. Acknowledgement traffic should not force an allocation preparation retry unless that operation genuinely depends on it. Recheck the final proposed result and preserve the existing serialized merge and durable receipt.
3. Extend the existing prepare, recheck and commit pattern to measured busy operations, beginning with absence submissions and Stapler saves. Perform independent expensive reads/calculation before the writer lock, then revalidate authority, changed inputs, time, applicable lease and domain constraints inside the short commit. Preserve the existing single-document persistence guarantee; consider storage partitioning only if measurements still show a material bottleneck.
4. Add a light selected-date version/change check while SMC is editing. Display who saved which lesson and when, plus new absences that affect current choices. Merge independent confirmed changes into the online base while retaining local edits; flag overlapping or cross-cell teacher conflicts with the current alternatives. Do not autosave, discard local drafts or fetch full-school context for every poll. Coalesce requests, back off on errors, pause hidden tabs and choose refresh frequency from measured load.
5. Reuse local candidate ranking and versioned model caches for fast editing. Reuse the exact date/source context across local changes, update only affected rows/candidate calculations and invalidate relevant availability when online inputs change. Add reviewed multi-period assignment, atomic two-assignment swap and local Undo where useful. The backend already accepts multiple demand IDs, but the current cell UI sends only the selected demand. Treat a swap and linked/grouped lessons as one conflict group, validating the final state rather than leaving half a swap saved. More browser RAM may help these local operations; it cannot remove shared backend lock wait.
6. Apply the confirmed manual-authority policy below. Every SMC manual assignment is protected by default. Explicitly adopting an automatic choice must also protect it, including the same teacher already assigned; reuse the existing protected field and audit history. The exact Keep this allocation control remains an implementation detail, not an extra protection step required after a manual assignment. Genuine invalidation must be flagged for SMC resolution while preserving the decision.
7. Before every Let teachers see action, show the complete selected date's pending shared changes, including author/time and affected teachers, against the last published version. Bind confirmation to the reviewed revision. If another SMC saves during review, refresh the difference before release. Do not imply the action publishes only the current SMC's work or includes another device's unsaved changes. Retain current SMC authority unless the user separately requests a release-owner rule.

### Confirmed policy: SMC manual allocations are authoritative

User decision on 21 October 2026, Singapore time: put SMC manual allocation as "sacred". Protection is the default for a manual decision, not an optional extra step. Clarification: "don't need smc approval for replacement. take clicks in assign relief as truth". An explicit allocation action in Assign Relief is the decision itself; no additional approval workflow is required.

1. Automatic allocation, optimisation, refresh, reconciliation and background updates must preserve a manual SMC assignment. They may suggest alternatives but must not silently replace, clear, move or reclassify it as automatic. Pressing a general Auto-allocate control does not authorise overriding manual decisions.
2. An authorised SMC's assignment action in Assign Relief immediately changes the local working allocation. Selecting a replacement, clearing an allocation or choosing No Relief is the instruction itself. Do not add a replacement approval, unlock step, second confirmation or approval from another SMC or the original author. Sequential manual edits may directly replace earlier manual choices. Keep actor, time and before/after history; capture necessary actual-duty details inline for started/completed corrections without a separate approval stage. Retain the agreed conflict comparison only when another save changed the underlying data concurrently; choosing the resolution is itself the decision.
3. An explicit allocation click selecting an automatic suggestion makes it a protected manual decision, including selecting the same teacher already shown. No second confirmation or separate protection click is required. Merely opening, viewing or filtering a cell does not adopt it. Preserve existing protection for explicit No Relief choices.
4. If new absence, double-booking, baseline change or another constraint makes a manual assignment invalid, retain the original decision and history and visibly mark the unresolved issue. Show the reason and alternatives. Do not silently substitute another teacher or count invalid cover as valid. A valid replacement selected in Assign Relief resolves the issue directly, with no further approval gate. Role checks, current-input validation and necessary audit records remain; show genuine validation errors inline rather than asking users to approve the same replacement again.
5. Preserve unsaved manual edits locally through refresh and reconciliation. Online allocator protection begins when Save to online is confirmed; unsaved edits cannot reserve server state or prevent another user from working. At save, retain manual intent, validate current inputs and review competing human choices. Let teachers see and Send WhatsApp remain separate explicit actions.

Acceptance must include repeated Auto-allocate, scheduled optimisation, refresh/reload, concurrent save, explicit adoption of an unchanged automatic choice, later absence and source invalidation, and deliberate SMC replacement with no extra approval, confirmation or unlock. Verify the replacement appears locally on the allocation click and remains unsent until Save to online. No automated path may silently overwrite a valid manual assignment. Invalid decisions must remain recoverable and visibly unresolved.

This confirms manual allocation authority only. The separate proposal to hold an unassigned lesson and its duration remains open; manual clearing must not silently acquire that additional meaning.

### Earlier open decision: temporarily hold an unassigned lesson

Update: item 073 now interprets the all-SMC-touched requirement to protect explicit manual clears until SMC returns the lesson to automatic allocation. The paragraph below preserves the earlier proposal; a separate timed-hold feature remains outside the agreed scope.

Clearing an assignment currently leaves it available for Auto-allocate. No Relief means no cover is needed and must not be used as a temporary hold. If SMC needs to reserve an uncovered lesson for manual work, recommend a separate Hold for manual allocation action with clear owner/time, persistent uncovered visibility and explicit release. It must affect both scheduled allocation before its cutoff and manual Auto-allocate. Decide hold duration/recovery before implementation; do not silently make every cleared lesson a permanent hold. This is a proposed policy, not approved behavior.

### Evidence and verification for a future implementation

Use existing phase instrumentation for context time, lock wait, lock hold, commit, projection and preparation retries. Compare local interaction time, confirmed save latency and conflict/retry rate under representative morning activity: for example five SMC editors within a total of 30 active users, concurrent absence reporting, teacher view openings and acknowledgements, and allocator activity before its cutoff. Run controlled fixtures first; no production load test is authorised by this request.

Verify independent edits both survive, genuine same-teacher/same-period conflicts remain blocked with a useful explanation, unsaved work survives refresh and uncertain requests, pin/hold behavior is accurate, and publication never includes unreviewed later saves. Performance targets must follow measured baselines; no numerical live speedup or current capacity guarantee is claimed.

Source evidence: `backend/RosterOperations.gs` rosterOperationsDayToken_, rosterOperationsDependencies_, rosterOperationsPreparedDispatch_, rosterOperationsDispatch_, rosterServiceDispatch_, rosterOperationsState_ and rosterOperationsCommit_; `backend/Code.gs` phase instrumentation; `roster-update/public/roster.js` checkFreshness; `roster-update/public/roster-operations-ui.js` local ranking, selected-demand controls and publication review; `shared/roster-allocation.js` protectedAssignment, autoAllocate and scheduledOptimise; `shared/roster-operations.js` manualApply, unassign, reliefBatch and publishAssignments.

Official references checked: Google Apps Script best practices recommends fewer service calls, batched operations and caching (https://developers.google.com/apps-script/guides/support/best-practices). LockService documents mutual exclusion for shared resources (https://developers.google.com/apps-script/reference/lock/lock-service). These are design guidance, not evidence of GSiS live timings.

Review used Ponytail, Pstack, Thermonuclear, Vercel and Superpowers, with independent read-only backend and allocator investigations. No new tests, live roster service calls or performance benchmarks were run for this advice. Only queued documentation changed. Later deployable scope is expected to include the Roster frontend and Deploy backend, with generated Worker changes only where the private-link implementation actually changes that component. Preserve cumulative suite-merge notes and return only changed deployables after explicit implementation authorisation.


## 069: Two WhatsApp teacher buttons and acknowledgement at the top of the private page

Status: requested and queued on 21 October 2026, Singapore time. This updates the button design in items 062 and 063. No template submission, live configuration change, code implementation, commit or deployment is authorised by this changelog request.

User reference: the supplied 100760.jpg is visible in the conversation and shows two native WhatsApp URL-style buttons, View Detail followed by Acknowledge. Adopt those buttons and their order. Ignore the reference message text, teacher name, date and period count. Retain the previously agreed GSiS message wording and closing line; change only the old single-button reference as needed for two buttons.

### Teacher notification buttons

1. Use two native template URL buttons labelled exactly View Detail and Acknowledge, in that order. This supersedes the earlier single Open timetable button draft. Apply to teacher timetable-change/relief-notification templates within the approved integration scope; do not relabel mutual-request approval actions as timetable acknowledgement.
2. View Detail opens the teacher's private published timetable. Acknowledge opens the same private timetable with its top acknowledgement control in focus. Both routes use the same teacher/date capability and fixed seven-day validity under item 064, without sign-in. Generate and reuse the capability consistently for the two destinations rather than issuing different lifetimes.
3. Opening either URL is a view/navigation action only. Record acknowledgement through the explicit acknowledgement action on the page, after the current published content and notice identity are loaded. If a newer publication supersedes the message, display that fact and the current content; never acknowledge an unseen newer version from a stale page or message. Preserve repeat access and idempotent acknowledgement.
4. A proposed view URL remains https://roster.gsps.edu.sg/external.html#{{1}}. The acknowledgement destination needs a non-secret navigation hint before the same signed fragment, for example https://roster.gsps.edu.sg/external.html?action=ack#{{1}}. Both are draft URL contracts pending provider acceptance and transport validation. The hint may only change focus/navigation; it must not trigger a write, substitute a teacher identity or extend expiry. Keep capability bytes out of query strings, paths and logs.
5. Update the template contract, approval matcher and sender together for both buttons and their ordered indexes. Keep three body parameters for name, date and change details, plus a separate URL suffix parameter for each button. Explicitly declare the private-link purpose instead of inferring it from body fields. Preserve existing field sanitation, notification identity, recipient eligibility and delivery reporting.
6. Keep the existing in-text template active until the replacement has actual provider approval and the matching sender/page support is installed. Do not switch routine sending based on the screenshot or a prepared draft. No provider request or WhatsApp test send was made for this item. The earlier inline replacement remains a recorded fallback, not the selected long-term presentation.

### Private page acknowledgement placement

Move the primary acknowledgement button to the first action row above the timetable and duty details. It must be visible near the top when the page opens, including on a phone, with enough teacher/date context to identify what is being acknowledged. Keep the timetable and instructions readable below it; do not require scrolling to the end to find the action.

Use the same notice identity, submission handler and authoritative status as the existing acknowledgement flow. Show loading while the current notice is being checked, prevent submission before valid content is available, show progress during the write and display Acknowledged only after confirmation. Preserve a retry path for failed or uncertain writes and return to pending when the displayed published content changes. Keep Daily Notify's filled acknowledged pill versus grey pending state consistent. This changes placement, not the meaning of acknowledgement.

Acceptance: verify both ordered buttons on the approved template in mobile WhatsApp, correct teacher/date and preserved token fragment, top-page control visibility, focus for the acknowledgement route, no acknowledgement merely from opening either URL, confirmed/pending/error states, repeated access after acknowledgement and exact seven-day expiry. Verify stale-publication rejection and a changed timetable requiring fresh acknowledgement. No actual runtime or mobile acceptance test has been run for these queued changes.

Preparation evidence: prior source investigation under items 062 and 063 and the supplied visual reference. Meta documentation was rate-limited during this follow-up; its official Postman collection lists template call-to-action examples but did not expose enough schema detail to validate this exact two-dynamic-URL contract. Exact button limits/shape, URL acceptance and account approval remain installation gates, not established facts. Reference: https://www.postman.com/meta/whatsapp-business-platform/request/n3jhmr4/create-template-w-image-header-text-body-text-footer-and-2-call-to-action-buttons .

Future deployment scope: Roster private-page assets, canonical notification template contracts and sender/approval validation with generated Pages gateway and notification Worker copies as affected. Backend changes are required only if the chosen implementation alters the acknowledgement protocol. Return only changed deployables after explicit implementation authorisation, carrying this decision into the wider suite merge notes.

## 070: 21 October morning save, publication and notification forensics

Status: investigated and queued on 21 October 2026, Singapore time. The user reported that SMC could not save or publish and supplied a second concurrent user's error. This is investigation authority only. No runtime patch, commit, deployment, publication, message send or live data correction was performed.

### Evidence and scope

Inspected both screenshots locally: image(20261021-001156).png and image(20261021-001234).png. Fetched the operational document at revision 226, with Drive modification time 21 October 2026 08:14:58.599 SGT. All times below are Singapore time. The first screenshot is an exact match to a retained successful publication receipt; the second has no request ID or failed-request log with which to identify the precise conflicting operation.

The operational snapshot was 3,834,332 bytes, SHA-256 f8afcc56e8e8223e2c45d604ba5bb68f9e4b3dc32d06f1cf8f26ae341022bc5e. Current source reviewed was release v0.8.1d, with backend source from v0.8.1c and notification Worker from v0.8.1b. The installed runtime version and Worker invocation logs were not independently obtained. Source reproductions establish the mechanisms in that release; live receipts establish the actual recorded outcomes.

### Confirmed: the red publication message reports a successful publication

At 07:02:14.678, Nurathirah's publication succeeded as publication revision 5, document revision 218. Receipt 44931669-3f20-4475-b9dd-3253aa8697c9 records exactly 33 reused requests, 2 retried, 2 skipped and 5 blocked, matching the screenshot. There were zero newly published assignment rows in this repeat publication.

| Time | Recorded event |
| --- | --- |
| 06:56:06 and 06:56:34 | SMC removal batches saved successfully. |
| 06:57:02 | Four manual assignments saved successfully. |
| 06:58:17 | Song Wee published 18 assignment rows; publication 4 queued 42 teacher notices. |
| 07:02:14 | Nurathirah republished; publication 5 recorded 33 reused, 2 retried, 2 skipped and 5 blocked. |
| 07:05:14 | Zafran republished; publication 6 recorded 25 reused, 2 retried, 7 skipped and 8 blocked. |
| 07:11:02 | A later manual P5 MTL replacement saved as a draft. |

The notification outcome buckets are mutually exclusive within each action. In this implementation, “blocked” counts requests already sending or with an uncertain send result, so the five do not mean five template failures. Existing template-disabled or contract-blocked requests can instead appear in the reused count. The UI marks the entire publication-success toast red whenever the blocked count is nonzero. This wrongly suggests that the publication itself failed.

The 07:11:02 replacement remained unpublished in the fetched snapshot: current allocation revision 61 versus publication 6's allocation revision 60. Therefore some saves and publications succeeded that morning, but it would also be wrong to claim that every later SMC change was visible to teachers.

### Confirmed: an overly broad day conflict traps the other SMC user's local batch

The second screenshot shows “Not saved. The selected day changed. Refresh and review this date before saving.” Its last checked time is 06:47. The exact source is the expectedDayToken check in rosterOperationsPreparedCheck_, not the lock-timeout error.

The token covers selected-day records and the publication revision. A different SMC changing an unrelated lesson, or republishing with no newly published assignment rows, can invalidate the pending batch. The events after 06:47 above are concrete candidates. Without the rejected request's token and timing, no single one can be named as the exact trigger.

An isolated two-editor reproduction confirmed that saving P3 for one editor rejects another editor's previously anchored P2 batch with this exact error, despite the edits involving different cells. Retrying the identical batch fails again. Reading current records and applying the retained P2 choice against a new token succeeds while preserving P3. The rejected batch writes nothing.

Publish, Refresh records and Excel export first call flushDraft. It returns false while this rejected batch has an error, explaining why one failed save appears to disable several unrelated tasks. “Retry the same save” deliberately keeps the original request and stale token; it is appropriate for an uncertain outcome, but does not resolve this definitive conflict. “0 unassigned periods” can include optimistic local choices and is not confirmation that those choices saved online.

Current recovery for this exact definitive error is Review latest and resolve, inspect saved versus retained choices, then apply the intended choices. This is a comparison against current records, not approval by another SMC. Another intervening edit can still cause a new conflict. Keep the tab and retained choices available; current recovery uses sessionStorage. Do not use Discard unless the retained work is intentionally unwanted. Started-period restrictions remain a separate existing limitation under item 065.

Pure acknowledgements, outbox updates and delivery events are excluded from the selected-day token, so they do not directly explain this exact error. Acknowledgements remain included in the broader preparation dependencies, where they can cause recomputation or a preparation retry, a separate performance issue. The last recorded optimiser run was 06:29:54, with none recorded after 06:30. The evidence does not support attributing this error simply to tomorrow's autoallocator.

### Confirmed: morning WhatsApp delivery was substantially delayed

Of the 42 daily notices created at 06:58:17, the snapshot contains 25 WhatsApp read confirmations, 15 delivered confirmations and 2 cancellations. These are the morning batch only; older retained jobs are not counted. WhatsApp read confirmation is not the explicit timetable acknowledgement.

Thirty of the 40 ultimately sent notices accumulated 75 expired, unprepared claims, with up to six such cycles for one notice. Gwendolyn's two unprepared claims at 06:58:49 and 07:02:32 expired; the third claim at 07:04:54 was prepared at 07:05:25, with a send result at 07:05:37 and WhatsApp read confirmation at 07:15:28. This matches the screenshot's “Unsent claim expired; returned safely to queue.”

One teacher's delivery was confirmed at 07:34:35, 36 minutes 18 seconds after publication. That teacher's send-result receipt was saved at 07:36:07. This demonstrates delay; it is not a claim that all provider event timestamps preserve first-delivery time.

The dispatcher claims five jobs together with 120-second leases and processes them serially through backend preparation, provider submission and backend result recording. A failed preparation or result call aborts the loop, leaving later claims to expire. Backend calls allow 25 seconds each and the provider submission 15 seconds. This is a confirmed fragile processing design consistent with the recorded repeated expiries. The exact cause of each interrupted invocation, such as execution termination, lock wait, Contacts latency or transport failure, cannot be determined from the retained operations document alone.

An unprepared expired claim is safe to return to the queue because no send was authorised. A prepared or otherwise uncertain send must retain duplicate-send protection and be reconciled with provider evidence. Do not treat every expired lease as a safe resend.

### Confirmed: contact problems and stale warning state compound the confusion

The two cancelled morning notices are Sarifah (FAJT) and Ros Hamidah (SRE), each with zero send attempts and the reason “Recipient mobile number is missing or invalid. Contact the teacher directly.” Those are the same two jobs retried in the 07:02 and 07:05 publications. Live Contacts reads confirm Mobile No is blank at rows 83 and 106 respectively. Republish/retry cannot repair that missing information.

No provider parameter error is recorded for the 42 morning notices. Historical META_132018 jobs belong to 20 October evening and must not be described as this morning's template failures.

A separate reconciliation defect leaves stale alarms after confirmed delivery. Peiwen's job has WhatsApp read confirmation at 07:20:50 but still retains “Prepared send lease expired…” and an uncertain last attempt. Eight of the 40 delivered/read jobs lack completedAt; seven last attempts remain sending and one uncertain. The delivery callback updates the main job status without consistently reconciling the attempt record or clearing its obsolete active warning. Historical errors should remain in history, while the current status should reflect later authoritative delivery evidence.

### Related manual-authority evidence

At 06:44:41 an SMC user cleared a P1 Form 1R assignment. At 06:44:57 automatic shared-subject reconciliation recreated the same demand and teacher. This was reconciliation, not a post-cutoff optimiser run. It occurred before the second screenshot's 06:47 read, so it is not established as that later save-conflict trigger.

Carry this concrete case into item 068's manual-authority review. Preserve the distinction between a manual replacement, an ordinary clear, No Relief and the still-unapproved temporary hold policy; do not silently turn every clear into a permanent hold.

### Queued corrective work

1. Implement items 067 and 068 using cell-level comparison of original, local and current online state. Merge independent edits automatically, preserve manual choices and surface only genuine conflicts. Keep one authoritative atomic commit, fresh availability checks, request receipts and protection against overwriting another user's work. Do not add a replacement approval step.
2. Separate planning edits from publication metadata for conflict purposes. An unchanged repeat publication must not needlessly invalidate an unrelated pending allocation. Preserve publication audit and idempotent notification intent; do not solve this by removing concurrency validation.
3. Make Refresh and review available while preserving a rejected local draft, show actionable changed cells and authors, and distinguish uncertain-request retry from definitive conflict resolution. Implement local Excel export under item 066 so a save failure cannot block export. Preserve the agreed separate Save to online, Let teachers see and Send WhatsApp actions.
4. Shorten notification claims to actual processing capacity, or renew/hand off them safely; isolate individual dispatch failures so one job does not strand later unprepared jobs. Preserve fresh recipient/publication checks, durable results, bounded retry and uncertain-send reconciliation. Do not blindly parallelise writes to the shared operations document or merely increase every timeout.
5. Add per-phase and per-job diagnostic evidence for queue wait, claim, preparation, submission and result persistence, with safe request references and no capability tokens or full mobile numbers. Use existing timing instrumentation and controlled concurrency fixtures before asserting a performance target.
6. Show publication success separately from notification progress. Replace the ambiguous blocked grouping with clear sending, uncertain, contact-data and template/configuration states. Display truthful totals for queued, delivered/read and failed/cancelled recipients; acknowledgement remains separate.
7. Surface missing/invalid mobile numbers before bulk sending and link the corrective task to Contacts. Repeating an unchanged publication should not present an unchanged invalid contact as a useful recovered send. Require a verified contact correction before a deliberate retry; do not invent numbers or send as part of this investigation.
8. Reconcile successful delivery callbacks with the corresponding attempt and current warning state without losing the audit trail, accepting spoofed events, regressing a later read status or duplicating a send.
9. Include the saved but unpublished P5 replacement in the user's publication review. Do not silently publish it or conflate a successful earlier publication with the latest shared draft.

Acceptance for implementation: concurrent independent allocations both survive; genuine same-cell and teacher-period collisions remain explicit; no-change publication does not disrupt independent drafts; save failure does not block local export or draft-preserving refresh; interrupted batches do not repeatedly strand unsent jobs; prepared uncertain sends are not automatically duplicated; corrected contacts become retryable; successful delivery clears obsolete active alarms; and current saved/published revisions remain distinguishable.

Checks performed: isolated adapter reproduction of independent-edit conflict and recovery; acknowledgement/outbox versus publication token assertions; three existing delivery-lease assertions, 20 recipient-policy checks and 10 manual-dispatch checks. No production load test or Worker-log inspection was performed.

Source locations: backend/RosterOperations.gs rosterOperationsDayToken_, rosterOperationsPreparedCheck_, rosterOperationsDependencies_, rosterServiceDispatch_ and delivery reconciliation; roster-update/public/roster-operations-ui.js projectDraft, sendDraft, flushDraft, resolveDraft and publication feedback; shared/roster-operations.js queueDailyNotices and publication identity; roster-update/public/_worker.js dispatchNotifications; notification-worker/index.js scheduler separation. Review used Ponytail, Pstack, Thermonuclear, Vercel and Superpowers with independent save/concurrency, queue and teacher-view investigations.

## 071: Sarifah's 21 October private timetable and failed notification

Status: investigated and queued alongside item 070. Reference screenshot image(20261021-001544).png shows Sarifah's selected 21 October suspended timetable. No message, acknowledgement, contact correction or publication was performed.

### Result

The saved published private timetable correctly includes the suspended timetable. Her WhatsApp notification was not sent because her Contacts Mobile No is blank. These are separate findings: correct published content does not establish successful delivery or what a teacher actually saw on a device.

| Period | Published teacher timetable |
| --- | --- |
| P1, 07:30–08:00 | Additional published relief: Form-Yusri, 3P, D1-07 (3P), covering Marsita. |
| P2, 08:00–08:30 | Suspended addition: MTL-Razilah, classes 1I, 1P and 1T, F2-16 (1K), ML1. |
| P4–P6 | EL, 5T, C4-18 MCL2, EL PO. |
| P8 | CCE, classes 5C, 5I, 5P, 5R and 5T, E4-10 (5T), ML2. |
| P11–P12 | MTL, the same five classes, E4-10 (5T) and E3-12, ML2. |

All seven periods visible in the screenshot match the decoded published Stapler plan and the published teacher timetable. Stapler draft and published plan are identical at revision 3. The active baseline's even-week Wednesday cells exactly match the stored teacher baseline; P1 and P2 are empty in that baseline. Therefore P2 is a real suspended-timetable addition, while P1 is an additional published relief duty.

The latest day publication is revision 6 at 07:05:14. Sarifah's unchanged content notice originated at 06:58:17 and was retained across subsequent publications. Her daily notification is cancelled with zero attempts; the 07:19:01 relief reminder is also cancelled with zero attempts for the same missing-mobile reason. No acknowledgement is recorded for her.

Live Contacts row 83 identifies Sarifah (FAJT), active Y, staff ID contact-d965c537-ded8-441c-b15b-49eb52c86de2, with Mobile No blank. Do not create or guess a mobile number. A verified number is needed before a deliberate retry, subject to current publication/notification eligibility.

### Verification and limits

Offline execution of the actual dailyTimetable function and private-page renderer against the fetched state confirmed all screenshot periods, the additional P1 duty, blank P2 baseline and rendered MTL-Razilah in the published timetable. The private endpoint's source calls rosterPrivateTimetable_, which includes dailyTimetable; external.js prioritises that daily published timetable over the weekly baseline.

The live private endpoint was not opened because its read path can reconcile and write operational state. No teacher capability was minted, exposed or acknowledged. The evidence proves current saved content and the reviewed renderer's output, not what a forwarded/copied link or a teacher's device displayed at an earlier time.

Queued acceptance: retain this exact Sarifah baseline/overlay/publication case as a regression fixture; a valid authorised private view must show P2 and the published P1 duty, missing-contact status must be explicit in Daily Notify, and WhatsApp delivery, page view and acknowledgement must remain distinct.

### Read-only evidence sources for items 070 and 071

1. [Roster operations](https://drive.google.com/file/d/17RTyB7u6N8J03ueJKOUBu5NxWSlYugJu/view?usp=drivesdk), revision 226, modified 21 October 08:14:58.599 SGT.
2. [Roster register](https://drive.google.com/file/d/1s6UfaBqvSWmIpVBDtW7HyknKCUUQ4fz4/view?usp=drivesdk), revision 5, identifying the active 20 October baseline.
3. [Active baseline model](https://drive.google.com/file/d/166P4aPyz2lpsl0X1ff-ZtxwrbNS_FMKs/view?usp=drivesdk), baseline ID 1d28c523-809c-462d-b2e2-6ca5fbbc8328.
4. [Contacts](https://docs.google.com/spreadsheets/d/1mbKXkgL2L6OOud6aki8CgJsjReYRKxjlkMD3SdhudKI/edit?usp=drivesdk), contacts rows 83 and 106, checked through bounded live reads.
5. [Deploy workbook](https://docs.google.com/spreadsheets/d/1gXyYNbb8tHKDsb3Q3yepLEuc3cjsbbAsfLl7_XACfls/edit?usp=drivesdk), deploy_index revision 190; published 2026 T4 post-PSLE revision 8 and no pendingFieldCommit at inspection. This is a source-manifest check, not a runtime deployment-version check.

The raw operational snapshot remains a private investigation input. This ledger excludes staff mobile numbers, signed private links, provider message IDs and full message bodies. Future authorised implementation must carry these findings into cumulative suite merge notes and return only changed deployables.

## 072: Daily plain-text allocation decision and SMC change trail

Status: requested and queued on 21 October 2026, Singapore time. The user requests a Worker-driven human-readable audit export. Runtime implementation, commit and deployment remain queued under the standing changelog rule. The separately authorised WhatsApp template submission is recorded in item 074.

### Daily file and ownership

Produce one UTF-8 plain-text file per verified school day in the existing school-controlled GSiS hierarchy, using the logical layout GSiS/Roster/Allocation Audit/YYYY/MM/YYYY-MM-DD.txt. Resolve the configured folder identity during implementation; do not create a duplicate GSiS or hardcode a different installation's folder IDs. Reuse one saved Drive file identity for each school date.

The file belongs to the lesson's school date in Singapore time. Evening planning on 20 October for 21 October belongs in 2026-10-21.txt. Later corrections to that date update the same file while recording when the correction actually occurred. A verified school day with no allocation activity should have a short “No allocation activity recorded” entry. Non-school dates must not silently be presented as school-day records.

The file starts with the school date, source and policy versions, latest included event/revision and generation time. Its chronological entries identify automatic runs, accepted SMC changes, publication changes and unresolved gaps. Use plain language, short sentences, named teachers/classes and explicit times. Do not export raw JSON as the human report.

### Explain the decision actually taken

1. Capture the decision inputs at computation and acceptance time: baseline and suspended-timetable revisions, dated demand, absence/availability state, current workload/accounting inputs, enabled rules and configured preference order, manual protections, run type, accepted revision and stable event/request identity.
2. Explain which lessons needed cover, which were exempt by the configured subject/TG policy, which were already covered, and which were preserved as SMC decisions.
3. For each automatic assignment, state the chosen teacher, lesson, period/time, relevant available quota/load values, applicable preference comparisons and the actual reason the accepted plan selected that teacher. Include meaningful exclusion reasons for alternatives and reasons for uncovered lessons.
4. Explain complete-plan tradeoffs. The current optimiser maximises coverage and then compares ordered preference costs across the plan; it does not simply select the first recommendation for every lesson. Do not claim a teacher individually outranked every alternative when the whole-plan constraints determined that choice.
5. Record whether coverage and preference optimality were proved, whether a bounded search stopped, whether the previous draft was retained, whether there was no change, or whether a run paused for missing/unverified inputs. A paused or rejected proposal must not be described as an accepted allocation.
6. Generate explanations deterministically from the captured rules and values. Do not ask an LLM to invent a rationale afterward, reconstruct old decisions from today's mutable inputs, or claim “best” when the solver did not prove it.
7. Preserve compact reusable evidence at run level and references per lesson. Avoid duplicating the complete staff directory and the same candidate facts for every lesson/run in the already shared operational document. Measure storage growth and export time; audit detail must not exhaust the operational store or reintroduce morning latency.

### Include every confirmed SMC allocation change

Record the SMC actor, Singapore timestamp, target school date, lesson identity, readable before/after values, prior and new automatic/manual ownership, saved revision and durable event/request reference. Include assignment, replacement, combination, No Relief, clearing, adoption of the existing automatic teacher as an SMC choice, explicit return to automatic control, committed undo/restoration and changes before or after publication/lesson start. Include relevant recorded warnings and optional notes without requiring a written audit reason.

Capture changes at the server commit boundary for all allocation-changing routes. Do not infer them only from button clicks or the final timetable. A multi-period action must retain its grouping while explaining each affected lesson. A rejected batch or unsaved local click is not an accepted online change; if attempted/rejected operations are reported for diagnosis, label them separately. Retried requests must not duplicate accepted entries.

Record Save to online, Let teachers see and Send WhatsApp as distinct actions where relevant. A saved change is not necessarily published, and publication does not establish notification delivery or actual completion of a relief duty. Preserve old decisions and subsequent changes rather than rewriting the story to match the final allocation.

### Durable export without blocking morning work

Write the necessary structured audit evidence and export intent with the accepted authoritative allocation transaction. The readable Drive file is an asynchronously generated view of that evidence. The Worker should run export independently of planning, teacher notifications and inbox handling, using existing backend authority to access school Drive.

Keep a durable per-date export watermark and file identity, retry failed exports without losing events or duplicating files, and show when the readable export is behind. An export failure must not falsely turn a confirmed allocation save into failure, delay WhatsApp dispatch or remove the audit intent.

Render the chronological file from committed events instead of blindly appending text. Use ordered publication or verified conditional writes so an older exporter cannot overwrite newer content. Format and transfer outside the main operations writer lock; retain only the short checks needed to publish the correct export revision. Skip unchanged dates and coalesce repeated updates.

The text file is a readable audit export, not a tamper-proof authority. Preserve structured audit evidence and source versions, restrict access through the existing school-controlled folder permissions, and coordinate pruning so unexported evidence is not silently deleted. Audit retention is independent of the seven-day private-link lifetime. Do not include mobile numbers, signed private URLs, access tokens, full notification bodies or unnecessary personal absence details.

Historical backfill can report only evidence that exists. Current run records retain aggregate candidates, preferences and solver outcomes but not every per-lesson exclusion or subject/level score. Mark older exports “Limited historical decision evidence” where appropriate; do not fabricate missing reasoning.

Illustrative wording only, not an actual recorded event:

    06:15: Automatic allocation run for 21 October.
    P2, class 1A: Teacher A was assigned. Teacher A was available and had
    verified relief capacity. This choice kept Teacher B available for P3,
    where fewer teachers were eligible. The run covered all required lessons.
    The search reached its limit before proving the best preference match.

    06:48: SMC user changed P2, class 1A, from Teacher A to Teacher C.
    Saved online as revision 125. Teacher C is now an SMC choice.
    Automatic allocation must retain this choice. It is not yet published.

Acceptance: exactly one file per school date; correct target date for evening planning and later corrections; every committed SMC edit included once; failed and uncertain requests represented truthfully; all protected decisions and uncovered reasons visible; correct whole-plan reasoning; no invented historical data; export retry/reordering cannot lose newer entries; no unnecessary work for unchanged dates; and notification/save latency remains independent of text export.

Implementation locations: shared/roster-allocation.js eligibility, ranked, allocationCosts and optimise; shared/roster-operations.js runOptimisation, manualApply, reliefBatch, reconciliation and pruning; backend/RosterOperations.gs authoritative commit and service dispatch; backend/Roster.gs configured Drive helpers; notification-worker/index.js independent scheduled tasks. Expected changed deployables after authorisation include the Deploy backend and notification Worker, plus Roster frontend status/indicator changes under item 073.

## 073: Automatic audit capture and protected SMC decisions without audit approval gates

Status: requested and queued on 21 October 2026. This refines items 065, 067, 068 and 070. Scope is the Roster allocation/publication workflow, including backend checks that otherwise reject the same frontend action. It does not remove authentication or SMC authority checks across the suite.

### Remove audit-related interruptions

Remove required written audit reasons before first publication, extra approval/unlock/confirmation steps for replacing an allocation, and the dead-end redirect to a separate audited correction workflow solely because a lesson has started or the day was published. Preserve optional notes and show relevant warnings inline. Capture who changed what, when and from/to automatically under item 072.

Revise matching frontend and backend rules together. Removing only a popup or disabled button would leave manualApply, unassign, noReliefApply and publishAssignments rejecting the request. SMC must be able to make and save a manual allocation change before or after publication or lesson start through the ordinary workflow.

Keep actual performance/accounting separate. Changing an allocation does not assert that the new teacher already completed relief. Preserve prior published snapshots and actual-duty/correction history; any unresolved actual-performance facts remain explicit instead of being silently rewritten by a timetable change. Mandatory narrative justification must not gate the allocation decision.

Authentication, SMC authority, valid lesson/teacher identities, genuine concurrent human edits, actual incompatible teacher-period collisions and hard employment limits remain validations. Existing supported combinations remain available. Removing audit approval gates does not turn invalid data into valid coverage or remove the automatic allocator's configured eligibility rules.

The user's separate Save to online, Let teachers see and Send WhatsApp choices remain. An allocation click changes the local draft immediately; there is no additional SMC approval for replacement. The server records shared authority when Save to online is confirmed.

### Protect every explicit SMC allocation decision

Use a durable manual-ownership marker scoped to the dated lesson/decision, with actor and time. Assignment, replacement, combination, No Relief and deliberately selecting the same automatically assigned teacher all become protected SMC decisions. Mere viewing, searching, filtering or receiving an automatic recommendation does not.

Show an “SMC choice” indicator with saved/pending state and accessible text. Scheduled optimisation, explicit Auto-allocate, shared-subject reconciliation, refresh and other automatic repair paths must honour the same backend protection. No separate lock click is required. Another authorised SMC may change the choice directly; no approval by the original author is required.

Interpretation of the latest all-SMC-touched requirement: an explicit SMC Clear also becomes a protected empty decision. It remains visibly uncovered and must not be refilled automatically until SMC assigns someone or explicitly returns it to automatic allocation. This supersedes the earlier open decision about whether a manual clear should remain available for automatic refill. It does not turn Clear into No Relief, and does not introduce a timed-hold feature or an automatic expiry of manual ownership.

Provide an explicit return to automatic allocation action when SMC intends to release manual ownership; record that action in the same daily audit. Preserve the real human-conflict comparison from item 067. Unsaved local choices cannot reserve the server or stop other users; keep them intact locally and compare against current online state when saved.

If a protected teacher becomes absent or the source lesson changes, retain the human decision/history, flag the issue, and do not count invalid cover as valid. Automation may flag or suggest; it must not silently substitute another teacher or erase manual intent. A new valid SMC allocation action resolves the choice directly.

Acceptance: manual replacement has no reason/approval/unlock gate; started/published timetable edits can be saved through the same workflow; selecting the current automatic teacher adopts protection; explicit Clear remains uncovered and protected; all automatic and reconciliation paths preserve manual ownership; another SMC can replace it directly; returning to automatic control is explicit and audited; and automatic audit export captures each confirmed change once.

Source evidence: roster-update/public/roster-operations-ui.js started-period controls and publishFromWorkspace; shared/roster-operations.js publishAudit, publishAssignments, manualApply, unassign, noReliefApply and shared-subject reconciliation; shared/roster-allocation.js protectedAssignment and optimise. Current same-teacher early return does not establish manual ownership, and a cleared assignment lacks a durable protected-empty record. These require backend changes as well as frontend indicators.

## 074: Two-button WhatsApp timetable template submitted through MCP

Status: external template submission explicitly authorised by the user and completed on 21 October 2026. Creation and a subsequent detail read both returned PENDING. This is a real review submission, not approval or activation. No teacher message was sent.

Business and Messaging Account: Gongshang Primary. Business ID 1367896852088548; Messaging Account ID 971916692625997. The account's existing gsis_timetable_updated_v1 template, ID 1116798554168000, was confirmed APPROVED before submission. No replacement with the proposed name was listed.

Submitted template:

| Field | Recorded value |
| --- | --- |
| Name | gsis_timetable_updated_button_v2 |
| Provider template ID | 1009634445543507 |
| Language | en_GB |
| Category | UTILITY |
| Parameter format | POSITIONAL |
| Review state on create and detail read | PENDING |
| Provider last-updated time | 21 October 2026, 08:25:05 SGT |
| BODY SHA-256 | c045ccb418e1680e2f528de915ba3897511bd7514eb9941b67f83fab2917c5b0 |

The submitted and read-back BODY is exactly the two-button draft in item 063:

```text
*Your timetable for today has changed*

Hi {{1}}, your timetable for today, {{2}}, has updates.

Specifically, the changes are:
{{3}}

Please use the buttons below to view your updated timetable alongside your usual timetable and acknowledge this update.

Thank you.
Access https://roster.gsps.edu.sg for more info.
```

Ordered button components confirmed by the provider detail response:

1. View Detail: https://roster.gsps.edu.sg/external.html#{{1}}
2. Acknowledge: https://roster.gsps.edu.sg/external.html?action=ack#{{1}}

Examples were synthetic: Example Teacher; 21 Oct 2026 (Wed); P2, 08:00 to 08:30: MTL, class 1A, Room A. Both URL examples use the non-authorising suffix review-example-not-a-valid-private-link. No real teacher capability, mobile number or timetable content was submitted as an example.

[View the submitted template and review status](https://business.facebook.com/wa/manage/message-templates/?waba_id=971916692625997&business_id=1367896852088548).

The existing template and sender configuration remain in service. Do not activate the new template merely because creation succeeded. Before a future authorised cutover, obtain actual APPROVED status, integrate the exact three-body/two-button contract and private capability purpose, update generated sender copies, implement the top-page acknowledgement/focus behavior, and validate mobile URL-fragment transport with an authorised recipient. Opening either button must not itself acknowledge receipt.

The provider accepted the requested two dynamic URL components for review. That establishes the submitted shape only; it does not prove approval, end-to-end button behavior, seven-day capability validity or the completed application changes. No approval-watching automation or future send was scheduled.

At the time of the template submission, only changelog documentation was edited locally. Runtime changes are subsequently included in v0.8.2 as recorded by the release disposition; the pending template is not activated.


## 075: Contacts view add to Google Contacts

Status: Implemented in v0.8.2; local regression and browser checks passed.

A small plus icon column immediately precedes TTb Name. An explicit click adds that visible directory contact to the signed-in user's own Google Contacts using Google consent and People API. Existing matching contacts are reused; uncertain creates are checked instead of blindly retried. Tokens stay in RAM. The directory itself remains unchanged. People API enablement and permission scope configuration are deployment prerequisites.

## 076: Full v0.8.2 release and inbox review

Status: Implemented and verified in v0.8.2.

User authorised the next full GSiS release, v0.8.2, with five coding skills for speed and reliability. Inbox now retains incoming image metadata and captions, displays authorised JPEG/PNG previews through private media storage, and uses conditional thread refresh and indexed contact lookup. No real messages were sent by local verification. The full suite includes all queued component changes and wider merge documentation.

## 077: Teachers view confirmed upcoming Stapler plans

Status: Implemented in v0.8.2; permission and snapshot regressions passed.

Ordinary eligible teachers can open confirmed upcoming plans in view-only mode. The preview is frozen at explicit confirmation; later saved working edits remain hidden until reconfirmed. The current daily published timetable remains the official daily view. No edit, save, confirm, publishing or notification authority is granted by viewing. Retained planner drafts must never restore into a teacher's read-only view.

## 078: Teacher Daily Update grouping and Relief Load restriction

Status: Implemented and verified in v0.8.2.

User supplied two screenshots, inspected locally. Ordinary teachers must not receive or see Daily Update Relief Load. They can view published daily arrangements grouped by Absent teachers or Relief teachers. Absent groups show period, timing, subject, class, venue and relief teacher; relief groups show period, timing, subject, class, venue and absent teacher. Unassigned lessons are visibly marked. Planning controls and working drafts are not part of this teacher view. SMC/Admin retains the operational Relief Load view; the restriction is enforced in the backend as well as the frontend.


## 079: Keep baseline visible below the day's suspended timetable

Status: Implemented and verified in the authorised v0.8.2 release on 21 October 2026.

In Roster Timetable, show the selected day's published suspended timetable first when available. Keep the baseline timetable function and its content visible below it instead of replacing or hiding one view when the other is selected. Retain teacher/class/group navigation and current-date/selection handling. If no suspended timetable has been published, show the baseline normally. A working suspended draft is not a teacher-visible publication.


## 080: Email update recipient settings save and recovery

Status: Implemented in the authorised v0.8.2 patch; focused backend, gateway and browser checks cover persistence and recovery.

The reported 21 October screenshot showed an unconfirmed save. A read-only operational snapshot at 09:11 Singapore time, revision 231, still had no email recipients and no recipient-settings save audit or receipt. Replaying that document locally succeeded; the exact installed failure remains unproven. The investigation must not be described as a confirmed Contacts address, Calendar, plan-validation or document-size fault.

Report settings now use a settings-specific comparison under the commit lock, so unrelated roster activity does not invalidate the save. Concurrent edits to the recipient settings still require review. The browser retains the exact unconfirmed request for the same signed-in account in that tab across reload and reauthentication. Check saved settings explicitly confirms or retries that request without queuing an email. Definitive validation remains visible; unavailable browser storage is disclosed. Sender, address verification and editor permissions remain enforced.

## 081: Daily Notify acknowledgement dashboard

Status: Implemented in v0.8.2 with local DOM and browser verification.

Use the highlighted upper-right space for Teacher acknowledgements: total requiring acknowledgement, acknowledged, pending and percentage progress for the selected published day. The panel stacks above the teacher cards on mobile. Acknowledged uses the filled state and pending the neutral grey state. Counts cover unique eligible teachers across the full day, independent of search text and By Relief Teachers / By Absent Teachers grouping. The current notice acknowledgement is authoritative; WhatsApp delivery is separate. No-publication and zero-recipient states are explicit. Reuse the existing Daily Notify response without extra requests.

## 082: Notify only for changes in periods when the teacher is present

Status: Implemented in v0.8.2 with focused notification and publication regressions.

Do not send Daily Notify to a teacher absent for the entire school day. For partial absence, compare the published timetable against baseline only in periods when the teacher is present. An absence-only difference must not make the teacher eligible. Continue sending necessary cancellation/reassignment or return-to-baseline corrections for present periods when an earlier changed timetable may already have reached the teacher.

Use the same eligibility for individual/all/update actions, queued-send preflight and the acknowledgement dashboard. Newly recorded absences can suppress a queued notice before republishing. Eligible partial-absence WhatsApp summaries omit absent-period rows. Preserve published timetable content, private-page access, delivery history and acknowledgement evidence; do not expose absence reasons through notification metadata.

## v0.8.2 release disposition

Items 061–082 are integrated in the full release. All 489 current scripts passed, followed by affected-suite checks after the final legacy attendance review fix and archive/source/checksum verification on the final package. The five-code-skill review and independent findings/fixes are recorded in VALIDATION.md and the verification archive. Historical queued statuses above describe the time of each request and are superseded by this disposition for implemented code.

The full deployment package includes all five frontends, the three complete Apps Script backends, the separate notification Worker, source, repository history and this wider merge record. The release was committed locally; no live deployment, contact correction, timetable publication or staff message was performed. The new button template was submitted through MCP and remains pending Meta review. OAuth configuration, valid recipient numbers, live delivery and installed school readback remain operational checks, not silently completed work.


## 083: Contacts viewport portable Add Contact file

Status: Implemented for the explicitly authorised v0.8.2a Contacts component patch on 21 October 2026, Singapore time. All 491 current npm test scripts passed; focused browser/serializer checks and independent reviews also passed. The deployment archive records the source commit and passes exact source/hash verification. No live deployment or personal contact write has been performed.

User reports that Add Contact does not work well and asks for a discrete file or prompt that works on both Android and iOS. The installed failure has not been reproduced or attributed to a confirmed cause.

The baseline v0.8.2 plus action added through Google People API. It depends on API/OAuth configuration, consent, popups and network access, checks that the Google account matches the signed-in GSiS account, and scans existing Google contacts before creating. A different personal Google account is rejected. That baseline did not offer a vCard file or device-contact import. This account constraint can cause friction, but is not proof of this user's specific failure.

Accepted UI: keep the column immediately to the left of TTb Name and set its heading to the literal lowercase text "add". Each row shows the text character "+", without the current circular outline or a visible button box. Keep a semantic, keyboard-operable button with an accessible Add to contacts label and visible keyboard focus. Match the surrounding text height; remove vertical padding or minimum-height styling that makes contact rows taller. Add invisible horizontal padding to the left and right of "+" for a wider touch target without increasing row height or overlapping neighbouring cells. The screenshot image(20261021-014329).png was inspected: it shows the existing blank heading and circled plus with excess row whitespace.

Accepted action: pressing "+" generates and exports only that person's standard .vcf contact file on demand. This replaces the Google People API action on the plus control. Generate from the authorised contact data already loaded in the browser, without another data fetch, a People API request or Google Contacts permission. Do not pre-generate files for the entire directory. Include available telephone numbers, email addresses and school organisation; omit absent fields and unrelated HR or access data. Validate escaping, Unicode, international phone formatting and interoperable vCard output.

Use this exact structured contact-name mapping; do not split or reinterpret either source name:

| Contact name field | Value |
| --- | --- |
| Prefix | GSPS |
| First Name | Entire TTb Name value |
| Last Name | Entire Statutory Name value |

Put GSPS in the actual name-prefix field, TTb Name in given/first name, and Statutory Name in family/last name. Leave unspecified name components empty. The formatted display name should reflect the same components in prefix, first-name, last-name order; the receiving contact app can apply its own display or sorting preferences. Do not silently substitute Basic Name, extract a surname, remove titles from source names or append a second GSPS prefix to the first-name field.

Opening the file should use the phone's contact preview/import flow where supported, with Download contact file and short platform instructions as a fallback. Do not promise an identical one-click save prompt across Safari, Chrome, embedded browsers and managed phones. On Android, Google's documented fallback is Contacts > Organize > Import from file, with a destination account choice when multiple accounts exist. Apple's documented iPhone import route opens a .vcf attachment from an email or message. Test actual iPhone and Android browser handoff before calling it verified.

A downloaded/imported contact is a copy, not an automatic sync with GSiS. Repeated imports may create duplicates; do not present the old Google duplicate check or saved receipt as evidence that a device import succeeded. The requested plus action exports a file only. Any separately retained Google API action must not be invoked as a side effect.

Primary references checked: https://support.apple.com/en-vn/guide/iphone/iph356499f31/ios and https://support.google.com/contacts/answer/15147365?co=GENIE.Platform%3DAndroid&hl=en.

## 084: Full v0.8.3 release and Contacts failure investigation

Status: Implemented and verified in the committed full v0.8.3 release on 21 October 2026. Included in the complete suite package; not installed live.

The user reported that v0.8.2a Contacts was not working and requested the full suite as v0.8.3. A read-only live browser check received a v0.8.2 Contacts sign-in page referencing google-contacts.js, without contact-vcard.js. The exact cause of the user's failed attempt remains unproven. The shipped v0.8.2a nested Contacts ZIP was complete and byte-matched its committed source. Real local HTTP tests using synthetic identity/backend responses successfully loaded fresh and restored sessions and exported the selected VCF offline.

A controlled combination of older HTML and newer JavaScript reproduced an uncaught error when the contact-file status region was missing. The fix creates that status region safely and gives visible Reload Contacts guidance when the serializer did not load. The login screen and authenticated header both show v0.8.3. Retain the compact add/+ UI and exact GSPS prefix, complete TTb First Name and Statutory Last Name mapping. No People API or extra Contacts permission is required. Actual native Android/iOS import remains unverified.

Deliver a complete version-aligned suite: five frontend ZIPs, three complete Apps Script backends, the notification Worker, source, repository history, current manuals and verification evidence. Extract the outer package and upload each enclosed frontend ZIP to its existing matching Pages project. The outer suite ZIP and source ZIP are not frontend uploads. Preserve existing school data, secrets and project URLs. No live installation or contact write is implied by the package build.

## 085: Teacher list of confirmed suspensions and Timetable guidance

Status: Implemented and verified in the committed full v0.8.3 release on 21 October 2026. Included in the complete suite package; not installed live.

Normal teachers should see a read-only list of confirmed suspensions, including today and upcoming dates, with helper text pointing to Timetable from the main screen for the published daily timetable. The reported screenshot showed an empty suspension list on 21 October. Source investigation found that the existing confirmed-preview rule excluded dates on or before today and required the teacher to appear in that plan.

Show confirmed dates to active eligible mapped teaching staff, using the frozen confirmed snapshot. Keep newer working drafts private. Preserve SMC editing and approved planning access separately. Place planning-access requests below the confirmed list in a collapsed section. The confirmed preview does not grant save, confirmation, publication, lease or allocation rights. Private absence reasons must not leak through imported lesson subject text or other preview fields.

## 086: Stapler Class inline field arrows

Status: Implemented and verified in the committed full v0.8.3 release on 21 October 2026. Included in the complete suite package; not installed live.

Replace the Class view's Edit tiles entry with compact inline Subject, Venue and Group fields in the style of offline Stapler. Give each field its own apply arrow. Clicking one arrow applies only that field to the class's matching tiles while preserving the other two fields and other tile data. Keep changes in the local editable plan until Save to online. Ordinary teachers viewing confirmed timetables must not receive editing controls or write authority. Preserve undo and established timetable validation.

## 087: Own arrangements beside No relief instructions

Status: Implemented and verified in the committed full v0.8.3 release on 21 October 2026. Included in the complete suite package; not installed live.

Show Own arrangements beside No relief instructions in the editable relief-instructions area, including while preparing a new absence. It must be usable with or without instruction text. Preserve entered text and the No relief instructions choice. Reuse the existing recoverable save before opening the colleague arrangement chooser for the confirmed saved absence. Opening this chooser must not create a peer request, mark No Relief, suppress required cover or discard an uncertain save. Retain current-date, permission and selected-date handling.


## v0.8.3 release disposition

Items 083–087 are integrated with the full v0.8.2 baseline and its earlier suite changes. The local release commit is identified by `refs/tags/v0.8.3` in the included repository bundle and by the full hash in the package maintainer notes. This is the complete suite, not a Contacts-only patch. All five frontend ZIPs, three complete backend sources, the notification Worker, versioned manuals, source, checksums and verification evidence are included.

The full gate passed all 494 current scripts through items 084–086. Item 087 was added afterwards; its fresh final affected gate passed all 16 checks (15 absence/instruction/mutual/recovery tests plus real-browser UI review). The packaged Contacts frontend passed real-HTTP fresh/restored synthetic session checks and actual offline VCF download; all 48 files matched source. Apps Script syntax passed for 75 files. The assembled package passed exact membership, source, asset and SHA256 checks; the final archive is rechecked after including the committed repository bundle. Independent correctness, quality and UI reviews have no unresolved material finding in the inspected scope.

Own arrangements is adjacent to No relief instructions, with or without instruction text. New absences or changed instructions save before the colleague chooser opens. The saved text, No relief instructions choice and relief requirement are retained. Unconfirmed saves use the existing receipt recovery, and opening the chooser sends no peer request.

A temporary Chromium 138 input failure was isolated with a plain HTML reproduction and resolved for verification by using Chromium 153. Both original Inbox tests passed unchanged. No Inbox product fix or weakened assertion is claimed. Native Android/iOS contact import, production Google authentication, installed school save/readback, actual provider delivery and live deployment remain unverified. No staff notification, personal-contact write, school-data mutation or production installation was performed by this build.


# v0.8.4 authorised additions

## 088: Teacher list of upcoming suspended timetable dates

Recorded: 21 October 2026, Singapore time.
Status: Implemented and locally verified in the authorised full v0.8.4 package on 21 October 2026. Not installed live.
Related item: 085, implemented and locally tested in the v0.8.3 package. This follow-up tracks the reported teacher-facing result rather than claiming a new completed implementation.

Teachers must see the dates of confirmed suspended timetables for upcoming school days, ordered with the soonest first. Retain today's confirmed suspension where applicable. The list must be available without planning access and without requiring the teacher to have a lesson in the plan. Access remains read only; unconfirmed working drafts remain private.

Show the helper text beside the list: "To view the published timetable, select Timetable from the main screen."

Evidence: the supplied image(20261021-044059).png was inspected. It shows GSiS Roster v0.8.3, the Confirmed suspensions section, an existing helper pointing to Timetable on the main screen, and the empty message "No confirmed suspensions are available for today or upcoming dates." The screenshot establishes that the list is empty in that session. It does not establish which confirmed records exist or why they are missing.

At implementation, verify the installed frontend and backend versions, confirmed date records and the normal teacher read response before assigning a cause. Keep the distinction between a confirmed plan and the published daily timetable clear. Show an empty state only when the read succeeds and no eligible confirmed dates exist; a failed read must not be presented as an empty schedule.

Acceptance: a normal teacher sees all eligible upcoming confirmed dates even without planning permission or a lesson in those plans; dates are sorted; today's eligible date remains visible; the helper uses the actual Timetable menu label; unconfirmed drafts stay hidden; genuine empty and failed-load states are distinct. No live defect, data correction or production fix is claimed at this changelog stage.

## 089: Report absence speed and responsiveness

Recorded: 21 October 2026, Singapore time.
Status: Implemented and locally verified in the authorised full v0.8.4 package on 21 October 2026. Not installed live.

Review the complete Report absence flow for maximal practical speed, including first open, date selection, lesson and instruction rendering, save, and transition into Own arrangements. Include days when a suspended timetable becomes effective or is updated while the page is open. Profile sequential requests, repeated timetable reads, backend work, decompression and main-thread rendering before selecting changes. Compression alone is not evidence of improved responsiveness.

Keep typing, date navigation and unrelated actions responsive while data loads. Show inline progress and clear pending, failed and confirmed-save states. Reuse available authorised data, batch independent necessary reads and avoid a full timetable reload for each small interaction. Preserve entered instructions and absence details through delayed responses, refresh, recoverable save failures and timetable changes; never silently carry instructions onto a different lesson.

Use the effective timetable for the selected school date under the existing publication policy. Distinguish baseline, confirmed planning previews and the teacher-visible active suspended timetable. Do not treat an unconfirmed draft as active. Ignore obsolete responses from earlier dates or sessions. On a relevant timetable revision, retain local input, identify affected lessons and reconcile only that scope before submission.

Acceptance: compare before and after measurements for cold and warm opens, date switches, first usable controls, instruction rows, save acknowledgement, request count, payload size and memory use. Cover baseline days, suspended days, activation and revision while open, multi-day/partial absence, slow or failed network, mobile use and concurrent editors. Record measured gains and limits; do not claim production speed from local fixtures alone. Apply Ponytail, Pstack, Thermonuclear, Vercel and Superpowers during the later coding review.

## 090: Repair the mobile Own arrangements period picker

Recorded: 21 October 2026, Singapore time.
Status: Implemented and locally verified in the authorised full v0.8.4 package on 21 October 2026. Not installed live.

An explicit Own arrangements click must produce immediate visible feedback and a working mobile-compatible popup, as in earlier Roster versions. The popup lets the teacher select the lesson periods that need colleague cover and choose suitable colleagues. It must work with blank instructions, entered instructions and No relief instructions selected, without changing relief-required status merely because it opens.

Investigate the installed click-to-popup path, prerequisite save and receipt recovery, current saved lesson IDs, candidate loading, permissions and baseline versus suspended timetable data. Do not assign a root cause from the report alone. If a prerequisite save or candidate read is pending, show progress rather than an apparently inactive button; retain typed data on rejection or an uncertain result. An uncertain save must not cause a duplicate absence or request.

Ensure periods, colleague selectors and Submit/Cancel remain reachable on narrow screens with the on-screen keyboard open. Use a scrollable dialog body, clear selection state, keyboard access and sensible focus restoration. Opening or cancelling must not itself send requests or mark No Relief. Submit only the selected periods through the existing explicit action, rechecking current availability and timetable changes. Confirm success before reporting requests as submitted; preserve the selection and explain any conflict or failure.

Acceptance: real mobile browser checks, ordinary-teacher identity, new and saved absences, blank and typed instructions, selected periods, baseline and suspended days, rejected/uncertain prerequisite saves, delayed candidate data, repeated clicks, and a colleague becoming unavailable concurrently. Verify that unselected periods are unchanged and no request is sent merely by opening. Use the five requested UI skills for the later popup design review.

## 091: Prepared compressed timetables and surgical validation

Recorded: 21 October 2026, Singapore time.
Status clarification, 21 October 2026: v0.8.4 implemented compressed snapshots for selected-date Report Absence reads and client reuse. It did not implement a Roster-startup batch covering all applicable timetables through 30 days ahead. That remaining scope is specified and implemented as uncommitted source under item097 below; production installation is not verified.

Have compressed baseline and suspended timetable snapshots ready for reuse by revision instead of rebuilding and downloading the same large data for each interaction. Transfer only data the signed-in user is allowed to read. Identify snapshots by school, baseline identity/revision, date or applicability, suspended revision, schema and access scope. Preserve the difference between confirmed planning snapshots and the active published timetable.

Decompress once and perform timetable composition, period selection, local comparisons and preview updates at the client. Reuse indexed in-memory data where useful; move expensive work off the main UI thread when measurements justify it. Additional device RAM is acceptable within a measured, bounded cache. Prevent cross-account reuse, clear protected data on sign-out, and invalidate affected entries when permissions or relevant revisions change. Do not disclose working drafts or private absence reasons through the cache.

Send a compact patch containing changed cells or records and the expected revisions or prior values. Validate only the changed scope and its affected dependencies rather than repeatedly revalidating or transferring the entire timetable. Those dependencies include linked periods or lessons, teacher and colleague availability, absence rules, permissions, publication state, concurrent changes and protected SMC allocations. Checking changed cell values alone is insufficient to detect a conflicting allocation elsewhere.

Keep the server authoritative at save time. Accept unrelated concurrent changes without overwriting them; return precise conflicts for review. Retain atomic updates, idempotent retries, uncertain-save recovery and audit history. Cached/offline previews must not be labelled saved online or submitted before confirmation. Measure compression, decompression, payload, memory and server cost alongside responsiveness; select a compatible format and fallback based on evidence.

Acceptance: identical baseline/suspended composition and lesson identities before and after optimisation; stale revision detection; concurrent disjoint and conflicting edits; failed transfers and interrupted saves; permission or account changes; suspended activation while open; and correct reconstruction after a cache miss. Reuse existing canonical data/comparison paths where possible. No full-document overwrite, extra approval barrier or weakening of SMC manual-allocation protection is authorised.


## 092: Consecutive periods with one relief teacher, configured in System Config

Recorded: 21 October 2026, Singapore time.
Status: Implemented and locally verified in the authorised full v0.8.4 package on 21 October 2026. Not installed live.

Provide a subject-specific rule in System Config requiring the same relief teacher for a configured number of consecutive periods. Default PAL to three consecutive periods. Keep this separate from the teacher maximum-consecutive-workload setting and from business preference ranking. Admin can edit the existing system configuration; existing access authority remains.

The auto allocator must treat each complete same-class/teaching-group lesson block as a unit. Choose one teacher who is eligible for the entire block, including availability, quota, workload and concurrent allocations. If no teacher can cover the whole block, leave the automatic part unfilled with a reason for review. Do not invent missing lessons or silently split a three-period PAL block between teachers.

SMC manual allocations, including deliberate clear or No Relief choices, remain authoritative. A compatible manual teacher anchors the remaining automatic periods; incompatible or conflicting anchors are kept and flagged for review. Configured rules are recorded with the allocator decision evidence. Verify non-PAL behavior, multiple classes and groups, repeated complete blocks, missing periods, mid-block absence, quota/cap limits, manual anchors and bounded solver runtime.

## 093: Shared backend lock contention and service ownership

Recorded: 21 October 2026, Singapore time.
Status: Implemented and locally verified in the authorised full v0.8.4 package on 21 October 2026. Not installed live.

The user can accept separate Sheets files if that improves concurrency. Inspection confirms the combined Deploy project uses ScriptLock for Deploy, Layout, Roster, notification settlement, Inbox and lease writes. A single .gs file is a packaging decision; the lock belongs to the Apps Script project. Layout already has a separate workbook but still uses that project lock. Roster operational data is saved in a Drive JSON file, and accepted mutations replace that document under the lock. Contacts and Calendar are designed as separate backend projects. Most read paths do not acquire this lock.

Splitting tabs or workbooks alone will not separate script-wide contention. First measure lock wait/hold and service phases, then shorten expensive context reads, cross-service publication and file creation inside critical sections while retaining dependency checks, exact retry receipts and atomic writes. Existing prepared allocation/publication and scheduler paths illustrate preparation outside the lock followed by current-state revalidation.

If operational isolation is warranted, give Roster a separate Apps Script project and sole ownership of its operations document, receipts and notification state. Retain a defined read/publication contract with Deploy/Layout. Never allow two independent project locks to protect writers to the same operations document, since that could lose concurrent updates. The source trace identifies a plausible contention mechanism; production timings are required before attributing the reported save failures to this cause alone.

See docs/GSiS-Concurrency-Assessment-v0.8.4.md for the traced paths and proposed sequence. Platform reference: https://developers.google.com/apps-script/reference/lock/lock-service.

### Item 093 authorised implementation decision

Create one separate Roster Apps Script project, keeping Contacts, Calendar and Deploy/Layout as the other three backend owners. Roster owns its existing operational JSON, baseline register/files, Inbox, request receipts, allocation/publication/notification state, leases and audit export. Keep the existing file/folder identities and published Deploy read dependency; Roster must not recover or write a Deploy transaction.

Build separate complete Deploy and Roster artifacts with fixed roles and fail-closed action/writer guards. New Roster activation requires an explicit enabled flag and the matching owner script ID. The cutover must disable historical Deploy endpoints and old Roster triggers, drain in-flight work and preserve secrets and existing state before enabling the new sole owner. Separate script locks cannot coordinate two writers to the same document. Deliver precise migration/rollback steps and verify role rejection, disabled owner, source reads and entrypoint protection locally. No live installation or measured concurrency gain is claimed from package generation.

## 094: IP Deploy retains the user's table position and focus

Recorded: 21 October 2026, Singapore time.
Status: Implemented and locally verified in the authorised full v0.8.4 package on 21 October 2026. Not installed live.

Changing any table allocation must keep the user near the last interacted row/cell rather than returning to the first row. Preserve table scrolling after DOM replacement and viewport sizing, restore focus to the equivalent logical cell/control, and retain toolbar focus during background redraws. Stable class IDs and teaching-group IDs remain the anchors after edits. Do not restore an old context after a tab/version change or override a new scroll/touch/keyboard interaction. Verify lower-row removal/addition, mobile view, existing picker behavior and background refresh.

## v0.8.4 release disposition

The explicit “commit 0.84” instruction authorised the full v0.8.4 package. Subsequent instructions added PAL same-teacher blocks in System Config, a moderate Apps Script split and IP Deploy scroll/focus retention. Items 088–094 are implemented and locally verified. The package includes five frontends, four complete backends, the separate notification Worker, matching documentation, source and repository history.

All 512 current scripts pass across the completed-source full run (511 pass, one old diagnostic-label assertion) and the final focused rerun after updating that assertion. Runtime source was unchanged for that last correction. Independent correctness/quality/UI reviews and ES2020 syntax checks pass. The package gate verifies archive membership, source parity, checksums, all 62 supplied assets and the manual’s 36 embedded figures. Exact evidence is included.

The Roster backend split is packaged for installation, not activated live. Follow docs/ROSTER_BACKEND_CUTOVER_v0.8.4.md: preserve existing data/secret identities, disable and drain historical writers, then enable only the new Roster owner and route its gateways. No workbook split is needed. Roster retains a serialized atomic document commit; published Deploy dependencies use verified version-bound snapshots with source identity in the audit trail. Production performance and installed delivery remain to be measured.

Existing Meta template approval/activation, provider delivery, Inbox media/folder access and native device contact import remain installation checks. No new automatic morning teacher-notification schedule is implied. No production deployment, school-data mutation, timetable publication, staff message or personal contact write was performed for this release.


## 095: Roster relief pool excludes SENOs and other supplemental timetable staff

Recorded: 21 October 2026, Singapore time.
Status: Implemented and verified for the authorised v0.8.4a component patch. Commit identity is recorded in PATCH.json and the release tag.

The user reported “R not verified” for 22 October after the Apps Script split. SENOs appear in the suspended timetable but are not eligible for relief. The old health check treated any active effective-timetable row without numeric R as an incomplete main pool.

Use current Contacts eligibility and baseline membership rather than the presence or absence of a numeric quota to decide main-pool membership. Exclude ineligible staff and supplemental suspended-only rows from R readiness and automatic allocation, including recess-duty repurposing. Keep their timetable rows and preserve existing manual choices and audit history. An eligible baseline teacher with missing R must still make capacity unverified. Do not manufacture zero quotas or silence source/Calendar failures. Deliberate eligible ad hoc relief activation remains manual-only.

Deliver only the standalone Roster backend and Roster frontend. Keep the v0.8.4 split, backend URLs, data files and secrets. The user explicitly authorised “commit patch 0.8.4a quickly”. No live deployment or staff notification is performed by the package build.


## 096: Record absences independently of baseline timetable availability

Recorded: 21 October 2026, Singapore time.
Status: Included in the authorised v0.8.5 full-suite implementation. The later request to investigate, fix and commit the next full suite authorises implementation and packaging. Final release verification is recorded below.

### Requested behaviour and confirmed decisions

1. Allow a valid absence to be submitted and durably recorded for a date or time without an applicable baseline timetable. A missing timetable must not prevent staff from reporting that they will be absent.
2. Offer full day or a start/end time range when timetable periods are unavailable. The user confirmed both options. Store this original absence coverage independently of lesson or period numbers, in Singapore local time.
3. Initially record these entries without lesson-specific relief instructions. Show a clear saved state such as “Absence recorded. No timetable is available yet. You can add relief instructions through Manage My Own Absence when the timetable becomes available.”
4. Keep the same absence visible and editable through Manage My Own Absence on the main screen, retaining its ID, reporter, original reporting timestamp and audit history.
5. When a valid timetable becomes applicable, automatically include affected lessons in normal relief planning without waiting for the teacher to add instructions. The user explicitly confirmed this behaviour. Instruction entry remains available later through Manage My Own Absence.
6. Resolve the current effective timetable, including an applicable confirmed suspended timetable. Apply the fallback separately to each date in a range that contains both available and unavailable timetable dates.

### Required boundaries

No instructions yet is distinct from no relief required. Preserve the absence's relief requirement; do not set reliefRequired=false merely because a baseline is missing. Keep a clear unresolved timetable state so an empty initial lesson list cannot be mistaken for a completed instruction snapshot.

Resolve stored coverage against the current verified timetable. For a time range, the implementation default is to cover lessons with a positive overlap; a lesson that starts exactly at the absence end time is excluded. Preserve the original times and full-day intent when period timings later change. Do not invent period numbers or silently truncate absence coverage outside the timetable window.

Recording an absence does not verify a school day, approve a baseline, allocate a teacher, publish a timetable or send a changed-timetable WhatsApp. Automatic planning must still obey Calendar verification, applicable timetable rules, normal relief eligibility and subject rules, and protected SMC manual choices. A date with no valid lesson demand remains an absence record only.

Retain authentication, permitted staff categories, ownership, absence reason/type rules, overlap checks, duplicate request protection, atomic saves, cancellation and concurrent edit protection. Preserve the existing rule that past records are view only; this request does not authorise retrospective edits. Timetable-dependent checks must be distinguished from checks that validate the absence record itself.

### Source investigation against v0.8.4a, commit c98d377

The current backend emits periods:[] when no active baseline exists (backend/RosterOperations.gs, rosterOperationsContext_). The domain saveAbsence path then validates a nonempty period selection and rejects the save (shared/roster-operations.js, periods and apply). The Report Absence frontend also disables submission without periods and requires the teacher's timetable cells (roster-update/public/roster-operations-ui.js, drawReport and submitAbsence).

Current saving expands fullDay into period numbers but does not retain full-day intent. Current Manage openEntry treats any lessonSnapshot array, including an empty one, as reusable saved data. Deferred records must fetch the newly applicable timetable and expose its lessons for instruction editing, instead of remaining stuck on an empty snapshot. Use the existing absence record and shared resolution path rather than a parallel reporting subsystem.

### Acceptance checks for implementation

1. Save and reopen whole-day and partial-day absences with no baseline; show confirmed persistence without requiring instruction entry.
2. Save a date range across timetable gaps without dropping dates, duplicating records or assigning invented periods.
3. Add or activate a baseline later; automatically derive eligible relief demand and allow instruction editing on the same absence record.
4. Resolve a confirmed suspended timetable and changed period timings correctly; respect interval boundaries and preserve original coverage.
5. Refresh an initially empty saved lesson list in Manage My Own Absence; keep existing user text, manual allocations and history where applicable.
6. Verify overlaps between whole-day, clock-time and existing period-based records, plus retries, concurrent updates and cancellation.
7. Retain permission and past-record limits; keep automatic allocation/publication blocked where school-day or timetable verification is still missing.

Initial changelog-stage review used Ponytail, Pstack, Vercel, Superpowers and independent Thermonuclear source inspections without changing runtime code. The later v0.8.5 full-suite commit instruction authorised implementation. This release adds durable coverage, mobile fallback reporting and later instruction editing, with final regression evidence recorded in VALIDATION.md.


## 097: Two-stage timetable preload from today through 30 days ahead

Recorded: 21 October 2026, Singapore time.
Status: Implemented and locally verified after v0.8.4a. The later full-suite commit instruction includes this change in v0.8.5 together with item096. No production deployment is performed.

### Confirmed scope and teacher behaviour

After the Roster home icons render, start a background preload for Singapore today through today +30 days, inclusive (31 dates). Install the complete compressed baseline batch first, then request and install the complete compressed suspended-timetable batch. Baseline navigation can begin before the second stage completes. Inline progress does not disable the home icons or other functions.

The baseline stage includes every distinct applicable baseline needed by those dates, with a date-to-baseline map. The suspended stage includes active saved plans within the same window. Verified SMC/Admin users can receive saved working drafts, including plans that have not been confirmed. Ordinary teachers receive only safe, immutable confirmed snapshots. Archived/deleted versions, unsaved browser edits and private absence reasons are excluded. Cached plans never grant edit permission or a writer lease.

When a teacher opens Stapler, show the preloaded confirmed date list immediately, clearly label it while the authoritative complete list refreshes, and retain dates beyond the preload window in the full list. Helper text points to Timetable on the main screen. A cached confirmed Stapler preview remains read-only while fresh access/content is checked. Planning users retain their authoritative list and editor flow.

The user explicitly chose latest confirmed first. Authenticated Timetable therefore shows the newest immutable confirmation for current/future dates even when it is newer than the published version. Label it Confirmed suspended timetable; show the baseline below; exports identify their confirmed source. If publication is at least as recent, retain the published timetable and its relief deltas. Later working drafts do not replace the teacher-visible confirmation. Past unpublished confirmations remain hidden. WhatsApp and private duty pages continue to use the published timetable; viewing a confirmation neither publishes nor sends a notification.

### Implementation boundaries

1. A dedicated read-only backend operation supplies gzip/base64 envelopes, with an explicit plain JSON fallback for clients without native decompression. The browser decompresses and validates each complete stage before installing it, keeps shared immutable baseline models in RAM, and yields between model validations. Reuse the existing selected-date transport and authoritative writes rather than replacing them.
2. Bind the two stages to verified account/role, Singapore date window, baseline register revision and immutable model identities. Bracket each stage with register checks. A source change returns a typed conflict and restarts both read stages once; malformed compressed transport gets one plain read fallback. Neither path replays a write. Operations data is read once for the suspended stage; no writer lock, Calendar lookup or Deploy quota lookup is added by the preload.
3. Enforce explicit decoded-size limits of 64 MiB per stage and 128 MiB combined serialized payload accounting. Actual JavaScript object overhead can be larger. Exceeding a limit is an explicit preload failure with normal per-date reads available; do not silently truncate dates. Production latency and peak mobile memory are not measured by synthetic tests.
4. Scope caches to account, verified role and date. Clear protected caches on logout or access denial, reject late superseded responses, invalidate affected dates after local writes, and use existing online checks for permissions, revisions, calendar/availability and saves. A preloaded timetable-day projection has a 60-second freshness window; expired views recheck the authoritative endpoint. Preloading does not imply that local edits are saved online.
5. Add a source-only synchronisation mode so generated runtimes can be checked without overwriting the existing v0.8.4a release files. The existing package version, commit and deployment artifacts remain unchanged. Regenerate versioned components only after an explicit commit/release instruction.

### Verification and release state

Independent correctness and structural-quality reviews covered backend stage coherence, payload redaction, immutable confirmation selection, browser cache lifecycle and shell integration. Review found and corrected missing typed-error propagation through the real backend response, missing latest-confirmed access for verified nonteaching SMC/Admin users, and incomplete displayed-data removal after a denied background request.

The broad source gate passed 519 of 522 executed scripts initially; all three failures were existing fixture assumptions about the newly added background read/closure state, and all passed after focused fixture updates. The package parity test was deliberately not run because the last authorised release archives remain unchanged. New focused checks cover gzip and fallback, 31-day bounds, source races, role isolation, cache cancellation, real signed backend-to-gateway error recovery, baseline-first loading, future confirmed rendering and teacher Stapler previews. The additional native-browser lifecycle test passes all five scenarios: baseline use while stage two is pending, access denial with late-response rejection, authoritative refresh after 60 seconds, logout during stage one, and role downgrade during stage two. This brings verified source scripts to 523 across the broad run and focused reruns. Exact source preservation evidence accompanies the draft source archive.

Five coding skill families were applied (Ponytail, Pstack, Thermonuclear correctness/quality review, Vercel code review and Superpowers). Five UI skill families informed the existing-component integration; no unrelated visual redesign was performed. No production publication, absence mutation or staff message was sent.


## 098: Sim Lan teaching group draft recovery and MTL filtering

Recorded: 21 October 2026, Singapore time.
Status: Implemented for the authorised v0.8.5 full-suite release.

Investigate the reported attempt to create 3HCL1 and assign Fayth. The cropped duplicate-name error and repeated Retry are reproduced by duplicate group creation inside one unsaved batch. Local validation now rejects duplicate TG names before queuing; server validation identifies the name. Review opens immediately, exposes read errors and lets users correct pending group names without losing their temporary identities, linked teachers or unrelated changes. An uncertain save keeps its original receipt identity. Never automatically merge same-name groups with potentially different scope. IP Deploy search includes subject/family so MTL finds related TG rows.

Read-only live evidence shows 17 accepted Sim Lan assignment edits ending at 18:04:57 Singapore time. The inspected 2027 and 2026 group projections contain no 3HCL1, and the 2027 edit/display fields agree. The original failed browser payload was not available; do not claim the exact click sequence or that a remote duplicate existed. See docs/GSiS-Sim-Lan-Investigation-v0.8.5.md. Mobile Chromium checks immediate Review and retained Fayth assignment after duplicate correction.

## 099: Full-suite read/write, speed and multi-user audit

Recorded: 21 October 2026, Singapore time.
Status: Implemented and audited for the authorised v0.8.5 full-suite release.

Audit Contacts, Deploy, Layout, Roster, Calendar and the notification Worker for dependency reads, client-side manipulation, compression, write granularity, concurrency, receipts and recovery. Fix the reproduced Calendar stale-cache validation race by using a fresh request-local metadata snapshot inside its writer lock. Move the Roster Inbox's remote Contacts lookup before its shared lock while retaining current locked duty/state checks and claim commits. Preserve existing surgical Sheets writes, audit journals, actor-bound receipts and authority checks.

Include item096 absence independence and item097 compressed baseline-first preload. The detailed report records measured synthetic counts and safe next improvements. Roster still replaces its complete operations JSON, and Deploy publication still holds its lock through recoverable cross-service handoffs. Do not claim these constraints were removed or infer live latency from local tests. Existing four-owner backend split is retained; do not repeat a completed Roster cutover.

The explicit instruction authorises the next full-suite source commit and complete release package, version 0.8.5. It does not install production code, change school records, publish timetables or send staff notifications. Final verification and commit identity are included with the release.


## v0.8.5 release disposition

The explicit full-suite commit instruction includes items 096–099 and retains the v0.8.4a item 095 relief-pool correction. All requested source changes in these items are implemented. The package contains five frontend ZIPs, four complete backend sources, the notification Worker, matching documentation, the suite-wide read/write audit, the Sim Lan investigation, verification evidence and committed repository history.

All 529 current source scripts are verified across the 528-pass initial broad run and the successful focused correction of one inherited browser fixture. The corrected fixture accepts intentional missing-timetable coverage while retaining atomic invalid-date/period and exact-retry checks. The full-package gate also passes, giving 530 current scripts including packaging. All 86 Apps Script files parse; all 62 assets and 36 embedded manual figures are verified. Independent correctness and quality reviews have no unresolved blocking findings in the final scope. The final archive is checked again after repository history is included.

The release repairs the reproduced TG draft/Review failure, deferred absence handling, Calendar cache validation and Inbox lock scope. It includes the two-stage 31-date compressed preload and current/future confirmed teacher views. The original Sim Lan failed browser payload remains unavailable, so the precise historical click sequence is not asserted.

Existing v0.8.4 split installations update the same backend owners in place. No live deployment, school-data repair, timetable publication or staff message was performed. Production timing, native-device memory, provider delivery and installation access remain unmeasured. Future measured work includes Roster storage partitioning, shorter recoverable Deploy publication handoffs and conditional transport compression; none of those architectural changes is implied by this release.


## 100: Validated consecutive-block subjects

Recorded: 21 October 2026, Singapore time.
Status: Included in the authorised integrated v0.8.5c patch.

Replace the typed subject in System Config's Same relief teacher for consecutive periods with a native validated dropdown. Use active baseline subjects and current/future confirmed suspended timetable snapshots. Exclude draft additions, stale confirmations, absence markers and annotation-only cells. The server validates fresh data on save. Existing unavailable rules remain visible until replaced or removed; no custom subject or invented PAL option is accepted. Preserve Admin writes, SMC read-only access, manual allocations and exact request retries.

## 101: Ongoing custom notifications with on/off controls

Recorded: 21 October 2026, Singapore time.
Status: Included in the authorised integrated v0.8.5c patch.

Custom notification rules apply across school dates while enabled. Remove the one-date selector and show an accessible On/Off control beside each rule. Existing undeleted rules default to On regardless of their former origin date. Switching Off retains text and level, period, class and teaching-group filters; editing a paused rule does not re-enable it. Keep in-progress form text when another rule is toggled. Preserve existing publication/acknowledgement behaviour, immutable past snapshots and pending-request retry identity. Protect active and paused policies from historical pruning and include all rules in day conflict tokens and cache invalidation.

## 102: Assign Relief defaults to the next school day after 2 pm

Recorded: 21 October 2026, Singapore time.
Status: Included in the authorised integrated v0.8.5c patch.

From 14:00 Singapore time, opening Assign Relief without an explicitly chosen date defaults to the next verified school day. Use Calendar school-day data, including holidays and school closures. Preserve manual date choices, recoverable work and pending saves. Do not change an already open allocation page as time passes. If Calendar cannot confirm the next day, show retry and explicit date-selection recovery rather than guessing or loading another day's allocations.

The user requested that 0.8.5a, 0.8.5b and 0.8.5c be integrated into one next commit. Only the resulting v0.8.5c Roster frontend and standalone Roster backend are packaged. Other components remain v0.8.5; no intermediate a/b deployment is needed.


## v0.8.5c release disposition

Items 100–102 are implemented together in one Roster component patch based on the full v0.8.5 release. All 43 targeted source scripts pass across the related run and focused reruns; all 87 Apps Script sources parse. Independent correctness and quality reviews have no unresolved material findings. The package includes installation instructions, the wider suite merge notes, source delta and committed incremental repository history. Backend-first installation is required. No live deployment, school-data update or staff notification was performed.


## 103: Inline timetable-period loading indicator in Report Absence

Recorded: 21 October 2026, Singapore time.
Status: Implemented and locally verified in the authorised full v0.8.6 release.

Show an inline animated spinner and “Loading timetable periods…” beside the “I'm not available…” button while the selected day's effective timetable periods load, including any applicable suspended timetable. Keep the rest of the page functional. Do not use a modal, backdrop, blur or page-wide interaction block.

Preserve entered data and focus. Guard only actions that depend on the pending periods. Stop the indicator when loading finishes; show an inline explanation and retry on failure. Ignore superseded responses after the selected day, teacher or signed-in account changes.

## 104: Yellow fill for in-progress status updates

Recorded: 21 October 2026, Singapore time.
Status: Implemented and locally verified in the authorised full v0.8.6 release.

Give in-progress status banners a yellow background fill, including the illustrated “Saving for 22 Oct 2026 (Thu)…” message and equivalent loading or processing updates. Use readable dark text with sufficient contrast. Keep the status inline and non-blocking, with existing dismissal controls where applicable. Apply the same treatment to the timetable-period loading status in item 103. Keep completion and error messages distinguishable from in-progress updates.

These entries record requirements only. No runtime code, release package or deployment is changed.

## 105: UT weekly cap must constrain relief load

Recorded: 21 October 2026, Singapore time.
Status: Implemented and locally verified in the authorised full v0.8.6 release.

UT teachers have a maximum weekly workload of 26 periods. A UT teacher who has already reached that cap must have zero available relief load.

The supplied Deploy v0.8.5 Ledger screenshot, for the published 2026 T4 post-PSLE plan, shows Kavitha (UT) (MTL) with Actual total 26, FTT + teaching 22, Weekly cap 26, Duty periods 2, status under load and R 4. The user's expected result for this UT row is R 0. The separate Kavi (BT) (MTL) row is not the reported UT case.

Acceptance and investigation scope:

1. Check the UT calculation against the full workload counted toward its 26-period weekly cap. FTT + teaching of 22 alone must not create four relief periods when the cap-counted total is already 26.
2. At or above the UT cap, return zero available relief load. Below the cap, any positive relief quota must fit within the remaining capacity as well as existing applicable relief rules.
3. Trace which components enter Actual total and the relief calculation, including any existing relief, to avoid omissions or double counting. Verify weekly and fortnightly units before applying the cap, including odd/even week handling.
4. Keep Ledger, exports, published Deploy quota data and Roster's consumed relief quota consistent. Review the under-load indicator for the reported case against the same UT capacity rule. Preserve BT and other employment-category rules.

Source investigation completed against the v0.8.5c repository, whose Deploy component remains v0.8.5. The existing HR Settings > Offload setting is read and applied. Its current meaning is a cap on FTT + teaching only. shared/teaching-rules.js defaults UT to 26 and explicitly excludes non-teaching periods; public/app.js labels the HR setting with that same basis. shared/relief.js calculates capWorkload as FTT + Teaching, then limits R to the smaller of normal relief capacity and cap headroom. Thus 26 minus 22 leaves 4 even when Actual total is already 26.

A read-only synthetic reproduction using the actual shared rule and relief modules confirmed configured cap 26, Actual total 26, counted cap workload 22, headroom 4 and R 4. The existing tests/cap708.cjs explicitly expects that teaching-only cap behaviour. This confirms a mismatch between the encoded cap basis and the user's intended total-workload limit, rather than an ignored HR setting. No live teacher breakdown or installed production code was retrieved.

Keep the existing saved HR Offload limit as the single source of truth. Do not add a second hard-coded UT limit or patch Kavitha's displayed R alone. The queued correction must align the UT cap basis across shared workload/relief calculations, explanations, tests, published quota output and Roster's baseline/suspended weekly headroom checks, while preserving other categories. backend/Relief.gs uses the same relief result for export; backend/RosterOperations.gs and shared/roster-stapler.js also enforce timetable-derived cap headroom. The under-load pill is a separate school-demand benchmark, not a statement of cap headroom.

Independent correctness and structural reviews corroborated the source finding. This entry records the investigation and queues the correction. No runtime code, deployment or published school data has been changed.

## 106: Configurable exclusions from the six-consecutive-period count

Recorded: 21 October 2026, Singapore time.
Status: Implemented and locally verified in the authorised full v0.8.6 release.

In Roster > System Config, add a list of period-matching rules excluded from the six-consecutive-period count. Reuse the fields, wildcard syntax and editor style of the existing rules for periods that do not need automatic relief. Keep this as a separate list with no additional exclusions by default.

A matched period acts as a blank for this count and breaks the consecutive run. Do not remove the slot and join the runs on either side. For example, three counted periods, one matched period and three counted periods form two runs of three. Apply the same interpretation to the day's effective baseline or suspended timetable and to prospective allocations checked by the allocator.

The exemption affects only consecutive-period counting. It does not make an occupied period available, remove a lesson's relief requirement, reduce workload or change the separate no-auto-relief rules. Apply consistent counting in previews and authoritative allocation checks. Preserve existing System Config edit permissions and saved configuration across deployments.

## 107: Toggle verbose Drive text logging

Recorded: 21 October 2026, Singapore time.
Status: Implemented and locally verified in the authorised full v0.8.6 release.

In Roster > System Config, add an On/Off toggle labelled Verbose logging. Default to On, including when an older saved configuration has no toggle value, to preserve current behaviour.

When On, retain the current human-readable logging in the GSiS Google Drive folder, including the school day's allocation decisions and SMC changes recorded by that logging path. When Off, skip generating those verbose text entries and skip creating or appending their Drive text files. Keep existing files. Re-enabling starts logging subsequent events; do not build or replay a backlog for the interval while Off.

Persist the choice and apply it consistently to the worker and other writers of the same verbose daily text log. Allocation, online saves and required operational state must continue to work with logging Off. Preserve existing System Config edit permissions. This toggle controls the optional Drive text output.

Items 106 and 107 are requirements only. No runtime code, release package, live setting or deployment has been changed.

## 108: Spinning overlay while changing Deploy versions

Recorded: 21 October 2026, Singapore time.
Status: Implemented and locally verified in the authorised full v0.8.6 release.

When an accepted version change begins in Deploy, show a visible loading overlay with an animated spinner and text such as Loading version…, identifying the selected version. Keep the overlay visible until that version's data is ready and displayed. Prevent edits to version-dependent content while the switch is in progress.

Preserve existing unsaved-draft and pending-save safeguards. Clear the overlay on success or failure. If loading fails, show a readable error with retry and keep the displayed data and version selector consistent. Ignore superseded responses so an older request cannot replace the latest selected version or clear its loading state.

This overlay applies to Deploy version switching. The previously queued Roster loading indicators remain inline and non-blocking. Changelog only; no runtime code, release package or deployment has been changed.

## 109: Retire WhatsApp Readiness and email delivery issues to Admin users

Recorded: 21 October 2026, Singapore time.
Status: Implemented and locally verified in the authorised full v0.8.6 release.

Retire Roster's WhatsApp Readiness page completely, including its navigation entry, home shortcut, readiness table and page-specific controls. Old links to the retired page should recover to Roster home. Do not replace it with another readiness table.

Move the WhatsApp delivery needs review alert to email for active Admin users with configured email addresses, using the existing email delivery setup. Send a consolidated message with the current issue count, affected records, known cause or status, relevant time and a practical next action. The example count of 4 is dynamic, not a fixed value.

Generate alerts from authoritative delivery/configuration checks in the background, without requiring anyone to open the retired page. A status of Not checked alone is not evidence of failed delivery or successful delivery. Distinguish confirmed delivery issues from a failure of the monitoring process itself.

Send on newly detected or materially changed issues, and on recurrence after resolution. Suppress unchanged repeat alerts from scheduled polls and retries. Verify and reuse existing background diagnostics and email delivery facilities during implementation. Ensure failed email delivery remains pending and retries do not duplicate alerts. Remove the replaced readiness-page alert from the frontend.

Retain underlying WhatsApp sending, delivery-status handling and retry functions. Admin issue emails remain independent of the optional verbose Drive text-log toggle in item 107. Preserve existing recipient permissions and avoid including private timetable access tokens in email diagnostics.

This repeated request is recorded once as item 109. Changelog only; no runtime code, deployment, live settings or outgoing emails have been changed or sent.

## 110: Clean full release and one maintainer handoff plus one user manual

Recorded: 21 October 2026, Singapore time.
Status: Implemented and locally verified in full v0.8.6 following “commit next version”.

The installation ZIP contains exactly twelve files: five complete frontend deployables, four complete Apps Script gCodes, the self-contained notification Worker as text, one human/LLM maintainer guide and one offline HTML user manual covering Calendar, Layout, Roster, Deploy and Contacts. Required runtime assets and licences stay inside the deployables. Historical documentation, source recovery and test evidence remain outside the installation ZIP.

The maintainer guide covers infrastructure, ownership, data and permission contracts, operator competencies, configuration, first-school cold start, school-specific adaptation, verification, upgrades, recovery and maintenance. The HTML manual explains role-appropriate workflows, Save to online / Let teachers see / Send WhatsApp, local drafts, acknowledgement, exports and error recovery. A new school must replace the supplied GSPS domains, school/campus seed data and account settings before activation; the package does not auto-provision a generic school.

The original “changelog only” sentences in entries 103–109 describe the time those requests were recorded. This explicit release instruction supersedes them. No live deployment, school-data modification, publication or staff message is part of this release build.

## v0.8.6 release disposition

Items103–111 are implemented together in full v0.8.6. The implementation queue for these items is cleared. All555 current test scripts are verified across the full source run and focused corrections/reruns; all92 Apps Script sources parse. Independent correctness and structural reviews have no remaining material findings in the inspected scope. Real desktop/mobile browser checks cover the new loading behaviour and the single offline manual. The exact12-member package passes source parity, hashes, component version/role and asset checks.

UT uses the existing numeric HR limit with a total-workload basis, including reserved non-teaching work. Deploy backend must be updated before Roster. Admin issue email uses existing MailApp authorisation and durable duplicate suppression; ambiguous submissions remain uncertain for mailbox reconciliation rather than being resent blindly. Logging Off preserves essential operational state and suppresses optional detailed export without a later backlog.

The installation package contains only deployables/gCodes/Worker text and two authoritative documents. Source history and verification are preserved separately. No live deployment, publication, school-data modification or outgoing staff message was performed. Provider approval/delivery and installed-service acceptance remain explicit operational checks.

## 111: Current relief-duty contacts above Roster Home icons

Recorded during final v0.8.6 integration on 21 October 2026, Singapore time.
Status: Implemented and locally verified in full v0.8.6 before the release commit.

Show normal text above the Home icons for every authorised teacher, SMC and Admin identifying the SMC staff currently assigned to relief duty. Use the existing verified current Singapore-day SMC Duty Roster; this means duty support staff, not the day's full list of teachers covering lessons. Link the text contacts.gsps.edu.sg to https://contacts.gsps.edu.sg for their contact numbers.

Load the compact name summary after the icons so the Home page stays usable. The server chooses today; selected timetable dates cannot select a different duty roster. Return only current names and safe date/check metadata, not contact numbers or the manager-only duty list. Distinguish no current assignment from an unavailable read, offer retry and reject late/account/day replies. Ordinary teachers gain no duty-edit permission.

## 112: Remove redundant code and data from individual gCodes

Recorded: 22 October 2026, Singapore time.
Status: Implemented in the authorised v0.8.7 source: four Layout-only blocks removed from the Roster gCode. Venue/quota helpers still used by Roster are retained.

Audit each standalone Apps Script deployable and its canonical build inputs for unused modules, duplicate helpers, legacy entrypoints and embedded data outside that backend's responsibilities. In particular, verify whether the Roster gCode needs the complete venue register or layout data. Do not assume all venue information is redundant: preserve venue identities and fields actually needed for timetable composition, relief decisions, validation, notifications and published views.

Trace callers, dispatch paths, triggers, initialization and cross-service contracts before removal. Update the build composition rather than editing generated gCodes alone. Preserve backend role guards, existing resource/property identities, authentication, data migrations and single-writer ownership. Verify retained operations and reject calls belonging to other backends. Record component size changes and any measured runtime gains separately; a smaller source file alone does not prove faster execution.

## 113: One Archify HTML visual explainer of GSiS

Recorded: 22 October 2026, Singapore time.
Status: Implemented in v0.8.7. The validated Archify explainer is embedded in the single HTML user manual.

Create one self-contained HTML visual explainer grounded in the release's actual implementation. Explain how Calendar, Layout, Roster, Deploy and Contacts fit together; the browser/client, gateways, four Apps Script owners, Sheets/Drive and notification Worker; and how identity, timetables, allocations, publication, WhatsApp/email and acknowledgement move through the system.

Show the distinction between Save to online, Let teachers see and Send WhatsApp. Explain local manipulation/caching/compression, precise writes, concurrent-user protection and recovery where implemented. Distinguish implemented behaviour from future proposals and provider-dependent outcomes. Provide accessible labels, readable mobile navigation and an offline view. Use Archify's validated diagram and delivery workflow. Keep the explainer as one HTML file and avoid duplicating the user manual or maintainer guide. Update the full-package membership deliberately when this additional requested document is delivered.

## 114: Close delivery-review alerts after successful Admin email reporting

Recorded: 22 October 2026, Singapore time.
Status: Implemented and locally verified in v0.8.7: exact matching Admin email receipts close active issues while preserving WhatsApp outcomes. Live installation is pending. The earlier four-alert manual repair remains a separate historical action.

Treat successful reporting to the required current Admin email recipients as closure of the corresponding review alert. Keep the underlying teacher WhatsApp outcome, provider errors, attempt history, publication and acknowledgement records intact. Use a distinct reported-by-email receipt/status bound to the exact issue fingerprint, issue revision and successful email jobs. Clear the active review count and corresponding delivery SMC alert only after the required email submissions are recorded successful. Partial, failed or uncertain email submissions remain pending; do not blindly resend uncertain email or teacher WhatsApp jobs.

Suppress the same reported issue on subsequent checks. Reopen a new, materially changed or genuinely recurring issue. Settlement must close only the issue snapshot actually reported, preserving issues that arrive or change while email is sending. Migrate already-sent matching email receipts safely and idempotently. Use the existing Roster owner and writer lock; do not replace the live operational document through a separate Drive writer.

### Verified live investigation

Read Roster operations.json (Drive file 17RTyB7u6N8J03ueJKOUBu5NxWSlYugJu), revision 277, file modified 22 October 2026 at 00:02:00 Singapore time.

| Notification record | Recipient | Duty date | Stored outcome |
| --- | --- | --- | --- |
| 4cc80c28-ae5a-48c8-aca8-58b7d77d46db | Song Wee | 19 October 2026 | SMC alert, uncertain after a prepared-send lease expired |
| 8da3438c-7de5-4194-9509-5385828b10cd | Dorcas | 21 October 2026 | Timetable message, failed after three META_132018 results |
| a31292c8-d54d-42ca-a308-2ff7ab0a9972 | Song Wee | 21 October 2026 | Timetable message, uncertain after earlier META_132018 results |
| db05b950-5384-43ec-89a6-7daa2f6a5877 | Song Wee | 21 October 2026 | SMC alert, uncertain after a prepared-send lease expired |

The review queue contains these exact four issues and no configuration/monitor issues. All six Admin email jobs for review revision 1 have status sent, with recorded submission times from 21 October 2026 23:56:02 to 23:57:07 Singapore time. This is backend email-submission evidence, not proof of inbox delivery or teacher WhatsApp receipt. Four corresponding delivery SMC alerts remain open.

Current code rebuilds review issues from failed/uncertain/blocked outbox rows. Email settlement marks only the email job sent; it does not close the review issue or delivery SMC alert. Deleting the issue array alone would regenerate it. There is no supported administrative closure endpoint. Direct Drive replacement would bypass the backend lock and risk overwriting concurrent absence/allocation/notification updates. No live records were changed, teacher messages resent, acknowledgements fabricated or provider success statuses assigned by this investigation.

The concrete repair scope is the four exact issue records above and their matching delivery SMC alerts, conditioned on fresh matching sent-email receipts under the owning backend lock. Preserve all other state. Backend execution/editor access is needed to install and run that guarded closure safely.

### Completed guarded repair and release merge requirement

The user installed and deployed the receipt-aware filter in rosterDeliveryReviewIssues_, then ran clearFourEmailedDeliveryAlerts through the owning Apps Script backend. The execution log at 22 October 2026 00:32:52 Singapore time reports cleared: 4, remainingReviewIssues: 0, operationsRevision: 282, whatsAppOutcomesPreserved: true, messagesSent: 0. The repair attaches exact-fingerprint adminReviewReceipt records and closes matching delivery SMC alerts without marking WhatsApp delivered, resending messages or changing acknowledgements. A later read of operations revision 294 still has zero review issues.

The installed receipt-aware suppression is merged into canonical source and generated Roster gCode in v0.8.6a. The v0.8.6 source bundle predates this live repair; replacing the backend with unmerged source would regenerate the warnings. Future automatic settlement after successful required Admin email jobs remains outstanding.

Items 112–114 remain queued for source integration after v0.8.6; the four existing alerts have been cleared. No new version or commit is authorised by these changelog entries.


## 115: Confirmed suspended timetable missing from teacher Timetable view

Recorded: 22 October 2026, Singapore time.
Status: Implemented in authorised component patch v0.8.6a following “patch commit”.

All authorised normal teachers can view a confirmed suspended timetable for the selected current or upcoming date through Timetable, independently of publishing relief allocations or sending notifications. Baseline access remains available. Later unconfirmed lesson edits remain private until explicitly confirmed.

### Verified cause and correction to the initial investigation

The 22 October EL EYE plan exists in Roster operations revision 294. Assign Relief selects its saved operational plan, while teacher Timetable requires provable confirmed contents. The record was confirmed at revision 1 on 20 October 2026 at 14:19:51.953 Singapore time. On 21 October at 12:39:57.706, renameStapler changed only the name to EL EYE and advanced the metadata revision to 2. No lesson edit occurred in that intervening revision. The initial finding identified a later updatedAt timestamp but had not yet distinguished this rename from a content edit.

The legacy record had no separate confirmedPlan. The old timestamp equality fallback rejected it after the rename; Stapler nevertheless displayed Confirmed revision 2 by using the draft revision. Calendar loading was secondary to the already accepted baseline response.

### Implemented patch

The shared confirmation selector now recovers legacy contents only when a unique matching confirmation event and complete consecutive rename history establish that no later lesson edit occurred. Recovery retains the original confirmation revision. Missing or conflicting audit evidence, content edits and unsafe identity/date conditions do not expose drafts. A successful recovery reads the existing plan without modifying school data or sending messages.

Rename and subsequent saved edits now preserve the known confirmed snapshot before changing metadata or draft contents. Direct Timetable, Stapler and compressed preload paths use the same recovery rule. Labels use the actual confirmed revision. Unrecoverable legacy confirmations show Needs reconfirmation and clear SMC guidance, without claiming that no suspended timetable exists.

The 22 October live snapshot was reproduced locally with the patch: source confirmed, confirmed revision 1, 104 teacher timetable rows, unchanged state. Deployment of the patched Roster backend makes that proven rename case recoverable without a manual reconfirmation. A plan with missing evidence still needs an authorised planner to review and Confirm it in Stapler.

### Release and verification

The component package contains exactly Roster_Backend_v0.8.6a.gs and Roster_Frontend_v0.8.6a.zip. Other suite components stay at v0.8.6. Install the backend first by updating the existing Roster deployment, then deploy the Roster frontend and reload the browser.

Focused checks cover rename recovery, missing/duplicate/mismatched history, multiple renames, later private edits, normal-teacher access, current/upcoming dates, compressed batch reads, durable saved-plan reload/replay, actual browser labels and preserved email-report receipts. Independent correctness and structural reviews found no remaining material issue in the reviewed scope. Provider delivery and live installed-service acceptance are not asserted by the build.

The installed item 114 receipt filter is included in canonical source and generated Roster gCode so replacing the backend does not recreate the four cleared alerts. Automatic future closure after Admin emails remains queued. Items 112 and 113 remain queued. No live deployment or outgoing staff message was performed by this patch build.

## 116: Apps Script execution failure reported after v0.8.6a

Recorded: 22 October 2026, Singapore time.
Status: Installation error identified from user report; live recovery not yet confirmed. No new runtime patch or commit made.

Reported message: Roster is temporarily unavailable. Use Retry or Refresh to try again. Apps Script returned an execution error. Ask an Admin to check the backend execution log. Reference: d8c1382f-99d4-41ad-870b-cbe64b649db5.

The gateway emits this advice when the upstream reply cannot be parsed as a normal JSON envelope and is an HTML page matching an execution-error pattern. The reference may be the gateway request ID rather than a cached Apps Script diagnostic. It does not establish the underlying exception or that the confirmed timetable patch caused it.

Read-only source investigation and an independent review did not reproduce a load failure. The complete shipped Roster_Backend_v0.8.6a.gs evaluates in a clean local Node VM with doPost, showRosterDiagnostics and the operations module available. Local evaluation does not prove Google runtime execution, project installation or deployment configuration.

Next required evidence: open the owning Roster Apps Script project, select Executions, open the latest failed Web app/doPost execution matching the attempt, and provide its red exception message and source line. showRosterDiagnostics is supplementary because a failure before doPost may leave no cached record. Investigate the actual exception before proposing another patch. No school data or outgoing messages were changed.


### Item 116 follow-up: duplicate full backend pasted into repair file

The user reports accidentally pasting the full v0.8.6a Roster backend into DeliveryAlertRepair.gs. If the main Roster file also remains, both declare the same project-wide constants. Combining two copies of the delivered backend reproduces SyntaxError: Identifier GSIS_BACKEND_KIND has already been declared. This explains an execution failure before the normal Roster handler can respond.

DeliveryAlertRepair.gs was only the one-time helper for the four alerts already cleared successfully at 00:32:52 on 22 October. Its original saved source has been inspected; the main backend does not call it. v0.8.6a already includes the receipt filter needed to keep those exact cleared alerts closed. The repair file can therefore be replaced with a single explanatory comment, while the full v0.8.6a code is kept once in the main Roster file. Save and update the existing web app deployment to a new version, retaining its URL and properties. Do not rerun the one-time repair. Restoring normal live access still needs user verification.


### Item 116 verification update: current profile request succeeded

The user's diagnostic captured at 22 October 2026 06:13:52 Singapore time records a successful authenticated rosterProfile response from v0.8.6a at 06:13:40, with HTTP 200, Contacts HTTP 200 and Drive HTTP 200. Total elapsed time was 3,284 ms, including 2,586 ms for Contacts and 419 ms for the recorded Drive read. This confirms that this current profile request executed successfully. The cached failure was from v0.8.6 at 03:59:19 and is marked historical. This does not establish that the separately failing Stapler dates operation has recovered. Its actual failed execution and source line remain necessary if Refresh dates still fails.

## 117: Faster morning publication and WhatsApp dispatch

Recorded: 22 October 2026, Singapore time.
Status: Implemented and locally verified in v0.8.7: bounded batched transport, separate delivery store, Queue wake and cron recovery. Production cutover and latency observation remain pending.

User reports that Let teachers see and Send WhatsApp together feels slow and asks whether morning WhatsApp sends must be serialised. Different recipients do not require one global serial provider-send loop. Retain short atomic state transitions, safe message ordering for each recipient, current-publication eligibility and durable per-job ownership while introducing measured bounded concurrency.

### Source-confirmed findings

The v0.8.6a dispatcher in roster-update/public/_worker.js processes at most five claimed recipients per invocation, sequentially. Each normal send uses three Apps Script requests: claimNotifications, prepareNotification, and notificationResult, with a Meta request between prepare and result. The worker claims one job only when ready to prepare it, avoiding untouched jobs expiring while earlier recipients wait. The backend checks current routing, publication and eligibility before preparing each send and preserves uncertain provider outcomes rather than blindly retrying them.

These backend state mutations share the Roster script writer lock and commit the operational document. claimNotifications and prepareNotification also obtain service Contacts context before the lock. Simply running many complete current workflows in parallel would multiply backend requests and contention. The scheduled worker runs notification dispatch concurrently with planning, inbox handling and audit export. Source configuration requests a once-per-minute schedule, and other invocations may overlap under job claims; the five-recipient cap is per dispatch, not proof of a global five-per-minute live throughput limit.

The combined publication button waits for fresh Calendar context, Apps Script publication/queue persistence, and the returned Daily Notify projection. It does not wait for actual Meta delivery: dispatch starts via ctx.waitUntil after the backend response. Prepared publication calculates outside the lock, then locks, reloads the operational document, validates/merges concurrent changes, commits the document, unlocks and builds the response. Preparation can retry when its dependencies change. Standalone Send WhatsApp for an already published day skips Calendar and publication reconstruction.

Existing timing fields include calendarMs, backendMs, prepare-state, prepare-context, quota, prepare-reconcile, prepare-apply, lockWait, lockHold, commit, projection and response serialization. No matching live publication/send timings were inspected in this investigation. The user's separate 3.284-second profile request is not a measurement of publication or message dispatch. No speedup factor or delivery deadline is claimed.

Meta's official throughput documentation describes support for multiple messages per second per business phone number; platform throughput does not require a global one-recipient-at-a-time implementation. Account, recipient and provider rate limits still apply. Reference: https://developers.facebook.com/documentation/business-messaging/whatsapp/throughput

### Queued implementation and verification requirements

Measure the current publication and delivery stages separately before choosing optimisations. Preserve an atomic publication plus notification-intent commit, but return a compact durable acceptance receipt and queue counts if response projection is a measured material delay. Keep the page usable with inline progress distinguishing queued, provider accepted, delivered, failed and uncertain; never label queued or accepted messages as delivered. Refresh delivery and acknowledgement status independently.

Design bounded parallel sending to different teachers, initially testing a small pool such as three to five in-flight sends. Reduce repeated backend overhead through bounded batch operations where safe. Claim and prepare only work for available send slots; do not lease the whole morning queue ahead of capacity. Recheck the authoritative publication and recipient eligibility close to send. Keep provider I/O outside the state lock and settle each outcome durably without waiting for an unbounded batch. Bound backend writes and apply backpressure, rate-limit handling and safe retry rules rather than flooding Apps Script with Promise.all over all teachers.

Preserve per-recipient ordering; idempotency across repeated clicks, cron overlap and worker restart; cancellation of superseded publications; existing acknowledgement rules; absent-teacher exclusion; manual quiet-hour bypass and automatic scheduling; and exact-fingerprint Admin email-report receipts. Do not automatically resend an ambiguous prepared send. Verify delayed provider replies, lease expiry, failed result persistence and concurrent new publications without duplicate messages or lost manual allocations. Test realistic morning recipient counts and report measured publication response time and queue completion time separately. Runtime code and release packaging await explicit commit/build instruction.


### Item 117 refinement: maximise permitted, sustainable WhatsApp throughput

User direction on 22 October 2026: optimise aggressively within applicable limits. The earlier three to five concurrent sends is a possible initial measurement point, not the required final throughput ceiling. Target the fastest measured sustainable dispatch allowed by the actual account, phone-number, recipient and hosting limits while keeping normal concurrent Roster work responsive.

Use adaptive bounded concurrency and request pacing coordinated across overlapping dispatches, so individual worker invocations cannot each consume the full shared allowance. Increase throughput when provider and backend timings permit; reduce it on explicit throttling, timeouts, writer contention or growing settlement backlog. Respect Meta account messaging limits, per-recipient pacing and approved-template requirements, plus Apps Script and Worker execution/resource quotas. Do not assume this account has an upgraded published maximum. Avoid arbitrary per-minute pauses while safely processable queued work remains; continue draining within execution budgets with durable continuation where required. Do not claim a delivery-time guarantee for provider or recipient-network delays.

Reduce per-recipient backend round trips and repeated full-state work before increasing provider concurrency. Keep separate budgets for provider sending and shared backend state mutations, retain capacity for SMC saves/publications, and preserve all item 117 protections. Measure accepted-send throughput, end-to-end queue completion, publication response and concurrent SMC save latency. No production traffic or live limits were changed. Official references reviewed: Meta throughput and messaging limits documentation; Google Apps Script service quotas.

## 118: Manual teacher suggestions follow business preferences and deprioritise daily load of eight or more

Recorded: 22 October 2026, Singapore time.
Status: Implemented and locally verified in v0.8.7: configured business preferences and eight-or-more total-period soft demotion in manual suggestions.

Apply configured business preferences to the suggested teachers in Assign Relief, including enabled rule order and applicable same-subject, subject-family/TG and level matching. Reuse the canonical matching, workload and fairness logic rather than create another frontend-only interpretation. This request changes suggestions; SMC selections remain authoritative and protected from automatic replacement. Business preference or workload warnings must not introduce a new manual allocation approval barrier.

Deprioritise teachers who already have eight or more total counted periods on the selected school day. Treat this as a soft ranking rule, not a maximum or ban. Within the same eligibility/override category, teachers below eight should appear before those already at eight or above; apply configured business preferences within those workload bands. Keep established availability facts and override distinctions visible. Teachers at eight or more remain searchable and selectable. Show their current total and a short reason for the lower ranking.

Count teaching, effective relief, combined-cover occupancy and other genuine timetabled duties using the effective baseline or suspended timetable for that date plus current local allocation edits. Count each occupied working period once; exclude blank, free, recess-only and non-working blocked cells. A subject configured as a break for consecutive-period counting does not automatically cease to count toward total daily workload. Use the actual current effective workload for the already-eight threshold and separately show projected workload for the proposed allocation, without double-counting an existing assignment or a combined lesson. A teacher currently at seven does not trigger the already-eight penalty merely because a single proposed lesson would bring the total to eight.

### Source findings and implementation boundaries

shared/roster-allocation.js manualRanks currently uses a fixed comparator over category, tier, weekly remaining R, suitability, fairness, alternatives and rotation. manualModel does not carry the complete saved business preference order/toggles or the matching subject/level profile context needed to follow them. Existing tests deliberately assert independence of manual ranking from saved auto preferences; this contract must be updated explicitly for this new request.

The current displayed manual load is the number of unique base occupancy and assigned periods, with the selected demand removed during evaluation. Base occupancy includes some cells that are non-working for workload purposes. The automatic workload calculation already distinguishes workloadBase, so the new threshold must share that interpretation and distinguish present workload from hypothetical assignment evaluation.

The frontend groups ranked candidates by category and tier after sorting. A new global workload demotion could therefore be undone in the displayed list and disagree with the top-three strip. Preserve final ranking consistently in both presentations and update headings and explanatory text. Do not merely attach an eight-period label to the existing sort.

Local projectDraft updates effective assignments and redraws suggestions, enabling immediate recalculation after Assign, Clear or Combine. Its teacher balance values are not generally recomputed for local cost deltas; manualRanks only restores the selected demand cost. Applying weekly-R business preferences to unsaved edits must account for those deltas against the loaded snapshot without double counting. Carry compact policy/profile data with the existing model and compute locally; avoid a network request on every candidate or click. Invalidate derived ranking when local assignments, timetable, policy or relevant server revision changes.

### Acceptance checks for the future patch

Verify configured preference order and disabled preferences; subject-family/TG and same-level matching; seven, eight and nine current periods; existing and proposed relief; combined duties counted once; non-working cells excluded; consecutive-count exclusions kept distinct from daily load; suspended-day selection; partial absence and present-time occupancy; local assign/clear/reassignment updates; weekly R deltas; consistent top-three and full-list order; and manual selection/protection at eight or more without new approval blocks. Review backend and frontend model version compatibility. These are queued verification requirements, not claims of tests already passed.


## 119: Saving online must remain available while WhatsApp dispatch runs

Recorded: 22 October 2026, Singapore time.
Status: Implemented and locally verified in v0.8.7: notification transport has separate state/locking and SMC local editing remains available. Exact historical live failure remains unproven.

Expected behaviour: SMC can continue local allocation and Save to online while previously queued notifications are delivered. Completing a publication and queue submission may briefly serialize an overlapping action from the same client, but the entire WhatsApp delivery queue must not block editing or saving. Preserve the publication snapshot that a message describes; later local or online changes still require Let teachers see before those changes become teacher-visible.

Both the service notification claim/prepare/result/delivery paths and online allocation saves use the same Roster ScriptLock and operational JSON document. Lock acquisition can time out after eight seconds. Notification progress repeatedly reads and writes the full document, including delivery webhook updates. This establishes a source-level path for saves to be delayed or rejected under contention; it does not establish that contention caused this particular user failure without the button state, exact error or matching timing/execution evidence.

Notification-only writes do not increment the domain revision. Dependency and day-token comparisons exclude delivery/outbox bookkeeping. The current reliefBatch save uses base-cell comparisons and rebasing, so notification progress alone should not create a stale-global-revision failure. Retain these safeguards. Do not remove the shared lock without replacing its protection against lost allocation, publication and notification updates.

Prioritise interactive save responsiveness alongside maximum sustainable notification throughput. Minimise repeated locked work, separate provider concurrency from persistence concurrency, bound delivery update pressure, and retain capacity for human saves. If durable notification state is separated, preserve atomic publication-to-outbox intent, explicit state ownership, idempotent settlement and restart recovery. Do not introduce independent writers to the same operational file. A larger unbounded send pool against the current persistence path may worsen the user's save problem.

Verify an SMC Save to online during a realistically sized dispatch, concurrent delivery webhooks and another SMC edit. Confirm exact per-cell results, preserved local drafts after timeout, safe retry of the same request, and no duplicate messages or lost manual decisions. Capture save latency and lock wait/hold times. The remaining diagnostic question is whether Save to online is disabled or returns an error; the actual message is needed to distinguish client gating, contention and unrelated failure.


### Item 119 frontend findings and focused verification

During a combined publication request, sendPending sets the client busy state and makes Assign Relief inert until the response or error handling completes. After an uncertain publication or notification submission, the retained owner/date pending task can continue to prevent new local edits through enqueueDraft, even after the busy indicator clears. Actual outbox delivery status is not a Save-button condition. The normal Save button is separately disabled for an in-progress local batch, no local changes, a retained save error, or certain allocation refresh states. A different SMC browser does not share this client busy flag.

The backend save lock timeout returns HTTP 503 with Another save is finishing. Retry the same save. The client retains the exact pending request and exposes Retry the same save instead of accepting a fresh ambiguous submission. Preserve request identity and local draft recovery. Release unrelated editing gates after durable queue acceptance and investigate allowing local changes while notification submission is unresolved without replaying or changing the pending publication snapshot.

An independent reviewer ran the existing tests/roster081-day-transactions.cjs suite: all eighteen checks passed, including merging notification-only updates/callbacks and simulated concurrency at one, ten and thirty notification users. These verify transaction behaviour with mocks, not production latency, live contention or the user's current browser state. No runtime code was edited.


## 120: Separate WhatsApp processing from Roster operations

Recorded: 22 October 2026, Singapore time.
Status: Implemented and locally verified in v0.8.7: independent notification state and execute-as-owner UserLock; attendance/allocation retains its single ScriptLock authority.

Roster owns absence, allocation, manual decisions, timetable publication and the corresponding durable notification intent. WhatsApp owns its dispatch queue, claims, send attempts, provider results, delivery/read callbacks and reporting status in a separate durable store with independent concurrency control. Routine transport updates must not acquire the Roster allocation writer lock or rewrite Roster operations.json.

The existing notification Worker already executes separately, but its backend status writes still use Roster's shared state and ScriptLock. Another worker or another file inside the same Apps Script project does not by itself remove that shared lock. Select an implementation with genuinely independent state ownership and locking. Keep one writer/transaction owner per mutable store; do not create two Apps Script owners that both patch the same Roster JSON file.

Persist publication and notification intent together through the owning Roster commit. Hand the intent to the WhatsApp queue asynchronously with a stable idempotency key and an immutable publication reference/fingerprint. A handoff outage must leave the intent recoverable without blocking further SMC saves, losing a notice or publishing an uncommitted plan. Preserve deduplication across repeated clicks, dispatcher overlap and restart. Do not describe the two-store handoff as an atomic distributed transaction.

Keep recipient eligibility, absence rules, current publication supersession, routing authority, quiet-hour policy and acknowledgement requirements authoritative at the appropriate boundary. Superseded queued work must be cancelled and conflicting messages to the same recipient ordered. Explicitly handle the race between a later publication and a message already submitted to Meta; a submitted message cannot be treated as recalled. Failed or uncertain provider outcomes retain their distinct states and require safe reconciliation, not blind resend.

Daily Notify joins publication and delivery/acknowledgement projections for display without copying every transport status back into the Roster file. Genuine business changes, including timetable acknowledgement or an approved mutual arrangement, use narrow idempotent commands to the appropriate owner. Preserve existing public link access, expiry and acknowledgement history. Keep user editing available while notification dispatch proceeds, with inline progress and separate pending/error state for each operation.

Migration must preserve existing sent, delivered, failed, uncertain and in-flight claims, message IDs, attempts, email-report receipts and audit history. Establish one active dispatch owner at cutover; reconcile ambiguous legacy sends without mass resending. Verify concurrent SMC saves during dispatch/webhook bursts, crashes during handoff, repeated queue receipt, new publications, out-of-order callbacks and failure of either track. Measure both notification throughput and interactive save latency. This architecture enables aggressive sending only within the independent track's tested sustainable limits.

Record handoff completion only after durable queue acceptance. Recheck authoritative eligibility immediately before provider submission; an immutable intent alone does not prove it is still current. Authenticate service commands and webhooks, and correlate delivery/acknowledgement events to the exact recipient, publication and send attempt so a late callback cannot acknowledge or overwrite a newer notice.


## 121: Freeze a publication notification batch and dispatch immediately

Recorded: 22 October 2026, Singapore time.
Status: Implemented and locally verified in v0.8.7: frozen publication content, stable job IDs, bounded parallel dispatch and durable optional Queue wake.

When SMC invokes the combined Let teachers see / Send WhatsApp action, create a stable batch from the successfully committed publication. Freeze its school date, publication revision, affected recipient identities, relevant teacher timetable contents, notice fingerprints and message data. The consistency boundary is the successful backend publication commit, not the instant a browser click begins. Unsaved local changes remain outside publication under the existing Save to online workflow. A failed publication must not produce a sendable batch.

Prepare shared timetable comparisons, eligible-recipient selection, template data and per-recipient payloads once for the batch. Use compact immutable data references or compressed payloads where useful. Persist publication and its recoverable notification intent together, then let the independent WhatsApp track durably accept and dispatch the frozen work. Do not reconstruct a live timetable or reload the complete Roster document separately for every recipient. A stable batch ID and recipient-job key make repeated submission and handoff retries idempotent.

Start dispatch as soon as the batch can be processed safely, without waiting unnecessarily for the next minute tick or retaining the current five-recipient-per-dispatch restriction as the target. Use the aggressive adaptive throughput requirement in item 117, with provider sending outside persistence locks and bounded outcome settlement. Return publication and queued counts to the UI promptly after durable acceptance; show ongoing progress inline while SMC continues local edits and online saves.

Keep immutable batch facts separate from mutable job states, claims, attempts, message IDs, delivery callbacks and acknowledgements. Later allocation edits or Save to online do not rewrite, re-render or restart the active batch. A later explicit publication creates a new immutable publication snapshot; create replacement send jobs only if that action also requests WhatsApp. Preserve the original audit history and record supersession of unsent older jobs separately where required to prevent obsolete notices. Order conflicting notices for the same recipient. Messages already submitted cannot be recalled, and an ambiguous submission must not be resent blindly.

This refines the earlier immediate-eligibility-check wording: evaluate timetable and absence eligibility consistently against the committed batch snapshot once, rather than against changing unpublished drafts during delivery. Continue enforcing authenticated dispatch, valid recipient routing, template approval, explicit cancellation/revocation and publication supersession through compact state owned by the notification track. Updates to that compact authority must have a defined version and event ordering; do not use an unversioned stale cache to skip revocation or supersession checks. Existing manual quiet-hour bypass and scheduled-notification policy remain unchanged.

Bind private timetable content, acknowledgement requirement and acknowledgement receipts to the exact publication/notice represented. A later version must be clearly distinguished and an acknowledgement of an earlier notice must not acknowledge the newer notice. Preserve repeated public-link access and seven-day expiry. A frozen batch is a consistency guarantee for message data, not a promise that every recipient is delivered at once; retain per-recipient progress and failure/uncertainty states.

Verify concurrent SMC edits during preparation and dispatch, repeated clicks, crashes before/after queue handoff, partial delivery, new publications before older jobs send, callbacks arriving out of order, and link/acknowledgement version consistency. Measure time to durable publication, first provider acceptance and batch completion, plus concurrent Save to online latency. These are future acceptance requirements; no new performance claim or runtime verification is made by this entry.

A frozen batch does not override the standing rule against notifying fully absent teachers. If a recipient becomes fully absent before submission, propagate a narrow versioned suppression event to the notification track and skip that job without rebuilding the batch. Preserve the applicable present-period change test for partial absences. Capture the skip reason in the delivery ledger.


## 122: Show publication timestamps for SMC reference

Recorded: 22 October 2026, Singapore time.
Status: Implemented and locally verified in v0.8.7: SMC publication date/time and revision displayed in Singapore time.

Show the recorded publication date and time to SMC in Daily Notify and the relevant Assign Relief publication status. Use a clear absolute Singapore timestamp with seconds, for example Published 22 Oct 2026, 06:42:18 SGT. This is a display example, not a live publication record. Keep the timetable's school/duty date separate from when it was published. Last checked and Save to online timestamps must remain distinct from Published.

Each frozen notification batch and its status/history should carry the publication timestamp it represents, allowing SMC to identify which release is sending, completed or superseded. Use the authoritative backend publication record and retain the same timestamp across refresh, retry, delayed handoff and delivery callbacks. Do not substitute the browser clock, latest edit time, notification send time or refresh time. Reuse existing publishedAt data where available; preserve stable publication revisions and batch IDs internally because timestamps alone are not unique.

Show Not yet published when there is no publication. If a legacy publication exists without a reliable timestamp, show Publication time unavailable rather than inventing one or implying it is unpublished. Verify advance publications where the publication date differs from the timetable date, multiple publications on the same day, timezone formatting and timestamp persistence across notification retries. No new implementation or test completion is claimed by this entry.


## 123: Optimise absence reporting before deciding on a separate Apps Script owner

Recorded: 22 October 2026, Singapore time.
Status: Implemented and locally verified in v0.8.7: absence context preparation outside the lock, fresh locked merge, exact retry receipts and compact responses. The attendance authority remains unified. Thirty simultaneous stale-snapshot submissions were simulated without lost writes or duplicates.

Recommendation: complete the selected WhatsApp separation first, then shorten the critical absence-save path while retaining consistent attendance/allocation ownership. Measure concurrent reporting and SMC saves before adding a separate absence project. Absence reporting and assignment planning share genuine business invariants: newly absent teachers must not remain eligible cover, changed/cancelled absences alter relief demand, own arrangements and instructions depend on affected lessons, and publication must reflect the attendance version it used. Two independent Apps Script projects patching the same operational JSON file would introduce independent script locks and lost-update risk, not a sound performance improvement.

### Source-confirmed performance target

saveAbsence does not use the prepared-outside-lock dispatcher currently used by publication, notifyDaily, reliefBatch and allocation. The generic write path takes the Roster ScriptLock first, then reads operations state, loads dated timetable context, reconciles, applies the absence, updates associated derived records/notification intents, and rewrites the full operations document. Normal absence reporting already avoids the full Deploy R quota lookup. A timetable with TG data can still cause a subject catalogue read from Deploy inside the locked context build. Compact report/entry reads and compact post-save projection exist, but compact read context is not applied to the save itself.

Prepare immutable reference data and timetable interpretation outside the writer lock. Keep only fresh identity/ownership, overlap and command-idempotency checks, changed attendance and necessary affected-allocation invalidation, audit/receipt and durable notification intent in the commit path. Revalidate the relevant attendance, timetable and instruction dependencies before commit; do not move stale decisions outside the lock without checking them again. Avoid unnecessary school-wide reconciliation on each report. Return a compact durable absence receipt promptly and load optional colleague suggestions and rich presentation afterward. Timetable gaps must continue to permit recording an absence with no relief instructions and later editing via Manage My Own Absence.

Use the existing compressed client timetable transport and local manipulation for responsive date/period selection, while preserving authoritative write validation. An optimistic UI or local-only cache is not evidence that the absence was saved. Keep retry identity and report status accurate when the response is uncertain. A queued background derivation must not allow SMC/auto allocation to treat a newly absent teacher as available in the meantime.

### Conditional later separation

If measured contention remains after these changes, evaluate an independently owned absence intake store/service. It would durably record the report and an ordered change event, then feed allocation through idempotent processing with visible received/processed state. Existing reports, edits and cancellations need stable IDs and revisions; allocation and publication must detect unapplied absence events or compare the attendance version before accepting work. Protect privacy, access rights, own arrangements, instructions and audit history. Never claim all consequences are synchronised merely because intake accepted the report. This adds migration, monitoring and failure-recovery duties and is not authorised for deployment by the present feasibility question.

Measure report screen load, receipt latency, lock wait/hold, SMC save latency and stale-attendance prevention under realistic concurrent school usage. No production timing or throughput claim is made. Google's Apps Script guidance supports minimising external calls and batching operations; project count alone does not establish better speed. References: https://developers.google.com/apps-script/guides/support/best-practices and https://developers.google.com/apps-script/reference/lock/lock-service


## 124: Faster repeat loading through persistent authorised caches and changed-data refresh

Recorded: 22 October 2026, Singapore time.
Status: Implemented and locally verified in v0.8.7: authorised persisted compressed snapshots, baseline-first reuse and changed-date refresh. Online role/manifest validation remains required; no production load-time guarantee is claimed.

The supplied screenshot reports time needed for the first login separately from ten-second repeated loading and shows the Roster home screen. It does not establish which requests consumed the reported duration. Measure first authentication, an already signed-in home reload, internal navigation and Report Absence opening separately. A cache does not replace sign-in or current access rights.

### Verified existing behaviour

Roster persists up to eight immutable baseline models per verified account/role in IndexedDB. Report timetable snapshots use compression and known-key unchanged responses, but their cache is in memory. The current-day-through-day-30 preload exists, sends gzip-compressed baseline first and authorised suspended plans second, and decompresses at the client. Its stage results remain in memory and each stage is sent in full; there is no persisted batch manifest or changed-date synchronisation. Local invalidation and full profile loading can clear broader caches than the changed date requires.

Home waits for configuration/session checking, then a fresh profile before showing normal icons. Profile is already small, but its backend path calls Contacts for current authority and reads the timetable register. Eight principal feature scripts total approximately 918 KB uncompressed and are loaded before the main Roster bootstrap; actual transferred bytes and parse time were not measured. Some feature code can be deferred. The bulk timetable preload already starts after icons paint, so it must not be presented as the proven cause of the initial home delay.

Existing knownModelIds and report snapshot keys reduce some transfer. allocationVersion returns a small token but still reads/unpacks the full operational document, and a changed token triggers a full allocation view. A small response by itself is not a cheap server check.

### Recommended implementation scope

Render a lightweight non-sensitive application shell promptly. Reuse valid authenticated sessions and reduce duplicate startup requests; verify present identity/role before restoring protected views. Lazy load feature modules such as exports, inbox and Stapler when needed, while preserving route readiness and keeping the requested timetable preload after icons. Version static assets deliberately and maintain frontend/backend schema compatibility. Investigate login/session delay separately rather than blindly lengthening authentication duration or caching authentication responses.

Extend the existing account-scoped IndexedDB cache instead of introducing a parallel cache framework. Persist eligible immutable baseline and confirmed timetable snapshots for the requested date window. Keep decoded working models in bounded client RAM for quick manipulation. Cache only the datasets the current user is permitted to receive; do not send the whole operational document, other staff's private absence detail, SMC drafts or administrator data to ordinary teachers. Treat each viewport's origin and permissions as a real cache boundary.

Add a genuinely inexpensive authenticated version manifest backed by commit-maintained revision/content identities. Check which datasets or dates changed and fetch only those bounded records/chunks, with explicit deletion and confirmation-revocation handling. An unchanged dataset should not require rebuilding, compressing or transmitting its full payload. Preserve unaffected baseline and suspension stages after local changes. Use a full refresh of the affected dataset only when a cursor, content identity or schema can no longer be reconciled. Avoid creating a fragile universal cell-delta protocol when changed-date or changed-record chunks suffice.

Show permitted cached data quickly after access validation, label the last successful check, and refresh changes in the background with an inline yellow status. Distinguish refreshing, current and unable-to-check states. Do not label stale duty staff or lesson data as verified current. Merge fresh data without discarding local drafts, moving focus or replacing newer local edits. Preserve server-side authority, per-cell/source checks, idempotent requests and durable receipts for Save to online, absence reporting and publication; local display does not establish a saved result.

Key caches by school/origin, verified account, role/authority scope, schema, content revision and date as appropriate. Purge disallowed data on logout, account switch, access revocation or role change, and discard responses belonging to an earlier session. Handle bounded eviction, storage denial, private browsing, corrupt data, midnight rollover and device clocks. Cached confirmation status must not expose a private suspended draft. No blanket service-worker caching of authenticated API responses, tokens or private-link capabilities.

Measure cold and warm first-useful-screen times, requested/transferred bytes, backend calls and client parse/render cost on a representative teacher phone. Verify repeated reload, valid-session reuse, role changes, confirmed plan edits/deletions, background refresh during local drafting and new-version deployment. The ten-second user report is the starting symptom, not a measured root cause or a guaranteed future target. Apply the same cache principles to other GSiS viewports only with their own authority and data ownership preserved.

Reference for displaying cached content while refreshing in the background: https://web.dev/articles/stale-while-revalidate . Cloudflare session management documentation was reviewed to distinguish session lifetime from application data caching; live Access or application-session settings were not inspected or changed.


## 125: Prominent acknowledgement actions and safe concurrent teacher acknowledgements

Recorded: 22 October 2026, Singapore time.
Status: Implemented and locally verified in v0.8.7: shared top acknowledgement controls, exact-notice scoped writes and receipt recovery across publication changes.

Move Acknowledge timetable and instructions to the first visible action row near the top of My Relief Duties, before the published timetable and long instruction text. The acknowledgement section is already early in the page, but the actual per-timetable button currently follows all its timetable rows and instructions. Put the date, publication timestamp and acknowledgement status beside the action; retain access to the full timetable and instructions below. This acknowledges receipt, not proof of reading every row.

Add the same action in the top-middle of the signed-in Roster home screen, above the icon grid, whenever today's published personal timetable requires acknowledgement. Interpret main loading page as this home screen, not the sign-in screen or a blocking loading overlay. Use the school date in Singapore time. The banner must offer View timetable as well as the acknowledgement action and remain usable on mobile. Once accepted, replace the pending action with an acknowledged state. Do not require successful WhatsApp delivery before a teacher can acknowledge an already published notice.

Both locations must share one teacher/date/notice state and mutation helper. Determine pending status from the current eligible published personal notice, respecting absence and correction rules; do not show unpublished drafts. Preserve existing per-teacher notice identity when another teacher's timetable changes. A newly changed personal timetable or relevant instruction update requires a fresh acknowledgement. Corrections returning a teacher to baseline may still require acknowledgement. Bind the click to the notice actually shown; a stale response or old-page click must never acknowledge a later publication. Show the newer notice as pending when superseded.

### Source-confirmed concurrency defect

The signed-in acknowledge command currently goes through the generic write adapter in backend/RosterOperations.gs. Its global revision guard runs before acknowledgePublications and the generic path increments that revision after an accepted new request. Two teachers viewing the same revision can therefore have the first acknowledgement succeed and the second rejected with Relief records changed. Refresh before saving, even when their notices are unrelated. This is a source-level finding, not a claim that the scenario was reproduced against production.

The shared acknowledgePublications domain function already checks ownership and notice identity, rejects superseded notices and deduplicates acknowledgements. The external private-link acknowledgement adapter does not require the same global revision match and commits only when savedIds is nonempty. Reuse these domain guarantees in a scoped authenticated acknowledgement command; do not broadly remove revision protection from unrelated writes. Validate current identity, teacher, school date, exact notice and any genuine dependencies under the authoritative writer. Return a compact durable receipt and current acknowledgement/notice state. Repeated clicks, retries and two tabs acknowledging the same notice must converge without duplicate acknowledgements or unnecessary domain revisions. Avoid the generic register/context read and unrelated reconciliation currently performed inside the signed-in acknowledgement lock; preserve the acknowledgement and its necessary audit/reminder/alert effects atomically within their owner. Do not infer acknowledgement from WhatsApp read status or clicking View timetable; SMC/Admin home controls also represent only that signed-in person.

### Speed, state ownership and UI behaviour

Provide a compact current-user pending-notice projection through the lightweight startup/version work in item 124 where economical, or a nonblocking request after the home icons paint. Do not load every teacher's duties or the full timetable twice merely to render two buttons. Avoid adding acknowledgement work to the initial profile critical path. Reuse the projection and accepted receipt between screens, refresh cheaply on appropriate focus/version changes, and avoid synchronised polling bursts across teachers.

Keep an inline spinner and yellow pending/saving status without disabling the rest of Roster or blurring the screen. Disable duplicate activation for the same notice while in flight; show Acknowledged only after a durable success receipt. Preserve the exact retry identity for uncertain outcomes and recover current status before claiming success. Late responses from an earlier account, date or notice must not replace current state. Share confirmed local changes across same-account tabs where supported, while maintaining server authority. Use semantic buttons, visible keyboard focus, adequate mobile hit areas and stable layout within the existing design system.

Keep acknowledgements as authoritative business events, coordinated with item 120's separate notification ownership. Acknowledge once under one owner and deliver an idempotent event to the notification track to stop reminders; do not perform WhatsApp transport work during the acknowledgement transaction. Shorten the current full-document read/write and lock hold with a compact maintained projection or separately owned acknowledgement ledger only through an explicit coherent ownership design. Merely adding another Apps Script writer over the same operations file is unsafe. Do not claim partial Drive writes or a separate acknowledgement store already exists.

Before release verify simultaneous acknowledgements by different teachers, duplicate clicks/tabs, a publication racing with acknowledgement, unchanged-teacher republication, full/partial absence, baseline-restoration correction, uncertain response retry, midnight and account switches. Confirm SMC saving and WhatsApp sending remain usable during a representative morning acknowledgement burst. Measure request counts and lock wait/hold, not only response size. Five UI review lenses applied to this queued design: established visual hierarchy, shared production behaviour, restrained existing styling, accessible mobile controls and immediate nonblocking feedback.


## 126: SMC and Admin Statistics page with date presets, interactive charts and Excel exports

Recorded: 22 October 2026, Singapore time.
Status: Implemented and locally verified in v0.8.7: restricted Statistics viewport, seven local Excel-exportable tables, interactive charts, explicit coverage and Calendar-backed presets. Historical records already pruned cannot be reconstructed.

Add Statistics to the Roster main page for SMC and Admin only. Enforce the same access restriction at the data API, direct routes and exports, not only by hiding the home button. Ordinary teachers must not receive the underlying absence/reason or staff-wide relief datasets through bootstrap, caches or hidden charts. Use the existing Roster visual system and navigation.

### Shared date controls

At the top provide quick-setting buttons labelled This week, Past week, Past Fortnight, Past Month, Past Term, Past Semester and Past Year, plus editable Start Date and End Date fields. Presets populate these same fields and drive one shared inclusive date range for all sections. Editing either date changes the preset state to Custom. Clearly display the resulting date range and use the configured school timezone, currently Asia/Singapore. Validate start not after end, keep focus stable and cancel/discard stale responses when a newer range is selected.

Proposed default: This week is the current Monday through today. Past week means the previous complete Monday-to-Sunday week; Past Fortnight the previous two complete weeks; Past Month and Past Year the previous completed calendar month/year. Past Term and Past Semester use the previous completed academic term/semester from the school's Calendar configuration, not hardcoded month lengths. These exact preset semantics remain subject to user refinement; show their actual dates so the choice is unambiguous. Missing academic boundaries must show a clear unavailable state while manual dates remain usable. Do not present all-time totals under a selected-range heading.

### Required tables and charts, in page order

1. Total Absences and Relief: first a cumulative summary for the entire selected range, then a by-date table with individual daily values and an interactive bar graph. Offer daily and running cumulative views with explicit units. Do not sum teacher-day absence counts and relief periods as if they were the same measure.
2. Total Absences by Teacher: table first, followed by an interactive horizontal bar graph ranked highest at the top. Provide a clearly labelled count/period metric selector if both are offered, retain zero values where appropriate, and use stable teacher identities rather than names as aggregation keys.
3. Total Relief Duties by Teacher: table first, followed by an interactive horizontal bar graph ranked highest at the top. Use a visible legend and consistent colour semantics for Relief and Combine. Count a teacher's simultaneous combined teaching block once as workload; also retain covered-lesson counts separately if needed for operational analysis.
4. Absence Summary: sortable and filterable table matching the first screenshot's fields: No., Date, Day, Absentee, Absent Periods, Reason and Created At. Date means absence date; Created At is the recorded submission timestamp, shown in Singapore time. Preserve historical names/identities where available, and do not replace original creation time with export/import/refresh time. Support column filters, sorting and search with explicit clear/reset actions.
5. Relief Statistics by Teacher: match the second screenshot's grouped headers. Each date has Relief and Combine subcolumns; the final group gives selected-range Relief and Combine totals. Rename Week Total to Range Total when the range is not one week. Values can open the corresponding duty breakdown without losing the date range or filters. The screenshot's Swap maps to GSiS Combine. The screenshot also contains Hearts, whose meaning is not specified; do not invent an equivalence to R or R balance. Confirm whether to omit it or map a defined GSiS metric before implementing that column.

### Counting and history contract to settle before release

Proposed absence measures are distinct absent teacher-days, absence records, and absent periods, shown separately rather than hidden behind an ambiguous Total Absences label. The same teacher on the same date counts as one teacher-day; partial absences retain their actual absent periods, and overlapping records must not double-count a period. Do not assume that a partial absence is half a day. Reporting without a baseline remains valid; lack of known periods must not erase the absence or be reported as zero absent periods. Do not equate absent periods with lessons needing cover.

Use authoritative dated records and the existing relief/accounting model to distinguish drafts, published scheduled relief, completed relief and later corrections. Do not call an uncompleted scheduled duty actual work performed. Cancellation, replacement, no-relief entries, combine, own arrangements and partially absent staff need explicit consistent inclusion rules across totals, per-teacher views, detail rows, charts and exports. No-relief entries contribute no performed relief. Do not count one combined teacher-period once per covered class. Keep historical teacher identities after rename/inactivation.

Source discovery found that the current prune path removes dated absence, assignment, imported-relief, correction and daily employment snapshot records. The audit archive holds audit/optimisation records, not a complete operational history, and verbose logging can be off. Weekly imported relief has period:null and a week-start date; it cannot truthfully be spread across daily columns. Combine and repurposed duties have zero R cost in the current accounting model, so R cost must not stand in for an activity count. Calendar provides term-week structure but no explicit semester entity was found; any mapping of Terms 1–2 and 3–4 needs an explicit school setting or confirmed rule. Audit the available historical sources and pruning/archival rules before claiming Past Year or custom-range completeness. Show data coverage and missing intervals; never silently treat unavailable/pruned history as zero. For actual relief prefer the authoritative completed/corrected ledger; keep scheduled coverage visibly distinct where requested. Any new durable daily summaries must remain reproducible and update idempotently when past absences or relief records are corrected. Existing Daily Employment snapshots freeze the first queued report and are not a continually corrected ledger; do not use them as the sole statistics truth. Preserve sufficient statistics history before pruning, and distinguish complete, partial, unavailable, pruned and weekly-aggregate-only coverage. Exclude draft commitments from reported published/completed totals.

### Export, compact width and interactions

Every table has its own Export Excel button. Generate a real .xlsx from the already loaded authorised snapshot, with numeric counts, typed dates, meaningful headers, selected date range, filters and checked-at/coverage information. Export all matching filtered rows in the selected sort order, not just the visible pagination page. If the full export dataset is not loaded, make that explicit and fetch authorised missing chunks once; do not silently truncate or require an unrelated save/network verification. Reuse the suite's existing exporter and escape untrusted cell text so names/reasons cannot become spreadsheet formulas.

Automatically fit each table's columns to its loaded content once loading completes. Do not stretch a small table to full page width. Bound long free-text columns and wrap them; retain readable headers and useful touch targets rather than squeezing the font. Keep numeric columns compact, text left aligned and a stable teacher column. Wide date matrices use their own horizontal scrolling with sticky teacher/header cells; long ranges must remain accessible without rendering hundreds of expensive off-screen columns at once. Preserve scroll position, filters and sort during background refresh.

Charts support hover, touch and keyboard tooltips with teacher/date, exact value and units, visible labels, accessible table equivalents and a clear reset for selections. Clicking a teacher/date bar can filter the related detail table; this interaction must not silently alter unrelated tables or the global date range. Handle empty, zero-only, missing-history, loading and error states explicitly. Show nonblocking inline loading/status feedback in the existing yellow style.

### Responsiveness and concurrency

Statistics is an on-demand read-only feature; do not add its datasets or chart libraries to every teacher's home startup path. Request a bounded authorised range/projection once, reuse it across all tables/charts/exports, and perform sorting, filtering, chart interaction and export on the endpoint. Prefer compressed historical chunks and revision-keyed cache reuse; fetch only changed date slices when available. Long history may need bounded paging/virtualisation or immutable daily aggregates, but charts and exports must disclose and reconcile total coverage. Avoid one backend request per chart/teacher/date, scans of all timetable workbooks on every filter, and writer locks held while aggregating or exporting. Prepare aggregates outside SMC save critical sections and preserve one authority for any maintained summary state.

UI review applies Awesome Design, Frontend Design Premium, Taste, UI UX Designer and Apple Design to hierarchy, reusable controls, compact information density, accessible mobile interactions and stable nonblocking feedback. Existing GSiS style takes precedence over marketing-style reference layouts. Verify cross-table totals, combine deduplication, partial absence, range boundaries, historical corrections, permissions, Excel fidelity and concurrent SMC work before the authorised release.


## 127: Investigate reported 44 WhatsApp delivery issues

Recorded: 22 October 2026, Singapore time.
Status: Read-only live investigation completed; remediation implemented in v0.8.7. Initial 44 issues were all uncertain prepared sends. Later snapshot at 09:48:28 Singapore time shows 54 uncertain outcomes and 51 active delivery issues. No provider success/failure conclusion or live clearance is claimed; execution-log reconciliation remains outstanding.

Treat 44 as the reported issue count pending verification, not a Meta error code and not proof that 44 teachers failed to receive messages. Capture the actual review snapshot, school/duty date, publication/batch identities, affected distinct recipients, job/attempt IDs, provider results, callback times and relevant deployed versions. Group failed, uncertain, blocked, retry-pending and genuinely delivered/read outcomes separately; distinguish stale review alerts from active delivery faults.

Check exact-fingerprint Admin email receipts and item 114's reporting/closure logic, including whether already-reported warnings have resurfaced or new issues were added. Do not clear an alert simply because some Admin email was sent, or mark a WhatsApp delivered because its review email was accepted. Keep the underlying delivery history and teacher acknowledgement unchanged. Only the precise successfully reported issue version may close under the owning writer; subsequent materially changed failures must remain visible.

Investigate correlated template/parameter failures, throttling, expired claims/leases, backend timeouts and callback settlement, using actual provider evidence before assigning a cause. Compare the incident timing with shared-lock contention and the queue/notification separation work in items 117 through 121. The earlier four-alert repair does not prove these 44 are the same issues. No blind mass resend: uncertain outcomes require reconciliation to avoid duplicate teacher messages. Any future recovery must preserve frozen publication content and current recipient eligibility.

Exit evidence: reconcile the count to exact issue records, identify the confirmed causes and affected batches/recipients, preserve uncertain states honestly, verify email-reported closure does not regenerate unchanged alerts, and demonstrate that normal Roster saves remain available during delivery processing. Live diagnostics and corrective execution remain outstanding.


## 128: Investigate unconfirmed Roster save with backend timeout

Recorded: 22 October 2026, Singapore time.
Status: Source contention mitigation and exact-retry verification implemented in v0.8.7. The supplied diagnostic reference was not found in the inspected receipts/audit; the original request ID and execution log are still needed to confirm that specific save outcome.

Exact displayed message:

> The Roster save could not be confirmed. Retry the same save. The backend took too long to respond. Reference: 76e1ad8f-23a9-4fdd-bdf8-440c95ca2c19
> You can view and filter records. Confirm this save before making another change. Retrying will not create another entry.

An uncertain response is not proof that the write failed. Preserve the existing local draft and original request ID/payload. The displayed diagnostic reference is a correlation key; do not assume it is the save's idempotency/request ID. Trace the reference through the frontend/Worker diagnostic and owning Apps Script execution, then inspect the durable receipt and resulting target records before deciding whether the save committed. Record the action, target date/record, actor, start/end time, current deployment and concurrent publication/WhatsApp activity without exposing private data in generic logs.

Identify where time was spent: authentication/Contacts, waiting for the writer lock, state read, timetable/reference preparation, reconciliation, mutation, durable commit or response creation/return. Compare with items 119, 120, 123 and 125. Shared contention is a plausible mechanism already identified in source, but is not established as this incident's cause. Do not treat raising a timeout alone as a root-cause repair.

If committed, recover the receipt and update the client to the saved state without repeating the mutation. If not committed, replay the exact same authorised request using the existing idempotency contract. If the outcome is still unknown, retain the uncertain status and draft rather than create a fresh entry. Review whether a compact request-status/receipt check can resolve this state promptly without another full-state save or timetable refresh. Unrelated viewing/filtering should remain usable; do not remove the guard against conflicting edits to an unresolved save merely to hide the message.

Before release verify a successful commit with a lost response, a genuine pre-commit timeout, duplicate retries, changed-payload request-ID reuse rejection and concurrent teachers/SMC activity. Evidence must show no lost writes, duplicate absence/assignment entries or unrelated changes overwritten. Reconcile this incident independently of WhatsApp success; their timing may correlate without proving one caused the other.


## 129: Simplify Daily Employment Update and link directly to Daily Notify

Recorded: 22 October 2026, Singapore time.
Status: Implemented and locally verified in v0.8.7: R utilisation removed from Daily Employment email; configured, authenticated, date-preserving Daily Notify link added.

Remove the R utilisation section/figures from the Daily Employment Update sent to its configured recipients. Include a clearly labelled Daily Notify link so SMC can inspect which teacher is deployed to which period, class/teaching group and venue. Link to the update's school/duty date, not whichever date happens to be current when the email is opened. Retain the update date and its recorded snapshot/check time, so a later live view is not mistaken for the exact earlier email snapshot.

Use the configured school Roster origin and a supported date-preserving Daily Notify route. Preserve the target through sign-in. Require normal SMC/Admin authority; this is not a public teacher capability link. The destination should show the selected day's published allocation summaries by relief teacher, with clear not-yet-published handling. Validate the actual deep-link route during implementation rather than inventing a fragment that merely opens Home. The link must navigate only, never trigger publication or WhatsApp sending.

This is a report-content change. Keep the underlying R calculation/accounting available where it belongs and preserve unrelated Daily Employment Update sections, recipient settings and scheduling. Generate email links from the same report date used by the update data, and verify delayed email opening, advance dates, sign-in return and unauthorised access.

Clarification retained for items 114 and 127: only the active delivery-review alert is to close after successful matching Admin email reporting. Raw delivery results, errors, attempt history and acknowledgements remain auditable. Sending the email does not prove teacher WhatsApp delivery. As of this changelog entry, automatic closure for new issues is still queued; the earlier four alerts were cleared through the separately run guarded repair. No claim is made that the newly reported 44 issues have been cleared.


## 130: Use approved timetable button template

Recorded: 22 October 2026, Singapore time.
Status: Implemented and locally verified in v0.8.7. WhatsApp Business MCP readback confirmed `gsis_timetable_updated_button_v2`, `en_GB`, UTILITY, APPROVED with three positional body parameters and two exact URL buttons.

An enabled GSPS legacy timetable route upgrades to the approved button variant; deliberately disabled routes remain disabled. Live approval and component matching are still enforced before sending. Other school origins must deliberately configure their own approved template. No live template configuration or messages were changed during release preparation.

## 131: Cancel current WhatsApp queue and dismiss repetitive delivery reports

Recorded: 22 October 2026, Singapore time.
Status: User-run cleanup confirmed by supplied execution logs on 22 October 2026. Read-only run at 12:16 Singapore time (revision 331), then mutation run at 13:01 (revision 336): zero waiting/in-flight jobs, zero open review issues and zero pending report emails; zero jobs cancelled. All 75 uncertain outcomes and private links preserved. This confirms the inspected state only, not provider delivery or the absence of future emails. No new live action was run in v0.8.8 development.

Earlier assistant-inspected snapshot: 09:48:28 Singapore time, operations revision 325. WhatsApp waiting/in-flight queue: zero. Outcomes: 230 sent, 54 uncertain, 85 cancelled and one failed. Review: 51 active delivery issues; Admin report jobs include two queued and one in progress. Counts are a snapshot, not a claim about subsequent activity.

`inspectCurrentWhatsAppQueue` and `clearCurrentWhatsAppQueue` run inside the active Roster editor under the owning locks. The cleanup cancels pending unprepared sends and queued report emails, preserves uncertain/prepared outcomes and late settlement, records explicit manual dismissal receipts, retains delivery and attempt history, and preserves private links. Already submitted messages/emails cannot be recalled. New future notices and materially new failures remain enabled. A standalone helper is provided for the currently deployed v0.8.6a; the same functions are built into v0.8.7. Remove the separate helper before installing the complete v0.8.7 gCode to avoid duplicate definitions. The tested helper was saved as NotificationMaintenance.gs in the active Roster Apps Script project through the available browser fallback. Running its read-only inspection requested Google authorisation; the permissions transition did not complete, and that inspection was cancelled at 10:03:55 Singapore time. That was the state at the earlier assistant inspection. The user subsequently authorised and ran the helper, supplying the 12:16 and 13:01 execution logs summarised above. No post-13:01 evidence proves that the same reports were sent again; preserve the distinction between an older received email and a newly submitted report.

## v0.8.7 release implementation audit

The authorised full release prioritises concurrent absence reporting, independent notification transport, the approved button template, acknowledgement responsiveness, authorised cache reuse and Statistics. It retains v0.8.6a's confirmed-suspension fix and the protected manual-allocation/absence-eligibility contracts. The full package contains five frontend ZIPs, four gCodes, one Worker text file, one maintainer guide and one HTML manual with the Archify explainer.

Implementation verification uses synthetic host/browser fixtures and read-only live evidence. It does not establish production throughput. At that release preparation, operational work included installation/cutover, queue cleanup, reconciliation of uncertain WhatsApp outcomes, and identifying the historical save receipt. Queue cleanup was subsequently run by the user as recorded in item 131; the uncertain outcomes and historical receipt still require provider/execution evidence. The isolated maintenance helper was saved in the live project editor; no deployment, WhatsApp send, Admin email, acknowledgement or queue cleanup was performed by this release preparation.


## 132: Rename a class in place in Deploy IP Deploy

Recorded: 22 October 2026, Singapore time.
Status: Implemented in v0.8.8: configured class-name selection renames the existing row while preserving class identity, teacher deployments and linked references. Expected old level/name checks reject a concurrent rename without rejecting unrelated assignment edits. Focus and scroll retained; backend and UI regressions verified.

User reports that the class cannot be changed in situ after its teacher deployment has been decided. Add a Rename class action directly on the IP Deploy class row. Changing the class name must retain the entire row of assigned teachers and all existing subject, period and deployment details; users must not recreate the class or reassign teachers.

Treat this as renaming the existing class in the selected Deploy version, preserving stable identity and updating dependent references in that version consistently. Do not silently merge it with another class, move its teachers to an existing class, modify other versions or rewrite historical published timetables. Reject blank or conflicting names with clear feedback. Preserve current permissions and the normal save/publication workflow; renaming alone must not publish or send notifications.

Keep the row in place and retain scroll position, focus, filters and unrelated drafts. Persist only the affected data, with an atomic rename/reference update and conflict checks so another user's allocation change is not overwritten. Record the old and new class names in the audit trail. Verify that all teacher assignments and workload totals remain unchanged after saving, refreshing and reopening the version.


## 133: Frontend WhatsApp delivery review and cleanup controls

Recorded: 22 October 2026, Singapore time.
Status: Implemented in v0.8.8: inline Daily Notify review, SMC/Admin exact-generation dismissal and Admin-only previewed cancellation of pending unprepared jobs. Preserves history, private links, prepared/in-flight work and newer notification requests. Durable action receipts protect retries; no automatic resend or blanket success claim.

Add a WhatsApp delivery issues button with an open-issue count in Daily Notify, available to authorised SMC/Admin users and enforced by backend permissions. Open an inline panel showing affected teacher, school date, notification type, recorded outcome, error details safe for display, last checked time and Admin email reporting status. Do not restore the retired WhatsApp Readiness page.

Expose the existing guarded maintenance workflow through clearly separated actions: review/refresh, clear reviewed alerts, and Admin-only cancel pending notifications. Clearing alerts must not resend WhatsApp, mark uncertain/failed messages delivered, delete delivery history or invalidate private timetable links. Queue cancellation must be separately labelled and preview the affected jobs; already submitted messages cannot be recalled. Show counts of what actually changed and remaining issues, including an honest zero-change result.

Automatically close an active alert only after successful matching Admin email reporting under the existing exact-receipt contract. Manual dismissal must record the actor, time and exact issue generation. Suppress repeat reports for that same handled issue; materially new failures remain eligible for review/reporting. Preserve raw outcomes, late callbacks and audit history. Sending an Admin email is not proof of teacher WhatsApp delivery.

Use independent notification operations, surgical writes and idempotent requests so review/cleanup never blocks absence reporting or SMC allocation saves. Show inline progress and keep the rest of the page usable. Verify concurrent refresh/cleanup/report sending, repeated clicks, lost responses, late provider outcomes and newly arriving failures.


## 134: Fix Statistics table header contrast

Recorded: 22 October 2026, Singapore time.
Status: Implemented in v0.8.8: explicit contrasting foreground/background for Statistics table headers and interactive states, including sticky headers. Contrast and browser regression checks cover all seven exported tables.

The supplied Absence Summary screenshot shows near-white column headings and a sort arrow on a pale blue-grey header background, making them difficult to read. Apply a consistent high-contrast header treatment to every table on Roster Statistics, preferably dark navy text on the existing pale fill. Set foreground and background together so inherited styles cannot recreate the mismatch. Keep column labels, sort indicators and filter controls legible in normal, hover, focus and sorted states; verify at least 4.5:1 contrast for normal-size header text. Preserve compact rows, sorting, filtering, sticky headers and Excel export behaviour. Review all Statistics tables after data finishes loading, including narrow-screen layouts.


## 135: Remove teacher-facing WhatsApp configuration reminder

Recorded: 22 October 2026, Singapore time.
Status: Implemented in v0.8.8: generic WhatsApp setup reminder removed from teacher duty views. Delivery eligibility, approval checks and actionable SMC/Admin diagnostics remain.

Remove the banner shown in My Relief Duties: "WhatsApp sending is not configured. Check My Relief Duties for requests and decisions." Remove equivalent generic WhatsApp configuration reminders from normal teacher-facing views. The screenshot identifies an on-page configuration notice, not an instruction to disable WhatsApp notification messages or scheduled relief reminders. Keep timetable updates, acknowledgement controls and requests/decisions accessible. Route actionable configuration diagnostics to authorised SMC/Admin review controls (item 133), rather than showing infrastructure notices to teachers. Verify removal does not suppress actual save failures or relevant user-action feedback.


## 136: Priority morning WhatsApp dispatch speed and reliability

Recorded: 22 October 2026, Singapore time.
Status: Implemented in v0.8.8: bounded protocol-2 batches combine claim/preparation and settle prior results with the next claim, preserving provider pacing, exact job identities and conservative uncertain outcomes. Synthetic 100-recipient fixture uses 10 backend calls instead of 28 (64% fewer); no production delivery-time guarantee. Existing notification work takes priority over optional audit export.

User requires a substantial improvement in morning WhatsApp sending speed. Treat this as an end-to-end measured performance requirement, not merely a larger parallel-send setting. First confirm which v0.8.7 components and optional Queue wake are installed and active; distinguish available source improvements from actual production behaviour. Trace publication commit, intent creation, dispatch wake, claim, payload preparation, Meta submission/acceptance and eventual delivery separately. Measure first-message latency and full-batch acceptance duration for representative morning batches, including concurrent absence reports and SMC saves.

Prioritise immediate durable dispatch after a frozen publication batch, prepared recipient/template/private-link data, bounded parallel provider submissions within verified account/provider limits, compact batched claim/settlement calls, and no per-recipient full Roster/Contacts reload. Remove unnecessary serial waits and repeated cross-service reads. Preserve independent notification processing so transport and reporting do not block attendance or allocation operations. Inspect worker budget, scheduler-only delays, prepared-send lease expiry, callback processing and retry/backoff before increasing throughput. Investigate the 75 uncertain historical outcomes separately; do not resend them blindly.

Proposed acceptance targets to validate against infrastructure and provider limits: return the durable queued-batch receipt within two seconds after publication commits; begin submission within five seconds of that commit; achieve provider acceptance for a representative 30-recipient batch within fifteen seconds and 100 recipients within thirty seconds under healthy-service conditions. These are engineering targets, not verified performance or handset-delivery guarantees. Record p50/p95, batch size, error/rate-limit rates and concurrent-save latency. If targets are not achievable on the current transport architecture, document the measured bottleneck and the smallest necessary architecture change before declaring completion.

Frontend must distinguish queued, submitting, accepted, delivered, failed and uncertain with timestamps and batch progress. A successful queue receipt is not delivery success. Preserve frozen content, exact job identity, idempotency, pacing, provider backoff, current recipient eligibility, manual-click quiet-hour override and automatic scheduling. Test duplicate wakes, partial batches, lost responses, concurrent publications, rate limits and late callbacks. Do not increase duplicate-send risk to improve a speed metric.


## 137: UI/UX responsiveness study for four morning workflows

Recorded: 22 October 2026, Singapore time.
Status: Implemented targeted responsiveness improvements in v0.8.8. Report Absence can save a valid dated absence while optional lesson details load; Assign Relief preserves and reconciles local edits; Inbox caches recent authorised threads and preserves composer/audio during updates; Daily Notify patches status DOM without rebuilding teacher cards. Synthetic 150-teacher/2,100-row refresh median: 124.9 ms to 23.9 ms (rendering only). Live 30-user p50/p95 measurements remain outstanding.

Report Absence: roster-operations-ui.js already seeds/caches report data and hydrates local timetable cells, but reportTimetableStatus disables submission during loading or error. Separate minimal verified absence coverage/type validation from optional lesson/instruction loading. Permit the authorised no-baseline absence workflow when its required coverage is valid, without treating a network error as proof no timetable exists. Render/edit the form immediately after authority is known; retain reason, dates and period selections across refresh. Load own-arrangement candidates only when requested, with a responsive mobile picker. Confirm the durable absence receipt before reporting success; preserve exact retry identity on timeout.

Assign Relief: existing local draft, Save to online and local export provide the right foundation. refreshRecords currently asks to discard dirty edits. Replace broad refresh with incoming changed-cell reconciliation: merge nonconflicting remote cells, preserve manual SMC edits and show genuine conflicts beside the affected cells. Maintain selection/scroll/focus. Index suggestions once per relevant day/revision and recompute affected teacher/period totals only. Keep Save to online and publication visibly distinct; show local unsaved count and saved time. Consider worker computation or bounded rendering only if profiling shows main-thread stalls.

WhatsApp Inbox: roster-inbox-ui.js clears selected thread messages on every thread switch, reads up to 100 messages, polls list every 15 seconds, and pauses thread polling while a draft exists, a reply field is focused or audio plays. Keep a bounded authorised session cache of recent threads for immediate back-navigation, then revalidate. Fetch message/status deltas without replacing composer DOM or interrupting audio. Show a new-message indicator while preserving drafts and scroll; do not force-scroll someone reading older messages. Use lightweight active-view refresh with backoff and hidden-tab pause, rather than multiplying whole-list reads across concurrent users. Existing lazy image loading and audio preload=none should remain; source already supports incoming images. Keep image dimensions stable and retrieve full media on demand.

Daily Notify: readView requests a dailyNotify view; rendering rebuilds overview/card markup. Split stable published summary from compact batch-status and acknowledgement updates. Patch changed cards/counts only, preserve search/tab/scroll, retain prior data with its timestamp while refreshing. Return a durable queued-batch receipt promptly; display queued/submitting/accepted/delivered/failed/uncertain separately. Do not hold the page or SMC saves until transport finishes. Integrate items 133 and 136 without duplicate refresh loops or automatic resending.

Shared priorities: first make absence entry usable and save outcomes reliable; next protect local SMC editing; then accelerate Daily Notify dispatch feedback and Inbox continuity. Use inline yellow progress near the affected control, with no screen blur and no layout shift. Reuse scoped caches and deduplicate in-flight requests. Invalidate only affected dates/records; enforce current authority and server validation before writes. Do not equate instant local feedback with server confirmation.

Proposed measured acceptance criteria, not achieved benchmarks: local interaction feedback within 100 ms; warm same-session view switches within 300 ms where required data is cached; no draft/scroll/focus loss on background refresh; no duplicate writes or messages on retries. Measure cold/warm entry, click-to-edit, click-to-durable-receipt, payload size, request count, long tasks and p50/p95 with 30 concurrent users on representative phones/laptops. Separate network/backend time from render time. Production bottlenecks remain unverified; source findings identify opportunities rather than prove live latency causes.


## 138: Study and reduce Apps Script lock contention using database techniques

Recorded: 22 October 2026, Singapore time.
Status: Study completed and conservative changes implemented in v0.8.8. Audit export releases UserLock before ScriptLock watermark settlement and rejects regressive watermarks; one date per call and active-notification deferral limit contention. Short authoritative commits, receipts, frozen outbox intent, bounded batches and client projections retained. Inbox still shares ScriptLock; Drive state still uses whole-file writes; a newly arriving batch can briefly contend with an already-running export. Transactional datastore migration and further generic-path changes require measured follow-up.

A script-wide lock is not mandatory for every request. Retain coordination for conflicting read-modify-write commits to shared state; perform independent reads, preparation, model calculation and external sends outside that critical section. Current Drive JSON state replacement does not become a surgical physical write just because the application describes a cell patch. Record lock wait, lock hold, state bytes and persistence latency by operation before changing storage.

Source findings in v0.8.7: rosterAbsenceDispatch_ already prepares context outside ScriptLock and rereads fresh state/checks receipts inside the lock. Generic Roster mutations still construct context inside ScriptLock. RosterInbox mutations and service callbacks use the same ScriptLock as Roster allocation/absence even though inbox state is separate. RosterNotificationStore uses UserLock, but rosterAllocationAuditExport_ also holds UserLock while doing Drive export work, creating potential contention in the execute-as-owner project. Audit export then requests ScriptLock; notification maintenance/migration obtains ScriptLock then UserLock. Opposite nested acquisition orders merit correction and timeout/retry tests; do not claim this proves the observed live delay.

Adapt SQL techniques selectively: record/cell expected versions with conflict checks inside an actual serialized commit; stable request IDs and durable replay receipts; prepared immutable read snapshots; compact read projections/materialized summaries; indexes by day/teacher/job; durable outbox intent committed with the business change; short claim, external send without lock, short settlement; bounded batch persistence. Where Sheets is the backing store, a supported single batchUpdate can apply related updates atomically, but this does not supply transaction isolation for a preceding read. Drive JSON has no cell-update semantics. An application revision check followed by a separate write is not atomic compare-and-swap unless protected by a verified storage primitive or owning lock.

LockService provides script, user and document scopes, not arbitrary named row/date locks. Another .gs file or web deployment in the same project does not create a separate script lock. Different projects writing the same shared JSON do not coordinate through their individual script locks. UserLock must not be treated as a per-domain named mutex; execution identity and ownership must be explicit. Do not build correctness locks from expiring cache entries or an unprotected PropertiesService check/set.

Priority plan: measure actual wait/hold distributions; remove remote context work from remaining generic locked mutation paths with dependency revalidation; eliminate audit/notification lock collision and inconsistent nested acquisition order; give Inbox an independent writer/storage authority if measured contention warrants it; keep attendance and allocation together until their atomic dependency/reconciliation contract is explicitly redesigned. Any independent writer must exclusively own its mutable state and use idempotent handoffs for cross-domain effects. Splitting Sheets alone does not remove project lock contention.

If whole-file persistence still dominates morning p95 latency after short-lock changes, evaluate moving hot operational writes to a transactional datastore while retaining Sheets for reference/reporting. Do not recreate a database engine with ad hoc leases and multi-file journals. A migration requires measured comparison, recovery design, deployment ownership, rollback and concurrency verification. Acceptance: concurrent new absences, same-cell conflict, duplicate retry, publication plus new absence, Inbox callbacks, notification claims and audit export must preserve all invariants without lost writes, duplicate effects or misleading success.

Official references checked 22 October 2026: https://developers.google.com/apps-script/reference/lock/lock-service and https://developers.google.com/workspace/sheets/api/reference/rest/v4/spreadsheets/batchUpdate .

## v0.8.8 release implementation audit

Authorised full-suite commit on 22 October 2026. Items 132–138 are addressed by the shipped changes and documented limits. The clean full package contains five frontend ZIPs, four gCodes, the notification Worker text, one maintainer guide and one HTML manual.

Independent correctness and quality review found and verified fixes for concurrent cancellation versus a newer manual-send intent, and delivery-review settlement after navigation. The full 582-script integration run identified six release metadata/package/assertion failures; corrected targeted regressions pass, including two additional race tests. Final build verification checks the complete 12-file package, exact source parity and Apps Script syntax.

The speed claims are local evidence only: 10 rather than 28 backend calls for a synthetic 100-recipient dispatch; Daily Notify DOM-refresh median 23.9 ms rather than 124.9 ms for 150 teachers and 2,100 period rows. No live deployment, WhatsApp send or operational queue cleanup was performed by this release work. Preserve the 75 uncertain outcomes in the supplied cleanup logs.

Follow-up research is documented in the maintainer guide: measure live lock wait/hold and whole-file persistence under concurrent absence reporting; isolate Inbox ownership if contention warrants it; evaluate a transactional operational store only when measurements justify migration. Audit priority is not complete transport isolation. Provider reconciliation and the historical save receipt remain separate investigations.


## GSiS Suite v0.9 release and future Venues pipeline

Authorised 24 October 2026, Singapore time: commit the reviewed integration as v0.9 and harmonise LORD, OVERLORD, STARLORD, Layout, Deploy, Roster, Calendar and Contacts. All eight apps use release label 0.9; npm uses 0.9.0. Existing data schemas, request/cache identifiers and approved provider template names retain their independent versions. No live deployment or staff message is part of this source release.

Included work: reviewed Roster morning concurrency and named human conflict choices; allocator progress, Minimise and cooperative Cancel; STAPLER durable retry recovery, exact-revision validation and compact unchanged confirmation; trusted today-through30-days timetable window markers; LORD-owned Contacts/published Deploy snapshots with stable identities and source-specific change checks. The full package includes the authoritative WhatsApp parameters and complete template mapping. See CHANGELOG_v0.9.md, VALIDATION.md and the v0.9 maintainer guide for exact scope, evidence and installation steps.

Venue storage decision: no new sheet split is needed now. The dedicated Venues registry and Layout's separate published venue table already exist. Preserve one physical-venue authority; LORD reference integration does not need another venue master.

Future pipeline authorised for logging: venues.gsps.edu.sg, a timetable-aware venue booking system drawing occupancy from Roster and its timetable UI patterns. Include accessible range selection, retained scroll, a Singapore-time vertical Now indicator and local revision-keyed caches through 30 days ahead. Use permanent physical venue IDs independent of yearly class/TG labels, a separately owned booking store, exact retry receipts and explicit conflict resolution. A future cross-service publication/booking fence or provisional-confirmation contract must handle a timetable publication during a booking. This release does not build or deploy the Venues app, create DNS, or migrate school data. Full design/acceptance sequence: docs/VENUES_PIPELINE_v0.9.md.

Automatic emergency notices for new absences after first publication and before 14:00, targeted affected-teacher publication follow-ups and expanded Calendar provider cooldown remain queued. A release commit must not mark these unfinished items complete.
