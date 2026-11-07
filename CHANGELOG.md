# Pending: D1 parity inventory and CI coverage guard, 7 November 2026

Model: Codex. Step 1 only: inventory canonical Google Roster dispatch, shared domain branches, Pages forwarding boundaries and persistence references; record synthetic D1 outcomes and detect unlisted operations in CI. Includes #96 intakeReview as present. No ports, production behavior, live calls or deployment. See docs/roster/D1_PARITY.md and docs/coordination/tasks/roster-d1-parity-sweep.md.

# Pending: type-to-search teacher picker in Stapler "Add teacher tile", 6 November 2026

Model: Muse. The Teacher field in the Add teacher tile dialog (and Edit teacher tile, which shares the same fields) is now the existing accessible teacher combobox instead of a native select. Typing filters as you type, matching the display name, the timetable name and bracket tags such as (MTL) and (FAJT), ignoring case, accents and spacing; prefix matches come first, then alphabetical. Keyboard and screen-reader support follow the combobox pattern, with a "No matching teacher" state. The same teachers, the same first-teacher default and the same saved staffId as before; saving tiles is unchanged. The shared picker also gains the new matching and ordering in Report Absence and Add teacher. Focused picker, dialog and Chromium tests passed. No deployment or live action. See [task](docs/coordination/tasks/stapler-add-tile-teacher-search.md).

# Pending: LORD return and collection as one long scrolling page, 6 November 2026

Model: Muse. Return and collection trolley cards render open in a single scrolling list with no collapsible sections and no one-open-at-a-time binding. The return page no longer has the per-trolley "I am physically returning" checkbox or the two placement declaration checkboxes; quantity and photo per trolley still gate submission, partial returns remain barred by the backend, and both placement declarations are still sent as true with every trolley, covered by the single submit confirmation. Source and template copies kept byte-identical; return and collection browser tests updated. No deployment or live action. See [task](docs/coordination/tasks/lord-return-collection-scroll.md).

# Pending: reliable Deploy to Contacts publication sync, 6 November 2026

## Unreleased: D1 received absence review

D1 received reports show saved overlapping periods and reasons. Exact duplicate attendance is marked Already recorded with an audit note, including bounded recovery of retained duplicate refusals. SMC can merge, keep existing, or edit then retry. Decisions require a current review and commit report status with attendance atomically; protected relief and original evidence remain. The reporter card shows parked review and applied states accurately. Google and D1 share the read-only comparison projection. No new setting, authority switch or live repair; local verification complete, full CI and exact-head review remain release gates. Revert this change to roll back; no schema migration.

Model: Codex. Report Contacts sync separately after a saved Deploy publication. Retry the same frozen publication and global catalogue revision with Admin/identity checks; reject superseded retries. Contacts invalidates cached validation choices by digest and rejects stale in-flight reads while retaining drafts and pending saves. Deploy keeps Layout handoff status visible alongside Contacts. Canonical bundles rebuilt; focused dispatch, writer and DOM tests passed. No deployment or live action. See [task](docs/coordination/tasks/deploy-contacts-catalogue-sync.md).

# Pending: retain the confirmed Stapler day while editing, 6 November 2026

## Unreleased: selected-day relief workbook

Assign Relief Export Excel uses the same one-day workbook renderer as daily Drive output, with frozen headers and teacher column, four rows per teacher, confirmed timetable source and local snapshot status. Excel duty cells no longer carry Draft, Published or Completed tags; Combined and Repurposed recess duty remain.

Model: Codex. Allocation, Report Absence, teacher timetables, publication and exports select the retained confirmed Stapler revision. Draft saves and replacement imports leave it active until Confirm. Assign Relief and Daily Notify show the effective source; never-confirmed drafts show a baseline notice and a dated review shortcut. Google, D1 and browser preload share the selected identity, including when the draft has a different origin. Existing reconciliation guards and historical communications remain. See [task](docs/coordination/tasks/roster-stapler-always-effective.md). No deployment or live action.

# Pending: Drive output diagnostics and Admin-only alerts, 6 November 2026

