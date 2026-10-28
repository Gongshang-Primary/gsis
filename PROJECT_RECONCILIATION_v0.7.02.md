# GSiS v0.7.02 project reconciliation

Reviewed: 15 October 2026, Singapore time. Package baseline: v0.7.01, 132687a.

## Result

The missing privacy page and its three contact images are restored from the exact parallel-chat artifact. Roster and the private duty page now link to it. The manual's printed relief equation now includes Other non-teaching, and the layout mapping document identifies the correct Pump Room and current venue count. Installation notes now accurately distinguish the final source archive from baseline Git history. These changes do not alter school data, permission policy, relief calculations or messaging activation.

No further confirmed missing runtime requirement was found in the reviewed scope. This finding does not certify every unseen project message or replace live acceptance.

## Coverage and limits

The review used the current conversation, ten focused history-retrieval requests for the GSiS project, canonical saved queued ledgers, carried release records, current source, regression evidence and direct checks. Retrieved history covers project decisions from 20 September to 15 October 2026. Search returned selected conversation evidence; no tool exposed a complete project-chat inventory or every full transcript. Absence from these results is not proof that no additional instruction exists.

Relevant threads or source records include Deploy Viewport; Contacts Viewport retired; Parse layout files; Queued change log; Resume v0.4.02 Commit; GSiS v0.5.xx; 2nd GSiS v0.5.x; v0.5.xx (iii); Port EXT Contact Info; Calculate R Rates; Clarify v0.6.00 Relief Calc; Revise Deploy Manual; later Roster R01 to R21 discussions; the privacy and staff-directory compatibility discussions; and the separate SMC presentation discussion. Existing current-thread UI and performance requests were also checked against v0.7.02.

The historical GSiS_v0.5.xx_Queued_Changelog(2).md was read in full at version 44, 1,291 lines. GSiS_v0.6.00_Queued_Changelog.md version 10 was read directly. Earlier GSiS_Queued_Changelog.md version 119 was recovered, alongside v0.3 through v0.7 release records. The matrices below identify code evidence rather than treating old completion claims alone as proof.

## Privacy restoration

Canonical artifact: GSiS_Roster_v0.7.00_Privacy_Images_Upload.zip, created 14 October 2026 at 13:52 UTC. Comparing it with the earlier Privacy_Upload ZIP showed that the later revision only replaced contact text and email links with three images.

The 13-section page and three images are copied unchanged. The page retains its 14 October policy date. The school helpdesk and WhatsApp number remain readable images, as agreed. No email links were restored.

| File in the Roster frontend | SHA256 |
| --- | --- |
| privacy.html | 5026da603b275147329bee7d3766839e88a13ac5bc41853348069af4b8cca2aa |
| privacy-assets/rems-email.png | fc999c8d8265beaf464fbb15189a03856d4ea6f661dd84507e4c661a1b16e633 |
| privacy-assets/school-email.png | 7467c418cd05fff2c93b35e64a3551c85793b1a8952c77f95a07663dadb9707e |
| privacy-assets/school-phone.png | 95219017d6dbe4227cafea4ef1c65f4402a82bde2c4ae3efa05ef09392a8dc35 |

The page covers staff and relief data, Google Workspace, REMS clauses 2.1.1 and 2.1.2, separate WhatsApp permission, message minimisation, security, retention, correction, deletion and withdrawal. Publication does not collect or prove permission.

The page and images are static paths outside the API worker's /api/* route. Independent runtime checks served all four files without a session or upstream request while /api/profile and /api/operations remained 401 without authentication. Existing Cloudflare Access policy can still block the whole site; after installation, verify the page and images in a private browser window. This release does not change that external configuration.

## Earlier requirements

## Included requirements

