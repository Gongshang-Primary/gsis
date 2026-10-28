# GSiS queued changes after v0.7.05

Logged: 16 October 2026, Asia/Singapore.
Baseline reviewed: v0.7.05 deployment source.
Status: v0.7.06 implementation authorised by the explicit commit instruction at 06:08 on 16 October 2026, Asia/Singapore. Implementation and local verification are complete. Final deployment package integrity is recorded in RELEASE_SUMMARY.json. No Git commit or production deployment is authorised by this package workflow.

The user asked to re-study Roster loading, reads and writes for speed. The explicit commit instruction now authorises implementation and a deployment package. Ponytail and Pstack reviews apply. The earlier investigation below records the reasons for the changes.

## User reports and required outcomes

| ID | Report | Queued outcome |
| --- | --- | --- |
| Q706-01 | Report Absence loads too slowly. | Open the form and available timetable data promptly. Reduce its initial response to the data the form needs. Show any required live check separately. |
| Q706-02 | Manage reported absences loads too slowly. | Make the saved-entry list a record-only read. Do not load timetable or planning data until an edit needs it. Reuse a recent list on return. |
| Q706-03 | Roster reads and writes remain too slow. | Remove unrelated work, share request-local indexes, preserve exact retries and atomic saves, and measure the actual service waits. |
| Q706-04 | Report Absence > Own Arrangements loads too slowly despite the cached full timetable. | Open the timetable matrix from available data immediately. Separate save confirmation and current colleague eligibility from initial matrix display. Keep filtering and period selection local. |
| Q706-05 | Loading and saving indicator fades in and out rather than spinning. | Keep one rotating wheel at constant opacity. Remove the opacity pulse. Use a slower rotation if reduced motion is requested, and explicitly test that mode. Preserve the single overlay, blurred background and visible outcome. |
| Q706-06 | Assign Relief loads too slowly. | Reuse cached baseline data and recent view data, reduce repeated calculation and duplicated response data, and keep current allocation checks authoritative. |
| Q706-07 | WhatsApp Readiness belongs on Home as a separate SMC-only function. | Add a dedicated Home tile and page. Remove the readiness and delivery-review panels from Manage Ad-hoc relief and other embedded locations. Keep any necessary short staff notice separate. |
| Q706-08 | Check Availability teacher names load slowly. | Populate and enable the picker immediately from the cached timetable applicable to the selected date. Do not wait for a Contacts directory response to show, search or select timetable names. |
| Q706-09 | More Roster reads should work directly from the cached timetable. | Any action that depends only on an already loaded immutable timetable must run locally. Share its indexes across Roster; fetch only missing models or current operational overlays. |
| Q706-10 | Recess Regression should use automatically generated virtual teacher rows with a configurable name. | Generate groups from actual classes in the cached timetable. Provide an editable base-name setting with the example Haze Recess, producing names such as Haze Recess P and Haze Recess Gt. SMC selects dates and affected levels once to create the required recess cover. Activation creates unassigned slots; SMC reviews them and explicitly uses Auto-allocate before publication. |

## Why the full timetable cache has not solved the delay

The full immutable staff timetable already stays in browser memory, with up to eight models. The ordinary timetable viewer reuses it. The operations screens use a separate view cache and API response. Report Absence, Assign Relief and Own Arrangements do not consume the browser's full-model cache through the existing readDate interface.

Planning requests still wait for Calendar, then Deploy, then Contacts, then operational state and context. A cached timetable does not contain current absences, relief assignments, colleague consent, permissions or save receipts. Those facts need appropriate current server checks. The first useful form or matrix does not need to wait for all of them.

Manage reported absences already skips Calendar, timetable construction and R calculation. Its delay therefore needs a different correction. Adding another timetable cache will not fix that path.

Source evidence: roster-update/public/roster.js:83-117; roster-update/public/roster-operations-ui.js:49-63,97-110,473-474; roster-update/public/_worker.js:53-68,162-169; backend/Code.gs:605-607.

## Findings from the review

### 1. First entry and repeated navigation still wait for avoidable work

Report Absence prefetch starts on hover, focus or pointer press. Home startup separately warms the baseline timetable and staff directory. The operations response can therefore arrive too late for the first click, despite earlier warm-up work.

Only Report Absence skips a repeat request when its cached view is under 60 seconds old. Manage and Assign draw cached data but immediately reload. The save handler refuses a save while this background read is active. Every mutation clears all operations view caches before receiving its result, then restores only the current view. This causes unnecessary cold returns to other screens.

Queue a single, deliberate preparation path for likely actions. Do not preload every page. Reuse verified recent views under an explicit freshness rule. Keep local editing available during refresh. Use date, identity, role, model and relevant record revision to invalidate only affected data. Clear staff data on account change or logout and clear denied views on permission failure.

Source evidence: roster.js:63-64,83-117; roster-operations-ui.js:50-63,97-121,123-129.

### 2. Manage reported absences is not a true record-only read

The mine view returns recorded absences, but its context still loads the timetable register. Its read dispatch also checks schoolwide assignments and pending requests. If reconciliation finds a change, loading this list can acquire a save lock and commit the operations document.

Make this list a genuinely read-only projection. Retain fresh timetable, permissions and reconciliation checks when editing or saving, and in the relevant planning paths. Do not apply this exclusion blindly to My Relief Duties, which has different published-duty freshness needs.

Source evidence: backend/RosterOperations.gs:32-37,86,112-124; shared/roster-operations.js:111-113.

### 3. Own Arrangements waits for optional work after an absence is committed

For a new report, the Own Arrangements button submits the absence with includeMutualCandidates before opening the dialog. The backend commits the absence, releases its lock, and then obtains R and calculates candidates before responding. The browser can still display Saving while optional screen preparation is running after the save.

Separate durable save acknowledgement from optional candidate preparation. Open the locally populated matrix immediately with a clear pending state. Confirm the absence as soon as its authoritative receipt returns. Check eligibility in the background and enable request submission only when the required checks are current. Optional planning failure must be shown as an availability problem, not as an unconfirmed absence save.

For saved reports the matrix already renders before the candidates return, but selectable target cells await eligibility. Reuse candidate results only for matching identity, date, timetable, parity and operational revision. Do not treat a blank cached timetable cell as proof of live availability.

Splitting a response can introduce another request. Measure total calls and time to useful interaction before choosing the final split. Do not replace a combined request with an unnecessary sequence of full reads.

Source evidence: roster-operations-ui.js:206-215,238,241-289; backend/RosterOperations.gs:55-66,105-109.

### 4. Initial views and calculations are too broad

Report and entry context constructs a complete day for every matched teacher. The generic response contains more schoolwide records than the initial form needs. Assign Relief carries timetable cells both in its generic day projection and allocation model. Manual allocation and health calculations separately rebuild teacher contexts. Mutual candidate batching avoids separate network requests per period but still rebuilds schoolwide context for each period.

Use narrow view projections and the shared immutable timetable. Construct identity, timetable, accounting and assignment indexes once per unchanged request context. Apply period-specific differences without repeating the whole calculation. Rebuild affected indexes after a mutation, since the pre-save availability result is no longer authoritative. Check all consumers before removing duplicate response fields.

Source evidence: backend/RosterOperations.gs:41-49; shared/roster-operations.js:85-100,115-116,409,436,468-474; shared/roster-allocation.js:46-77,95-99,115-116.

### 5. Saves remain atomic, but their critical section can be expensive

Roster uses one operational JSON document. Every operation reads it; every save replaces it. Absence, relief, audit, receipt and notification intent commit together. This is a logical surgical change followed by a whole-document write, not partial Drive I/O.

The global script lock currently covers state loading, context and quota preparation, reconciliation and application before the commit. Deploy saves also use this lock. Reduce unrelated work first. Move immutable preparation outside the lock only if fresh revision and source checks inside the lock prove it is still valid. Preserve the receipt check before expensive work and the exact request ID, actor and digest on retries.

Normal same-page saves already use the returned result without a second generic read. Keep that behavior. Separate or archive historical data only if measured document size and Drive timings justify a storage change. Do not split the receipt, operational changes and outbox into independent writes.

Source evidence: backend/RosterOperations.gs:2-12,87-109; backend/Code.gs:662; roster-operations-ui.js:123-136.

### 6. Profile requests an unused staff directory

Roster profile asks Contacts for rosterDirectory, then only uses the authority and timetable register data. Remove the unused directory projection from this request. Keep fresh verified authority. Contacts already batches its required sheet reads, so this is a narrower response, not removal of all Contacts work.

Source evidence: backend/Code.gs:605; backend/Roster.gs:229-233; backend/Contacts_Code_with_Deploy_API.gs:155-158,246-261.

### 7. The fading indicator is an explicit reduced-motion branch

The CSS rotates the wheel normally. Under prefers-reduced-motion: reduce it selects ops-pulse, which changes opacity and does not rotate. The previous feedback test explicitly accepted this pulse.

A current Chromium reproduction confirmed normal mode changes the transform at opacity 1. Reduced-motion mode kept transform none while opacity changed from 1 to approximately 0.728. The existing feedback browser test passed. This confirms the code mechanism, but does not establish the user's browser media setting.

Remove the pulse animation. Use the existing CSS spinner and preserve one progress dialog through the operation. Do not introduce a JavaScript animation framework. Keep a static readable status label. Change the acceptance test to require constant opacity and actual rotation in both modes, with slower rotation in reduced-motion mode.

Source evidence: roster-operations.css:20; roster-operations-ui.js:81-85,154; tests/roster702-feedback-ui.js.

### 8. WhatsApp Readiness needs an explicit lightweight view

The current shared notifications renderer mixes the staff notice, route readiness and failed delivery details. Manage Ad-hoc relief includes this renderer. There is no standalone readiness function on Home.

Add WhatsApp Readiness with the existing strict SMC navigation flag and a server-side SMC check. An Admin who is not SMC must not gain access merely through the existing broader readiness decoration. Use a distinct notificationReadiness view on the existing operations route. Do not let its name fall through to the generic smc view, which calculates allocation data.

The view should return only identity, notification readiness and relevant delivery issues. Skip Calendar, timetable, quota and reconciliation. Reuse the existing Worker configuration and approval-cache status. Opening the page must not call Meta for a fresh template scan, send a message, retry a delivery or change activation flags.

Move readiness and delivery review to this page. Keep a short staff-facing sending notice where it is needed to explain how colleague requests work. WhatsApp and scheduled automation remain paused.

Source evidence: roster-operations-ui.js:32-49,63,98,143-149,227,255,485,495,529; roster.js:47; roster-update/public/_worker.js:64,166,247-257; backend/RosterOperations.gs:25-37.

### 9. Check Availability bypasses cached timetable names

Follow-up requested: 16 October 2026 at 05:40 Singapore time.

The Check Availability page disables the name picker until readDirectory completes its operations directory request. It does not use the existing cached model or readNames shortcut. Adding or removing each teacher then calls loadAvailability again. While that response is pending, drawAvailability replaces the result grid with Checking selected teachers. This creates avoidable waits even when the timetable is already in memory.

Use the active cached timetable for the selected date as the immediate name source. Search, selection chips, add/remove and baseline timetable comparison must work without awaiting a server response. Keep the displayed results in place while background checks run, with their freshness state visible.

The imported timetable stores names and cells, not Contacts staff IDs. Reuse a verified mapping alongside the cached model when it is available, or enrich it in the background. Do not invent staff IDs from names or silently match ambiguous names. A name without a verified mapping can still show its baseline timetable; it cannot be treated as a verified staff identity for relief actions. A mapping is identity data, not cached permission to perform a save.

Keep ad hoc external teachers available through the date-specific operational overlay, because some do not occur in the baseline timetable. Preserve selections while enrichment arrives. Do not silently remove an unmatched selection or turn an inactive teacher into an eligible relief candidate.

Refresh a compact operational overlay for the selected date separately from the baseline model. Derive the chosen teachers' results locally from that complete, verified snapshot while it remains fresh. Selecting a different subset must not trigger a new full request when the snapshot already covers it. Coalesce concurrent requests. If a needed teacher or context is missing, fetch only what is needed and keep the baseline visible.

Cached blank periods support a baseline free-period preview. Current absences, relief assignments, pending arrangements, ad hoc activation and existing eligibility rules still affect verified availability. Keep these states distinct. Do not change the existing availability policy simply to make the screen faster. After overlay expiry or failure, retain the useful preview and show that current availability has not been confirmed.

Source evidence: roster-update/public/roster.js:83-117,261-272,283-300,350-355; shared/roster.js; shared/roster-operations.js:85-100,467; backend/RosterOperations.gs:70-72.

### 10. Apply one local timetable read rule across Roster

Use the existing immutable model cache as the shared source instead of adding another competing cache. Build reusable indexes for teacher, class, TG, date pattern and period once per model. The cache must cover the loaded timetable's full staff content, not only the selected teacher.

| Action | Local behavior when relevant data is cached | Separate current check |
| --- | --- | --- |
| Teacher, class and TG names | Show, search and select from model indexes immediately. | Resolve stable staff identities and operational status only where needed. |
| Baseline timetable display | Select a teacher, class, TG or week pattern and draw from the model. | Date-specific school-day and parity context is separate. Never guess odd/even parity when unknown. |
| Check Availability | Update selected names, chips and baseline free-period intersections locally. | Refresh current absence, relief and eligibility overlay without blocking the picker. |
| Report Absence | Draw the teacher's baseline lessons, period choices and lesson labels locally. | Apply loaded absence-type rules; verify current rules, date context, conflicts and authority before saving. |
| Own Arrangements | Open and filter the colleague matrix locally; show baseline lessons immediately. | Current eligibility and saved absence identity govern request submission. |
| Assign Relief | Draw baseline cells and reuse loaded candidate indexes when selecting periods or filtering names. | Allocation state, R and eligibility must match the required revision and date. |
| Display controls | Change fields, period cutoffs, sorting and filters locally. | No server request for a display-only change. |
| Baseline PDF and Excel | Generate from the loaded model and selected fields locally. | Published relief exports remain distinct and use their authoritative publication snapshot. |

The all-timetable export currently calls timetableModel, which may await readDate when date context has expired even if the model remains cached. Separate baseline export requirements from date-specific operational verification so a baseline export does not wait for unrelated current records.

Cache rules for implementation:

1. Reuse a loaded model for its immutable ID and select it using its valid date range; ordinary record refreshes must not discard it.
2. Keep timetable content, Calendar date context, identity mapping and mutable operational state under separate freshness rules.
3. When changing dates within the same model, slice locally; use verified cached parity or show both patterns until date context is known.
   An upcoming timetable remains a labelled preview until its effective date; its gaps must not appear as confirmed current availability.
4. On a true model miss, reuse an existing in-flight fetch or fetch once. Do not issue separate copies from each screen.
5. Refresh affected operational dates after a confirmed write without clearing unrelated timetable indexes or all page caches.
6. On timetable replacement, account change, logout or permission denial, invalidate the appropriate data and prevent stale callbacks from restoring it.
7. Keep full staff timetable data in bounded session memory. This request does not authorise adding persistent staff data to localStorage or IndexedDB.

Acceptance additions: with a warm model and delayed directory/operations responses, Check Availability names, search, chips and baseline preview remain usable; display-only events produce zero API requests; teacher subset changes reuse a fresh complete overlay; expired or missing overlay is not shown as confirmed live availability; duplicate or unmatched names, an external ad hoc teacher, a date/parity change and a timetable replacement are covered. Repeat the same no-request checks for baseline display controls and exports.

This follow-up changes the queued requirements only. No runtime code or deployment ZIP was changed.

### 11. Recess Regression: generated supervision rows and name setting

Requested: 16 October 2026 at 05:57 Singapore time. Automatic generation and a name setting confirmed at 06:01. Batch activation by dates and levels confirmed at 06:03.

The screenshot image(20261015-215553).png shows an imported Haze Relief C row with recess slots for 1C through 6C. The user proposes the same relief allocation interaction for automatically generated virtual rows. They selected automatic generation from actual classes in Roster rather than requiring manual rows in the source timetable software.

Confirmed requirements:

1. Generate virtual supervision rows from the actual unique classes in the cached timetable.
2. Group matching class suffixes across primary levels. For example, Haze Recess P covers the recess slots for the existing Prudence classes across levels 1 to 6.
3. Include only levels where that class exists. If Gt exists only at P1 and P2, Haze Recess Gt contains only 1Gt and 2Gt. Do not create phantom classes at other levels.
4. Provide a configurable base-name setting with the example or input hint "e.g. Haze Recess". The resulting display name is the chosen base name plus the class suffix. The example is not an immutable system name.
5. Treat these as virtual supervision rows, not real people in Contacts, staff counts or staff workload denominators. Actual supervising teachers still follow the established relief allocation and accounting rules.
6. Use stable internal identities for generated rows and class-period demand. Renaming the base label must not duplicate demand, cancel assignments or change the actual class represented.
7. SMC selects the dates and affected primary levels once in Recess Regression. Roster creates all applicable virtual supervision demand in one action; SMC does not report each virtual teacher absent individually.
8. Include only actual classes at the selected levels and their applicable recess periods. The resulting slots use the normal relief assignment workflow. Date, class and period identity must prevent duplicate demand when activations overlap or are retried.

The current implementation already creates class-specific recess demand and exposes it in Assign Relief. This proposal changes generation/grouping and presentation. It must not create a second copy of the same class, date and recess-period demand alongside the existing path.

Build interpretation announced after the commit instruction: activation creates unassigned slots. SMC reviews them and clicks Auto-allocate separately, then publishes through the existing workflow. This conservative default does not imply the user answered the preceding allocation question. Existing recess timing, permission, deactivation and allocation rules remain unless the implementation evidence below states a change. Batch activation does not authorise immediate allocation, publication, notification sending or scheduled automation.

The specification above is authorised for v0.7.06 implementation. No live school data change or notification activation is included.

## Order for the next authorised build

1. Capture the existing cold and warm request baseline for the named screens and saves.
2. Narrow Manage reported absences and profile reads, and add the standalone readiness page and corrected spinner.
3. Share the immutable timetable with operations views and make cache invalidation specific to affected data.
   Include the Check Availability name picker, local subset changes and the cross-Roster local read rules in Q706-08 and Q706-09.