Model: Codex. Preserve sanitised Google refusal reasons in output ledgers and System Health, scan workbook cell/shared-string text, recover expired backups and deduplicate enabled output alerts by kind/day. Operational alerts now use active Admin recipients and separate Admin wording; claim/presend checks reject legacy duty-worded jobs. Coverage alerts retain the duty list. Proposed Admin template remains disabled pending Meta approval. The precise live Drive refusal remains unconfirmed. See [task and verification](docs/coordination/tasks/roster-drive-outputs-bridge-error.md). No deployment or live action.

# Pending: priority-aware automatic relief replanning, 6 November 2026

## Unreleased: Calendar stale save recovery

Calendar can settle hour-old dispatched event saves that never landed, under the writer lock with an audit receipt. Publication recovery verifies operation-bound audit evidence and keeps ambiguous partial writes blocked. Admins can list unresolved receipts and check each one; the original user sees a redo notice with current content. No live repair is performed by this change.

Model: Codex. Full Auto-allocate gives first priority to daily SREs and any teacher activated ad hoc for the date with no baseline timetable, within their activation and workload limits. It ranks priority-1 relief use above recess-duty reuse and retains existing choices when business preferences tie. Ad hoc activation changes retain a date-local re-plan notice until a successful full run. Allocation logs name idle priority-1 teachers and their availability or limit reasons. Manual, peer, Stapler, protected, published and started duties stay fixed. Google and D1 use the same objective and evidence. See [task and verification](docs/coordination/tasks/roster-reoptimise-priority-adhoc.md). No deployment or live action.

# Pending: Deploy ledger targets use configured relief budgets, 6 November 2026

Model: Codex. Remove the Target offload % column from both ledger views and their shared Excel/print output. FAJT Target now uses the saved relief fajtWeeklyPeriods / weeklyPeriods ratio; missing or invalid budgets show Needs configuration. Help shows the configured values. The public projection includes only these two budgets and their schema, retaining the server-only relief engine and Admin-only settings. Defaults preserve Target, at-load bands, load status and R. See [task and verification](docs/coordination/tasks/deploy-remove-target-offload.md). No deployment or live action.

# Pending: restore the existing Allocation Audit TXT, 6 November 2026

Model: Codex. Remove #82's Why capture and report-only eligibility calculations from allocation and saves. Restore the exact pre-#82 TXT renderer and lean Google audit snapshots; remove the added D1 save hook. Existing event facts and audit markers remain. The background queue also backfills missing Drive TXT files from D1 audit rows and retained R2 audit archives since the fresh start, with verified per-file ledger entries. Daily relief workbooks, background output queue/ledger, capacity-warning wording and #81 are retained. See [task and verification](docs/coordination/tasks/roster-remove-why-capture.md). No deployment or live action.

# Pending: daily relief workbook and Allocation Audit Drive outputs, 5 November 2026

Model: Codex. Add a background D1 date queue for the existing teacher-timetable workbook and Allocation Audit TXT. Daily files retain their IDs, coalesce committed changes, verify Drive readback and close once as FINAL after Singapore midnight. The workbook uses four rows per active/ad-hoc teacher, frozen headings and Stapler colours. The audit keeps its full event trail and adds a privacy-safe summary, glossary and captured decision checks/R%. Shared ledger, per-date health and failure alerts work with the fresh-start mirror off. Capacity-warning variables now name uncovered periods and the smallest eligible teacher count without contradictory 100% health. See [setup and recovery](docs/ROSTER_DAILY_OUTPUTS_RUNBOOK.md) and [task](docs/coordination/tasks/roster-daily-drive-outputs.md). No deployment or live write.

# Pending: scheduled D1 Drive backups and retained ledger, 5 November 2026

Model: Codex. Add hourly school-record increments and daily 02:15 full backups with gzip hashes, counts and Drive readback; a dedicated home-base writer leaves the frozen Google archive intact. Admin configuration, filtered ledger/CSV, age/failure alerts, a private continuity Sheet and isolated weekly/manual restore staging work in fresh-start mode. Restore preserves the archive identity and archives pending historical sends. See [setup and drill](docs/ROSTER_DRIVE_BACKUP_RUNBOOK.md) and [task](docs/coordination/tasks/roster-d1-backup-ledger.md). No deployment, activation or live data write.

# Pending: fresh D1 start with retained Google history and Admin opening balances, 5 November 2026