| Earlier accepted requirement | Current code and verification evidence | Disposition |
| --- | --- | --- |
| Separate planning versions; rename/date/archive; blank versus duplicate; version independence; explicit publication and Contacts approval | `backend/Code.gs`, `backend/Planning.gs`, `public/version-rows.js`; `tests/backend.cjs`, `tests/storage.cjs`, `tests/release04-planning.cjs`, `tests/teacher-publish-contacts.cjs` | Included. Blank retains structure rather than assignments; duplicate copies independently; approval gates remain. |
| Admin deletion and selected-version Audit purge; active version protected; retain durable audit and save recovery | `backend/Code.gs`, `backend/FieldStore.gs`; `tests/backend.cjs`, `tests/audit-read-path.cjs`, `tests/release419-backend.cjs` | Included. Publication permissions have a historical ambiguity described below. |
| Venue anchored IP Deploy matrix with form class context and TG rows; compact working area | `public/app.js`, `shared/venue-groups.js`; `tests/ip-anchor413.cjs`, `tests/release505-tg.cjs`, `tests/release506-tg-ui.cjs` | Included. |
| Contacts per-column filtering; no global search requirement; compact 13 inch working space; frozen TTb name/header; one native scrolling owner | `contacts-update/public/index.html`, `contacts-update/public/app.js`, `shared/table-viewport.js`, `shared/table-viewport.css`; `tests/release17-table.cjs`, `tests/contacts-management-ui.cjs` | Included in current controls. No new global search box was found. Actual fit on the office laptop is live acceptance. |
| Contacts control stack Default/All/Clear; single authoritative Membership page; Subject Load accepts zero and n/a separately; HR choices version owned and removed assigned values retained | `public/planning-ui.js`, `backend/Planning.gs`, `contacts-update/public/index.html`; `tests/release04-ui.cjs`, `tests/release04-planning.cjs`, `tests/release402-catalogue.cjs` | Included. Later settings hierarchy replaces the older flat navigation request. |
| Named Block B and K geometry changes: retained L2 connector alignment, closed end, separate north shifted stair roof/sky opening, narrowed east lift, route via south/west/north, hall infill, open upper partitions retaining room IDs | `layout-update/public/landmark.html`; `tests/release18-geometry.cjs`, `tests/model-k.cjs`, `tests/review04-geometry.cjs`, `tests/release17-corridor.cjs`, `tests/model419.cjs` | Included in actual scene meshes and ray tests. Later annotated revisions supersede earlier geometry interpretations. |
| Q134 explicit Contacts column sort takes precedence over hierarchy; default restores hierarchy | `contacts-update/public/app.js:34` and adjacent render path, `contacts-update/public/core.js`; `tests/release501-contacts.cjs` | Included. Explicit sort is primary; ties retain staff order. |
| Q135 seven discrete assignment columns; filter works even when hidden; same-assignment level/subject semantics | `contacts-update/public/app.js:17` to `:29`, filter pipeline; `tests/release501-contacts.cjs` | Included. Empty source memberships are not fabricated. |
| Q136 to Q138 desktop five default columns, mobile three, one pixel mobile font reduction, automatic compact fit after all result changes | `contacts-update/public/app.js:19`, `:43`, render `GSISTableFit`; `contacts-update/public/styles.css`; `tests/release501-contacts.cjs`, current Contacts UI tests | Included in current implementation. Desktop is Name/GSPS/CES/Mobile/FT; mobile is Name/Mobile/FT. |
| Q139 independent Layout owned year snapshot; ordinary draft saves do not alter it; coherent recoverable publication; removed rows Active N | `backend/LayoutRepository.gs`, `shared/layout-data.js`, `layout-update/public/app.js`; `tests/release501-layout.cjs`, `tests/public-layout.cjs` | Included. Test asserts public Layout does not open Deploy, retries reuse snapshot ranges, and 2027 cannot overwrite 2026. |
| Q140 TG allocation third page; MTL source labels, merged teacher/venue facts, counts, discrepancies, 3CL6 C4-17 and 5ML2 E3-12 source priority | `data/layout-2026.json`, `backend/LayoutRepository.gs`, `layout-update/public/app.js`; `tests/release501-layout.cjs`, `tests/layout-tg-compact.cjs` | Included. Deliberate source discrepancies remain reviewable. |
| Q141 created independent 2026 seed; correct143 venues,40classes,59groups,99allocations,394pupil rows,106usage references | `data/layout-2026.json`; `tests/release501-layout.cjs` | Current seed counts directly verified. The historical ledger records completed live data preparation on5October; live current sheet was not reread in this audit. |
| Q142 to Q144 Contacts durable save/recovery; viewing remains available during pending save; identity isolated caches; safe degraded data and detailed errors | `backend/Contacts_Commit.gs`, `backend/Contacts_View.gs`, `Contacts_Code.gs`, `contacts-update/public/app.js`; `tests/contacts502-save.cjs`, `tests/contacts503-view.cjs`, `tests/contacts503-save.cjs`, `tests/release504-contacts.cjs` | Included. Original protected cell incident was fixed by the user's permission repair and is not a source fix claim. |
| Q145 second Form Teacher assignment blocked immediately in draft; stable IDs | `public/app.js` local validation, `backend/Code.gs`; `tests/release504-ui.cjs`, `tests/release504-rules.cjs` | Included. |
| Q146 optional HOD i/c, SH i/c, OIC,2IC committee leadership; preserve ambiguous old positions | `shared/planning.js`, `public/planning-ui.js`; `tests/release504-ui.cjs`, `tests/release504-storage.cjs` | Included. |
| Q147 and Q170 equal text size equations; sufficient vertical room for fractions | `public/workload506.css`, `public/workload-ui.js`, bundled KaTeX; `tests/release506-workload-ui.cjs` | Included. Formula evolution does not change this display requirement. |
| Q148 explicit role offload replaces general appointment percentage; editable/deletable HOD SM50%; explicit0 different from unset | `shared/teaching-rules.js`, `public/app.js` Offload UI, backend shared engine; `tests/release504-rules.cjs`, `tests/release504-storage.cjs` | Included. Later whole-week formula retains role precedence but changes how employment/offload enters R. |
| Q149 and Q151 suite read/write audit and surgical optimisations with truthful timing, current authority, durable journal/retry protection | `IO_INVENTORY_v0.5.04.json` and `PERFORMANCE_v0.5.04.md` through `PERFORMANCE_v0.5.09.md`, `backend/FieldStore.gs`, `backend/SheetsIO.gs`, `shared/transport.js`; release504/505/506 performance and recovery tests | Code improvements included. Production latency/concurrency acceptance remains open; no cell-count result proves school speed. |
| Q150 Add/Edit TG one checkbox class selector; stable identity and associations; workload once; venue separate | `shared/tg-scope.js`, `shared/venue-groups.js`, `public/app.js`; `tests/release505-tg.cjs`, `tests/release505-tg-ui.cjs`, `tests/release505-tg-storage.cjs` | Included and later extended by accepted multi-level Q195. Original same-level restriction is superseded, not a missing guard. |
| Q152/Q154 relief R before Blocks, zero floor, authenticated API, actual per-teacher teaching; preserve unavailable values | `backend/Relief.gs`, `shared/relief.js`, `public/relief-ui.js`; release505/507/508 and release600/601/602 relief tests | Included under latest PDF model. Old Expected mode/lunch/budget rules were deliberately superseded. |
| Q153 future timetable, assignment and notifications | Current `roster-update/public`, `backend/Roster.gs`, `backend/RosterOperations.gs`, `notification-worker` and maintained Roster regression suites | Later implemented. Original roadmap was not itself a demand to activate sending. |
| Q155 Singapore Audit display without changing stored UTC timestamps or order | `public/app.js` Singapore formatter; `tests/release506-info.cjs`, `tests/audit-read-path.cjs` | Included with date rollover test. |
| Q156 FMA selection survives scope/venue changes, Apply, Save and reload; Q157 IP scroll remains at edited TG | `public/app.js` TG selector and stable anchor path; `tests/release506-tg-ui.cjs`, `tests/release506-tg-storage.cjs` | Included. Original production FMA defect was not reproduced, so no claim of proven original root cause. |
| Q158/Q161/Q163/Q164 Classes, Span of Control, HR, Audit surgical reads/writes and compact content width | `backend/FieldStore.gs`, `public/reporting-ui.js`, `public/app.js`; `tests/release506-performance.cjs`, `tests/release506-storage.cjs`, `tests/release506-hr-ui.cjs`, `tests/audit-read-path.cjs` | Included code improvements, production acceptance outstanding. |
| Q159/Q160 Program Settings left text/centred numeric cells, shorter PLT/Events labels | `public/app.js`, scoped CSS; `tests/release506-info.cjs` | Included. |
| Q162 all inactive Contacts staff visible at bottom by default; compact teacher rows; explicit reuse retains identity | `public/app.js` teacher listing and planner resolver; `tests/release506-hr-ui.cjs` | Included. Display alone does not add/activate records. |
| Q165/Q174 MCL1 C4-17, MCL2 C4-18 in public Layout and Deploy Info Layout, including older missing registry | `shared/layout-data.js`, `public/app.js`, `data/layout-2026.json`; `tests/release506-layout-names.cjs`, `tests/release507-layout.cjs` | Included. Follow-up Q174 fixes the actual older Deploy data path missed by the initial Q165 implementation. |
| Q166 six compact level tables one horizontal row/shared scroll/sticky headings, full export | `public/app.js`, `public/deploy506.css`; `tests/release506-info.cjs` | Included. Unknown legacy levels retained as an extra panel rather than silently removed. |
| Q167 Ledger R before Blocks; Q168 Stats category R average and Compact; Q169 Workload Settings beside HR Settings | `public/app.js`, `public/workload-ui.js`, `public/workload506.css`; `tests/release506-info.cjs`, `tests/release506-workload-ui.cjs` | Included. Stats average was an announced implementation assumption, not a later unanswered proposal. |
| Q171 multiple Deputy/TLs checkbox choices; Q172/Q173 one trailing Choose and automatic gap closure in all five membership matrices | `shared/planning.js:29` to `:57`, `public/planning-ui.js`; `tests/release506-groups.cjs`, `tests/release506-groups-ui.cjs`, `tests/release506-groups-storage.cjs` | Included, stable role positions retained. |
| Q175 actual individual Ti; Q176 external app owns Blocks; Q177 Admin rule editing; Q178 configurable budgets | `shared/relief.js`, `backend/Relief.gs`, `backend/RosterOperations.gs`; `tests/release507-security.cjs`, `tests/release508-relief.cjs`, latest relief tests | Included under later accepted model. Q182 expressly opens applied breakdown viewing to SMC, superseding Q177's earlier broad read restriction. |
| Q179 Workload tables fit contents; Q180 PAL default Auto right/Manual left and retained manual editing | `public/workload506.css`, `shared/pal.js`, `public/app.js`; `tests/release508-ui.cjs`, later `tests/release604-pal.cjs` and `tests/release604-ui.cjs` | Included under later PAL clarification: FT additions copied, previous PAL teachers retained on replacement, YH/Admin edit anytime, SMC edit in Manual. Do not revert to old removal policy. |
| Q181/Q182 whole-week relief budgets, school reference demand, offload and individual transparency; SMC read/Admin edit | `shared/relief.js` current whole-week-v4, `backend/Relief.gs`; maintained relief rule/storage/API/UI tests | Included. v0.6.00 PDF replacement and later updates supersede early formulas, fractional rounding and adoption choices. |
| Q183 coherent updated R with save delta; cache version verified; batch recoverable Recalculate | `backend/Relief.gs`, `backend/Contacts_Recalculate.gs`, `backend/FieldStore.gs`; `tests/release508-atomic.cjs`, `tests/release508-storage.cjs`, `tests/release508-contacts.cjs` | Included with unchanged-result proof and durable completion safeguards. |
| Q184 Workload Settings navigation lock/hidden Cancel; Q185 surgical Exclusion saves without unnecessary R calculation | `public/app.js`, `public/workload506.css`, `backend/ExclusionStore.gs`; `tests/release509-ui.cjs`, `tests/release509-exclusions.cjs` | Included. Tests cover top actions, dirty leave/discard, exact R predecessor, old projection fallback and native transport. |

