# Pending: R3 Worker-only Google backup, 2 November 2026

Model: Codex. Update backup returns status and queues a dedicated Worker wake without capturing or leasing a mirror in Pages. Worker runs allow 180 seconds and 64 steps, with up to 500 items and a 2 MiB target per transfer. A 13.5k-row full copy passes the 30-minute test under the recorded latency envelope. Source and page receipts, unknown sends and authority stay intact. See [R3 task](docs/coordination/tasks/roster-backup-worker-throughput.md).

# Pending: R7 server-driven Roster import, 2 November 2026

Model: Codex. A current Admin queues one durable import. The notification Worker advances preparation and stages up to four independent parts, retaining exact source and part receipts. Object assembly waits for segments. Minute cron and dedicated import Queue wakes continue without a browser; the page polls status. Both heads stop at imported for separate evidence review and activation. See [R7 task](docs/coordination/tasks/roster-import-server-continuation.md).

# Pending: R2 Google published Deploy source for D1 Roster, 2 November 2026

Model: Codex. D1 Roster reads the immutable published Deploy document through its signed Google service while Deploy remains on Google. Both sources use the existing rosterReference calculator. D1 caches the publication by commit and revision, rechecks metadata after 30 seconds, and fails closed if verification fails. Personal calculations use the same source. No live authority or settings changed. See [R2 task](docs/coordination/tasks/roster-google-deploy-reference.md).

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