Model: Codex. Prepare empty Roster and timetable-register states from a signed settings-only source while Google remains the frozen archive. The setup path verifies its config digest before activation and keeps original Google pointers for a guarded switch back. Admin can enter, paste, review and correct dated opening balances with per-row audit evidence; SMC can view them. Annual fairness respects each as-of cutoff, while weekly capacity and real duty history remain intact. History views identify their D1 start date and link to authenticated, read-only Google records. See [design and verification](docs/coordination/tasks/roster-d1-fresh-start.md). No live cutover or deployment performed.

# Pending: independent Stapler days and guarded timetable reconciliation, 5 November 2026

Model: Codex. Stapler keeps its complete day under its own timetable identity. Baseline swaps and pruning leave its cells, relief and notices intact. Admin can preview and apply the one-time migration with a checked digest. The difference view only shows changes against the current baseline. Ordinary dates release only removed lessons, including published duties, and withdraw their notices. Large releases require SMC/Admin review in System Health. Google and D1 share the resolver and reconciliation rules. See [the task](docs/coordination/tasks/roster-d1-timetable-reconcile-cancels.md). No deployment or live migration.
# Pending: Roster preparation clocks follow real boundaries, 5 November 2026

Model: Codex. Google and D1 prepared saves accept harmless minute changes. The shared allocator clock checks school-date changes, composed timetable period starts and relevant cutoffs, with one recomputation and a specific terminal message. Missing period times retain strict minute checks. Allocation runs record preparation duration, System Health shows the recent per-date timings, and Google Auto-allocate warns after 45 seconds. Prepared Google operations compare dated planning facts and derived quota/fairness inputs, so unrelated records merge without another solve. Scheduled Google and D1 cycles return SKIPPED_BUSY while a manual run owns the date. Supersedes unmerged hotfix `134816a`. See [the task](docs/coordination/tasks/roster-allocation-clock-minute.md). No deployment or live action.

# Pending: consecutive limit counts occupied periods, 4 November 2026

Model: Muse. Consecutive limit now counts all occupied periods except configured exclusions. Automatic and manual consecutive checks use the same occupied set; only subjects matched by System Config "Periods excluded from the consecutive count" are left out, and Don't-need-relief has no effect on the count. Daily totals, workload and quota are unchanged. See [roster-consecutive-after-gap](docs/coordination/tasks/roster-consecutive-after-gap.md).

# Pending: Roster message buttons and acknowledgement continuity, 4 November 2026

Model: Codex. Selects approved peer-request v2 and keeps five pending private-link plus four pending staff-link templates disabled. Equivalent acknowledged duties retain receipt through first publication and republish. A valid old own-duties link shows current authorized duties; stale acknowledgement submissions require review, and current Contacts eligibility remains enforced. Capability expiry and peer-request scope stay unchanged. No live settings or messages change. See [the task](docs/coordination/tasks/roster-whatsapp-url-buttons.md).

## Pending: minimal Worker allocation single-flight, 4 November 2026

Model: Codex. Add one durable Worker scheduler lease, record overlaps as SKIPPED_BUSY and back off after two timeouts. Retain uncertain execution leases and timeout history until confirmed completion; fence late results. No backend or UI change; the broader #72 remains for next release. See [bounded task](docs/coordination/tasks/roster-allocation-single-flight-j.md).

## Pending: repair duplicate Stapler audit identities, 4 November 2026

Model: Codex. Owner ruling (a) gives each colliding Stapler decision audit the fixed `-decision` suffix and keeps the original planning-request reference on both events. The bounded repair uses one pure projection for import preparation and an Admin dry-run/apply command with a retained receipt. Preserve all other rows and raw source freshness checks; no live repair or deployment. See [repair task](docs/coordination/tasks/roster-import-duplicate-audit-repair.md).

## Pending: Home own-duty cache follow-up, 3 November 2026

Model: Codex. PR #65 reuses today's verified own-duty summary across Home visits and page reloads for ten minutes. The cache is scoped to staff, date and revision. Refresh and known changes invalidate it. Home renders before the optional background request, which waits for main Home data. Failure keeps the explicit retry wording without repeating the same request on each visit. See [task and checks](docs/coordination/tasks/roster-home-banner-wording.md). Not deployed.

# Pending: clear Home timetable and relief-duty wording, 3 November 2026

Model: Codex. Home distinguishes "No suspended timetable today" from the signed-in teacher's own relief periods. The existing duty roster is labelled "SMC doing Relief Allocation". Own-duty loading, none and failure states are explicit; a recent authenticated duties result is reused. No backend or authority change. See [Home banner task](docs/coordination/tasks/roster-home-banner-wording.md).