## Additional earlier decisions returned to the parent audit

The parent retrieved further decisions while this subtask ran. These were compared against the same current source rather than treated as fresh change requests:

| Decision | Current evidence | Disposition |
| --- | --- | --- |
| 23 September: exclusions flag a mismatched assignment rather than silently remove it | `LEVEL-EXCLUSIONS.md`, `tests/exclusions.cjs`, `tests/exclusion-ui.cjs`, `tests/exclusion-cells.cjs` | Included as advisory assignment warnings. |
| 25 September: version owned Offload; compact/autofit tables, horizontal window scroll and frozen first column | `shared/teaching-rules.js`, `shared/table-viewport.js`, `shared/table-viewport.css`, `tests/table-controls.cjs`, `tests/release17-table.cjs` | Included. Later per-page document scroll requirements supersede universal fixed-height containers. |
| 29 September Q86: export only displayed columns in displayed row order, including filtered and offscreen rows | `shared/table-tools.js`, `shared/excel-export.js`, `tests/tables412.cjs`, `tests/release500-excel.cjs` | Included. Audit clearly exports loaded rows only. Q87 graphical Layout Excel initially open was subsequently implemented, with unresolved venues included in an appendix. |
| 1 October: Statutory Name remains Contacts owned; version teacher basic name, modifiers and role/appointment are joined by stable Staff ID | `backend/Code.gs` teacher resolution/publication review, `shared/fields.js`, `tests/release17-roles.cjs`, `tests/teacher-publish-contacts.cjs` | Included. Current v0.6.08 teacher identity validation and explicit deletion do not change Contacts ownership. |