4. Separate first matrix display and durable save confirmation from optional colleague planning.
5. Reuse request-local calculation indexes and remove verified duplicate payload fields.
6. Reduce lock scope or storage size only where the measured remaining delay warrants it.

## Acceptance and evidence required

| Check | Required result |
| --- | --- |
| Warm form or timetable matrix | First useful content within a proposed 200 ms browser target when its required immutable data is already loaded; live check status remains visible. This is a target, not a measured production claim. |
| Cold screen | Show its shell promptly. Report live service waits separately; do not label a skeleton as a fully loaded screen. |
| Manage list | No Calendar, timetable model, R calculation or reconciliation write for the list read. Editing and saving still validate current facts. |
| Own Arrangements | Matrix and filtering work while current eligibility loads. Saved absence confirmation is independent of optional planning success. No request is submitted against unverified eligibility. |
| Assign Relief | Selecting periods and filtering loaded candidates makes no backend calls. Health, R tiers and allocation rules retain their results. |
| Save acknowledgement | One authoritative commit and exact retry receipt. No routine duplicate refresh, duplicate entry or premature Saved state. |
| Concurrent changes | Fresh absence conflicts, timetable replacement, R changes, identity/role changes and revision conflicts remain enforced. |
| Progress | One overlay and one status label; constant opacity, observable rotation and no repeated Saving text in both media modes. |
| Readiness permissions | SMC sees the Home tile and compact page. A direct request by a non-SMC user is rejected. No message or activation occurs. |
| Real latency | Compare cold and warm median and slow-tail end-to-end timings on the installed stack, with the same data and comparable user conditions. |

The Worker already records calendarMs, backendMs, totalMs and Server-Timing. Deploy records Contacts timing and phases for state, context, quota, reconciliation, apply, commit and projection. Collect these per named action and diagnostic ID, without record contents or secrets. Extend only missing boundaries, such as response payload bytes and time to usable form.

The existing local browser checks use synthetic service responses. They prove specific rendering, interaction and retry behavior. They do not prove fast responses from the live Calendar, Deploy, Contacts and Drive chain. This review made no authenticated production requests and has no current production timing baseline.

Ponytail conclusion: reuse the existing operations route, renderer, cache ownership and CSS animation. No new framework, dependency, parallel cache architecture or broad rewrite is justified. Pstack conclusion: the proposed changes must preserve authority, freshness, atomicity and exact retry semantics; do not remove these checks to meet a speed target.

The released v0.7.05 ZIPs remain unchanged. The explicit commit instruction authorises the v0.7.06 package. Final implementation and verification results are recorded in QUEUED_v0.7.06.md, VALIDATION.md and RELEASE_SUMMARY.json.

## v0.7.06 implementation disposition

Q706-01 through Q706-10 are implemented in the v0.7.06 deployment source. Check Availability uses cached names and one complete operational overlay. Report and allocation reads support compact projections. Manage reported absences is record-only. Own Arrangements shows the cached matrix before save and eligibility responses, while exact save receipts remain authoritative. The progress wheel rotates in both motion modes. WhatsApp Readiness is a separate SMC-only Home function.

Recess Regression creates virtual rows from actual classes, uses a configurable base name and preserves separate same-period class demands. Activation creates unassigned demand for explicit Auto-allocate and publication. Stable class identity and legacy assignment reuse protect existing cover when Deploy metadata changes.

All 289 selected Node scripts, nine Chromium suites and the 123-source Apps Script syntax gate passed. The manual retains its 36 embedded images and the canonical privacy page and assets are unchanged. Final archive checks and limits are recorded in RELEASE_SUMMARY.json and VALIDATION.md. These checks do not establish live Apps Script speed. No live deployment, school-data reset, message or Git commit occurred.

## Queued after v0.7.06: Q707-01 Colleague cover or combine by clicking the same period

Requested: 16 October 2026 at 11:49, Asia/Singapore. Status: logged only; implementation, build and deployment are not authorised by this request.

In Roster > Arrange relief with colleague, first click the reporting teacher's lesson. Then allow a click on a colleague's cell in that same period column: a blank slot selects the colleague to provide cover; an existing lesson selects combining the two classes. The user reports that colleague lesson cells cannot currently be clicked.

Both target types must use the same direct matrix interaction. Keep selection and highlighting local when the timetable is cached. Preserve current date, timetable, identity, eligibility and consent checks at submission. An occupied lesson is an explicit combine-class choice, not a blank availability result. Keep ineligible cells visibly explained rather than silently inert. Different period columns cannot serve as targets for the selected lesson.

Acceptance: select own lesson, select same-column blank colleague slot and receive cover selection; select same-column occupied colleague lesson and receive combine selection with both classes visible; changing the source lesson clears or revalidates the target; unsuitable or stale targets show a reason; no duplicate request or save is created. Evidence: image(20261016-034701).png was inspected. It shows the selected own P6 Science lesson for 5T, a highlighted blank colleague cell and a highlighted occupied colleague MTL lesson in the same P6 column. The failed click is reported by the user; the static screenshot cannot demonstrate the event handler.


## Queued after v0.7.06: Q707-02 Absences by Date uses the page for table layout

Requested: 16 October 2026 at 11:50, Asia/Singapore. Status: logged only; no runtime implementation or build.

Roster > Absences > Absences by Date (Daily Absences) must show its table as full-page content, using the available page width and normal page scrolling. Remove the constrained nested frame or fixed-height vertical scroll area that clips the action menu. The user's term is iframe; the screenshot alone does not establish whether the implementation uses an iframe or an overflow container.

Preserve the date selector, Absent Teachers and Relief Assignments tabs, search, Excel download and existing pagination behavior. Every row's three-dot menu, including the last row and a single-row result, must open fully above surrounding content and remain clickable without scrolling an inner table. Keep responsive horizontal overflow only where needed for narrow screens, without clipping menus.

Evidence: image(20261016-035003).png was inspected. It shows v0.7.06 Daily Absences, a single result, a highlighted internal vertical scrollbar, and the opened action menu clipped at the bottom of the table area. Acceptance covers one row, many rows, the last row, resized viewports and keyboard menu access.

## Queued after v0.7.06: Q707-03 Restore the custom Relief Health indicator and percentage

Requested: 16 October 2026 at 11:53, Asia/Singapore. Status: logged only; no runtime implementation or build.

Roster > Assign Relief must use the previously designed custom indicator shown in image(20261016-035242).png: compact stacks of individual green/red horizontal bars aligned on a common baseline across period columns, with the Relief Health percentage clearly visible. Preserve the agreed green eligible-opportunity and red assigned-opportunity meanings and the existing calculation contract; styling must not redefine R or treat overlapping opportunities across periods as independent R units. Match the supplied indicator rather than presenting a row of empty bordered period cards as the principal visual.

Distinguish verified zero capacity from unavailable or incomplete inputs. If no applicable published Deploy snapshot supplies R, show an explicit R-data-unavailable explanation and an unavailable percentage; do not substitute 0%, 100%, or a confirmed critical-shortage warning for missing data. Identify unmatched timetable identities and unverified annual accounting separately. A partially populated result must disclose incomplete coverage rather than imply complete schoolwide capacity.

Evidence inspected: image(20261016-035212).png shows v0.7.06, date 16/10/2026, 0 / 0 eligible opportunities, No eligible capacity, six uncovered periods, unmatched timetable names and an annual-R-history verification notice. image(20261016-035242).png supplies the stacked-bar appearance; the percentage requirement is stated explicitly by the user.

Read-only diagnosis on 16 October 2026: the live Deploy register at revision 154 has one editable version, 2027 Term 1, and a frozen publication named 2027 initial planning at revision 16. The published document's from and to values are both empty. rosterOperationsQuota_ requires both dates and an applicable date before returning R rows. Therefore this publication cannot supply R for 16 October. The separate 2026 T4 post-PSLE baseline work remains necessary. Existing weekly entitlement records may also supply R; the screenshot alone does not establish each teacher's individual exclusion reason. Annual history verification is a separate automatic-allocation gate and must not be declared verified merely by publishing a current baseline.

Acceptance: compare the populated indicator to the reference; retain the percentage for valid data; cover unknown R, true zero capacity, partial identity matches and valid populated capacity; keep automatic allocation disabled with a specific explanation while its required checks are unresolved. No notification activation is included.

## Queued after v0.7.06: Q707-04 Manage Absence > Edit Absence opens too slowly

Requested: 16 October 2026 at 11:55, Asia/Singapore. Status: logged only; no runtime implementation or build.

The user reports that opening Edit Absence from Manage Absence takes too long. Make the edit form and existing saved values appear promptly on the first click. Reuse the selected absence and applicable timetable already in session memory; fetch only missing edit context or current facts. Do not gate the first useful form on a full timetable, schoolwide allocation, R calculation or unrelated reconciliation.

Refresh required permissions, revision, permitted periods and current absence state without overwriting edits already typed. Use a single in-flight read for the same context, discard stale responses after switching or closing entries, and show a recoverable error while retaining the draft if validation fails. Saves must still enforce current authority, conflicts, valid periods and relief reconciliation, with one atomic save and exact retry receipt.

Acceptance: measure click-to-usable-form for cold and warm opening; with cached record and model, target the existing proposed 200 ms warm UI budget without claiming measured production performance. Verify opening different entries quickly, closing during a slow read, background changes, permission changes, read failure and duplicate save clicks. Keep a single visible loading state and do not show Saved until the durable receipt confirms it.

## Queued after v0.7.06: Q707-05 Check Availability full-row selection and local highlighting

Requested: 16 October 2026 at 12:00, Asia/Singapore. Status: logged only; no runtime implementation, build or deployment.

In Roster > Check Availability, make the full width of each teacher option row the selection target, including the name and remaining blank space. Remove the visible checkbox. Clicking anywhere in the row toggles that teacher exactly once. Keep multi-selection, selected-name chips, chip removal, search, a clear selected-row appearance and keyboard operation with an accessible selected state.

The user confirms that teacher names and the table now load quickly, but table highlighting appears to wait for server data. Preserve the fast initial loading. Selecting or deselecting teachers must update chips, selected rows, table filtering and common-period highlighting immediately from the applicable timetable and any operational data already in browser memory. No request or server acknowledgement is needed for these display-only calculations, and the table must not be cleared or replaced by a blocking spinner after each selection. Reuse a complete current operational overlay when available rather than fetching a separate subset for each selection.

When live absence or relief data is still pending or stale, still calculate and highlight common blank periods locally, but label the result as timetable-only or awaiting live verification. Do not suppress baseline highlighting while waiting, and do not label baseline-only results as confirmed live availability. Apply live exclusions when the matching response arrives without resetting the selected teachers. Discard responses for old dates, models, accounts or selections where applicable.

Evidence: image(20261016-035913).png was inspected. It shows v0.7.06 Check Availability, selected chips for Chuan Song and Song Wee, a teacher dropdown with checkboxes, and a yellow annotation spanning Ada's option row. The table is already visible below, with a Baseline preview only notice. The alleged server dependency is the user's observed behavior, not something the static screenshot alone proves.

Acceptance: click the left edge, name and right-hand blank area of a teacher row; each toggles once. Verify keyboard selection and chip removal. With the timetable loaded and the network delayed or unavailable, changing the selected teachers updates baseline highlighting immediately and emits no API request attributable to selection. Test both a fresh live overlay and a pending overlay, plus rapid toggles and date changes. Keep current live-status wording accurate.

## 2026 in-force baseline decision: Noorfizah inactive in this version

Confirmed: 16 October 2026 at 12:00, Asia/Singapore. The user instructed: for 2026 in-force Deploy make Noorfizah inactive. This resolves the missing-load decision for the 2026 T4 post-PSLE baseline. Exclude her from that version's active workload and R pool without inventing a zero teaching load. Preserve her schoolwide Contacts record and the existing 2027 planning version.

Publication must respect the current Contacts review contract: merely setting the shared Active profile field to N would propose changing Contacts too. Use the supported version removal and publication review path with Contacts values retained, or another proven version-only mechanism; do not silently deactivate her in Contacts. Verify that the published 2026 R export excludes her and that Contacts remains Active=Y.

Execution status: the existing GSiS Deploy Apps Script editor is open under the user's school account. A temporary editor-only preflight helper has been saved, with no endpoint or trigger. It requires a Google-verified effective-user identity and live Admin authority, then reads and backs up the current source before any migration. Running it opened Google's permission consent screen for Drive, Sheets and external services. Consent has not been granted by the assistant; the preflight and school-data migration have not run. The current 2027 source guard remains revision 153, commit 38fb8cb6-e4b4-45bb-b9f2-1d9a8c3b319a.

## Queued after v0.7.06: Q707-06 Defer SMC override reasons to the first daily mass publish

Requested and clarified: 16 October 2026, 12:30–12:33 Asia/Singapore. Status: logged only; no runtime implementation, build or deployment.

Remove the per-edit Audit reason pop-up when SMC changes auto-filled relief assignments. Let SMC make these edits directly. At the first successful mass publish for the day, typically around 07:00 but triggered by publication rather than a timer, display a table of human changes to pre-filled data and one shared required text field for the audit reason. The user explicitly chose one shared reason, not one reason per row.

Normal human assignment of an originally unassigned period requires no audit reason. Unassigning a teacher to free that teacher also requires no reason. The screenshot's specific prompt says R is unverified: the user clarified that R/unverified-R and soft-limit overrides are exceptions to the empty-slot exemption and must join the publish-time review. Deferral changes when an explanation is collected; it must not invent verified R or bypass hard eligibility, absence, authority, collision, date or revision checks.

The user explicitly chose first publish only. After the first successful mass publish that day, continue recording subsequent edits in the underlying audit trail, but do not prompt for another reason that day. Preserve who changed what and when, including exempt changes; exemption means no required human explanation, not deletion of the audit event. Clarify any special treatment of later R overrides before implementation if the rule requires an exception to first-publish-only.

Proposed table columns for confirmation: absent teacher, class/subject, period, auto-filled covering teacher, final covering teacher/action, editor and edit time, and any R or soft-limit override. Do not show this proposed shape as already approved.

Still to clarify: whether the first publish is shared across all SMC for the selected school date; whether the table shows only final differences or every intermediate replacement; which automated fills establish the comparison baseline, including re-running Auto-allocate; and whether an empty review table should allow publishing without a reason. Avoid deciding these silently.

Evidence: image(20261016-042823).png was inspected. It shows a Confirm relief change modal for Dorcas, class 3R, period P12, with R is unverified and a required Audit reason field. The background candidate list labels candidates as Tier 1 / R override. This is an override prompt, not merely a generic save confirmation.

Acceptance to refine after clarification: no per-edit reason modal; correct exemptions; R/soft-limit override inclusion; one shared first-publish reason; no repeat prompts later that day; failed or cancelled publication must not consume the first-publish marker; exact retry must not duplicate the audit reason or publication; concurrent SMC edits must not disappear from review; new-day behavior uses the school timezone. Keep notifications paused unless separately authorised.

## 2026 in-force backend execution update, 16 October 2026 12:32 SGT

Google consent was granted by the user and the verified school editor has normal Admin authority. Read-only preflight passed on backend v0.7.06. The refreshed 2027 source is revision 154, commit 88656f25-95d7-45da-92d0-c7e635c4c1c2; its source hash is cde285341e329d15f89dc3a0e487401d50be0134b6dd95d77f872625d2183073.

The approved Contacts save completed through its normal saveData route. The separate 2026 T4 post-PSLE draft, ID 82076441-f087-4f82-9c34-7714ffe57f27, was created through change/create and populated through five normal saveDraft batches with stable request IDs and no returned conflicts. Metadata covers 14 October through 20 November 2026. Saved revision 7 passed read-back checks: 40 classes, 128 TGs, 514 assignments; 2,447 teaching periods, 410 FTT periods and 257 non-teaching periods. The reduction of three non-teaching periods is Noorfizah's version-only exclusion: two PD and one duty. Seven CCE teacher assignments are represented by six class-specific TGs under the current CCE TG-only contract, preserving each teacher's observed periods.

The unchanged 2027 source hash was verified after import. Publication review and final Roster verification remain in progress at this checkpoint; do not treat this paragraph as proof of publication. WhatsApp remains paused.

## Queued after v0.7.06: Q707-07 Bottom-align Assign Relief controls on the right

Requested: 16 October 2026 at 12:35, Asia/Singapore. Status: logged only; no runtime implementation or build.

In Roster > Assign Relief, place the Relief/Combine segmented control and the Search teachers input on a common bottom baseline at the right-hand side of their toolbar. Keep Find a teacher above its input without pushing the input below the segmented control. Preserve the existing control functions and provide a sensible wrap on narrow screens.

Evidence: image(20261016-043530).png was inspected. Red annotations underline the Relief/Combine control and search field at different heights. The request concerns their lower-edge alignment, not changing the No Relief Needed or Undo actions above.

## Queued after v0.7.06: Q707-08 Same-venue teachers missing in Assign Relief

Requested: 16 October 2026 at 12:36, Asia/Singapore. Status: logged only; no runtime implementation or build.

The user reports that Tseh Chyn should appear under Other teachers in the same venue for the selected Song Wee lesson, but the page shows None. Investigate the selected date, odd/even week, weekday and period against the cached timetable; match all relevant venue components rather than requiring equality of a whole display string. Confirm the exact cause before changing business rules. Teacher identity/name normalisation and cells containing multiple venues or class annotations must be covered.

Evidence: image(20261016-043622).png was inspected. Song Wee's P1, 07:30–08:00, is selected. Its text reads Form / 3R / D2-09 (3R) / Hall,Class. The Other teachers in the same venue section says None. The expected inclusion of Tseh Chyn is the user's reported fact; this screenshot does not show Tseh Chyn's own cell.

Acceptance: the matching teacher appears for this exact timetable context; matching does not cross dates, weeks or period columns; normalised common rooms are detected in multi-venue cells; unrelated teachers are excluded; local same-venue display uses the already loaded model without another selection-time server wait. Being listed in the same venue does not by itself override live absence or assignment eligibility checks.

## Publication approval block, 16 October 2026 12:37 SGT