# Pending: optional non-SRE daily relief cap, 4 November 2026

Model: Codex. System Config adds Maximum relief periods per day (non-SRE), default 3 and Off. When enabled, automatic allocation counts distinct held and proposed relief periods, including approved peer arrangements and imported duties. All SREs are exempt. Existing duties stay; manual assignment and combination warn above the cap. See [the task](docs/coordination/tasks/roster-daily-relief-cap.md).

# Pending: distinct audit event identities, 4 November 2026

Model: Codex. New Stapler request and decision audit events retain distinct IDs and a shared planning-request reference. Reserved identity overrides and new duplicate IDs are refused before storage. Existing audit rows and historical collisions remain unchanged pending the owner repair ruling. See [the task](docs/coordination/tasks/roster-import-duplicate-audit-id.md).

## Pending: Venues sync diagnostics and Admin recovery, 3 November 2026

Model: Codex. Roster save failures now identify a pending or uncertain Venues fence. System Health shows both source states and a five-minute warning through the existing SMC/Admin alert records. A confirmed Admin action runs the existing Venues transaction recovery, when needed, then Roster source recovery, and stops on either refusal. No save or commit algorithm changed. See [task and evidence](docs/coordination/tasks/roster-venues-fence-after-rollback.md). Not deployed.

# Pending: bounded Roster import parts and late checkpoint recovery, 4 November 2026

Model: Codex. Split oversized records into verified transport segments, freeze one part per call and recover a late Google checkpoint before repeating work. Import failures distinguish bridge and Google timeouts from Google errors and retain step size. Setup shows the build label, live freeze age and saved preparation progress. The all-phase 25-second timing gate is not yet established; this draft does not clear the next cutover. No deployment or live action. See [the task](docs/coordination/tasks/roster-import-step141-bridge-timeout.md).

# Pending: recipient-approved peer relief can exceed weekly R, 3 November 2026

Model: Codex. A colleague may approve a peer request when weekly R is exhausted or unverified. Timetable, attendance, employment and consecutive-period checks remain enforced. The relief still counts toward R. An essential audit and an SMC warning record the exception; automatic allocation is unchanged. See [peer quota override](docs/coordination/tasks/roster-peer-quota-override.md).

# Pending: cancel freeze stops its server import, 3 November 2026

Model: Codex. Confirmed Cancel freeze atomically stops the unfinished server import, records why and invalidates its preparation and staging claims. Late responses cannot advance it. Source snapshots, checkpoints, staged rows and receipts stay retained for explicit restart. Edge setup shows "Import stopped because the freeze was cancelled". No authority or live configuration change. See [the task](docs/coordination/tasks/roster-cancel-freeze-import.md).

# Pending: quiet-mode allocation audit catch-up, 3 November 2026

Model: Codex. The dedicated audit lane catches up retained daily exports in oldest-first batches, up to three calls with a 20-second budget for starting further work. A renewed quiet session, notification priority, contention or failure leaves work pending. D1 export status now reaches the shared dispatcher with an accurate backlog count and concurrent-change protection. Saved SMC decision facts and original timestamps stay in the existing authoritative records and immutable archives. See [the task](docs/coordination/tasks/roster-quiet-mode-log-catchup.md). Draft review only; merge held until after the cutover and owner release. Not deployed.

# Pending: R8 verified retained import archival, 2 November 2026

Model: Codex. Admin can archive eligible abandoned import sessions into bounded, checksum-verified private R2 gzip JSON pages and a manifest. D1 copies are removed only in a guarded transaction after readback; the newest two sessions and every session not abandoned stay in D1. Import continuation makes bounded automatic progress. Admission cap increases from 8 to 24. Original records, receipts and evidence remain retained; no live archival or authority change. See [R8 task](docs/coordination/tasks/roster-import-session-archive.md).

# Pending: R3 Worker-only Google backup, 2 November 2026

Model: Codex. Update backup returns status and queues a dedicated Worker wake without capturing or leasing a mirror in Pages. Worker runs allow 180 seconds and 64 steps, with up to 500 items and a 2 MiB target per transfer. A 13.5k-row full copy passes the 30-minute test under the recorded latency envelope. Source and page receipts, unknown sends and authority stay intact. See [R3 task](docs/coordination/tasks/roster-backup-worker-throughput.md).

