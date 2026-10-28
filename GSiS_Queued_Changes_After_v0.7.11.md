# GSiS queued changes after v0.7.11

Updated: 19 October 2026, Asia/Singapore.
Baseline: v0.7.11, commit 0f3d0b222f73633f6770cde35af8d8c8e90eec2e.
Final source disposition: accepted requirements are implemented in v0.7.12. The entries below preserve the original request and review history; historical pending or uncommitted wording does not reopen completed source work. See PROJECT_RECONCILIATION_v0.7.12.md and VALIDATION.md for final scope and verification.

## Roster: SMC Duty Roster

Status: requirements recorded; runtime implementation pending.

1. Replace the single date form as the landing page with a list of current and upcoming named duty rosters.
2. Use the Baseline Timetable saved list as the interaction reference.
3. Each duty roster has a name, an inclusive start date and an inclusive end date.
4. Provide Edit, Activate and Delete actions for each saved duty roster.
5. Editing opens that roster's duty members, name and date range.
6. Retain the existing eligibility rule: no SLs, AMs or OMs.

Proposed presentation: Duty name, Start date, End date, Status and Actions, with an Add duty roster button. Status makes the current and upcoming lists clear.

### Activation rule confirmed

Confirmed by the user: Activate takes effect immediately and overwrites the list's start date with today's Singapore date. Otherwise, the list follows its saved inclusive start and end dates. Preserve its end date. A list whose end date is already past requires an updated end date before activation, as in Baseline Timetable.

Use Baseline Timetable's existing selection rule for overlaps: the later start date takes precedence; the latest activation or edit resolves an equal start date. This overlap rule is an implementation default drawn from the requested reference.

Current source findings: SMC Duty Roster saves recipients directly into daily records for its date range, and overlapping saves overwrite those dates. It does not yet have named draft lists or an activation lifecycle. Baseline Timetable uses validity dates and offers a separate Activate today action. The requested list therefore requires persistent roster records and a clear activation rule, as well as a page change.

## Roster: baseline timetable caching

Status: implemented and checked in the draft; uncommitted.

1. Store validated baseline timetable models in IndexedDB and reuse them after a verified page reload.
2. Reuse the local model for teacher names, date changes and timetable views, with at most eight models per account and permission scope.
3. Continue to obtain current access, active baseline selection and live operational records from the server.
4. Clear the previous scope on sign out, access denial or account and permission changes. Fall back to a server read when storage is blocked, unavailable or invalid.
5. A forced online refresh remains authoritative even while a stored model is being restored.

Verification: the real browser fixture used a 469,279 byte timetable with 150 teachers. Initial loading downloaded one model; a verified warm reload downloaded none. Account and role isolation, storage failure, corrupted records, sign out and overlapping refresh checks passed. These are controlled fixture results, not production latency measurements.

## Roster: Auto-allocate recovery

Status: recovery wording and smaller responses implemented and checked; the production failure cause is not yet established.

1. Auto-allocate already saves its assignments automatically. The uncertain response control confirms the original request; it is not a separate Save step.
2. Show Allocating relief during the operation and Retry auto-allocation if its outcome cannot be confirmed. Retain the diagnostic reference and the same request payload and identifier.
3. Request compact Assign Relief mutation responses and restore lesson details from the returned allocation model.
4. Keep publication as a separate action.

Verification: simulated a committed allocation followed by a lost response, then retried the original request. It created no duplicate allocation, publication or notices, and preserved a manual assignment and lesson details.

Still needed to identify the reported production error: the Worker log for reference `490496f0-7ab8-4a7d-8f78-82e6dc290e7b`. The warning alone does not identify whether the failure was a timeout, upstream error or invalid response. This draft does not claim to fix that unverified cause.

## Roster: automatic relief exclusions

Status: implemented and checked in the draft; uncommitted.

1. Step 1 defines wildcard exclusion patterns, such as PD*.
2. Step 2 offers additional specific subjects. Wildcard matches are immediately removed from its clickable options and search results.
3. Step 3 shows the resulting population of current baseline subjects excluded by either type of rule, counting each subject once.
4. Keep previously selected exact rules when a new wildcard covers them. Removing that wildcard restores those subjects as checked options.
5. Keep wildcard and exact rule controls in their respective steps. Preview updates stay local until Save changes.
6. Preserve wildcard syntax and the existing policy for saved absences and manual assignments.