The completed normal publication review for 2026 draft revision 7 contains exactly one difference: Noorfizah's removed-from-version proposal. The prepared approval retains every existing Contacts value, including Active=Y. Local validation confirms this leaves her excluded from the version's R export without changing Contacts.

Automatic approval review rejected running publishInForce2026. Stated reason: publication changes the active Deploy version and downstream Roster data; preparing the in-force backend draft and its review was authorised, but activating it was not judged explicitly authorised. No alternative route may be used to evade that decision. The draft remains saved and verified; activation awaits the user's explicit approval. This checkpoint is not a publication success claim. The existing published snapshot remains the prior 2027 initial planning snapshot unless independently changed by another authorised user. No WhatsApp message or activation occurred.

## Queued after v0.7.06: Q707-09 Three-part selected-period action row

Requested: 16 October 2026 at 12:41, Asia/Singapore. Status: logged only; no runtime implementation, commit, build or deployment.

In Roster > Assign Relief, use Stapler Module 3 as the visual reference but follow the user's explicit new arrangement: one horizontal row immediately above the assignment/candidate panel, divided into three equal-width sections. The left third contains Other teachers in the same venue and its matching names or empty state. The middle third is the Clear assignment button. The right third is the No relief required button. Keep the three sections aligned with consistent gaps.

Clear assignment operates only on the currently selected absent teacher's period, removes its existing relief assignment, and returns it to an unassigned state. No relief required is a separate action that marks the selected period as needing no relief. Neither is a whole-day clear action. Keep the existing save, authority, revision and retry checks, and apply the confirmed reason exemptions from Q707-06 when freeing a teacher. Same-venue content must follow the selected period and include the Q707-08 matching correction.

Evidence: image(20261016-043911).png was inspected. The Stapler reference shows a full-width same-venue panel above a separate two-button row, with No Relief Required on the left and Clear Assignment on the right. The user explicitly changes that arrangement to a single row ordered same-venue teachers, Clear assignment, No relief required; the written instruction takes precedence over the screenshot's existing order. Preserve the compact visual grouping and clear button distinction without copying the old two-row layout.

Acceptance: desktop shows the same-venue panel at one-third width, Clear assignment centred in the middle third, and No relief required in the final third, all on one row. Switching the selected period updates the same-venue list and both action targets. Clearing an assignment does not mark the period as no relief required or alter other periods. Keep labels readable and keyboard access intact; on narrow screens preserve the same reading order without clipping.

## Queued after v0.7.06: Q707-10 Stapler colours, Combine/Relief modes and assignment inside the selected slot

Requested: 16 October 2026 at 12:43, Asia/Singapore. Status: logged only; no runtime implementation, commit, build or deployment.

In Roster > Assign Relief, follow Stapler Module 3's supplied colour scheme: dark navy/slate panel surfaces with white text, teal active mode and tier accents, pale green candidate cards, golden yellow selected-period highlighting, amber assignment/clear accents, blue Assign actions and a neutral grey No relief required action. Match the reference while preserving readable contrast and the already requested compact layout. Do not restore the reference's older two-row action layout; Q707-09's three equal sections still apply, as does Q707-07's right-hand control alignment.

Change the Swap/Relief control to Combine/Relief, with Relief selected by default. Combine must represent combining the selected absent teacher's class with the colleague's existing lesson, not merely rename an underlying swap operation. Keep the distinction from ordinary relief cover and retain applicable eligibility and conflict checks.

Move each candidate's Assign button from the teacher-card header into that teacher's timetable cell in the currently selected period column. The action targets the selected absent teacher, date and period and follows the chosen Combine/Relief mode. Do not put assignment actions in unrelated period columns. Preserve the cell's lesson information and make the action accessible by keyboard as well as pointer.

Evidence: image(20261016-044242).png, image(20261016-044259).png and image(20261016-044335).png were inspected. The latter two annotate the mode switch and arrows from header Assign buttons into the selected P4 cells. Acceptance: compare colours against Stapler, verify Relief is the initial mode, verify Combine semantics, and confirm each in-cell Assign action targets the selected column without duplicate header buttons or altered adjacent periods.

## Queued after v0.7.06: Q707-11 Support all requested baseline timetable import formats

Requested: 16 October 2026 at 12:45, Asia/Singapore. Status: logged only; no runtime implementation, commit, build or deployment.

Roster baseline timetable ingestion must support all six combinations below. The user's term "illegal" MSHTML Excel means the HTML-based spreadsheet export presented as an Excel file; "legal Excel" means a genuine Excel workbook. Both are required inputs.

| Source format | Single-week timetable | Odd/even-week timetable |
| --- | --- | --- |
| MSHTML Excel export, five-row lesson format | Required | Required |
| Genuine Excel workbook, four-row lesson format | Required | Required |
| Genuine Excel workbook, variable-row lesson format | Required | Required |

Detect the actual file content rather than relying only on its extension. Parse the supported lesson layouts without assuming that every source has the same fixed row count. Preserve teacher identities, weekday/period positions, subjects, classes and venues, and retain the correct single-week or odd/even-week interpretation. Normalise these inputs into the common Roster baseline model used by the in-memory timetable cache and downstream views.

Acceptance: use representative files for each of the six combinations and compare the parsed timetable against its source. Check that missing or variable lesson rows do not shift data into another teacher, period or week; odd and even lessons remain distinct; and single-week files retain their intended schedule. Validate the complete candidate model before replacing the active baseline, with a clear error for ambiguous or unsupported input and the existing baseline retained on failure. The six-format requirement is logged; no import compatibility is claimed as implemented or tested yet.

## Queued after v0.7.06: Q707-12 Roster Home grid and Stapler icon

Requested: 16 October 2026 at 12:54, Asia/Singapore. Status: logged only; no runtime implementation, commit, build or deployment.

Fit four function tiles across the Roster Home page on desktop browsers. Add Stapler in the first row, fourth for SMC and third for ordinary teachers. Preserve the existing first two functions and SMC-only Assign Relief visibility:

| Viewer | First | Second | Third | Fourth |
| --- | --- | --- | --- | --- |
| SMC | Report Absence | Manage reported absences | Assign Relief | Stapler |
| Ordinary teacher | Report Absence | Manage reported absences | Stapler | No additional function requested |

Use a flat 2D stationery stapler icon with a dark gold outline, matching the existing icons' line weight, scale and simple style. Preserve readable labels and responsive wrapping on smaller screens; do not squeeze four columns onto a phone. Keep the existing single horizontal divider below the priority row and the remaining functions below it. Showing Stapler to an ordinary teacher does not itself grant editing or publishing authority: its entry must support the sponsorship workflow in Q707-14.

Evidence: image(20261016-044829).png was inspected. It shows the current three-column Home layout, with Report Absence, Manage reported absences and the SMC-only Assign Relief tile above the divider. No icon asset or runtime layout has been changed in this logging task.

## Queued after v0.7.06: Q707-13 Stapler dated tile planner with draft and published states

Confirmed requirements: add a Stapler function within Roster, using Module 2 of the supplied offline Stapler tool as the interaction reference. Load the baseline timetable applicable to an exact selected date and use lesson tiles to rearrange that day's timetable. Provide separate draft and published states. SMC may continue editing after publication and publish again to update the published state. The user will supply further specifications; do not import the offline application wholesale or assume every Module 2 feature is approved.

Reference reviewed: Stapler_v4_3_Reference(2).md, especially section 3.2, and Stapler_v4_3(2).html. Module 2's teacher/class projections share one tile collection, holding area (Card Pit), clash engine and undo history. These are useful design references, not an instruction to duplicate every pane, suspension feature, import/export function or free-text editing rule. The offline tool's saved JSON is not an online draft/publish mechanism. Its manual Odd/Even selection, name-based identities, grouped-subject heuristics and Swap behaviour must not replace GSiS date resolution, staff identity, Subject Type/TG or Combine contracts.

Design constraints identified by the Ponytail/Pstack review, to guide the later implementation:

1. Resolve the exact school date, weekday and week parity against the applicable baseline and Calendar. Record the source baseline identity/revision so a changed baseline is detectable.
2. Keep draft edits separate from the live published timetable. A draft move must not cancel existing relief, change live availability, alter an accepted colleague arrangement or send a notification. Saving a draft is not publishing it.
3. Use one effective published timetable for each date across Stapler, Relief, Check Availability, teacher timetable views and absence demand. Retain the origin of changes for audit, while deriving staff-facing duties from the combined result.
4. Publish against current permission, baseline/date, plan and affected operational revisions. Validate teacher/period conflicts and affected relief before committing. Preserve unrelated assignments and reject stale conflicting publication rather than silently overwrite another editor. Exact retry must not duplicate a publication or notification work item.
5. Republish a new revision while preserving the previous published state until success. Do not accidentally publish unrelated Relief drafts or another planner's unapproved work. The precise joint-publication boundary remains to be specified.
6. Reuse the loaded timetable and local indexes for tile display, selection, filtering and draft previews. Authoritative save/publish checks remain on the backend. Use the existing notification infrastructure instead of a separate Stapler delivery system.
7. Preserve real absence restrictions when rearranging lessons. The offline tool's teacher-suspension marker is a one-time planning evacuation, not proof that an absent teacher has become available.

The later specification in Q707-16 onward defines tile moves, linked views, holding area, suspension, add-row actions and recess cards. Confirmed on 16 October at 15:53: orange teacher transfers count as relief; Card Pit need not be empty for publication; recalculate R minus Block for the affected week using the suspended day's plan. At 16:00 the user chose full weekly R recalculation and confirmed that suspension mats are visual only and do not count as periods. Remaining questions include detailed activity accounting and edit permissions; teacher/class/venue conflicts and legitimate combined lessons; multiple planners for one date; handling a baseline replaced during drafting or after publication; and the joint publication boundary with Relief. Accounting follows stored assignment semantics, not rendered colour.

Earlier baseline decisions allow an SMC baseline replacement to take effect during the day. Recording a draft's source revision must not silently turn an old baseline into the current source of truth; an explicit reconciliation rule is needed. This entry is a specification record, not evidence that the new planner exists.

## Queued after v0.7.06: Q707-14 Restore the approved teacher sponsorship workflow for Stapler

Prior decisions recovered from the 14 October 2026 conversation at approximately 09:05 to 09:08 Asia/Singapore, in response to the user's request to comb the earlier chats:

1. An ordinary teacher can request Stapler planning for one particular date and nominate an SMC sponsor.
2. Any SMC member can approve the request, not only the nominated sponsor.
3. Once approved, the teacher can plan and publish for that date only.
4. The nominated sponsor receives the approval notification.
5. WhatsApp replaces email for this workflow. The approval message identifies the date and permits the teacher to log in and plan; a rejection may include the deciding SMC member's comment.

The current v0.7.06 source does not implement this sponsorship contract. Its external-recipient link supports viewing/responding/acknowledging and is not a planning grant. Implement future sponsorship as an explicit dated permission tied to the existing staff identity, with live checks on protected operations. Do not give the teacher a general SMC role, baseline administration or unrestricted Relief publication rights merely to enable Stapler publishing.

Unresolved details: expiry beyond the date scope, revocation, whether a grant covers all teachers/classes for that date or a narrower subset, concurrent grants for the same date, and the approved teacher's ability to republish after SMC has revised that day's plan. These were not found as confirmed decisions and must not be invented. The date restriction is confirmed; it does not by itself establish when future-date preparation starts or when editing expires.

Retrieval scope: the relevant sponsorship decisions were recovered; this is not a claim that every conversation in the project was exhaustively accessible. No sponsorship request, approval, privilege change or WhatsApp send was performed.

## Queued after v0.7.06: Q707-15 Unified timetable-change notifications

Confirmed requirement: a teacher is eligible for a timetable-change WhatsApp notification when at least one period in that teacher's final published timetable differs from the baseline for the selected date. Whether the difference came from Stapler or Relief must not change notification eligibility. Retain that origin for audit without splitting the staff-facing result into contradictory schedules. Draft changes do not qualify for operational notification.

Use the final published teacher/date timetable for the comparison and notification content. Do not count UI layout, filters or styling as timetable changes. The exact material fields still need definition, including subject, class/group, venue, teacher allocation, period placement and availability status. Unchanged teachers should not be included merely because someone published a plan.

Recommendation, not yet confirmed: compare each eligible teacher's current published timetable with the last notified schedule to avoid sending the same unchanged altered timetable on every republish. Send a correction to a teacher previously notified of a change when a subsequent publication restores the baseline. Without that correction, a teacher can keep following an obsolete instruction even though the current baseline difference is zero. The notification-policy clarification offered during this turn received no answer, so this recommendation is not recorded as an approved rule.

Further details to settle: message timing for future dates versus same-day updates, whether every republish deliberately renotifies all affected teachers, the return-to-baseline correction rule, the approved template/content used for timetable changes, and acknowledgement behaviour across published revisions. Preserve existing delivery status and exact-retry protections; a failed send must not be treated as successful delivery.

WhatsApp activation remains paused. This requirement describes future behaviour only; it does not authorise sending messages, enabling scheduled notification flags, activating the customer-service window or submitting templates now.

Specification acceptance for Q707-12 through Q707-15: check Home order for both roles; exact-date baseline selection; immediate local tile interactions; isolated draft edits; successful publication and repeat publication; concurrent/stale/revoked-authority handling; consistent published teacher and Relief views; one comparison across both change sources; and notification/reversion behaviour once its policy is confirmed. No implementation or production performance claim is made.

## Queued after v0.7.06: Q707-16 Compact Stapler workspace and three visibility controls

Requested: 16 October 2026 at 15:28, Asia/Singapore. Status: specification updated only; no runtime implementation, commit, build or deployment. These requirements refine Q707-13 using image(20261016-072823).png, which was inspected.

Use the annotated desktop arrangement: Teacher POV above Class POV on the left, with Card Pit and compact planning controls on the right. Remove the crossed-out offline Module 2 controls and redundant vertical rows. The screenshot crosses out the 2A Plan / Classes heading, old pane checkboxes, Left/Right versus Top/Down mode control and separate full-width teacher search row. It moves summary counts into the upper status area. Preserve GSiS draft/publish behaviour. Legacy Load State is now expressly requested in Q707-25; the remaining offline save/export controls are still reference context rather than automatic approval to port those functions.

Place three pill buttons at the top right: Teacher POV (the screenshot abbreviates this as Tcher POV), Class POV and Card Pit. Each toggles its corresponding window independently. Hiding a window changes presentation only, without discarding its tiles, selections or draft. Reclaim the hidden window's space while keeping the pills reachable. Define a usable result if all three are hidden rather than removing the way to reopen them.

Teacher POV and Class POV each have their own partial-text name filter, placed compactly in the corresponding left-hand name/header area as shown. Filters operate immediately on the loaded local model and do not change planner data or clash calculations. Keep timetable columns aligned across both views. Show period numbers and timings above the Teacher POV grid and below the Class POV grid, as in the reference.

The horizontal bar between the two POVs serves both functions requested by the user: drag left/right to scroll period columns in both POVs together; drag up/down to change their relative heights. Implement distinguishable horizontal and vertical gestures so resizing does not accidentally change the selected period or drag a lesson. Keep teacher/class name columns visible during horizontal scrolling. The right-hand Card Pit remains its own usable panel.

Acceptance for the later build: verify the compact arrangement on desktop and a 13-inch school laptop, each pill independently, both local filters, shared period alignment, horizontal scrolling and vertical resizing. Preserve usable type and access to controls at increased browser scaling. Do not copy the offline app wholesale.

## Queued after v0.7.06: Q707-17 Linked lesson tiles, persistent baseline ghosts and colour rules

Confirmed interactions: a live lesson tile can be dragged from either Teacher POV or Class POV into Card Pit. Pit tiles retain all lesson information, including teacher, subject, class/group and venue, plus their source date, period and baseline identity. Moving a tile between views or into Pit is a change of location of the same lesson, not creation of another scheduled lesson. Both POVs are projections of one shared timetable; a drop from Card Pit into Class POV updates the corresponding teacher's timetable row too.

Use the user's colour rules:

| Tile state | Appearance |
| --- | --- |
| Original unchanged live lesson | Light blue |
| Edited lesson | Green |
| Lesson moved to a different teacher, directly or through Card Pit | Orange |
| Original baseline reference left behind | Grey ghost |
| Suspended teacher/class time range | Grey deskmat behind the working tiles |

Whenever a card moves away from its original position, imprint its baseline ghost in the original position. Keep that original reference even if a new live tile occupies the same cell; a replacement must not erase the reference. The screenshot's Suriwati Period 6 illustrates the source ghost, while the orange Covering Suriwati tile appears in Yanyu's row. Repeated moves must retain the original baseline reference rather than making the previous edited position a new baseline.

The baseline reference is the basis for timetable-change comparison in Q707-15. Store it in the model; do not derive notification differences from rendered colours, visible filters or DOM ghosts. A ghost is a reference, not an active lesson: it must not consume teacher availability, double the workload or create duplicate class demand. Retain the user's exact-date baseline contract and the still-open rule for replacing that baseline during a live planning day.

Pit-to-another-teacher and direct teacher-to-teacher transfers create the orange reassigned live representation while retaining the original source teacher for explanation/audit. Confirmed on 16 October at 15:53: these transfers count as relief against the receiving teacher's R. Integrate them with the shared relief ledger so the same cover is not counted twice through Stapler and Assign Relief. Do not mechanically import the offline Swap operation, which drops the recipient's own lesson.

For a Class POV drop, retain the tile's teacher identity unless the planner explicitly changes the teacher; place the lesson at the destination period/class and update that teacher's row. This is the working interpretation of the user's linked-POV statement, to confirm if a different assignment gesture is intended. Derived TG/class handling must keep GSiS identity and demand rules; one shared lesson must not become duplicates when rendered in several class contexts.

Still to settle: colour priority for a tile that is both edited and reassigned; colour for newly created extra periods (pink is visible in the screenshot but was not expressly specified); whether a ghost is hidden when the unchanged original tile returns to its exact source; and how to display content-only changes alongside the original reference. Occupied teacher/time destinations are now resolved by Q707-26: reject the conflicting move immediately. Keep unresolved choices separate from confirmed behaviour.

## Queued after v0.7.06: Q707-18 Teacher/class suspension deskmat and Card Pit