# Pending: R7 server-driven Roster import, 2 November 2026

Model: Codex. A current Admin queues one durable import. The notification Worker advances preparation and stages up to four independent parts, retaining exact source and part receipts. Object assembly waits for segments. Minute cron and dedicated import Queue wakes continue without a browser; the page polls status. Both heads stop at imported for separate evidence review and activation. See [R7 task](docs/coordination/tasks/roster-import-server-continuation.md).

# Pending: R2 Google published Deploy source for D1 Roster, 2 November 2026

Model: Codex. D1 Roster reads the immutable published Deploy document through its signed Google service while Deploy remains on Google. Both sources use the existing rosterReference calculator. D1 caches the publication by commit and revision, rechecks metadata after 30 seconds, and fails closed if verification fails. Personal calculations use the same source. No live authority or settings changed. See [R2 task](docs/coordination/tasks/roster-google-deploy-reference.md).

## Pending: R6 peer-mail health only, 2 November 2026

Model: Codex. Split the peer-mail health changes from held #41 without inactive-staff or weekly-R/FAJT work. Each unchanged uncertain outcome records one health observation, reviewed uncertainty remains idle, and delivery evidence is retained. D1 health receipts commit to D1; Google remains send-only for new guarded mail handoffs. The fenced-Google regression runs actual Worker dispatch through ten idle ticks with zero Google calls and no resend. #41 stays open. See [R6 task](docs/coordination/tasks/roster-peer-mail-health-only.md). Not deployed.

# Pending: R1 D1 reset after manual rollback, 2 November 2026

Model: Codex. Admin can reset retained D1 Roster heads only with explicit legacy Cloudflare authority and signed proof that Google is writable. One D1 transaction archives the exact old rows, receipts, heads and mirror evidence, resets both heads and invalidates backup work. Google capture cleanup remains recoverable under the same reset request. No live settings or records changed. See [R1 task](docs/coordination/tasks/roster-d1-rollback-reset.md).

# Pending: freeze Google for the D1 cutover, 1 November 2026

Model: Codex. Admin can freeze Google writes before the final import, inspect its age and cancel a pre-fence cutover. Both writer locks drain before the freeze. Roster writers refuse clearly; immutable preparation files remain usable. Worker jobs skip frozen Google work while durable absence receipts and Queue wakes remain retained. A four-hour warning never auto-releases the freeze.

Explicit activation is available only behind a confirmed freeze and the existing preparation flag, current Admin and exact imported-source checks. The freeze completes after both D1 stores activate. Partial or uncertain completion remains recoverable; no authority flag is changed automatically. See [the F task](docs/coordination/tasks/roster-d1-cutover-freeze.md) for verification, configuration, rollback and the runbook handoff. Not deployed or live-activated.

# Packed D1 import capture, Follow-up R2, 31 October 2026

Model: Codex. Snapshot digesting and frozen-source serialization retain stored compressed Stapler plans and allocation evidence. Later steps expand only the selected plan; D1 retains compressed audit evidence and verifies it when a dated consumer needs it. Roster and notification locks release before source upload. Google descriptors and D1 sessions retain bounded failure details, and edge setup shows the failed phase and elapsed time. A production-shaped regression reproduces the old 92.53 MB expansion from 1.46 MB stored data; fixed capture writes 1.46 MB without decompression. See [the R2 task](docs/coordination/tasks/roster-d1-import-packed-capture.md). No deployment or authority change. After deployment, explicitly restart imports prepared before R2 because the source digest now describes stored bytes.

## Pending: D1 Google backup and verified switch-back (Model: Codex)

Roster D1 revisions now queue immutable Google backup generations in the PR #19 split format, with native readers/writers for restoration, command receipts and object/source workbook preservation. Setup and System Health show backup lag. Switch-back requires paused, caught-up and digest-verified evidence. Google remains authoritative until a separately verified owner cutover; no deployment or live flag change is included.

Import preparation releases production locks before upload and places new source/checkpoint/part files in a private subfolder while retaining old captures.

# Resumable D1 import preparation — 31 October 2026