Verification: DOM and Chromium checks passed for the step order, immediate filtering, search, empty states, saved selections, overlap counts, save retry, conflict recovery and access checks. Desktop and narrow mobile layouts were visually inspected. Independent review found no material correctness issues in these changes.

## Roster: Stapler level recess blocks

Status: implemented and checked in the draft; uncommitted.

1. Show normal aligned recesses as one purple Canteen block per level in Class POV, spanning its class rows and full configured duration.
2. Drag left or right to swap adjacent lesson columns across the entire recess cohort. Longer drags repeat the swaps in sequence.
3. Send displaced lessons with teacher clashes to Card Pit, as confirmed by the user. Keep the teacher's existing booking in place and name the displaced lessons and reasons.
4. Keep shared lesson cards as single records. A shared lesson extending outside the moved cohort goes intact to Card Pit rather than partially moving its classes.
5. One Undo or Redo covers the entire move. Local changes still use the existing Save and Confirm flow.
6. Keep the complete cohort when filtering classes. The visible block states how many classes it moves and how many are currently shown.
7. Support one-period movements within a block spanning multiple short periods, using drag position or the left and right arrow keys.
8. Preserve existing split recess times and recess cards already in Card Pit. Only aligned placed recesses form a block.
9. Preserve the stored per-class recess identities and classroom supervision metadata. Canteen identifies the normal recess block in the planner.

Verification: focused model and real Chromium tests passed for left and right swaps, shared cards, conflicts, full-duration movement, incompatible timing rollback, filtering, Undo and Redo, save and reload, read-only access and keyboard movement. The browser, shared model and embedded backend copies match. Desktop and mobile screenshots were inspected. Independent review found a merged-period drop issue; it was fixed and the exact one-period drag was verified before saving this draft.

## Existing draft: Layout courtyard and System Config icon

Status: implemented and checked in the draft; uncommitted.

1. Keep the hall as Block A, including A2-01.
2. Extend the L1 grass west to the hall wall and remove the mistaken L2 slab, beams, supports and slab rails above it.
3. Preserve the L1 rain shelter, open L2 bridge and its railings, and Block K.
4. Correct the Roster System Config gear icon.

Targeted geometry checks, browser rendering and independent correctness and quality reviews passed for this earlier draft. The SMC duty list change above is not part of those verification results.


## Roster: Stapler Excel export

Status: implemented and checked in the draft; uncommitted.

1. Replace My timetable today on the editing toolbar with Export Excel. The personal published timetable remains available elsewhere.
2. Export the selected date from the current local plan, including unsaved edits. Filters do not restrict the exported teachers. Export does not save, confirm, publish or notify.
3. Follow the actual offline Stapler Plan exporter: full weekly teacher workbook, weekday headings in row 3, period headings in row 4, then four rows per teacher for Subject, Class, Venue and Group.
4. Change only the selected date and parity. Preserve the other weekdays and week sheet, including when the baseline odd and even weeks are identical. Keep unmatched baseline teacher rows intact and append added teachers on every week sheet.
5. Preserve Plan colour meanings: grey for vacated original slots, green for changed original cards, pink for new cards and pale blue for teacher suspension periods. Teacher suspension fill takes precedence.
6. Preserve canonical GSiS borders, fonts and teacher name merges. Wrap affected fields and grow rows when needed. Treat all entered content as literal text, including formula-like values.
7. Use the exact saved baseline identity and its timetable teacher names. Stop with a clear error if that baseline cannot be obtained or mapped. Card Pit cards and teacherless class recess blocks do not become teacher lessons.

Verification: actual Chromium download, independent OOXML checks, openpyxl reading and save/reopen, and a rendered workbook inspection passed. Tests cover selected date and parity, hidden teachers, unchanged weekdays, blank and added teachers, colour precedence, long and multiline fields, literal formulas, immutable inputs, read-only access, retry and cancellation after navigation. Export leaves dirty state and Undo intact. Existing exports and Stapler UI tests also passed.

