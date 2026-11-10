# assign-relief-export-baseline-adhoc: Assign Relief "Export Excel" lists baseline-named teachers + ad hoc relief teachers only, day only, Stapler formatting

- Status: claimed
- Owner/model: Muse
- Reviewer/model: Codex
- Last updated (Asia/Singapore): 2026-11-10
- Branch: muse/assign-relief-export-baseline-adhoc
- Base SHA: 5a4ab02
- Current head SHA (or PR head; avoid self-referential commit hashes):
- PR:
- User-authorised scope: owner 10 Nov 2026 ("fix please") — restore the Assign Relief → Export Excel behaviour the owner wants: one sheet for the selected date only, comprising only names named in the baseline timetable plus ad hoc relief teachers, looking like the 5 Nov 2026 Stapler Teacher Summary screenshot (time + period-number headers, 4 rows per teacher, Stapler colours).
- Files/domains owned (include generated outputs): roster-update/public/roster-operations-ui.js (localExportSnapshot, exportRelief), roster-update/public/roster-stapler-export.js (Stapler relief workbook, if the download returns to it), roster-update/public/roster-export.js (only if the daily renderer gains a scope option), tests proving the narrowed scope and the formatting, CHANGELOG.md, generated bundles via the canonical build only.
- Out of scope: the Drive daily file, unless the owner picks "Drive file too" (see Decisions); no live data, no deploy, no merge (owner merges).
- Acceptance checks: (1) Export Excel for a fixture day lists only baseline-named teachers plus ad hoc relief teachers (plus relief assignees and absent teachers as today — they are already in addedTeachers via the assignments loop and the backend summary), and no other active teacher appears — proven by a test with an active teacher who has no baseline lesson and no relief role, failing on old code. (2) One sheet, selected date only. (3) Stapler formatting: "All teachers · date · plan status" header, legend in the header line, green (changed lesson) and blue (suspension) colours restored; no [Draft]/[Published]/[Completed] cell tags (owner rule, 6 Nov). (4) Works from the local snapshot when the backend is unreachable, labelled "Local snapshot". (5) `npm run build` leaves no diff; full CI green; draft PR naming Codex as reviewer at the exact head.

## Decisions and changes

- Diagnosis (10 Nov 2026, code reading + git history): the wider scope came from PR #93 (commit 77bf557, merged 6 Nov, release o). It switched the download from the Stapler relief workbook (`RosterStaplerExport.makeReliefWorkbook`, built from the baseline model, so only baseline-named teachers + relief assignees appeared) to the shared Drive daily renderer (`RosterExport.dailyTeacherWorkbook`), and added a loop in `localExportSnapshot` (roster-update/public/roster-operations-ui.js) that puts every active person into `addedTeachers`. The daily renderer lists `plan.teachers` + `addedTeachers`, so the download now lists every active teacher.
- Correction (10 Nov): the owner did NOT request the wider scope. The "every active teacher" phrase is in Claude's spec (the #93 task file, authored by Claude 5 Nov 23:42); the owner's recorded ask was only "selected day in the daily workbook format". The only #93 item attributed to the owner is the removal of [Draft]/[Published]/[Completed] cell tags.
- Why the widening followed from the renderer switch: the Drive daily file lists every active teacher by design (shared/roster-operations.js:1677 — `extraIds` includes all active people only when `dailyDrive` is true), and #93 required the download's content to match the Drive file for the same revision. The formatting changed the same way: title, status line, legend rows at the bottom, no green/blue, always one day — all from the daily renderer.
- Pending owner decision — Drive daily file: RESOLVED 10 Nov 2026 — owner picked "Drive file too — narrow both". Both the download and the Drive daily file narrow to baseline-named teachers + ad hoc relief teachers. The download returns to the Stapler relief workbook (screenshot look, day only); the Drive file keeps the daily renderer with the narrowed scope, so the two files list the same teachers. The #93 "one renderer / file content matches" rule was Claude's spec, not the owner's, and is superseded for this export: the download and the Drive file match in teacher list, not in format — as they did before #93.
- Implementation (10 Nov, Muse): (1) `shared/roster-operations.js` `dailyExport`: `extraIds` no longer includes every active person when `dailyDrive` is true, and the `visible` filter on `fullPlan.teachers` is removed, so the plan keeps all its baseline-named teachers. `dailyDrive` still sets the `noReliefRequired` default on demands. Generated copies (`backend/Code.gs`, `roster-update/public/edge-roster-domain.js`, `roster-update/public/roster-operations-model.js`) come from the canonical build, not hand edits. (2) `roster-update/public/roster-operations-ui.js`: the all-active loop in `localExportSnapshot` is removed; `exportRelief` for Export Excel calls `RosterStaplerExport.makeReliefWorkbook(data, null, {hideAbsenceReasons:true})` — standalone, selected date only. (3) `roster-update/public/roster-stapler-export.js`: `makeReliefWorkbook` takes an options object and passes `hideAbsenceReasons` through to the relief overlay, so the download keeps hiding absence reasons exactly as it does now (post-#93); the Stapler screen's own export and the existing tests still show reasons. This was a deliberate call, not the owner's words: the owner asked for scope and formatting, not for reasons to return, and the current download hides them.
- Not tested: the `exportRelief` button wiring itself (no test clicks Export Excel; same coverage shape as #93) and `localExportSnapshot` directly (no test harness for it; the narrowed scope is proven through `dailyExport` plus both renderers in the rewritten test). The one-line frontend loop removal is verified by reading the diff.

## Verification
Exact command, tested commit, outcome and evidence. Explicitly list checks not run.

## Review
Reviewer/model, reviewed SHA, findings, resolution. Advisory review is not human approval.

## Deployment
Not deployed unless supported by explicit environment/version/time evidence. State staging and production separately.

## Handoff
Remaining work, blocker, next action, ownership transfer if any. No secrets or private school data.