Suspend teacher applies to a teacher present in the selected baseline. For the chosen time range, place a grey deskmat across that teacher's period cells and move all existing live tiles in the range into Card Pit. Their baseline ghosts remain visible. A planner can return those cards, including edited cards, onto the same teacher within the mat. The Yanyu example shows live green/orange/pink cards on a grey suspension mat with original ghosts still present.

Suspend class performs the corresponding operation for the selected class/time range: move its live lesson cards into Card Pit and spread a grey deskmat across that range in Class POV. Synchronise the teacher view immediately. A shared lesson shown in both POVs must be moved only once; exact treatment of a lesson shared with an unsuspended class still needs a decision.

The deskmat is a planning marker and the suspension is a tile evacuation, not a permanent prohibition on placing lessons back. It is distinct from a reported absence. Returning a tile onto the mat does not cancel an actual absence or override an absence conflict. These changes apply to the draft until publication; moving draft cards into Pit must not silently cancel live published relief.

Card Pit remains a holding area, with lesson information intact and its search/filter operating locally. A Pit card is unplaced in the working draft, while its baseline ghost remains a source reference. Confirmed on 16 October at 15:53: Card Pit need not be emptied before publication. Retain these cards as unplaced planning history rather than active lessons. This does not cancel the separate requirement that traditional classes have no free periods from 07:30 to 13:30. Confirmed at 16:00: a named suspension mat is visual only and does not count as a period or supply class coverage. A temporary draft drag into Pit does not itself change the published timetable.

Still to settle: overlapping/repeated suspension ranges, removal of a deskmat, and suspension effects on shared multi-class lessons and existing published relief. Restoring cards to a mat is confirmed and must remain possible.

## Queued after v0.7.06: Q707-19 Add teacher, add class and class-wide edits

Revised on 16 October at 15:53: Add teacher opens a popup to choose an inactive teacher OR create a new teacher with basic name and modifier. This supersedes the earlier active-and-inactive selector requirement. Selection adds a row in Teacher POV and the day's ad-hoc external relief entry. Reuse the existing staff identity for a selected inactive teacher; create a new identity only through the confirmed new-teacher route in Q707-23. Do not duplicate an existing row or book one person through separate identities. Adding an inactive teacher for a date does not by itself reactivate their Contacts record or grant login/SMC rights.

The user answered the accounting question with: recalculate R minus Block based on the suspended day for that week. Q707-24 records this requirement and its remaining arithmetic questions. Selection of an inactive teacher does not itself verify contact details, notification delivery or availability. Q707-23 records the newly authorised product capability to create a minimal teacher record and alert Admin for completion; it is not authorisation to create a live record during this specification task.

Add class creates a new row in Class POV. The user's phrase "ad-hoc created cross" is provisionally interpreted as an ad-hoc created class, supported by the Add class control and LO class row shown in the screenshot. Such a class retains the ability to apply a one-shot edit across its tiles when required. The reference shows Subject, Venue and Group fields with an apply arrow. Preserve this bulk-edit concept; confirm whether it covers every tile for the class or only a selected period range before implementation. Apply a bulk edit as one coherent draft operation and reflect it in both POVs without changing each tile's stored original baseline.

The screenshot also retains Give teacher extra period(s). This is noted as reference context; detailed creation, colour and counting rules remain for clarification. No unrelated offline workbook import/export or added-teacher persistence mechanism is adopted automatically.

The three initial clarification questions were answered on 16 October at 15:53: orange transfers count as relief, Card Pit need not be emptied, and R minus Block is to be recalculated for the affected week using the suspended day. The Add teacher selector was narrowed to inactive teachers or a new teacher. Further arithmetic, coverage and layout details remain as recorded below. Existing sponsorship, draft isolation, publication checks and paused WhatsApp activation continue to apply.

## Queued after v0.7.06: Q707-20 Effective timetable layers and personal comparison page

Requested: 16 October 2026 at 15:53, Asia/Singapore. Status: specification only; no implementation, build, live publication or notification activation. Evidence: image(20261016-073210).png was inspected; it retains the stacked planner and adds Reset Recesses beside Add teacher/Add class.

The user defines the frontmost tile as the effective activity for a position. Relief operates over the final Stapler plan and is the highest operational layer. Keep the usual baseline underneath, with suspension mats and edited/reassigned tiles layered over it. A mat can have working cards placed on it. The final published front layer is compared with the baseline; a teacher with at least one effective period different from baseline qualifies for a notice, whether the difference came from suspension planning or relief.

Treat this as explicit timetable state, not incidental visual stacking order. The same effective result must feed teacher/class views, availability, absence demand, relief allocation and notification comparison. Lower reference layers must not count as simultaneous live lessons or make a hidden duplicate assignment valid. Confirmed at 16:03 in Q707-26: one teacher cannot have two live tiles at the same time. Reject a conflicting placement immediately; drawing one tile above another is not a way to permit a duplicate assignment.

Provide each teacher with an individual page showing today's published modified timetable above their usual baseline timetable, with both rows aligned by period number and time. The upper row includes the final effect of Stapler and Relief; the lower row remains the usual baseline for comparison. Resolve today using the school timezone and do not expose unpublished drafts as duties. Reuse the shared cached model and published date data for responsive display. Previously logged notification deduplication and return-to-baseline correction choices remain open.

## Queued after v0.7.06: Q707-21 Purple recess cards, configured defaults and full class-day coverage

Create one purple recess card for each traditional class, linked to that class's level. These are class-level schedule records, not fictitious teacher lessons. The user's initial defaults are:

| Level | Recess starts | Recess ends |
| --- | --- | --- |
| P1 | 08:30 | 09:00 |
| P2 | 09:00 | 09:30 |
| P3 | 09:30 | 10:00 |
| P4 | 10:00 | 10:30 |
| P5 | 10:30 | 11:00 |
| P6 | 11:00 | 11:30 |

Store configurable default recess timings in Roster > Recess Regression. Stapler reads that setting; do not keep another independent copy of the same defaults. The school can change these settings in future. Keep recess designation separate from the existing Recess Regression workflow that creates supervision demand; a purple card alone must not silently activate or duplicate relief demand.

Clarified on 16 October at 16:00: moving a purple recess card uses adjacent jump-swaps, accordion style. As it crosses each neighbouring period, that adjacent lesson moves into the position recess just vacated. Across several periods, the intervening lessons shift one slot in sequence while retaining their relative order. This replaces the earlier endpoint-only swap interpretation. For example, Recess then English then Maths becomes English then Maths then Recess when recess is dragged across both lessons. Update every affected teacher row through the linked model.

Apply the gesture to the selected class's recess card; a whole-level bulk move was not requested in this clarification. Recess continues to prevent a simultaneous teaching lesson for the affected class. The earlier wording about blocking a whole level still needs confirmation if it was intended to apply to other classes whose own recess cards have not moved. No card or intermediate lesson is discarded into Pit by the normal adjacent-swap gesture.

Traditional primary-school classes must remain filled with valid activity, including recess, from 07:30 through 13:30 with no free periods. Keep ordinary classes distinct from TGs and ad-hoc planning rows when checking this rule. Card Pit may remain populated; a removed source lesson need not be scheduled if another valid activity covers its class slot. Confirmed on 16 October at 16:00: a suspension deskmat, even with an Exam or Invigilation reason, is visual only and does not count as a period. Class coverage requires a live lesson, recess or activity card; ghosts and mats do not fill gaps.

Still to specify: the handling of multiple/co-taught/TG tiles in an adjacent slot and whether recess can be placed in Pit. Teacher clashes are resolved by Q707-26: block the conflicting adjacent swap immediately. Preserve stable class identities and avoid duplicating recess cards across teacher or derived TG rows. Drag cancellation must restore the pre-drag order rather than leave a partially applied chain of adjacent swaps.

## Queued after v0.7.06: Q707-22 Reset Recesses and current venue list

Add Reset Recesses as shown. It moves purple recess cards back to their intended default timings from Recess Regression. Cards occupying those default recess slots are moved into Card Pit. This remains distinct from the manual accordion gesture, which shifts adjacent lessons in sequence rather than sending them to Pit. The reset must update both POVs coherently, preserve each displaced card's information and avoid duplicate purple cards or duplicate Pit entries.

The user expressly permits Pit contents, but resetting recesses can leave a former recess position empty. The full class-day coverage rule still applies. Clarify whether the planner fills such positions manually or a specific restoration rule is required; do not silently restore arbitrary historic lessons. A repeat reset with no intervening changes should not create more tiles or move the same card twice. Keep this within the draft until publication.

Obtain the currently in-force venue list from the authoritative Deploy/Layout data, instead of relying on the offline workbook's free-text venue list or a hardcoded list. Use its existing identities where available and cache the list for local selection. The exact authoritative API and treatment of future planning dates still need to be verified during implementation; this request does not justify inventing another competing venue catalogue.

## Queued after v0.7.06: Q707-23 Suspension reasons, fixed-size animation and revised Add teacher

Clicking Suspend opens a popup asking for the reason before applying the suspension. The example is Invigilation for Yanyu. Preserve the reason with the suspension and display it on the grey deskmat. This applies to teacher/class suspension, and remains separate from the deferred first-mass-publish relief override reason in Q707-06. Cancelling the popup leaves tiles in place. Whether an empty reason is allowed remains to be confirmed.

When suspension is applied, animate the affected live tiles along a parabolic arc from their current cells to Card Pit. Keep their size stable during flight and in Pit. Card Pit must not dynamically resize its cards as the number of cards changes. Use scrolling or wrapping at the defined card size, retain all tile information, and let the model update correctly even when animation is skipped for reduced-motion accessibility. Animation must not introduce a server wait or duplicate the movement operation.

Add teacher now offers inactive teachers or Add new teacher. A new teacher requires a basic name and modifier, following Deploy's established naming approach. Check for timetable-name clashes, prohibit duplicate TTb names and permit a custom modifier to distinguish names. Reuse the canonical TTb naming/normalisation contract and validate the final name on the server so concurrent creation cannot create duplicates. The resulting day row and ad-hoc relief entry must resolve to the same identity.

Alert Admin to complete the new teacher's other details in Contacts viewport. The product capability is confirmed; no live staff record or alert is created now. Do not invent contact channels or treat an incomplete new record as notification-ready. Before implementation, settle who may create the minimal record and alert, particularly a sponsored teacher versus SMC/Admin, and how this fits the existing Contacts approval contract. Choosing an inactive person is not permission to reactivate them globally.

## Queued after v0.7.06: Q707-24 Weekly R minus Block recalculation and transfer accounting

Confirmed answers: moving a lesson to a different teacher is relief and counts against the receiving teacher's R; Card Pit need not be empty; recalculate R minus Block for the affected week based on the suspended day's timetable.

The weekly adjustment must use the effective suspended-day plan while keeping other dates in that week intact. Count a single orange assignment once even when visible in both POVs, imported from a legacy relief plan, or subsequently displayed in Assign Relief. A draft can show an estimate, but it must not silently change published accounting. Republish must replace the prior revision's effect rather than deduct it again. Reversal/cancellation must not leave an old deduction in place.

Clarified on 16 October at 16:00: recalculate the full weekly R using the affected day's revised teaching and duties; do not hold Deploy's original R fixed and change only Blocks/relief used. Keep the other days in that week intact and retain source provenance. This is an operational recalculation for the affected week, not permission to rewrite the permanent Deploy baseline or historical weeks.

Detailed activity mapping remains to be defined: how invigilation, replacement activities, suspended teaching and orange cover contribute so the same period is not charged twice as both revised ordinary teaching and relief. A visual suspension mat alone contributes no period; actual activity cards determine the revised workload. Preserve the distinction between the recalculated quota, Block and relief used. New/inactive external staff without the necessary workload inputs must not be assigned an invented quota.

## Queued after v0.7.06: Q707-25 Load legacy Stapler Relief plans as an overlay

Support loading saved plans from the legacy offline Stapler application. Use the more complete Relief state as the migration source and overlay its final timetable/relief state on the chosen GSiS date baseline. Keep the usual baseline intact for ghosts and notification comparison. This is an explicit compatibility/import requirement; it does not authorise wholesale adoption of the offline code or its old rules.

Validate date, week/period timings, teacher TTb identities, classes and venues before accepting the overlay. The legacy payload contains shared Plan and Relief data; derive its final effective result without losing either layer or turning ghost/Pit tiles into live lessons. Map imported cover into the same relief accounting used by new orange transfers, once only. Present unmatched identities or incompatible time axes for resolution rather than silently attach them to a similarly named teacher or wrong day.

Import into a reviewable draft, using the ordinary publish path to make it live. Loading or retrying the same state must not automatically publish, notify, reactivate staff or double-count cover. The precise supported legacy versions, handling of old Swap records, and what to do when the imported embedded baseline differs from GSiS's selected baseline require clarification. Existing published changes must not be silently overwritten on import.

Clarification update, 16 October 2026 at 16:00 Asia/Singapore: recess moves use adjacent jump-swaps in an accordion sequence; suspension is a visual indicator and does not count as a period; recalculate the full weekly R. These answers are incorporated above. At 16:03 the user confirmed the immediate teacher-clash prohibition in Q707-26. All entries remain queued specifications; no code, live publication or WhatsApp activation occurred.

## Queued after v0.7.06: Q707-26 Reject teacher/time clashes immediately

Confirmed: 16 October 2026 at 16:03, Asia/Singapore. The user instructed checking Stapler's existing rules and disallowing two tiles for the same teacher at the same timing. This closes the earlier question about permitting conflicting draft placements: reject the conflicting operation immediately rather than accept it as a red draft clash.

Verified against Stapler_v4_3(2).html: teacherWouldClash checks the complete active tile collection for another tile with the same teacher and assigned period, excluding the tile being moved. Both moveToTeacher and moveToClass call this check before mutating the tile; the tile editor applies it before saving a changed teacher. The reference document's invariant is one teacher, one place, one period. Filtering is presentation only. This source review confirms the offline rule; it is not a claim that the new online Stapler function has been implemented.

Apply the rule consistently to Teacher POV, Class POV, Card Pit placement, teacher changes in tile editing, orange transfers and every displaced lesson in an accordion recess swap. Evaluate the complete proposed result of a swap before accepting that step, so a teacher moved by the swap cannot be double-booked elsewhere. Reject the step without partially moving its cards, identify the conflicting teacher/time, and preserve the last valid draft state. A filter or hidden POV must not conceal a clash from validation.

Use stable teacher identity and actual timetable timing in GSiS. Recheck on authoritative saves and publication to catch concurrent changes. A legacy import with a clash needs resolution before the conflicting placements can enter the accepted draft; do not silently drop one lesson or import the clash as an acceptable plan.

Baseline ghosts, suspension mats, unplaced Pit cards and duplicate projections of one underlying lesson are not additional live teacher assignments. Class co-teaching by different teachers is not prohibited by this teacher-specific rule. A top Relief layer represents the effective assignment and must not preserve a second live assignment for that same covering teacher/time underneath it. Existing Combine semantics remain separate and must not be implemented as two unrelated live tiles that bypass this rule.

Status: specification updated and reference checked only. No runtime code, build, deployment, staff-data mutation or notification activation.


## Q707-27 — SMC duty roster and v0.7.07 build authorisation

User authorised the next deployment-ready build, using Ponytail and Pstack, with surgical changes, atomic saves and batched operations where applicable. In this project “commit” means versioned Cloudflare Pages deployment ZIPs; it does not instruct a Git commit, live deployment, live timetable publication or message send.

Add an SMC-only Duty Roster page. For the selected operational date, show checkboxes for SMC members resolved from the current in-force Deploy version and verified against current Contacts authority. Include start/end time selectors in Singapore time. Permit selecting only the signed-in user when that user is an eligible SMC member. No in-force version means a visible unavailable state, never a fallback to all staff.

Implementation interpretation: the duty row is keyed by operational date. Its time window applies to the Singapore clock at dispatch, including previous-evening reports about that date. An evening report is eligible only if its window includes that evening clock time. Selection controls SMC duty notifications, not unrelated teacher notices. Keep all WhatsApp/automation activation flags disabled in the package.

Build in progress; verification and final shipped/deferred reconciliation follow in the v0.7.07 release notes.


## Q707-28 — Baseline Upload owns recess and timing (supersedes Q707-21/22 timing storage)

User retracted the new recess specifications/settings under Recess Regression because Baseline Upload already includes level recess selections. Keep those existing baseline controls as the single source. Stapler's recess defaults and Reset Recesses use the selected uploaded baseline; no duplicate Recess Regression timing controls or separate timing store. Existing Recess Regression naming and activation behaviour remains.

Under Baseline Upload, step 3 Period Timing now contains Period 0 start time (default 07:00), minutes per period (default 30), and end of day (default 13:30). Last period is read dynamically from the uploaded timetable. All imported later periods are retained; end of school day is not a truncation instruction.

The correction is included in the authorised v0.7.07 build.


## v0.7.07 delivery reconciliation

The authorised source build implements Q707-01 through Q707-28, with Q707-28 superseding duplicate recess-timing settings. See CHANGELOG_v0.7.07.md, VALIDATION.md and verification/707-final-release-review.md in the release for implementation and validation. The latest timing fields are Period 0 start 07:00, 30 minutes per period and end of day 13:30; the uploaded last period is dynamic and later periods are retained.

SMC Duty Roster uses current in-force membership and explicit duty times, with a Select only me shortcut. This selects SMC notice recipients only. New Stapler templates remain prepared, not submitted. All messaging and scheduled activation flags stay disabled. No live deployment, Git commit, staff-data cleanup, in-force publication or message send was performed.

Remaining operational actions: install matching backends/frontends, publish a valid current in-force Deploy version through its guarded workflow, obtain needed template approvals, and separately authorise recipient-specific delivery testing. Genuine binary BIFF .xls needs Save As .xlsx; ambiguous or unsupported legacy plans require correction.


## Queued after v0.7.07: Assign Relief Home tile hover fill

Logged: 16 October 2026, 17:32 Asia/Singapore. Reference: image(20261016-093213).png.

On Roster Home, remove the persistent green background fill from the Assign Relief tile. Show the green fill only while the mouse pointer is over that tile, and restore its neutral background when the pointer leaves. Clicking or leaving the tile must not retain a green fill. Keep the existing green icon and label styling and the SMC access rule. Retain a visible keyboard focus indicator independently of the background fill.