Model: Codex. Queue row R replaces one long preparation call with a frozen snapshot, bounded preparation steps, immutable part files and a final manifest. D1 leases serialize steps and retain uncertain outcomes; retries use the same source and checkpoint. The setup page shows step progress and timing. Failed imports retain evidence and support an explicit, resumable restart. Allocation audit JSON now uses immutable versions so later exports cannot change a captured import source. Google remains authoritative; no activation, deployment or live data change is included. See [the task and verification](docs/coordination/tasks/roster-d1-import-resumable-prepare.md).

# Roster cold-output archives — 31 October 2026

Model: Codex. Queue row A moves finished machine output older than 30 days into verified monthly Google archives while retaining every record. Admin Storage offers Archive now and archive browsing. Request replay identities, human audit, pending sends, current/future work and relief accounting remain protected. Daily audit export no longer deletes human history. Full verification and exact-head review are recorded in [the task](docs/coordination/tasks/roster-archive-cold-output.md). Not deployed.

# Daily SRE priority and capacity — 30 October 2026

Model: Codex. Queue row 2b. A verified daily SRE is allocated before annual R preferences, without an R quota. Published Deploy teaching evidence identifies the SRE type. Daily capacity uses Ad hoc relief max periods, initial 10 with an On/Off control, and the existing consecutive limit. Lower daily load then rotation orders daily SREs. Counts remain recorded; displays say Daily roster, no R%. Existing activation, employment restrictions and protected manual/peer work remain enforced. Long-term SRE calculations and FAJT priority remain separate queued tasks. [Task and verification](docs/coordination/tasks/roster-sre-daily-priority.md). Rebased onto current main, preserving the merged HAL fix and test repairs; fresh full verification passes 877/877 Node and 38/38 LORD programs. Not deployed.

## PR #13 owner follow-up

PR #13 merged as 17fc352e905043c1eb95b441e6f89f622d068006. The owner changed the final presentation: human assigners use timetable/Contacts names or an alias fallback; Excel retains its earlier relief-for cell text without Assigned By. The earlier entry below describes the original implementation before that follow-up. The My Relief Duties callback finding in PR #13 comment 6512974388 remains logged; it is not combined with this policy task.

# Roster assignment attribution — 30 October 2026

Model: Codex. Queue row 2. Assigned By follows the relief assignment: Auto-allocation, the recorded SMC editor, Peer arrangement or Shared subject rule. Unknown legacy actors show Not recorded. Daily Notify, My Relief Duties and all three relief Excel exports use this attribution, including unsaved local choices. Publishing remains a separate recorded action. Updating a label alone keeps the existing timetable notice identity; teacher publications and retained communication evidence keep their existing boundaries. Google remains authoritative. See [the task](docs/coordination/tasks/roster-assigned-by-label.md) for verification, review and rollback. Not deployed.

# Roster automatic relief completion accounting — 30 October 2026

Model: Codex. First task in the approved November queue. Ended published relief counts as completed in annual balances and personal calculations without a manual completion click. Explicit SMC corrections override the clock; cancelled, removed and zero-cost duties retain their existing accounting rules. Total spent, quota formula, allocation priorities and stored publication/notification records stay unchanged. Google remains authoritative. Local verification and Claude exact-head review are recorded in [the task](docs/coordination/tasks/roster-relief-auto-complete.md); no deployment or live record change is included.

# Roster import integration after PRs #10 and #11 — 29 October 2026

Model: Codex. Existing PR #8 now integrates actual main 699749f through normal merges, retaining short WhatsApp summaries and the quiet-mode replay/arrival fixes. Canonical bundles rebuilt; nine requested import programs, WhatsApp summary, quiet-mode state/route, 18-component generated parity and diff checks pass. No full-suite rerun, deployment, live import, provider send or authority change. Google remains authoritative. See the task’s final integration handoff and post11 test evidence. Claude reviews the exact new PR head.

# Roster import integration after PR #10 — 29 October 2026

Model: Codex. Existing PR #8 incorporates main 1708c3d with a normal merge, preserving merged WhatsApp short summaries, allocator and quiet mode. Canonical generated outputs rebuilt; nine focused import programs, generated parity for all 18 components, Apps Script syntax gate and the six WhatsApp summary cases pass. Prior broad-suite/runtime figures remain historical; no new full-suite result is claimed. Google remains authoritative. No deployment, live import or provider send. See the [task handoff](docs/coordination/tasks/roster-d1-chunked-import.md) and focused evidence. Claude must review the new exact head.