Format reference: the supplied offline Stapler v4.3 Plan exporter and its reference, sections 2.1 and 2.4. GSiS stores a canonical workbook model rather than the arbitrary original import bytes; this export preserves GSiS formatting, not an unavailable original file's custom formatting.

## Roster: WhatsApp Inbox

Status: implemented and checked in the draft; uncommitted and not activated.

1. Add a mobile-friendly inbox using the existing school WhatsApp number. All SMC and Admin users can read, reply, assign conversations and mark them handled.
2. Retain incoming messages and voice notes, with private authenticated playback. Keep conversation storage separate from relief allocation records.
3. Record the staff member, time and delivery state for each human reply. Retrying an uncertain request must not send a duplicate.
4. Permit ordinary replies only within 24 hours of the latest incoming customer message, enforced again immediately before sending. Outside the window, require a currently approved template. Sending a template does not reopen free-form replies.
5. New-message alerts go only to the current duty SMC. No duty roster means no fallback to all SMC or Admin. Assignment does not change who may access the inbox.
6. Preserve the existing menu where enabled. Retain messages independently of the menu setting and suppress duplicate legacy urgent forwarding for inbox messages. Older out-of-order messages do not undo a later handled decision or create historical duty alerts.
7. Queue replies durably and dispatch them through the existing every-minute notification worker. Closing the browser does not interrupt dispatch. Recheck staff access and the reply window before sending; never automatically resend an attempted reply whose outcome is uncertain.
8. Search across all conversations, paginate messages, and preserve the reply draft and audio playback during background refresh. Show open-conversation duty alerts on the Roster home tile only to current duty SMC.
9. Keep metadata in a separate private document, with explicit capacity limits of 20,000 messages and approximately 8 MB. Keep voice bytes in a private R2 bucket and authorize every playback request. Storage failures retain the conversation and expose an audio retry action.
10. Production setup needs the updated scheduled worker, private audio storage and a dedicated approved new-message alert template. The proposed template is supplied for review; outbound alerts remain disabled by default. No live messages, template submissions or deployment were performed while preparing this draft.

Verification: focused domain, Apps Script adapter, worker and real Chromium checks passed. They cover permissions and revocation, exact-request retries without duplicate sends, current-duty recipients, missing-duty behavior, historical and repeated webhooks, fresh 24-hour checks after slow storage, approved templates, out-of-order delivery receipts and Meta error codes, private audio and recovery, assignment and handled state, search beyond the first page, escaped message content, draft/audio preservation and mobile layout. Existing WhatsApp workflow and diagnostics checks also pass. Provider calls are mocked; production activation has not been tested.

Activation details: `docs/whatsapp-inbox.md`. Ordinary replies queue until the next scheduled run; a never-attempted reply expires after five minutes. Duty WhatsApp alerts expire after two minutes rather than arriving late. These are operational limits of this draft.

## Roster: Stapler exclusive planning lock

Status: requirements recorded; runtime implementation pending.

1. Allow only one editor at a time for each dated suspended timetable. Acquire an exclusive lock when an authorised user starts editing that plan.
2. Show the lock state and editor's name on the list of suspended timetable dates, for example: Locked by Song Wee.
3. Other authorised users may view the saved plan but cannot edit, save, reset or confirm it while another editor holds the lock. Viewing the date list does not acquire a lock.
4. Save draft retains the lock. Release the lock only after Confirm succeeds and the latest edits have been saved. A failed or uncertain confirmation must not release it prematurely.
5. Keep Confirm's existing meaning: the plan is ready for Roster automatic allocation. It does not publish the day's relief timetable.
6. Confirmed plans remain editable. A later editing session must acquire a new lock before making changes. Different dates can be edited independently.
7. Enforce lock ownership on the server, including protection against stale tabs and simultaneous attempts to acquire the same plan. Disabling frontend controls alone is insufficient.

Recovery rule confirmed by the user: expire a disconnected editing session automatically and allow an Admin to release an abandoned lock. Renew the lock while the editing session remains connected; ordinary keyboard or mouse inactivity does not release it. An expired or released editor must reacquire ownership and reload the latest saved plan before writing. Reconnecting an old session must not restore ownership over a newer editor's lock.