Status: queued specification only. No runtime change, version increment, build, Git commit or deployment. WhatsApp configuration and sending remain unchanged.

## Queued after v0.7.07: GSiS favicon across the suite

Logged: 17 October 2026, 17:24 Asia/Singapore.

Use the supplied GSiS standalone logo (02-logo.png) as the browser favicon for Contacts, Deploy, Layout, Roster and Calendar. Use the logo symbol, not the wide wordmark. Apply it consistently to relevant entry pages so browser tabs do not fall back to a generic icon. Preserve the supplied artwork and provide suitable small icon sizes. Verify each deployed app's tab icon, including a fresh load and normal cached reload.

Status: queued specification only; no runtime asset changes, version increment, build or deployment.

## Queued after v0.7.07: Deploy Versions Publish review visibility and page scrolling

Logged: 17 October 2026, 17:24 Asia/Singapore. Reference: image(20261017-092334).png.

The user cannot see enough context in Deploy > Versions > Publish. The screenshot shows the publication review area with a value chooser occupying much of the visible panel, while the review's headings and surrounding record context are not visible. It also shows a separate scrolling Versions table. This records the observed visibility problem; it does not assume the current implementation uses an actual iframe.

Make publication review use the available window width and generous page height, with the main browser window providing vertical scrolling. Avoid unnecessary iframes, fixed-height embedded panels and nested vertical scroll containers. Keep record identity, compared values, field labels, validation feedback, Cancel and Approve and publish accessible. Dropdown menus must not be clipped by their parent container or hide the context needed to choose a value. Preserve draft choices while scrolling and maintain existing publication permissions, validation, conflict checks and atomic behaviour.

Apply the preference for normal full-window page scrolling across GSiS where practical. Retain specialised scroll regions only when needed for a usable matrix or deliberate comparison. Inspect the actual overflow, height and sticky-header rules before changing the Publish layout; do not replace a container solely because it resembles an iframe.

Acceptance: at normal desktop/laptop sizes and browser zoom, the full publication review is readable via the main page scroll, menus can be used, and both final actions remain reachable without a forced refresh or clipped content.

Status: queued specification only. No runtime edit, version increment, build, Git commit or live publication. WhatsApp settings remain unchanged.

## Queued after v0.7.07: Baseline upload misreads merged teacher rows

Logged: 17 October 2026, 17:47 Asia/Singapore. Evidence: Teachers_Summary(2).xls and image(20261017-094649).png. User reports the export meets the requested format but upload fails with "Lesson data is missing its teacher name."

The attached 775,467-byte file is a MIME/quoted-printable HTML Excel export with an .xls filename, not a ZIP-based .xlsx workbook. This belongs to the legacy MSHTML export family already requested for support. It contains three HTML tables, 103 physical rows, 100 named teachers, Odd/Even weekdays and periods 0 through 16. Lesson cells use the supported field order with an optional fifth timing line. File extension alone is not the cause: parseFile correctly routes these bytes to parseSource.

Confirmed root cause in v0.7.07 roster-update/public/converter.js:9-16: parseSource concatenates physical table rows and expects every nonempty row to begin with its own teacher name. It expands header colSpan but does not resolve teacher or lesson rowSpan. Sarifah (FAJT) has an explicit name cell spanning two physical rows. The continuation row inherits that name and some lesson cells, but the parser sees only its 52 explicit cells and rejects its four nonempty lessons as nameless. This is flattened physical row 70, after 67 named teacher rows. The teacher name is present in the source. The current message is misleading.

There is also a distinct overlapping-activity case within that merged teacher block. Odd and Even Tuesday periods 11 and 12 (12:30-13:30) each contain PD (P5/P6 EL) on the upper subrow and MTL / grouped P5 classes / ML2 on the lower subrow. Correcting teacher inheritance alone cannot safely turn both activities into the current single-activity-per-teacher-period model. Do not silently choose one, overwrite one, duplicate inherited cells, concatenate unrelated lesson fields or invent a second teacher. Preserve both source activities for conflict review and identify teacher, week, day and period precisely. Whether PD is meant to coexist with MTL or is superseded is not established by this file. Respect the existing no-double-booking rule unless the user explicitly defines a different supported meaning for these source activities.

Next authorised implementation: normalize HTML rowSpan/colSpan into logical coordinates before interpreting teacher blocks, inherit names only within explicit merged spans in their own table, and retain the original Subject/Class/Venue/Group field boundaries and week/period coordinates. Track original cell identity so inherited copies are not counted as extra lessons. Distinguish valid continuation rows from genuinely missing teacher names. Non-conflicting merged blocks should import normally. Distinct overlapping activities need a specific conflict report and explicit resolution before saving, with no partial baseline activation.

Minimum regression coverage: an anonymized version of this merged-name, sparse-continuation case reproduces the current false missing-name error; a non-conflicting merged teacher block imports with correct coordinates and counts; the four overlapping slots are all reported with both activities retained; a truly unnamed lesson is still rejected; ordinary single-week and Odd/Even four/five-field imports remain valid. Check horizontal spans if adding shared span handling. Current synthetic HTML fixtures cover one physical row per teacher and missed this case.

Review: independent attachment inspection and Pstack root-cause review confirm the physical-row/merged-cell mismatch. Ponytail review recommends keeping normalization within the existing HTML import path rather than adding a separate upload service or broad importer framework. Source and file were inspected locally. A fresh Chromium execution was unavailable in this session because its executable was absent; no browser reproduction or implemented fix is claimed.

Status: investigation and queued correction only. Original attachment and release source unchanged. No runtime edit, version increment, build, Git commit, production upload, baseline activation or WhatsApp change.

## Queued after v0.7.07: Resolve imported lesson clashes during baseline review

Confirmed: 17 October 2026, 17:56 Asia/Singapore. The user confirmed that the PD/MTL overlap in the supplied timetable is a human timetabling error. This resolves the earlier question about whether both activities should be accepted as simultaneous assignments. The user has not yet selected which activity to retain in that particular file.

When a future baseline import contains multiple distinct lessons for the same teacher at the same time, present a local review chooser. Show the teacher, Odd/Even week or single week, day, period/time and each conflicting lesson's subject, class, venue and group. Let the user explicitly choose the lesson to keep and discard the other conflicting lesson(s) from the imported baseline. Do not silently choose, default to the first activity, combine different activities or require the user to repair the source file before they can finish this import. Keep the original upload unchanged.

For a clash spanning several periods or repeating in both weeks, state the complete scope before applying one choice to multiple slots. Do not apply a decision to other clashes without explicit selection. Keep all non-conflicting lessons and teacher identities intact. Merged-cell expansion and inherited-cell deduplication must occur before clash detection, as recorded above.

Show this guidance with the chooser: "This choice corrects this import only. Resolve the lesson clash in EduPage before exporting future timetables." This advice must not add another blocking confirmation after the user has resolved the clash.

The review and selection operate on the parsed file in browser memory. Revalidate the complete resolved model before the existing atomic save/activation. No unresolved overlapping assignments may enter the accepted baseline, and a failed or cancelled review must leave the current baseline unchanged. Preserve choices while reviewing other clashes. Return specific remaining clash details rather than the false missing-teacher error.

Acceptance: the supplied merged-name case reaches a chooser for the four affected teacher/period slots; either activity can be explicitly retained; discarded alternatives cannot reappear in the saved/reloaded baseline; all unrelated lessons and 100 teacher identities remain intact. Genuine missing teacher names remain validation errors. Test cancellation, partial resolution, explicit multi-slot choice and completed resolution before save.

Status: queued specification only. No code change, new build, commit, live upload or source workbook edit.

## Queued after v0.7.07: Employment weekly period limits cap R

Logged: 17 October 2026, 17:56 Asia/Singapore. The user requires employment types with a configured upper period limit, such as UT, to have relief quota bounded by their remaining permitted weekly workload as well as the normal R formula.

For an applicable weekly cap C and the workload W counted against that same cap, calculate headroom H = max(0, C - W). Final usable weekly R is the lower of normal formula R and H, floored to whole periods under the existing rounding rule, and never negative. Do not increase R merely because spare cap capacity exists. If already at or above the cap, R is zero and an existing over-cap workload remains visible. Example: normal R 8 and headroom 3 gives R 3; normal R 2 and headroom 3 gives R 2. No configured cap preserves the current calculation. Missing or invalid required cap/workload data must remain visibly unavailable rather than be treated as unlimited or zero workload.

Use the configured employment rule, not a hardcoded UT period count. Keep cap, workload and R in the same weekly units. For Odd/Even timetables, enforce the cap separately for the relevant week; a fortnight total or average cannot permit one week to exceed its weekly maximum. Any fortnight display is derived from the resulting weekly values. Retain existing relief deductions and remaining-capacity accounting without double-counting an assignment.

Confirmed source gap: shared/relief.js currently computes normal weekly R but does not apply the matched rules' period cap. Retain the existing cap definition: W = actual FTT + actual Teaching. This definition appears in shared/workload.js:199, the UT rule note in shared/teaching-rules.js, and the prior confirmed decision recorded in WORKLOAD_REVIEW.md. PD, duties, other non-teaching, offload allowance and SIUE still affect normal formula R, but are not added to this cap's counted workload. Do not substitute the weighted Wi value. The precise calculation is R = floor(max(0, min(normal raw R, C - FTT - Teaching))). The existing rule resolver uses the lowest configured matching cap when several apply; preserve that rule. UT's current default is 26 periods per week, but the saved configured cap is authoritative. Example: cap 26, FTT + Teaching 22 and normal R 7 gives final R 4.

When implemented, apply the approved cap rule consistently in Deploy's calculation and API output, Roster's effective-week recalculation after timetable changes, candidate ranking and allocation/assignment checks. Carry required cap metadata through the existing API contract as an additive change, and invalidate cached R when the calculation/rule/source revision changes. Expose the normal result, configured cap, counted workload, remaining headroom and final R in the existing permitted breakdown so users can see why a quota was reduced. Preserve current permissions for editing rules.

Acceptance: uncapped teachers unchanged; cap binding and non-binding cases; exactly at cap; workload above cap; missing/invalid configuration; correct whole-period rounding; independent Odd/Even enforcement; changes from Stapler/relief reflected without stale or duplicate deductions. An independent source review identified shared/roster-operations.js composeStaplerContext as a second quota calculation that must apply the cap after recomputation rather than bypass it through rawR. Review with Ponytail and Pstack at implementation. No implementation or performance claims yet.

Status: logged for the next authorised build using the established FTT + Teaching cap definition. No code edit, version increment, build, commit, production data change or WhatsApp activation.



## v0.7.08 delivery reconciliation

Authorised by the user's next-version commit instruction on 17 October 2026. Commit means versioned Cloudflare Pages deployment files, not a Git commit or live deployment.

Included: Assign Relief hover-only fill; supplied-logo favicons throughout five apps and relevant entry pages; full-page Deploy Publish review; merged row/column handling for timetable imports; explicit per-slot clash choices with EduPage correction advice; configured employment caps on R, including effective-week and Stapler recalculation, current publication checks and permitted breakdowns. Original timetable files are unchanged.

The all-suite speed and concurrent-user review additionally corrected duplicate Google certificate reads and rotation handling in four gateways, fresh Calendar permission checks inside existing locks, stale Calendar metadata edits, inactive Admin record edit paths and duplicate formatting creation after lost responses. Timetable-only interactions remain local; writes still validate current authority and state.

Ponytail and Pstack reviews plus independent Thermonuclear correctness and code-quality passes were used. Final local regression and browser results are in VALIDATION.md and RELEASE_SUMMARY.json. These records replace the earlier queued-only status for the six post-v0.7.07 feature entries without erasing their investigation history.

The package preserves privacy text and images, URLs, properties and data. WhatsApp and scheduled activation remain disabled. Live service latency, production installation, in-force Deploy publication, earlier absence cleanup and separately authorised messaging tests remain operational follow-up, not silently completed tasks. No new production data, notification or template submission occurred.


## Post-v0.7.08: WhatsApp readiness before deployment

Requested 17 October 2026. User wants the package WhatsApp-ready before online deployment. Current live Meta reads confirm registered school sender, connected and published GSiS app, configured callback/messages subscription, account subscription and payment method. All 19 submitted GSiS templates are approved. Seventeen of 21 current notification types match approved Utility contracts exactly; conditional instructions and three Stapler contracts remain prepared but unsubmitted. Evening v1 stays selected; unused v2 is retained.

Refresh the stale v0.7.04 setup guide to cover all 21 current routes and current approval observations. Confirm Cloudflare runtime configuration and the actual signed callback account before activation; provider account-resolution reads were inconsistent, so no identifier was changed by guesswork.

Single-recipient testing requires explicit isolation: selecting one SMC duty member does not limit teacher/admin/sponsor notifications. The existing runtime has no general recipient allowlist. Before an all-route live pilot, add a recipient restriction before claim and pre-send that preserves excluded queued jobs and attempts, or use an isolated test backend. Turning off allocation automation does not stop message dispatch.

Automatic approval review blocked template submission because previous authorisation was preparation only. Exact four-template drafts and a readiness report are prepared for approval. No template was submitted, no message sent, no activation changed, and the completed v0.7.08 release ZIPs were not rebuilt in this readiness check. Full end-to-end delivery remains to be verified in a running environment with separately authorised testing.


## WhatsApp test scope and four-template preparation

17 October 2026: user explicitly declined recipient protection and will test using their own simulated absences in production. This supersedes the earlier recipient-isolation requirement above. Do not add an allowlist or require an isolated backend for this test. Existing business rules, authentication, current-authority checks, template approval gates and idempotent dispatch remain in place. A simulated absence can notify colleagues assigned to cover it and the relevant duty recipients.

Prepared the four exact Utility templates for submission: gsis_relief_instruction_v1, gsis_timetable_updated_v1, gsis_timetable_sponsor_v1 and gsis_timetable_access_v1. All use en_GB and positional body fields. Independent read-only review confirmed exact runtime names, bodies, hashes, field order and sample counts of 5, 4, 4 and 4. A readable submission pack accompanies the existing JSON drafts.

Status: prepared, not submitted. No WhatsApp message, activation, deployment, runtime edit or rebuild occurred. The request was preparation for submission; no retry of the earlier blocked creation action was made.

## WhatsApp template wording review and same-day timetable release

17 October 2026, 20:18 Asia/Singapore. User wants the four drafts presented one at a time directly in chat for editing, rather than more Markdown deliverables. No template is submitted during this review. Earlier prepared drafts are superseded by the accepted wording below where stated; they must not be submitted unchanged or represented as already matching the new runtime requirements.

Template 1, conditional relief instructions: retain fields 1 to 5 and add field 6 for the absent teacher's name and field 7 for their contact method. Use a complete WhatsApp link when the absent teacher has a mobile number in Contacts. User approved their school email as the fallback when mobile is absent. The contact wording must be channel-neutral, not say "on WhatsApp" for an email fallback. Final proposed body based on the accepted edit and fallback:

```text
*Instructions for relief lesson*

Hi {{1}}, please note the following instructions for your assigned relief lesson at Gongshang Primary School.

Class: {{2}}
Date: {{3}}
Period and time: {{4}}

Lesson instructions:
{{5}}

For clarification, please contact {{6}}, the absent teacher:
{{7}}

Thank you.
```

Template 2, timetable changes: user confirmed these notices concern the affected day and should be released when SMC publishes that morning. Remove the school name from this template because the audience is mainly internal. Keep the date and private timetable link. Current source supports publishing a future date and queues notices at publication, so the same-day release rule is a code change to implement, not existing verified behaviour.

For this timetable-change route, future-date publication must not send a notice early. The same-day SMC publish must release the latest applicable notices, including where a future plan was already published and its revision is unchanged. Keep later same-day publication updates for affected teachers, prevent duplicates for unchanged content, and recheck the Singapore duty date before dispatch so a delayed job cannot incorrectly say "today". Do not apply this restriction to planning sponsorship requests or other notification types which legitimately concern future dates.

Suggested final title is "Your timetable for today has changed" so it also covers a later change returning to the usual timetable. Fields remain teacher name, duty date, change summary and private timetable link. Template 2 wording is still being reviewed in chat.

At the next authorised build, update the runtime field construction, exact bodies and body hashes, generated Worker copies, examples and relevant tests together. Template 1 now needs seven parameters rather than five. Keep the deployment ZIP unchanged until that build. No live setting, message, submission, source edit or deployment was made by this logging operation.

## Roster publishing restricted to the current workday; template 2 accepted

17 October 2026, 20:39 Asia/Singapore. User clarified: "publish function is good for that work day only not for future days" and accepted template 2 by saying "next".

This supersedes the earlier interpretation that future plans could be published with their notifications deferred. In Roster, future dates remain available for planning and saving drafts, but publishing relief allocations or Stapler timetable changes is allowed only for the current Singapore workday. Retain existing role and sponsorship checks. Do not extend this restriction to Deploy version publication or Calendar configuration.

Implement the date restriction in both the interface and authoritative backend, using verified school-date information. Recheck it at publication and before sending a notice describing "today". SMC's morning publication releases that day's notices; later same-day publication changes notify only affected teachers. This does not introduce an automatic publish time. Future-date planning sponsorship requests can still be reviewed in advance. At implementation, handle any already-published future plans explicitly without deleting school data or sending notices early.

Accepted body for gsis_timetable_updated_v1, Utility, en_GB, with unchanged positional fields (teacher name, duty date, change summary, private timetable link):

```text
*Your timetable for today has changed*

Hi {{1}}, your timetable for today, {{2}}, has updates.

Specifically, the changes are:
{{3}}

View your updated timetable alongside your usual timetable:
{{4}}

Thank you.
GSiS Roster
```

Status: logged for implementation at the next authorised build. Template 2 text is accepted for preparation, not submitted to Meta. No runtime edit, new ZIP, live activation, message or deployment occurred. Proceed to template 3 wording review in chat.

## Template 3: user-edited suspended timetable request

17 October 2026, 20:56 Asia/Singapore. Retain the user's wording exactly for gsis_timetable_sponsor_v1 (Utility, en_GB). Positional fields remain SMC recipient name, requesting teacher name, planning date and Roster review URL.