## Accepted requirement reconciliation

| Requirement and historical source | Current evidence | Result |
| --- | --- | --- |
| Q181/Q182 whole-week relief and transparent applied values, 9 Oct morning; universal PDF model Q186 supersedes old adoption model, 9 Oct evening | `shared/relief.js:7–31` uses whole-week-v4, normalises older settings in memory, uses actual teaching only; `:59–82` keeps school teaching numerator/full-time denominator, 84/67.2/65 budgets, employment applied once, nonnegative integer R. `backend/Relief.gs:9–21` gives Admin/SMC details and only Admin private editable rules. | Included. Do not restore the superseded legacy/adoption choice or earlier alternative formulas. |
| Q187 rendered equations synchronised to configured budgets, 9 Oct | `public/relief-ui.js:8–14` renders Wi plus all three R branches with configured values and bundled KaTeX. | Included; actual DOM suite passed. |
| Q188 partial-name department multiselect, keep search/open/focus and selections, 9 Oct | `tests/release600-ui.cjs` exercises actual Dept controls for partial matching, clear, empty result, focus, persistent query and the one queued organisation change. | Included; rerun passed. |
| Q189 active ST/LT/MTT department TL eligibility, version-owned role mapping, 9 Oct | `shared/planning.js` TL eligibility; `tests/release600-rules.cjs` and `tests/release600-storage.cjs` exercise client/domain and backend mixed-save enforcement, retained inactive removal. | Included; rerun passed. |
| Q190 specialist assigned periods/headcount/average is informational, not a replacement Wi, 9 Oct | `shared/workload.js:161–181,195–197`; `tests/release600-rules.cjs` checks part-time headcount, duplicate suppression, inactive exclusion, missing inputs and unchanged R. | Included; rerun passed. |
| Q191 current Admin may grant Admin without dropping SMC, 11 Oct | `tests/release601-admin.cjs` exercises actual backend grants, current authority, reactivation, conflicts and existing role preservation. | Included; rerun passed. |
| Q193 Acting SH belongs to SMC, Acting ST/LT/MTT TL membership remains independent of OF, 11 Oct | `tests/release601-membership.cjs` checks actual Contacts directory and Deploy resolver, absent catalogue flags, TL eligibility and retained Acting OF. | Included; rerun passed. |
| Q192 Layout loading diagnostics and recovery, 11 Oct | `CHANGELOG_v0.6.01.md` explicitly separates diagnostic containment from live root-cause acceptance. New v0.7.02 diagnosis URL logic is handled by root/current thread. | No claim of live acceptance. Not a missing feature inferred from an older incident. |
| Q194–Q196 compact TG layout, multi-level TG periods once, workload/search optimisation, 12 Oct | `CHANGELOG_v0.6.02.md` and current source retain these contracts. Later `tests/release605-workload.cjs` and `tests/release607-workload.cjs` validate independent TG demand, not duplicate or suppressive demand. | Included in carried implementation; later demand policy supersedes the temporary replacement selector. |
| Q197 and Q203–Q211 workload benchmarking, 13 Oct onward | `shared/workload.js:71–154` uses planned demand; `:189–194` actual non-teaching + retained teaching benchmark with inclusive band, FAJT 65/84 and no RT target; `CHANGELOG_v0.6.07.md` removes mandatory Additional/Replacement selector. | Included. Latest independent TG policy retained. Three selected Ledger/workload suites passed. |
| Q198–Q202 PAL and relief integer/scope changes | `CHANGELOG_v0.6.04.md`; actual `tests/release604-pal.cjs` and `tests/release604-ui.cjs` check additive FT copying, manual removal preservation, YH/Admin/current authority and active-teaching relief table scope. | Included; rerun passed. |
| Q214–Q216 teacher identity and lifecycle | `shared/planning.js:34–53` teacher impact/clear helpers; `tests/release608-teachers.cjs` exercises duplicate names, Admin reviewed delete, SMC inactivation clearing every allocation, stale review, identity/audit and publication isolation. | Included; rerun passed. |
| Q217–Q218 and 12 Oct Revise Deploy Manual | Final rebuilt ZIP contains top-level `GSiS-Deploy-User-Manual-v0.7.02.html`, README link and checksum manifest; manual bytes match the corrected source. It has the Get Started/Decide/View/Settings/Audit/Reference tree, combined SMC instructions, 36 inline screenshot images and zero external scripts. | Included, with the Wi omission corrected. Final archive checks confirm the corrected manual is packaged. |
| IMP counted once as non-teaching, later v0.7.00 requirement | `shared/relief.js:80`, `shared/workload.js:142` and `backend/Relief.gs:9–14`; actual IMP domain/API/UI suites validate publication, frozen snapshots, unchanged Ti/Tavg/SIUE, atomic saves, authority and deletion impact. | Code included. Manual formula omission now corrected. |