This entry records the requested behavior only. No locking code, commit or deployment is included in this change.

## Roster: Report Absence staff exclusions

Status: requirements recorded; runtime implementation pending.

1. Exclude SLs, MK, Support, SAT, OSOs and AE from the staff selection under Report Absence, including search results and reporting on behalf of another person.
2. Use the authoritative staff categories in Contacts rather than matching names or job title fragments.
3. Apply the same eligibility rule when accepting new absence reports, so a stale selector cannot bypass the exclusion.
4. Preserve existing absence records and their audit history. This change limits new reporting; it does not delete earlier reports.

No additional staff categories are excluded by this entry. No runtime change or deployment is included.

## Roster: faster No Relief Needed cell saves

Status: targeted optimization implemented and checked in the draft; uncommitted. Production save latency remains unmeasured.

1. Treat slow Roster reads and writes as a priority for the morning relief workflow. This change targets an unassigned cell changing to No Relief Needed, or restoring that cell to Unassigned.
2. Return a small authoritative assignment update after the durable save instead of rebuilding the entire allocation response.
3. Skip quota loading, annual and weekly accounting projections, full reconciliation and capacity recalculation for these bounded changes, which do not add or remove a covering teacher.
4. Retain fresh access, Calendar, active baseline, parity, target lesson and confirmed Stapler revision checks. Check the server clock immediately before applying the change so a slow read cannot bypass the period start boundary.
5. Keep state revisions, audit records, the write lock and exact request replay. Cancelling actual assigned cover continues through the full validation and notification path.
6. Show Saving on the affected cell while allowing staff to browse periods, absentees and teacher search. Block further writes and publication until the pending save is resolved. Show Saved only after acknowledgement.
7. Preserve the full view's original freshness timestamp after a partial update. Refresh a reopened view after an in-flight save finishes; retain exact retries when its outcome is uncertain.

Controlled backend fixture: 150 teachers and 120 demands. Response size fell from 232,805 to 1,367 bytes, approximately 170 times smaller. Quota loads fell from 1 to 0, full reconciliation from 1 to 0, accounting initialisations from 3 to 0, weekly captures from 2 to 0, health calculations from 2 to 0, and full allocation projections from 1 to 0. One state read, register/model lookup, lock and durable write remain. These are work and payload measurements, not production latency measurements.

Verification: six focused backend test groups, real Chromium delayed-save and lost-response checks, current workspace and auto-allocation retry checks, existing no-relief/publication/reconciliation/backend authority tests, Apps Script syntax and independent correctness and quality reviews passed. Review fixes cover changed Calendar parity or lesson source, navigating away and back during a pending save, and definite errors after navigation. Two older speed tests retain pre-existing expectations for a removed health disclosure and a home-screen read count from before the Inbox badge; those failures are separate from this change.

Remaining limit: Calendar and Contacts verification, Apps Script execution and durable Drive I/O remain on the save path. This draft does not claim that all Roster reads or confirmed saves are 10 or 100 times faster. Production timing data is still needed to establish the remaining bottleneck and validate the morning-rush target.

## Roster: clearer absence function names

Status: implemented in the draft; uncommitted.

1. Rename Manage reported absences to Manage my absences.
2. Rename Absences by Date to Manage school-wide absences.
3. Use the same labels on the home tiles, page headings and navigation. Preserve the existing personal and school-wide access scopes.

## Roster: shared subject lesson cover rule

Status: requirements and execution point confirmed; runtime implementation pending.

1. Add a business rule enabled by default, with an Admin switch in System Config to disable it.
2. Select Form by default. Allow Admin to select additional subjects from the unique subject list in the baseline timetable, including both odd and even weeks.
3. For each selected subject, identify the teachers timetabled at the same venue for the same date and period. Use the latest effective timetable and current absence records when evaluating cover.
4. If at least one of those teachers remains present, combine the absent teachers' lesson cover with one remaining teacher at that venue. Do not allocate an additional relief teacher.
5. If every teacher in that shared lesson is absent, create one relief requirement for the whole group and assign one relief teacher, subject to the normal eligibility checks. Do not create one independent vacancy for each absent teacher.
6. Follow existing relief accounting: combining with a teacher already teaching there adds no relief period; one replacement relief teacher counts once for that period. Keep all affected absence references for audit, instructions and notification history.
7. Keep different dates, periods, selected subjects and venues separate. A blank or unresolved venue must not group unrelated lessons. Preserve explicit manual cover decisions and accepted own arrangements.
8. Recheck the group if attendance or the effective timetable changes, so a previously present teacher who later becomes absent does not leave the lesson falsely covered.