```text
*Request to plan Suspended Timetable*

Hi {{1}}, {{2}} has requested your approval to plan and publish a suspended timetable for {{3}}.

Please review the request and approve or reject it here:
{{4}}

Thank you.
```

The request can be reviewed before the planning date; publication permission still applies only on the current workday under the new rule. No school-name footer or additional wording is added to this user-approved body.

Next: present template 4, the request outcome, in chat. Its wording must work for the requesting teacher and the SMC sponsor, since the current route sends an approval outcome to both; do not incorrectly call it the sponsor's own request. Status: logged, not submitted, no runtime edit or rebuild.


## Four revised WhatsApp templates submitted to Meta

17 October 2026, after the user explicitly instructed "submit" at 21:39 Asia/Singapore. All four revised templates were created successfully in the existing Gongshang Primary account as Utility, English (UK), positional body-only templates. Each returned PENDING and a subsequent read confirmed its exact body, field samples, language and category. No message was sent and no activation flag changed. This new explicit instruction authorised submission after the earlier preparation-only rejection.

| Template | Meta template ID | Status | Category |
| --- | --- | --- | --- |
| `gsis_relief_instruction_v1` | `2516068742237019` | PENDING | UTILITY |
| `gsis_timetable_updated_v1` | `1116798554168000` | PENDING | UTILITY |
| `gsis_timetable_sponsor_v1` | `1647877567013330` | PENDING | UTILITY |
| `gsis_timetable_access_v1` | `2207471319799180` | PENDING | UTILITY |

### gsis_relief_instruction_v1

Fields: recipient_name, class, duty_date, period_and_time, conditional_instruction, absent_teacher_name, absent_teacher_contact.

```text
*Instructions for relief lesson*

Hi {{1}}, please note the following instructions for your assigned relief lesson at Gongshang Primary School.

Class: {{2}}
Date: {{3}}
Period and time: {{4}}

Lesson instructions:
{{5}}

For clarification, please contact {{6}}, the absent teacher:
{{7}}

Thank you.
```

### gsis_timetable_updated_v1

Fields: recipient_name, duty_date, change_details, private_timetable_url.

```text
*Your timetable for today has changed*

Hi {{1}}, your timetable for today, {{2}}, has updates.

Specifically, the changes are:
{{3}}

View your updated timetable alongside your usual timetable:
{{4}}

Thank you.
GSiS Roster
```

### gsis_timetable_sponsor_v1

Fields: recipient_name, requesting_teacher_name, duty_date, roster_plan_url.

```text
*Request to plan Suspended Timetable*

Hi {{1}}, {{2}} has requested your approval to plan and publish a suspended timetable for {{3}}.

Please review the request and approve or reject it here:
{{4}}

Thank you.
```

### gsis_timetable_access_v1

Fields: requesting_teacher_name, duty_date, change_details, roster_plan_url.

```text
*Suspended timetable request outcome*

{{1}} made a request to plan a suspended timetable for {{2}}.

The request has been reviewed and the outcome is:
{{3}}

View the request and decision here:
{{4}}

Thank you.
```

Template 1 now has seven fields; the absent teacher contact is their WhatsApp link with school email fallback when mobile is unavailable. Template 4 has four fields and field 1 is always the requesting teacher name for both teacher and SMC recipients. It retains the fixed "Thank you." ending discussed before submission. The actual runtime construction must preserve the requester identity separately from the delivery recipient.

The current-workday-only Roster publication rule remains queued. Update exact bodies, fields, hashes, Meta IDs, examples, generated Workers and setup documentation at the next authorised build; do not wire these revised templates to the unchanged v0.7.08 payloads. Source code and deployment ZIPs were not changed or rebuilt by submission. Meta approval and end-to-end delivery remain unverified; PENDING is not approval.


## Finalised v0.7.09: current-day publication and revised WhatsApp contracts

17 October 2026. The user authorised the next deployment build with Ponytail, Pstack and Thermonuclear. In this project, commit means finalise versioned code and deployment ZIPs. It does not mean a Git commit, live deployment or WhatsApp activation.

Roster Relief and Stapler now publish only for the current Singapore date with a verified Calendar school day. Future drafts and sponsorship requests/decisions remain available. The browser rechecks the date at confirmation and after an asynchronous draft save. The backend refreshes the clock inside the existing write lock after reference reads. Exact replay of an already committed publication still works after midnight.

The four submitted contracts are integrated exactly with their IDs, hashes, language and field order. Conditional instructions use seven fields, with the absent teacher name and fresh Contacts WhatsApp link or school email. Decision field 1 is the requesting teacher for both requester and SMC recipients. Timetable notices contain actual period changes, with an explicit concise period list for large changes and the complete comparison in the private timetable page. Instruction text is not truncated.

Previously early-published future records are retained and require explicit publication on the actual workday. Replacement, removal and No Relief Required drafts cannot revive old cover. Current-day cancellation notices retain historical publication timestamps. Teacher and snapshot-backed SMC notices cannot bypass actual-day publication; unrelated future planning notices remain valid.

All 309 selected source regression scripts and six Chromium suites passed. Independent reviews reproduced and closed the replacement ordering, premature SMC escalation and oversized timetable summary findings. The thirteen new domain checks cover the fixes. Current build evidence and archive verification are recorded in VALIDATION.md and RELEASE_SUMMARY.json. All 62 assets, the complete privacy page and its three images, and 36 manual images are preserved.

All four revised templates were read again as Pending on 17 October. The other 17 mapped routes retain their approved observation. Evening v1 remains selected and v2 is retained. All 21 route examples and sending/menu/automation/diagnostic activation flags remain disabled. No recipient allowlist was added. No live message, in-force Deploy publication, absence cleanup or production configuration change was performed.

Final packaging also excludes intermediate archive files from the source ZIP, with a regression assertion in the package integrity check. Application runtime is unchanged.


## Queued after v0.7.09: Deploy opens the latest unpublished draft

18 October 2026, Asia/Singapore. User requested an immediate backend change and inclusion in the next release. No new release build was requested.

On initial load, Deploy chooses the most recently saved unpublished version available to the signed-in Admin or SMC/KP user. If no unpublished version exists, it opens the current in-force version. Latest means the greatest valid saved updatedAt timestamp, with later existing index order as the tie or legacy fallback. A new API read or extra document load is not needed for selection.

Use the existing publication status: a saved revision that differs from the published commit is unpublished, including edits to the currently published version. Preserve an explicit version selection during refresh, manual switching and editing. Ordinary readers retain published-only visibility. If neither a draft nor published version exists, preserve the existing empty state.

This changes the default displayed version only. The active and published authority pointers, published snapshot, Roster R source, Layout source, publication rules, permissions and school data remain unchanged. Do not change active/published pointers as a shortcut.

Live inspection found the unpublished 2027 Term 1 version and the published 2026 T4 post-PSLE version. The current backend has no default-version Script Property. Apply the surgical snapshot selector change and update the existing Apps Script web-app deployment to a new code version while keeping its URL and settings.

Status: backend patch applied live on 18 October 2026 at 07:17 Singapore time. The Apps Script editor content was read back and matched the intended narrow patch exactly before saving. The existing deployment was successfully updated from Apps Script version 71 to 72, preserving its deployment ID, web-app URL, execute-as account and access settings. No spreadsheet data or publication pointer was changed. Thirteen focused snapshot scenarios and the existing version-copy and selected-campus-version regressions passed. The application remains v0.7.09; include this hotfix in the next authorised release source. The existing release ZIP was not rebuilt. Live browser verification at 07:18 Singapore time opened Deploy without selecting a version and showed 2027 Term 1 · Unpublished selected, with 2026 T4 post-PSLE · Published still available. No unsaved changes were present.


## Queued after v0.7.09: Unlock all Subject Type choices

18 October 2026, Asia/Singapore. User requested this as a changelog item for the next release, not an immediate build or live change.

Under Deploy > Program Settings > Subject Type, every listed subject must allow Class only, TG only or Both. Remove the Fixed rule label and fixed-subject disabled states. The same options must be accepted and honoured by backend validation and the shared calculation model; do not merely unlock the visible controls.

This includes the currently locked teaching-group subjects CL, ML, TL, HCL, HML, HTL, FCL, FML, FTL and CCE EL, and the currently locked form-class entries Assembly, FTGP and FTT. Keep the existing Class/TG/Both values as defaults until an Admin changes them. Admin remains the editor; SMC can view. Existing assignments remain visible and retain their actual workload until explicitly changed. Preserve publication boundaries, version isolation, and the existing treatment of derived totals.

Acceptance checks: all listed subjects offer all three choices; no Fixed rule label remains; save and reload preserve the selected type; Class/TG matrices and planned demand use the selected type; ordinary viewers cannot change it; no automatic subject-type migration or assignment deletion occurs.

Status: logged only. Implementation and release packaging await the next explicit build instruction.


## Queued after v0.7.09: Search the baseline teacher preview dropdown

18 October 2026, Asia/Singapore. User requested this as a changelog item.

Under Roster > Baseline Timetable > Baseline Upload > Preview a teacher's timetable, include a search field inside the teacher dropdown. Match partial names without case sensitivity and filter the already loaded baseline teacher list immediately in the browser, without a server request on each keystroke.

Keep the selected teacher and preview until the user selects another result. Support keyboard navigation and selection; clearing the search restores the full list. Show a clear no-results message when nothing matches.

Acceptance checks: partial and mixed-case searches find the expected teachers; typing does not request server data; mouse and keyboard selection update the preview; clearing the search restores all names; no-results handling does not discard the current selection.

Status: logged only. Implementation and release packaging await the next explicit build instruction.


## Queued after v0.7.09: Faster baseline upload and prune with visible progress

18 October 2026, Asia/Singapore. User reported that Roster baseline upload and prune operations are slow, and that status feedback at the top of the window is not visible while working farther down the page.

Review both operation paths for avoidable repeated parsing, reads, round trips and full refreshes. Reuse valid loaded data and batch related work where useful. Keep changes surgical and writes atomic where applicable, preserving validation, concurrent-user correctness and existing data protections. Measure the affected operations before and after implementation; do not treat a faster loading screen as a speed improvement to the underlying operation.

While either operation is pending, show one viewport-fixed loading overlay with a visibly rotating spinner and a greyed or blurred background. Keep the progress message visible regardless of page scroll. Use one pending status rather than duplicate Saving or Loading messages, and do not rely on the top status bar. Prevent duplicate submissions while work is pending.

On confirmed success, dismiss the overlay and show the result near the user's current work. On failure, dismiss the overlay, restore usable controls, preserve the pending upload or selection where recoverable, and show an actionable error without falsely reporting success. Respect reduced-motion preferences with an accessible pending indicator.

Acceptance checks: overlay visibility from the bottom of the page; actual spinner rotation with normal motion settings; one pending status; no duplicate writes from repeated clicks; success and failure both clear the pending state; retained draft or selection on recoverable errors; measured upload and prune timings with their validation and data integrity checks intact.

Status: logged only. No optimisation or performance result is claimed yet. Implementation and release packaging await the next explicit build instruction.


## Queued after v0.7.09: SMC Duty Roster members come from Contacts

18 October 2026, Asia/Singapore. User reported that the current SMC member lookup is unreliable and slow, and requested Contacts viewport as its source.

Under Roster > SMC Duty Roster, populate the member picker from Contacts using the existing Contacts SMC authority criteria. Remove the picker's dependency on the current in-force Deploy version. This supersedes the earlier requirement to source this list from in-force Deploy; it does not change Deploy's role in providing R or workload data.

Preserve checked duty members and their start and end times by stable staff identity when the list refreshes. Reuse valid loaded Contacts data to avoid redundant lookups while keeping permission checks current. If Contacts is unavailable or stale, show a useful error and retry action; do not silently clear saved selections, broaden membership, or treat stale membership as current authorisation. Surface any selected member whose eligibility can no longer be verified for review.

Acceptance checks: the picker works without an in-force Deploy version; eligible members match Contacts; list refresh preserves selections and timings; failure and retry retain the user's work; permission checks remain authoritative; repeated opens avoid unnecessary reads when valid loaded data is available.

Status: logged only. No implementation or measured performance improvement is claimed. Implementation and release packaging await the next explicit build instruction.


## Queued after v0.7.09: Compact Manage Ad-hoc relief into shared rows

18 October 2026, Asia/Singapore. User requested greater vertical information density, following the marked screenshot image(20261017-232043).png.

Under Roster > Manage Ad-hoc relief, align the page title and SMC label on the left with Last checked and Refresh records on the right of the same header row. Remove the large blank area caused by stacking these groups vertically.

Move the date group into the unused right side of the Ad hoc relief teacher form, on the same row as Known relief teacher, its current employment modifier and Add new contact. Place the formatted date and weekday beside the date picker instead of underneath it. Keep the date scope clear for both the form and the activated-teachers list. The later employment-modifier clarification makes the known teacher's modifier read-only; editable modifier selection belongs only to Add new contact.

Use compact spacing and consistent control alignment on desktop. Wrap related groups cleanly on narrower screens without overlaps, clipped menus or reduced readability. Keep day warnings visible and preserve existing form behaviour.

Acceptance checks: title and refresh information share a row; date controls share the teacher-entry row at desktop width; formatted date is inline with the picker; the former empty header space is removed; controls and dropdowns remain usable at narrower widths.

Status: logged only. No UI code, live configuration or release package was changed. Implementation awaits the next explicit build instruction.


## Queued after v0.7.09: Filter Manage Ad-hoc relief teacher choices

18 October 2026, Asia/Singapore. Under Roster > Manage Ad-hoc relief, exclude SLs, OSOs, Support, SAT and MK from the Known relief teacher picker, including search results. Use the existing authoritative staff classifications rather than matching these words in staff names.

Apply this to the available choices for ad-hoc relief. Do not alter Contacts records or staff active/inactive status, or silently delete existing dated relief records. Preserve eligible teachers and the existing eligible inactive-teacher workflow. Filter already loaded authorised data locally where available; avoid an extra server call solely for hiding these categories.

Acceptance checks: all five excluded groups are absent from the picker and partial-name results; eligible teaching staff remain selectable; refreshing or clearing search does not restore excluded groups; Contacts records and existing dated records remain unchanged.

Status: logged only. Implementation and release packaging await the next explicit build instruction.


## Queued after v0.7.09: Respect existing employment modifiers and admit new relief contacts immediately

18 October 2026, Asia/Singapore. User clarified the Manage Ad-hoc relief employment flow.

For known teachers selected from Contacts, retain the employment modifier currently in force. Show it as existing information, not a user-selectable day override. The selectable employment modifier is for Add new contact only. This supersedes earlier wording that allowed a changed modifier for a known teacher for this day.

A newly added relief contact must become usable in Roster immediately after the minimum required record is successfully saved. Do not wait for Admin review or completion of the full Contacts record before assigning that person to the day's relief. Admin involvement is subsequent formal completion and correction of the record through Contacts viewport, including the remaining details. Preserve the existing minimum identity and TTb collision checks. Keep a stable identity between the immediate Roster entry and the later completed Contacts record; completion must not create a duplicate or break existing assignments.

Keep daily ad-hoc employment separate from a permanent active/inactive status change. Retain the earlier exclusions of SLs, OSOs, Support, SAT and MK from known-teacher choices. The immediate-use rule does not change the existing authority to add relief contacts or access private data.

Acceptance checks: selecting a known teacher preserves their effective modifier; changing the known-teacher selection updates that read-only value; only new-contact creation exposes modifier selection; a successfully saved new contact can be used for the day's roster before Admin cleanup; later Contacts completion preserves identity and assignments; duplicate-name and existing save/retry safeguards remain effective.

Status: logged only. No Contacts record, roster assignment, source code or release package was changed.


## Queued after v0.7.09: Daily Employment Update reports

18 October 2026, Asia/Singapore. Add a Roster function named Daily Employment Update. Admin and SMC users can change settings and send reports manually. Normal authenticated teachers can view, including other teachers' absence reasons as explicitly confirmed by the user. This access applies to the new report views; it does not make absence reasons available on external relief links or the public internet.

The function has three subpages:

1. Recipients and report settings: list the selected recipients, select their email addresses, edit the email subject and choose the automatic send time. Both CES and gsps.edu.sg addresses for each selected person are enabled by default, where recorded. This is not a school-wide selection of every address with those domains. Deduplicate identical addresses. Default send time is 08:00 Asia/Singapore. Add a date selector and a manual Send report action on this first subpage for authorised Admin/SMC users. The exact default subject remains an implementation choice.
2. Absences: choose a date and show absent teachers and their reasons. Normal teachers may view these reasons; Admin/SMC retain editing authority.
3. Relief load: choose a date and show teachers performing relief, their relief load that day and their cumulative annual R percentage. Keep the existing calendar-year accounting model. Do not introduce a fortnight reset. Show unavailable when a valid R denominator is absent, rather than inventing a quota or displaying a misleading zero.

The email states which non-active teachers have been employed as ad-hoc external relief for that day, the day's relief-system health at the report time, a table of absent teachers and reasons, and a table of relief teachers and relief loads. Use the existing custom relief-health indicator and percentage semantics. Keep the reporting date and snapshot time explicit. Derive its sections from a coherent snapshot, not mixed versions of the same day.

Automatic delivery: if SMC publishes before the configured send time, send at that time; if the first publication is later, send immediately after successful publication. Send one automatic email report per date. Later publications do not automatically resend; Admin or SMC can deliberately send again for a selected date using the first subpage. No publication means no email. Keep this publication requirement for manual sending too; a saved draft or future plan alone is not a published day's report. The manual-send action must distinguish deliberate resending from a network retry of the same send.

Source verification on 18 October: v0.7.09 shared/roster-allocation.js annual() and balances() calculate cumulative R% as the calendar year's accounted completed plus committed relief units divided by recorded accumulated weekly R entitlement, multiplied by 100. Excluded weeks contribute zero entitlement. The numerator includes commitments; it is not just completed cover. A zero or missing denominator produces unavailable. Existing allocation gives coverage priority, then seeks lower annual utilisation spread subject to availability, quotas, workload constraints and protected assignments. Automatic allocation requires verified annual history; the calculation does not fabricate earlier history. This was a source review, not an audit of completeness of live school records.