# Roster bounded D1 preparation — 29 October 2026, local only

Model: Codex. Task: [roster-d1-chunked-import](docs/coordination/tasks/roster-d1-chunked-import.md). The existing administrator import route now captures one immutable Google snapshot, transfers verified parts, retains durable D1 progress and commits both Roster scopes together at **imported**. Production Roster remains Google-first; no authority flags, activation fence, provider messages or school records were changed.

The backend captures under the existing writer locks and uploads its private indexed container after releasing them. A request cannot silently capture a different source after an interruption. An uploaded container can be recovered after a lost acknowledgement only when its private folder, length, bounded header and manifest digest match; bytes never uploaded require an explicit new-request restart. Large Stapler/model/audit objects use verified compressed segments and known-length streaming assembly in private R2, preserving existing object keys and encoding. Status, evidence export and restart avoid rebuilding the operational state. Restart retains the source, staged rows and receipts.

Focused synthetic checks cover global record identities/UTF-8, legacy state and object-reference parity, missing/altered/duplicate parts, concurrency, lost responses, Admin revocation, storage failure, guarded SQL rollback, unchanged activation fencing and browser continuation. The final local workerd/D1/R2 run imported 14,907,897 source bytes in 75 calls: 72 parts, a 262,400-byte largest Google response, 55,459,509 bytes sampled peak isolate memory and 159.78 ms maximum sampled active CPU. These measurements fit the tested 30-second paid CPU budget assumption; the account plan was not verified and the free 10 ms CPU tier is not certified. The [tracked runtime evidence](docs/coordination/review/roster-d1-chunked-import-runtime.json) and task record distinguish these local results from live release acceptance.

Admission retains at most eight sessions in each backend; existing identities can resume at capacity, while new captures require reviewed archival/cleanup. No uncertain evidence is automatically deleted. Bounds: 192 KiB ordinary record target and compressed segments; 1,900,000-byte maximum part; 2,048 parts; 512 KiB manifest; 40 MiB payload plus bounded header; 32 MiB raw individual object, also constrained by total payload. Build, focused import checks and 38 LORD programs pass; the full current JavaScript selection has 860/867 passes with seven reproduced baseline failures recorded in the task. The initial Google capture/encoding/upload still needs separate Apps Script/live staging verification. No live throughput, deployment or cutover is claimed. Rollback before activation stops preparation while preserving the retained sessions, source containers and objects; do not delete shared D1/R2 data or reuse failed request IDs. Claude review of the published exact head, staging, release approval and all authority-handover gates remain open.

# Roster scheduled allocation bounds — 29 October 2026, local implementation

Scheduled Google allocation records at most two attempts per dated slot, counts interrupted attempts, reconciles unknown saves by durable receipt and skips completed/stopped no-work ticks before full reads. A 75-second calculation budget preserves the last valid draft and leaves time for due SMC reporting; manual allocation and protected cells keep their existing behavior. Google remains authoritative. See [task decisions, focused verification and rollback](docs/coordination/tasks/roster-allocation-run-once.md). Generated builds, full-suite verification, exact-head review and production release remain separate controller/owner gates.

# GSiS revision K

See [K changes](CHANGELOG_v0.9.8k.md), [setup](SETUP_v0.9.8k.md) and [validation](VALIDATION_v0.9.8k.md). This is a focused Roster correction on J. Other products remain J.

# GSiS Suite v0.9.8j

See [J changes](CHANGELOG_v0.9.8j.md), [setup](SETUP_v0.9.8j.md) and [validation](VALIDATION_v0.9.8j.md). Roster publication/learning/export and Calendar sync/editing updates preserve Google authority; the production Calendar queue is optional and I rehearsal remains separate. Final release evidence is recorded by the controller.

# GSiS Suite v0.9.4

25 October 2026. Coordinated Worker/D1 authority, durable absence and peer capture, private timetable caching, Venues recovery and complete maintainer documentation. See [changes](CHANGELOG_v0.9.4.md), [README](README.md) and [validation](docs/v094/VALIDATION.md). No production deployment is performed.

# GSiS Roster v0.9.3b

25 October 2026, Singapore time. Durable absence receipt and processing are separated from allocation, with protected peer proposals and independent WhatsApp/email invitations. This patch updates the Roster frontend, backend and notification Worker; other components stay v0.9.3. See [changes](CHANGELOG_v0.9.3b.md), [installation](HOTFIX_v0.9.3b.md) and [validation](VALIDATION_v0.9.3b.md).