Execution point confirmed by the user: show the combination immediately as a draft when an absence is reported. If everyone in the group is absent, leave one vacancy for Auto-allocate, including scheduled allocation. Publishing and notification remain separate actions.

Source finding: current demand identity is per absence and period, so the all-absent case requires a shared lesson requirement rather than repeated independent combinations. The existing combination operation already has zero relief cost. No runtime rule change or deployment is included in this entry.

## Roster: concurrent absence reporting

Status: required behavior recorded; current design reviewed; runtime correction pending. Prioritise this before the shared subject rule is implemented.

1. Allow multiple teachers to report their own absences at the same time. A successful report by one teacher must not force another teacher to refresh and resubmit an unrelated report.
2. Preserve current authority checks, absence period validation, overlap checks, audit records, notification intent and request receipt replay. An uncertain retry must not create a duplicate absence.
3. Scope conflict checks to the records and teaching context the command actually depends on. Creating an independent absence must not require the whole school's operational revision to remain unchanged. Editing the same absence must still detect conflicting changes.
4. Validate new reports against the latest authoritative state within the protected commit. Keep the shared commit brief and measure contention. Do not replace the shared lock with separate user locks while different users still write the same document.
5. Recompute affected shared Form lessons against the latest absences. Concurrent reports from co-teachers must result in either a valid combination or one vacancy, without duplicated relief or stale cover.
6. Keep ordinary absence reporting independent of Stapler's exclusive dated planning lock. Report saved only after durable acknowledgement; retain the user's input and a safe retry when the outcome is uncertain.

Current source finding: `backend/RosterOperations.gs` reads and replaces one `Roster operations.json` document. It takes the script lock before reading state, then rejects every new mutation whose global revision differs. The lock acquisition allows an 8 second wait; expiry returns a retry response. Two teachers who loaded the same revision therefore cannot both save immediately: the first increments the global revision and the second receives a conflict even when their absences are unrelated. The UI retains the draft and asks for review and resubmission. Request receipts protect exact retries of already committed requests.

The stored update includes absence, relief, audit and notification intent together; it is not a separate storage transaction for each teacher. This review establishes the current conflict mechanism, not production throughput or a guarantee against every failure. No concurrency runtime change, commit or deployment is included in this entry.

Verification: an isolated adapter reproduction confirmed that two new reports using revision 0 cause the first to save and the second to receive a conflict. An exact retry of the first report created no second write; after refreshing, the second report saved and both records remained. Existing R10 checks and all 25 integrity review checks passed. Independent correctness and structural reviews agreed on the narrow remedy: accept a new absence against the latest protected state after current validation, while preserving stricter checks for edits and shared allocation. No production load test was run.

## Roster: persistent No relief instructions needed action

Status: implemented and checked in the draft; uncommitted.

1. Keep No relief instructions needed visible in the main Report Absence form, including when SMC reports consecutive absences for different teachers and changes dates or periods.
2. Preserve the action's existing meaning: validate and submit the current absence with instructions marked not applicable. This does not change whether relief is required. Keep the label stable and disable the action after success until the report changes.
3. Clear the previous teacher's notes, instruction flag, preview and saved editor target when another teacher is selected. Changing dates or periods invalidates the old panel while retaining appropriate notes for the same unsaved report.
4. Keep the normal instructions preview and saved instruction editing paths. Remove the duplicate No relief instructions needed action from the unsaved preview.
5. Lock report details while a save outcome is uncertain, keep Retry available outside the form and preserve the exact request. Prevent Refresh from replacing the pending report, so a retry cannot attach one teacher's saved instructions to another teacher's form.