Historical reporting confirmed on 18 October: past-date report pages and manual resends use the original stored report snapshot. Preserve the original reporting date and capture time, external relief employment, absent teachers and reasons, relief assignments and loads, relief-health percentage and annual cumulative R% as recorded for that report. Later corrections, republications or changes to annual entitlement must not overwrite this snapshot or silently recalculate the historical report. Show the original capture time on views and resends. If no original snapshot exists, explicitly show that the historical report is unavailable; do not reconstruct an alleged original from current records.

The existing annual helper uses entitlements through the current week and all same-year commitments, including future commitments; it is not a historical as-of-selected-date query. Capture its report values once with the coherent original report data, persist that snapshot before delivery, and reuse it across retries and historical resends. Never present today's annual metric as if it were captured at 08:00 on an earlier date. Preserve annual accounting for allocation while separating immutable dated report presentation.

Implementation checks: both selected recipient addresses; normal-teacher access to the requested report fields and absence reasons; Admin/SMC-only settings and send controls; before/after-time publication scheduling; one automatic report per date; deliberate manual resend by selected date; original snapshot retained after later corrections or republication; historical views and resends preserve its values and capture time; explicit unavailable state when no original snapshot exists; concurrency and retry protection; visible delivery status and recoverable failures; annual R rather than fortnight reset; no invented historical data.

Status: recipient defaults, late-publication timing, manual sending, teacher visibility, annual R basis and original-snapshot historical reporting are resolved. Logged for the next authorised release. No code implementation, live setting change, email send, scheduled automation or release build was performed.


## Queued after v0.7.09: Minimum new relief identity and duplicate recovery

18 October 2026, Asia/Singapore. User clarified Add new contact in Roster > Manage Ad-hoc relief.

Require the ad-hoc teacher's basic name and valid mobile number. Mobile is mandatory for immediate creation because the relief teacher must receive WhatsApp notices. Default the name modifier to SRE and compose the TTb display name with (SRE) appended once. Keep the modifier field selectable and permit a custom modifier, including a value outside the normal approved list, to distinguish a genuinely different person with a colliding TTb name. Save the entered custom modifier into Contacts as a provisional value; Admin cleans it up later. Do not silently keep only a display suffix or substitute SRE for the stored custom value. Preview the resulting TTb name before saving. For an existing Contacts teacher, continue to respect the modifier in force rather than exposing this new-contact editor.

Reject new-contact creation when either the complete TTb name OR the mobile number already exists, checking both active and inactive Contacts records. Apply the system's canonical TTb and mobile comparison rules so formatting differences do not evade duplicate detection. A custom name modifier cannot bypass an existing mobile-number match. Reject blank or invalid mobile input. Compare canonical mobile numbers against existing records; an empty historical mobile field is not a duplicate match for a supplied number.

When the existing match is an eligible inactive teacher, offer that existing teacher for ad-hoc relief on the selected date, preserving their identity, past records and effective employment modifier. The user chooses to deploy the existing record; do not create a duplicate. When the match is already active, tell the user that the teacher is already active in the system and prevent duplicate creation. Retain the earlier excluded staff-group rules.

If the entered TTb name and mobile point to different existing records, do not merge or select a person automatically. Show the conflict for correction before a new contact or daily deployment is saved. Keep duplicate validation authoritative at save time and safe under concurrent requests and retries; a fast local check alone is insufficient.

A successfully created valid minimum record remains immediately usable in Roster. Admin completes the remaining contact details later through Contacts viewport, as already logged. Creating or using daily ad-hoc relief must not silently change the person's permanent active status.

Confirmed fast-track policy: accept the minimum valid identity and mobile with a provisional custom modifier, then allow immediate daily relief use without waiting for Admin completion. Missing nonessential Contacts fields or a modifier outside the approved catalogue must not block this flow. Required name/mobile, final TTb/mobile uniqueness and permissions still apply. Later Admin cleanup through Contacts viewport must preserve stable staff identity and dated relief history. Do not invent workload or R entitlements for an unrecognised provisional modifier; existing external-relief operation remains available while Admin completes the record.

Acceptance checks: basic name and valid mobile are required; SRE is appended by default; a valid custom modifier changes the complete TTb name; duplicate TTb name alone blocks creation; duplicate mobile alone blocks creation even with another modifier; an inactive match can be reused without losing history; an active match produces the stated prompt; conflicting matches are not silently merged; concurrent duplicate saves do not create duplicate people.

WhatsApp access: the newly added external relief teacher receives the relevant publication-triggered notice at the required mobile, with a page they can open without a school Google account and use to acknowledge their duties. Use the existing recipient-specific, dated external-link approach rather than exposing the school roster or absence reports to anonymous visitors. Source inspection found existing externalUrl/readCapability and externalAcknowledge routing in roster-update/public/_worker.js. Verify this path works for newly created provisional Contacts identities, including updates and acknowledgements. Opening the page alone must not count as acknowledgement; preserve the existing explicit action and notification/publication rules.

Status: minimum fields and provisional custom-modifier handling are now resolved and logged. No staff record, roster data, application code, live message or deployment package was changed.


## Queued after v0.7.09: Stapler date list before the dated planner

18 October 2026 at 08:00, Asia/Singapore. User reports that Stapler does not open despite an uploaded baseline timetable. Screenshot image(20261017-234958).png shows v0.7.09 with only the Stapler heading, “Choose a verified school date with an active baseline timetable.” and Retry. It provides no date selector or route into the planner.

Confirmed navigation: the first subpage under Stapler lists suspension dates and provides Add new suspension date alongside sponsor controls. Selecting an accessible date opens the second subpage, which is the previously specified compact tile planner. Opening Stapler from Home must land on the date list instead of trying to initialise today's draft first. Preserve explicit dated deep links, but let users return to the date list or choose another date when that dated plan cannot open.

The date list shows existing accessible plans and the relevant sponsorship requests, with their saved draft, publication and request status. Keep controls compact and horizontally aligned where space permits. SMC can add a suspension date and review requests; ordinary teachers can choose a date, nominate an SMC sponsor and see their request outcome. Retain the existing rule that any SMC member can decide a request and approved planning authority applies to its specific date. Do not expose another teacher's private drafts or widen authority merely to populate the list.

The first subpage must load independently of whether today's date is a school day or has an applicable baseline. Use a compact list/status response rather than constructing full timetable models for every listed date. Add or open a date against the baseline applicable to that selected date, with verified Calendar context and week parity. If that date cannot be used, keep the list, date control and sponsor controls visible. Distinguish no applicable baseline, non-school date and unverified Calendar data in the feedback instead of showing the same generic error and Retry alone. Do not bypass authoritative checks or require re-uploading an existing valid baseline as a workaround.

The second subpage retains Q707-16 through Q707-26 and their later amendments: Teacher POV above Class POV on the left, Card Pit and compact planning controls on the right, three visibility pills, independent partial-text filters, aligned periods and timing, shared horizontal scrolling and adjustable relative heights. Preserve linked tiles, baseline ghosts, colour rules, suspension mats, recess behaviour, local interactions, draft saving and publishing. Keep a visible route back to the date list and protect unsaved edits or a pending save when switching dates. This is not permission to replace the specified planner with a generic table or import the offline application wholesale.

Source diagnosis: roster-update/public/roster-stapler-ui.js render at line 125 defaults to ctx.today() and immediately calls load(); load at line 114 replaces the page before the request and exposes only Retry on error. The date selector is created only by renderWorkspace at lines 47 onward, after a successful response. shared/roster-operations.js staplerView at line 166 calls staplerBaseline for an authorised planner before returning; staplerBaseline at line 165 throws the screenshot's error if the selected day has no baseline ID, is not a school day, or is explicitly unverified. Therefore an uploaded baseline alone does not establish that the default date can open, and the current flow removes the controls needed to choose another date. The exact failing live condition has not been verified. Source inspection only; no live backend read or mutation was performed.

Pstack boundary decision: separate date discovery and sponsorship from date-specific planner initialisation; retain baseline and permission validation at the planner/save/publish boundary. Ponytail scope: reuse the existing tile workspace, sponsorship operations and domain model; no second planner, duplicate timetable store or generic navigation framework is needed. Keep future dates available for draft planning and retain publication only on the current verified Singapore school day.

Acceptance checks for implementation: entry on a non-school day; valid uploaded baseline but no baseline for today; unverified Calendar context; first use with no saved dates; add and reopen a valid future draft; ordinary-teacher request and SMC approval; approved dated access; switching dates without losing an unsaved or pending draft; failed date load with list still reachable; baseline replacement warning; local filtering and tile actions; same-day publication restrictions; concurrent save/retry safeguards. Loading the date list must not fetch every date's full timetable or require a planner to be constructed first.

Independent read-only review also confirmed effective baseline date range, weekday and odd/even parity resolution in backend/Code.gs at lines 3283–3289. Include an explicit parity-unavailable explanation where applicable. Additional acceptance: merely opening either subpage performs no write or publication; past dates retain recorded status without offering expired planning access or edit actions; a late response for a previous date cannot replace the currently selected date's view. A synthetic non-school-day fixture with an existing baseline reproduced the reported 409, but the precise live failing condition remains unverified.

Status: fault and two-subpage requirement logged for the next authorised build. No application code, live data, publication, notification or deployment package was changed.


## Queued after v0.7.09: Roster System Config and wildcard No Relief Required subjects

18 October 2026 at 12:54, Asia/Singapore. Add a System Config function within Roster. User supplied image(20261018-045235).png showing a blue gear Home tile labelled System Config with Configure school settings, and image(20261018-045316).png showing the required General Rules panel. Both screenshots were inspected. Standing log-only instruction remains in force until an explicit build request.

Use the existing Roster Home icon style and navigation hierarchy. The page follows the second screenshot: a blue General Rules heading, a Subjects (No Relief Required) field, compact removable selection chips, and the explanation that selected subjects are automatically marked No Relief Required when staff absences are reported. Keep the page dense and use normal full-page scrolling without an iframe. Provide keyboard-accessible selection and chip removal, visible focus, Save changes and Cancel, clear save feedback and preserved input on failure. User subsequently clarified on 18 October at 12:59: System Config is available only to Admin, including viewing. This supersedes the earlier Admin-edit/SMC-view proposal for this page. Enforce access in both the interface and backend configuration endpoints; ordinary operational responses may still include the effective rules needed by an authorised workflow.

Populate the searchable lesson/subject choices from unique nonblank lesson subject labels in the currently active baseline timetable, across its complete week pattern including both Odd and Even weeks where present. Use the active saved baseline identity and effective dates rather than the newest upload, a future baseline or the user's last preview selection. Catalogue extraction must not require today to be a teaching day; a valid active baseline remains usable for configuration on a weekend. These are available choices, not automatically selected exclusions. Do not copy the screenshot's entire selected set into the school's configuration without an existing equivalent rule or explicit choice.

Allow both exact subject selections and custom wildcard patterns such as PD * and BLK *. Proposed matching contract for the build: case-insensitive matching of the complete subject label; trim outer whitespace and normalise repeated whitespace consistently; * represents zero or more characters, while other characters, including parentheses, slash, plus, dot and question mark, remain literal. This is a simple wildcard interface, not a raw regular-expression editor. Exact subject chips remain exact even if their source label contains punctuation or an asterisk. Store exact selections and wildcard patterns distinctly. Reject empty entries and collapse equivalent duplicate rules. A lesson matched by several rules receives one No Relief Required result.

Examples after the same normalisation is applied to both sides:

| Rule | Matches | Does not match |
| --- | --- | --- |
| PD * | PD (ART), PD (CL1), PD TL | PD, PDP, PD(ART) |
| BLK * | BLK (FRI/P), BLK DUTY | BLK, BLOCK, BLOCKED (CCA) |
| PD as an exact selection | PD | PD (ART) |
| BLOCKED * | BLOCKED (CCA), BLOCKED (AED) | BLOCK, BLOCKED |

Keep the space in PD * and BLK * meaningful after whitespace normalisation. Do not silently broaden BLK into BLOCK/BLOCKED aliases or make PD * match unrelated PD-prefixed words. Bare PD, BLK, BLOCK or BLOCKED can be selected as separate exact entries. The wildcard examples are capability examples, not authorisation to add all of them as active rules now.

Make wildcard chips recognisable and show a local match count with an expandable list of matching active-baseline subjects before saving. Distinguish partial-text search in the picker from the stored full-label wildcard rule. Support a clear No current matches state, retain the saved rule for future matching labels, and show when broad or overlapping patterns match many subjects. Preserve patterns as patterns rather than expanding them into a frozen list of today's labels. When the active baseline changes, retain saved rules and refresh their match previews against the new baseline.

Behaviour scope: matching lesson demand is automatically marked No Relief Required in absence processing. Baseline lessons remain visible and unchanged. This rule does not itself delete timetable cells, change Subject Type, recategorise teaching/PD/duty/Block workload, or change R accounting. Preserve the distinction between this automatic subject rule and an SMC user's explicit per-period No Relief Required decision. Removing a subject rule must not silently undo a manually recorded decision or overwrite an existing relief assignment.

Performance and reliability requirements for the later build: reuse the complete cached baseline for subject extraction, picker search and wildcard preview; no request per typed character or chip click. Save only the configuration with a revision check, current Admin authority and retry protection. Use the same matching contract in the browser preview and authoritative absence processing. A changed configuration revision invalidates derived rule matches, not the entire timetable cache. Do not mark a failed configuration load as an empty exclusion list.

One decision remains: when rules change, should already saved, unpublished absence demand be re-evaluated, or should the new rules apply only to newly reported absences? Do not rewrite existing published duties, original report snapshots or send notifications merely because System Config is saved. The user has not yet authorised retrospective changes.

Design review scope: Awesome Design reference considered for plain surfaces and clear form borders; Frontend Design Premium for consistent controls and recoverable states; Taste for preserving the supplied design and information density; UI UX Designer for accessible labels, controls and flow. The supplied screenshots and existing GSiS design take precedence over marketing-page spacing, new visual themes or new framework recommendations. Independent screenshot review confirmed the BLK/BLOCK/BLOCKED distinction and the need to retain unmatched patterns. No application UI was implemented or visually tested in this logging turn.

Acceptance checks for the build: catalogue from the correct active baseline and both week patterns; weekend configuration access; deduplicated labels; exact versus wildcard matching; case and whitespace normalisation; literal punctuation; bare-prefix and BLOCK/BLOCKED examples; overlapping patterns; unmatched patterns retained after a baseline change; immediate local search/preview; browser/backend matching parity; Admin-only save; concurrent revision conflict and retry; unchanged published duties and report snapshots; existing-absence behaviour once confirmed.

Status: System Config and wildcard subject-rule requirements logged for the next authorised build. No source code, live setting, absence record, timetable, notification or deployment package was changed.


## Queued after v0.7.09: Admin-only System Config and Baseline Upload

18 October 2026 at 12:59, Asia/Singapore. System Config and Baseline Upload are available only to Admin. Hide their entry points from users without Admin authority and reject direct configuration/upload requests on the backend. An Admin who is not also SMC must still be able to access these Admin functions. Keep ordinary timetable reads and cached baseline use available to their existing authorised users.

This entry restricts Baseline Upload specifically, including its upload/preview/save flow. It does not silently revoke existing SMC authority over other saved-baseline management operations such as metadata, activation, prune or restore; broader restriction of all baseline management has not been requested. The rest of System Config, including the subject exclusions, allocation priorities and scheduled-allocation switch, is Admin-only for viewing and editing.

Source review: backend/Roster.gs lines 242–251 currently shares an SMC gate across rosterUpload and rosterUpdate, while roster.js currently exposes Baseline Timetable to SMC. Contacts_Code.gs line 283 and backend/RosterOperations.gs lines 31–33 distinguish rosterAdmin from rosterSMC. Change the upload gate, not just button visibility, and do not accidentally require both roles. The separate operational Prune records command is already Admin-only and is not baseline upload.


## Queued after v0.7.09: Reorderable automatic-allocation preferences

18 October 2026 at 12:59, Asia/Singapore. User supplied image(20261018-045814).png as a commercial reference for a System Config allocation section and requested decomposition of GSiS's own automatic relief algorithm into vertically arranged rules that Admin can drag up or down to express priority. The screenshot was inspected. Its daily total, consecutive-period, daily-relief and consecutive-cover controls are reference context, not confirmation that GSiS already has those settings or that their commercial defaults should be copied.

Source-based proposal: show a compact Automatic candidate preferences list with numbered draggable rows, a drag handle, a short explanation and Move up / Move down buttons for keyboard and touch use. Reordering updates locally; persist the validated order only on Save changes. Provide Restore default order as an unsaved edit. Use the existing System Config panel style and full-page scrolling. No new framework or general-purpose business-rule engine is needed.

The four preferences exposed by the current automatic candidate comparator, in existing order, are:

| Default order | Admin-facing label | Current meaning |
| --- | --- | --- |
| 1 | Lower annual R utilisation | Prefer lower annual completed-plus-committed relief divided by recorded entitlement. Teachers within one percentage point of the eligibility group's minimum share a fairness band; unknown values sort last. |
| 2 | Fewer alternative relief periods | Prefer the teacher with fewer other automatically eligible periods that day, preserving more flexible teachers for other slots. Current count covers all timetable periods, not just periods with outstanding relief demand. |
| 3 | More weekly R remaining | Prefer more unused weekly R among otherwise eligible teachers. Remaining R and employment caps still limit automatic eligibility. |
| 4 | Rotation order | Prefer a teacher not yet in the valid annual automatic-allocation rotation, then the least recently selected in that rotation. This is not a history of all manual and automatic relief. |

Source: shared/roster-allocation.js ranked() at lines 120–123 and rotation() at lines 115–118; automatic rotation events are written in shared/roster-operations.js at line 324. Stable staff identity remains the final deterministic tie-break, not a draggable preference.

Do not present these four rows as a complete ordering of the current final-roster algorithm. optimise() at lines 180–195 maximises feasible coverage across all pending lessons, preserves fixed assignments, strongly prefers eligible reuse of an existing recess duty, combines candidate ranks with marginal allocation costs, and may improve the annual-utilisation spread through later exchanges. A valid existing automatic draft is normally replaced at equal coverage only if that spread improves by at least one percentage point. The bounded solver certifies coverage where it can, not globally optimal fairness or globally minimal preference cost. These behaviours can override a local candidate order.