## Current-thread and later Roster requirements

| Requirement | Evidence | Disposition |
| --- | --- | --- |
| Exact SMC primary row and one divider; other functions below | roster-update/public/roster.js and roster.css; tests/roster702-memory-ui.cjs; Chromium Home checks | Included. |
| Hierarchical breadcrumbs at right of status row | roster-update/public/index.html, roster.js and roster.css; Chromium desktop/mobile checks | Included. |
| STapler Module 3 assignment UI and screenshot-based daily absences | roster-update/public/roster-operations-ui.js and roster-operations.css; tests/roster702-operations-ui.cjs; Chromium operations suite | Included while preserving authoritative GSiS assignment rules. |
| One in-memory baseline and indexes; blank timetable until selection; owner/logout lifecycle | roster-update/public/roster.js; tests/roster702-memory-ui.cjs | Included. |
| Lightweight availability directory; date-activated external teachers selectable | backend/RosterOperations.gs; tests/roster702-backend.cjs; actual Chromium selection checks | Included. |
| Fast cached read-only views, fresh updates and draft protection | roster-operations-ui.js and backend/RosterOperations.gs; operations UI/record-only tests | Included. Production latency is not established by synthetic tests. |
| R01 to R20 quota, publication, acknowledgement, annual fairness, notification and export workflows | shared/roster-operations.js, shared/roster-allocation.js, backend/RosterOperations.gs, maintained Roster suites | Inherited implementation retained. Annual entitlement and live notification acceptance remain explicit gates. |
| No Relief Needed without a written reason, including after 06:30 | shared/roster-operations.js; tests/roster701-r20.cjs | Directly rerun, 9 checks passed. |
| R21 Recess Regression follows normal relief flow and protects preassigned slots | shared/roster-operations.js and shared/roster-allocation.js; tests/roster701-r21.cjs | Directly rerun, 11 checks passed. |
| Restore Script Property URL configuration and fix identity scope | backend/Roster.gs, backend/LayoutDiagnostics.gs, backend/appsscript.json; tests/roster702-backend.cjs | Included. School-specific diagnostic URLs are not hardcoded. |
| Dashboard-copy notification Worker, setup corrections and no-send diagnostics | notification-worker, scripts/build-notification-worker.py, WHATSAPP_SETUP.md; notification setup tests | Included. Sending, menu, diagnostics and allocation flags remain disabled. |