Verification: the new focused Chromium test failed against the prior UI and passes with the fix. It covers consecutive reports for three teachers, period and date changes, retained notes, no inherited notes or instruction flags, keyboard use, a narrow viewport, delayed and rejected saves, and exact retry after a lost response. The uncertainty test checks real focus behavior, blocked draft replacement and restored editing after acknowledgement. Existing absence subject-policy and remarks checks pass. Independent correctness and quality reviews found and resolved a pending-save identity issue. Desktop and mobile screenshots were inspected. No live reports were submitted.

Verification limits: the older operations UI test still expects Daily Absences instead of the previously requested Manage school-wide absences label. A broad Premium static audit reports existing repository convention and ownership gaps, so full Premium audit compliance is not claimed. This scoped fix retains the established native form controls and confirmation behavior.

## Roster: upward relief capacity bars

Status: implemented and checked in the draft; uncommitted.

1. Place all period labels on a common bottom axis and grow the green opportunity bars upward from it.
2. Retain each teacher's baseline green opportunity when relief is assigned. Show a red marker beside that same teacher's green marker instead of replacing it.
3. Use a neutral marker beside red when the assigned teacher is outside the baseline eligible pool or eligibility is unverified. Do not invent green capacity for overrides or unknown R.
4. Keep current free counts, the capacity percentage, R calculations and allocation rules unchanged. Clearly distinguish baseline opportunities from current availability; opportunities in different periods do not represent separate R quota.
5. Preserve teacher names and status in accessible labels and tooltips. Allow horizontal chart scrolling on narrow screens while keeping the period baseline aligned.

Verification: focused model and real Chromium checks passed for paired teacher markers, differing column heights, empty periods, outside-baseline assignments, unknown capacity and older responses without baseline IDs. Desktop and mobile screenshots were inspected. All 16 R17 core checks, 10 R17 integration checks and 31 Apps Script syntax checks passed. Independent correctness and quality reviews found no material remaining issues. The shared model, browser copy and embedded backend copy match. No production data or allocation was changed.

## Reconciliation before v0.7.12

The two progress updates identified by the user concern the same completed No Relief Needed optimisation: the small response measurement and the later source-change guard. The completed draft includes both, and all six focused backend checks were rerun successfully before this changelog commit. Its earlier browser and independent review evidence is recorded above. The user authorised clearing the remaining accepted source requirements and committing the next version on 19 October 2026 Singapore time.

An additional current requirement from the WhatsApp implementation chat is included in this release scope: make Report Absence the first WhatsApp menu option, described as Open the current relief system, replying with https://roster.diveanalytics.com/. Retain Urgent Message, School Layout, Collect / Return ICT and Call General Office. Configure the URL through the Pages worker's validated HTTPS setting. This link does not transfer absence records into GSiS. The standalone Stapler Excel export note is already implemented by the draft entry above and does not represent a second export feature.


## Completed source disposition: v0.7.12

All accepted source requirements in this queue are incorporated into the release. This includes named SMC duty lists, verified baseline caching, safe allocation retry, exclusions ordering, recess block movement, offline-format Excel export, WhatsApp Inbox, exclusive dated Stapler editing, compact cell saves, precise absence eligibility, management labels, shared Form cover, concurrent new absence reports, persistent instructions and upward capacity bars.

The implementation rejects overlapping named duty lists with an explicit conflict instead of adopting the earlier proposed precedence default. This prevents a list edit from silently replacing current routing. Activate uses today's Singapore date and preserves the end date. The existing 62-day range limit remains.

New absence appends validate the latest protected state and accept valid stale starting revisions; edits and shared allocation retain stricter conflicts. Thirty independent same-revision reports and exact replay are covered by the merged adapter fixture. Stapler alone has an exclusive per-date editor lease; reporting absences remains independent.

The first WhatsApp menu option now links to the current relief system. Safe numeric Meta diagnostics from v0.7.11 are retained in the regenerated Worker. No deployment, live messages, provider activation or school-data cleanup is implied by completion of this source queue. Installed diagnostics and latency checks remain in PROJECT_RECONCILIATION_v0.7.12.md.