Fixed checks outside the draggable list: verified school date/timetable/identity; no absence or double booking; applicable weekly R and employment caps; no newly introduced six-or-more occupied-period run; protected published, completed, manual and mutual assignments; applicable scheduling/publication rules; verified annual accounting. Ordinary automatic allocation currently excludes external/ad-hoc teachers. Existing matching recess-duty reuse has deliberate exceptions because it reuses an occupied duty with no additional R cost. Do not remove such rules or exceptions merely to make them reorderable. Manual override policies remain separate.

Manual suggested teachers are also separate: manualRanks() at lines 132–144 uses eligibility categories, suitability tiers, remaining R, annual fairness, alternatives and rotation. Do not silently apply changes to the automatic preferences to the manual suggestion tiers or claim venue, subject expertise or the screenshot's daily caps are existing automatic criteria.

Decision confirmed on 18 October 2026 at 13:10, Asia/Singapore: yes, moving annual R utilisation down must also lower its priority in final-roster optimisation. Annual R utilisation and balance remain the main preference by default, first in the initial order and in Restore default order. Here R priority refers to the annual cumulative R utilisation/balancing preference discussed above, not simply choosing the teacher with the largest raw R allowance. The rest of the default order remains fewer alternative relief periods, more weekly R remaining, then rotation.

The saved preference order must govern the final allocation policy as well as candidate selection. Update the solver's costs, improvement exchanges and draft-acceptance criteria coherently; do not leave the existing unconditional annual-spread improvement step or one-percentage-point acceptance gate able to override a deliberately higher-ranked preference. This is an authorised future solver-policy change, not merely a comparator reorder or display change. Coverage, fixed eligibility checks and protected assignments remain mandatory. Existing special recess-duty reuse semantics remain distinct. Define and verify a consistent ordered comparison of complete allocations during implementation, and do not claim global preference optimality beyond what the bounded solver establishes.

Implementation direction: one validated ordered array of stable rule IDs owned by the shared allocation module, consumed by both scheduled optimisation and manual fill-only Auto-allocate. Do not duplicate comparators in browser, Worker and Apps Script. Save with current Admin authority, revision/request handling and an audit record; record the effective policy revision with each run. Keep cached timetable data independent of configuration invalidation. Do not run or publish allocation merely by dragging a rule or saving its order. Add acceptance cases where lowering annual R changes the preferred final allocation among equal-coverage valid alternatives, where restoring defaults makes annual R primary again, and where no reordering bypasses eligibility or protected assignments. Preserve the separate manual suggestion-tier policy.


## Queued after v0.7.09: Scheduled allocation switch from 16:00

Add an Admin-only System Config toggle labelled Scheduled automatic allocation, with concise help that it plans the following date from 16:00 Singapore time until the morning cutoff. Default to Off for a new setting; do not activate a live service as part of logging or building. Retain existing deployment master gates and make any setup/gate preventing a saved On setting from taking effect visible to Admin.

Verified current schedule: the minute notification-worker cron invokes the signed scheduledRoster service. shared/roster-allocation.js schedule() at lines 197–205 targets tomorrow after 16:00, optimises every 30 minutes through 05:30, then at 05:45, 06:00, 06:15 and 06:29. At 06:30 it generates a handover report without optimisation. mayOptimise() permits allocation from 16:00 on the preceding date through 06:29:59.999; the backend also checks the cutoff before committing. It targets the following calendar date and validates school-day status; it does not search ahead to the next school day.

On permits subsequent eligible scheduled allocation runs under the existing timetable, annual-history, timing and protected-assignment rules. Off stops subsequent scheduled allocation and rebalancing without deleting saved drafts or assignments. It leaves SMC's explicit Auto-allocate action available to fill unassigned, not-yet-started periods. Neither mode automatically publishes. Re-enabling waits for an eligible scheduled cycle and must not replay expired cycles or duplicate assignments. Read the current setting within the scheduler's existing protected write operation, so once Off is confirmed a later allocation commit cannot use an older enabled setting.

The new control governs allocation only. Do not wire it directly to ROSTER_AUTOMATION_ENABLED: _worker.js lines 455–462 uses that environment flag to gate the entire scheduled service, including reports and published-duty reminders. The new persisted rule belongs at the optimisation branch inside shared/roster-operations.js scheduledTick(), reached through backend/RosterOperations.gs scheduled dispatch. Keep independent report/reminder processing and WhatsApp activation separate. Do not mark deliberately disabled allocation as failed or successfully completed optimisation; show its paused/skipped status accurately in final and handover reporting.

Persist the strict boolean and its audit event with the existing operational state, permission checks, revision and request receipts. Record actor, time and before/after values. Current package defaults are disabled, but this source review has not checked deployed flag values. Saving an On preference must not falsely claim that the notification Worker, service master gate or WhatsApp sending is active.

Acceptance for these settings: Admin-only page/read/save/upload with Admin-without-SMC supported; SMC and ordinary-user denial for restricted actions; existing permitted baseline reads and other management preserved; reorder persistence and stable IDs; defaults reproduce the chosen policy; scheduled and fill-only allocation use the same saved preferences; fixed clash/quota protections survive every order; Off during a pending cycle; duplicate/retried config saves; re-enable before/after cutoff; missing Worker/master gate status; reports/reminders continue when allocation is off; no automatic publication or WhatsApp activation.

Review record: Ponytail and Pstack source/ownership analysis plus independent Thermonuclear correctness and code-quality passes were applied to the supplied v0.7.09 allocation, scheduler and permission boundaries. Thermonuclear was absent from this chat's initial skill catalogue and generic plugin search, but the user's personal-plugin listing resolved thermonuclear v0.1.0 (plugins_6ad3430cadf08191ae5c8b4c2d01501a, release pluginrel_6ad3430f05ac81918164d0b149ac69cb). Its current entry, both review skills, shared contract and original rubrics were read through Plugin Creator on 18 October. The local prepared package checksum was also verified. No plugin content change or reinstall was necessary; this updates the earlier availability assessment. These are source-based design reviews, not an implementation diff, live-service audit or concurrency test.

Status: permissions, the preference list and the scheduled-allocation toggle are logged for the next authorised build. The priority scope is now confirmed: annual R first by default, with Admin's saved order respected by final allocation. The earlier question about applying changed subject exclusions to existing unpublished absences remains open. No code, live settings, school data, scheduled activation, plugin content or release package was changed.

## Finalised v0.7.10, 18 October 2026

The user authorised the full deployment package, updated Deploy manual, Archify schema and backend workflow, first-time/current-install maintenance guidance and a separate WhatsApp activation guide. All post-v0.7.09 items in PROJECT_RECONCILIATION_v0.7.10.md are implemented, with one explicitly retained decision: whether changed No Relief Required subject rules should affect existing unpublished absences. Current code retains each saved absence's captured policy.

The release includes Admin System Config and Baseline Upload; exact/wildcard exclusions; final solver preference order with annual R utilisation first by default; separate scheduled allocation switch; Contacts-based SMC duty selection; fast-track ad hoc identity with mandatory mobile and duplicate recovery; original Daily Employment report snapshots and durable email dispatch; local baseline preview and direct save-response reuse; and date-first Stapler. Deploy loads the latest unpublished draft and permits every Subject Type to be edited.

The source regression gate passed 322 scripts; four supplemental Chromium suites passed. Independent Ponytail/Pstack and Thermonuclear reviews closed four cross-feature findings. Eight Archify diagrams passed their actual renderer and browser gates. Complete final package evidence is in VALIDATION.md and RELEASE_SUMMARY.json.

Meta's current 21 mapped routes were checked: 17 Approved and four Pending. All exact contracts matched. The activation guide contains settings for both Roster Pages and the separate notification Worker, plus an all-route activation JSON. Pending routes remain blocked until approved. Packaged runtime flags remain disabled until the operator applies the guide. No live deployment, Git commit, staff message, school data reset or production configuration change was performed.

## Queued after v0.7.10: notification Worker connection diagnostic details

18 October 2026. During WhatsApp activation the installed diagnostic returned only false for Meta sender/templates and Calendar. The user requested a complete replacement Worker plus a logged source change for the main branch.

Canonical owner: roster-update/public/_worker.js, diagnoseNotificationConnections(). Regenerate notification-worker/dashboard-worker.mjs and dashboard-worker.txt with scripts/build-notification-worker.py; do not maintain a separate hand-edited bundled implementation.

Add diagnosticBuild 0.7.10-worker-diag1 and the validated configured Graph API version. Meta sender checks now report HTTP status, integer Meta error code/subcode and a fixed request/response phase. Distinguish sender-ID mismatch, timeout, failed fetch and non-JSON response. Calendar distinguishes an unreleased year from other request failures using its existing safe projection. Do not log token values, provider error messages, response bodies, headers, staff data or webhook secrets. Template catalogue approval checks retain their existing behavior.

The diagnostic adds no network request, queue claim, allocation, publication, email send or WhatsApp send. Existing activation flags and application behavior are preserved. This diagnostic gathers evidence; it does not claim the current live Meta or Calendar failure has been fixed.

Status: complete replaceable Worker and canonical source patch prepared for the next main source build. The published v0.7.10 deployment archive is retained unchanged. No Git commit, release version increment or live deployment was performed by this task.

Verification: generated-source parity, Node syntax and focused mocked runtime checks passed for successful responses, OAuth error 190/subcode 463, invalid/null JSON, sender mismatch, timeout, network failure, unreleased Calendar year, disabled diagnostics and scheduled diagnostic no-send behavior. Ponytail and Pstack applied; independent Thermonuclear correctness and quality reviews found no material issue in the bounded diff. Live root cause and delivery remain unverified.

## Queued after v0.7.10: Cloudflare Meta request redirect compatibility fix

18 October 2026. The deployed diag1 result reported metaSender phase request / FETCH_FAILED with no HTTP response. Source inspection confirmed all four Meta fetch paths passed redirect:error. Cloudflare Workers only supports follow and manual; error throws TypeError during Request construction before any network request is sent. Official references: https://developers.cloudflare.com/workers/runtime-apis/request/ and https://github.com/cloudflare/workerd/blob/main/src/workerd/api/http.c%2B%2B (Request constructor).

Replace redirect:error with redirect:manual in the canonical roster-update/public/_worker.js at template catalogue GET, template message POST, inbound menu reply POST and sender diagnostic GET. Retain status/JSON validation and existing failed/uncertain delivery handling. No automatic redirect following is introduced, so Authorization is not forwarded to another destination. Regenerate both dashboard files with the existing builder. Identify diagnostics as 0.7.10-worker-diag2.

This corrects a confirmed runtime incompatibility and supersedes API-version guessing as an explanation for the pre-response failure. It does not prove the live token, template authority or Calendar connection works. Keep those checks explicit. No new API version, secret, ID, cron or sending flag is selected by the patch.

Verification: focused diagnostic test now enforces Cloudflare's supported manual redirect contract, including 302 rejection, no credential/body leakage, disabled zero-network and no-send diagnostic behavior. Existing roster701-gateway-integration (with manual-mode assertions on all observed Meta requests) and roster702-notification-setup pass. Generated source parity and Node syntax pass. Independent Thermonuclear correctness/quality plus Ponytail/Pstack reviews found no material issue in the five-line change. Tests are mocked Node integration, not live Cloudflare/Meta execution.

Status: full replaceable diag2 Worker and canonical source patch prepared for next main source build. Original v0.7.10 release archive retained unchanged; no Git commit, release version increment or live deployment performed here. The separate CALENDAR_REQUEST_FAILED condition still requires investigation after the next installed diagnostic.


## 2026-10-18: Calendar diagnostics in notification Worker (v0.7.10 diag3)

Status: implementation prepared and locally verified for the next main source build. User will install the full replacement Worker to collect live evidence. No full suite release, Git commit or live deployment was performed by this update.

The notification Worker previously collapsed Calendar request errors into CALENDAR_REQUEST_FAILED. This update records request stage, final HTTP status, elapsed milliseconds, response format and whether a redirect occurred. It distinguishes HTTP failures, non-JSON replies, timeouts, fetch failures, backend rejection, invalid response envelopes, invalid Calendar results and an unreleased year. Recognised backend messages are mapped to fixed labels for a mismatched proxy secret, missing Calendar secret, disallowed service action, rejected service identity or unavailable spreadsheet. Unknown backend text and codes are not logged.

The canonical change is in roster-update/public/_worker.js; regenerate both notification-worker/dashboard-worker.mjs and dashboard-worker.txt using scripts/build-notification-worker.py. The self-contained replacement retains the diag2 fix using redirect:manual for all four Meta request paths. Diagnostic build is 0.7.10-worker-diag3; suite version stays 0.7.10.

No extra requests, retries, timeout changes, credential settings or activation flags were added. The diagnostic still makes four existing read requests and returns before allocation, email or WhatsApp dispatch. Normal single-date and multi-date Calendar return values retain their previous contract; detail stays in the private scheduled diagnostic.

Validation: 19 Calendar response/failure scenarios; 24 before/after Calendar request and result comparisons; existing gateway integration, notification setup and Meta redirect diagnostics; generated bundle parity and syntax checks. Ponytail, Pstack and Thermonuclear correctness/quality review found no material issue in this change. Tests use simulated service responses. The live Calendar failure is not yet diagnosed or fixed. The user's diag2 log confirmed Meta sender and template reads now pass, with 17 approved templates and 4 pending, all disabled at that observation.


## 2026-10-18: Configuration diagnostics in notification Worker (v0.7.10 diag4)

Status: narrow Worker update prepared and locally verified for the next main source build. Suite version remains 0.7.10. No Git commit, full release build, live deployment, configuration update or message send was performed.

The latest user diagnostic stops at CONFIGURATION_INCOMPLETE before any connection probe. It does not identify the failing setting, and the early return omits diagnosticBuild. The diag2-to-diag3 configuration rules were unchanged, so the supplied output cannot identify which deployed setting failed or confirm the installed diagnostic build.

Add diagnosticBuild to enabled diagnostic results, including configuration failures. Report the first failing setting as a fixed field name and classify it as MISSING_OR_EMPTY or INVALID_VALUE. Attribute errors in the existing canonical notificationConfig validator instead of maintaining a duplicate validator. Separately attribute the existing Calendar URL and proxy-secret checks. Never log setting values, tokens, raw parsing errors, template keys, URLs, response bodies or stacks.

Canonical owner: roster-update/public/_worker.js. Regenerate notification-worker/dashboard-worker.mjs and dashboard-worker.txt with scripts/build-notification-worker.py. The full diag4 replacement retains the diag2 Meta redirect fix and diag3 Calendar request diagnostics. No new settings, changed accepted input rules, activation changes, retries or network requests are introduced. Diagnostic mode returns before allocation, publication, email or WhatsApp dispatch.

Validation: 372 source/bundle comparisons against the actual diag3 validator, covering 93 configuration cases under both requireEnabled modes; 72 early-failure diagnostic cases; fixed-field privacy; first-failure order; scheduled no-send with activation flags enabled; existing 19 Calendar scenarios, Meta redirect diagnostics, gateway integration and notification setup; generated parity and syntax. All runtime service responses are simulated. Ponytail, Pstack and Thermonuclear correctness/quality self-review found no material issue within the bounded change. No independent reviewer or live-service confirmation is claimed.

The operator should replace the existing notification Worker with GSiS_Notification_Worker_v0.7.10_diag4.txt, preserve variables and secrets, keep diagnostics enabled and sending disabled, then paste the configuration result. Repair the identified setting only after seeing that result. The live configuration and earlier Calendar failure remain unresolved.



## 2026-10-19: WhatsApp menu access to the existing relief system

Status: queued requirement for the next authorised build. No code deployment, release build, school-data change, message send or live menu change performed by this task.

Add a first menu item titled "Report Absence", with description "Open the current relief system". Selecting it replies with the clickable URL https://roster.diveanalytics.com/. The URL was checked on 19 October and redirected to its Roster login page offering Google login. No authenticated workflow was inspected.

This preserves a route to the existing reporting workflow for staff using the former duty-phone number, now on Cloud API. Retain Urgent Message, School Layout, Collect / Return ICT and Call General Office. The link does not submit an absence, copy data into GSiS, confirm receipt or change notification/publication rules.

For the next build, update the menu selection ID, backend action allowlist and reply mapping together. Use a Pages URL setting such as WHATSAPP_CURRENT_RELIEF_URL and the existing HTTPS-link validation helper. Document the setting. The separate scheduled Worker has no incoming webhook and does not require this setting for its timer. Regenerate generated Worker files if shared source changes. Verify selection-to-link handling and the existing options before packaging.

Continuity limitation: the link does not restore the old duty phone's human WhatsApp inbox. Typed messages, voice notes and conversations expecting human attention require a separately defined inbox/handoff process. Do not imply that a Dive absence enters GSiS. Inbox migration, coexistence and cross-system integration are outside this logged change.



## 2026-10-19: Replace Stapler timetable shortcut with Excel export

Status: queued for the next authorised build. No implementation, commit, deployment or release build performed here.

On Roster > Stapler's editing page, replace the toolbar button "My timetable today" with "Export Excel" in the same position, after "Load legacy plan", as marked in the user's screenshot image(20261018-163124).png.

Export the Stapler plan for the selected date. Use the actual offline Stapler tool's Excel export format as the reference, including its applicable workbook structure and visual formatting. Inspect that exporter before implementation; this logging task has not examined the offline workbook/exporter, so no exact sheet schema or format match is claimed.

This change concerns the shortcut on Stapler's editing toolbar. It does not remove the teacher's personalised timetable elsewhere. It is separate from the already requested Excel export on Assign Relief.


## Final reconciliation in v0.7.12

The four Worker diagnostic entries above were incorporated in v0.7.11 and remain in the regenerated v0.7.12 Worker. The later Report Absence menu link and Stapler toolbar Excel export requests are implemented and locally verified in v0.7.12. Their earlier queued wording is historical. The current source register is PROJECT_RECONCILIATION_v0.7.12.md; deployment, provider activation and installed-service incident diagnosis remain separate operations.