## Superseded decisions and related work

1. Earlier relief equations, per-fortnight explanatory tables and Expected teaching proposals do not override the later PDF/whole-week-v4 product formula. The manual correction changes only its missing Other term.
2. The earliest Admin+KP publication wording conflicts with later v0.4.04 Admin review/gates. Current Admin-only publication remains; this audit does not broaden permission.
3. Earlier same-level TG and PAL removal rules were superseded by later accepted multilevel/additive rules. They were not restored.
4. The 6 October EXT port was a one-time transfer between Staff Info.xlsx and contacts.xlsx. Available source supports EXT but does not prove the transfer result. No source work is a substitute for a current data comparison, and no data overwrite was repeated.
5. staff_info_compat was created as a read-only seven-column legacy export in the live Sheet. Later retrieved history reports LORD and Fault consumers cut over, with data_valid still pending. Current downstream status and IMPORTRANGE authorisation require a separate live check; no compatibility API was invented for this ZIP.
6. The SMC presentation and requested live screenshots are separate deliverables. No retrieved instruction requires them inside the deployment package. The deck's live screenshot request is not counted as completed here.
7. Route finding and other earlier feasibility or architecture discussions were not treated as approved new runtime features.
8. School-browser cold/warm speed, concurrent editing, current Layout/Calendar data, missing individual timetable data and live notification delivery remain installation/data acceptance tasks. The package does not claim to resolve them through local tests.

## Verification

Independent Pstack and Ponytail review found no remaining privacy implementation or unnecessary-complexity issue. Canonical page/asset equality, public-file handling and protected API rejection were checked directly. The original 62 vendor asset hashes are retained; the three privacy images are additional assets.

Seventeen focused policy, authority, lifecycle, IMP, garden and R20/R21 scripts were rerun successfully. These include release600 rule/storage/UI, release601 Admin/membership, release603 Ledger, release604 PAL/UI, release605/607 workload, release608 teachers, IMP domain/API/UI, garden605 and R20/R21. The offline manual rendered without external requests or horizontal overflow.

The final regression, browser and archive results are recorded in VALIDATION.md and RELEASE_SUMMARY.json. Package checks now fail if the public page, its images or either app link is missing. Neither source preparation nor these checks deploy a service, modify a secret, open a WhatsApp reply window or send a message.