# GSiS Suite v0.9.2

Full-suite consolidation with Venues, STAPLER recovery and visible known UT cap. See [release changelog](CHANGELOG_v0.9.2.md), [main README](README.md) and [release notes](docs/GSiS-v0.9.2-Release-Notes.md). Local integration and release verification are in progress; no live deployment is performed.

# GSiS v0.9.1c Roster patch

25 October 2026, Singapore time. See [changes](CHANGELOG_v0.9.1c.md), [installation](HOTFIX_v0.9.1c.md) and [validation](VALIDATION_v0.9.1c.md) for full-school-year absence reporting.

# Venues design refinement — not a runtime release

25 October 2026, Singapore time. The [Venues design](docs/superpowers/specs/2026-10-25-venues-design.md) now specifies descriptor-aware room search with unit-only selected values; optional purpose/preparation notes; a multi-room staff dashboard with grouped periods and exact timings; admin-assigned room owners; and room-level immediate/approval-required booking policies. Earlier repeat rules remain explicit. The self-approval assumption is visible for review. No Venues runtime, deployment or provider send is included. The separate product backlog remains outside Git.

# GSiS v0.9.1b LORD and Roster patch

25 October 2026, Singapore time. See [patch changes](CHANGELOG_v0.9.1b.md), [installation](HOTFIX_v0.9.1b.md) and [validation](VALIDATION_v0.9.1b.md). [Change workflow](docs/CHANGE_WORKFLOW.md) records automatic changelog commits and the separate uncommitted product backlog.

# GSiS v0.9.1a LORD patch

25 October 2026, Singapore time. See [patch changes](CHANGELOG_v0.9.1a.md), [installation](HOTFIX_v0.9.1a.md) and [validation](VALIDATION_v0.9.1a.md). The LORD trio and backend use 0.9.1a; other components remain at 0.9.1.

# GSiS Suite v0.9.1

24 October 2026, Singapore time. This release promotes `81cc56a` (`v0.9-correction`) to a full numbered release. All eight app labels and npm metadata become 0.9.1. Storage schemas, cache identities, request protocols and provider template names remain unchanged. The original `v0.9` and `v0.9-correction` history is retained.

## Included since the original v0.9 release

* Move LORD core configuration into Apps Script Properties and Pages bindings; preserve existing peppers and secrets outside source and general archives.
* Restore Report Absence periods/timings and the requested review and **Submit absence** labels.
* Support atomic multi-teacher submissions for SMC/admin with individual teacher/date instructions, self-only ordinary-teacher permissions, and exact retry receipts.
* Keep confirmed green feedback above Relief instructions; avoid unused candidate reads, a duplicate delivery read and unrelated STAPLER preparation packing.
* Restore the Own arrangements full-day matrix with partial-name search, cover/combine selection and confirmed-timetable privacy.
* Offer school-wide absence page sizes 50 / 100 / 150 / 200 while preserving filters and selected eligible records.
* Preserve explicit single-teacher selection on confirmed STAPLER report reads.
* Include settings-first guidance in the deployment inventory and reject stale or dirty source when producing source/history release bundles.

No new runtime behavior is added beyond that retained correction. The original v0.9 LORD integration, trusted timetable caching, STAPLER retries, human allocation authority and allocator lifecycle protections remain included. See [the correction guide](docs/GSiS-v0.9.1-Settings-and-Absence-Correction.md) and [the historical v0.9 changelog](CHANGELOG_v0.9.md).

## Installation and verification

Use [READ_FIRST](docs/READ_FIRST.md), the [maintainer guide](docs/GSiS-v0.9.1-Maintainer-Guide.md) and [LORD setup](docs/LORD_SETUP_v0.9.1.md). Save settings before replacing source, install matching backends before frontends, preserve current owners and URLs, and reload open tabs. [VALIDATION.md](VALIDATION.md) records the fresh release evidence.

This source release does not deploy code, change platform settings or school data, activate a reference bridge, publish a timetable, or send provider messages. Automatic new-absence emergency alerts after first publication and before 14:00, targeted publication follow-ups, expanded Calendar provider cooldown and the future venue-booking pipeline remain queued.
