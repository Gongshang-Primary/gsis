# assign-relief-export-stapler-format: Assign Relief Export Excel matches the Stapler workbook layout

- Status: claimed
- Owner/model: Muse
- Reviewer/model: Codex
- Last updated (Asia/Singapore): 2026-11-10 ~18:35
- Branch: muse/assign-relief-export-stapler-format
- Base SHA: e590c29
- Current head SHA (or PR head; avoid self-referential commit hashes):
- PR:
- User-authorised scope: Make Assign Relief "Export Excel" (the download) produce the Stapler standalone workbook layout from the owner's Nov 5 screenshot ("2026 Nov 05 Stapler - Teachers TTb saved 2026 Nov 05 0705h", sheet "Teacher Summary · 2026-11-05 · Current Stapler plan"). Target layout: filename "<date> Stapler - Teachers TTb saved <date> <time>h.xlsx"; sheets "Teacher Summary" and "Class POV"; A1 "Teacher Summary · <date> · Current Stapler plan"; a weekday row (e.g. "Thursday"); a "Start / End" row; a "Teacher" row with period numbers 0-12 (no P prefix); teachers from row 6, 4 rows each; the relief overlay colours as today (orange relief, grey absent/vacated, green changed, pink extra, blue suspension). Keep #109's scope (baseline-named + ad hoc relief teachers only, selected date only) and #109's privacy rule (absence reasons hidden in the download).
- Files/domains owned (include generated outputs): roster-update/public/roster-stapler-export.js, roster-update/public/roster-operations-ui.js (the exportRelief call), tests/roster-assign-relief-export-day.mjs and any new export-format test, CHANGELOG.md, generated bundles via the canonical build.
- Out of scope: the Drive daily file (stays the daily renderer; only its teacher scope was narrowed by #109); the Stapler screen's own export (unchanged); the relief-instructions "being checked" question (separate issue, see Handoff); any live data, settings, merge or deploy.
- Acceptance checks:
  1. The download matches the screenshot layout in the header area (filename, sheet names, A1, weekday row, "Start / End", "Teacher" + period numbers, teacher start row), proven by a test that asserts each of these and fails on the current q code.
  2. The download still lists only baseline-named + ad hoc relief teachers, and still hides absence reasons (the #109 privacy tests still pass).
  3. The relief overlay still applies (orange/grey/green/pink/blue as today).
  4. Canonical build leaves no diff; full local suite green; full CI green; draft PR naming Codex at the exact head.

## Decisions and changes

- Owner deployed v0.9.9q on 10 Nov ~18:28 SGT and confirmed q's Export Excel still produces the "All teachers" relief workbook (filename "<date> Relief local snapshot - Teachers TTb...", one sheet "Teacher Summary", A1 "All teachers · <date> · Local snapshot · ...", row 3 "Time", row 4 "Teacher" + "P0/P1...", teachers from row 5). The owner asked for a hotfix from Muse.
- Verified by running the real q export code (probe, 10 Nov): #109 restored the old RELIEF workbook, not the screenshot. The screenshot is the Stapler screen's own export (roster-update/public/roster-stapler-ui.js:512 calls makeWorkbook(plan, baseline, {eventName: 'Stapler', includeClassPov: true})), which uses the full-week converter (weekday row, "Start / End", period numbers) and plannerWorkbook (Teacher Summary + Class POV, A1 "Teacher Summary · <date> · Current Stapler plan").
- The hotfix should reuse that screen-export path for the relief download rather than inventing a new layout.
- Implementation (10 Nov): the relief download now routes through the screen-export path when a usable baseline is available.
  - `roster-stapler-export.js` `makeReliefWorkbook`: a new explicit `includeClassPov` option, honoured only with a baseline, sets eventName 'Stapler' and passes includeClassPov to `makeWorkbook`. Without a baseline it falls back to the relief-workbook layout (eventName 'Relief local snapshot'/'Relief current saved'). The option is explicit so the existing two-week relief tests (roster714-teacher-export, roster098j) keep their pinned behaviour.
  - `makeWorkbook` `if(summary)` block: the relief-workbook header (A1 "All teachers…", A2 legend, A1/A2 merges, row heights, pageSetup) is skipped when includeClassPov is set, so the Stapler layout keeps the screen export's header (A1 set by plannerWorkbook, A2 empty, converter row heights, no merges). The relief overlay still applies in both layouts.
  - `plannerWorkbook`: A1 is now set to "Teacher Summary · <date> · Current Stapler plan" unconditionally (was only when there was no reliefSummary); the screen export already got this value, so only the relief path changes. `hideAbsenceReasons` is threaded through to the Class POV data.
  - `makeClassWorkbook`: when `hideAbsenceReasons` is set, the absence label omits the reason ("Alice (absent — unresolved)") and imported tile subjects are scrubbed with the daily renderer's exact two replaces, so a reason embedded in an imported lesson cannot leak into the Class POV sheet. The standalone Class POV export (no flag) still shows reasons.
  - `roster-operations-ui.js` `exportRelief`: for the full export it uses the warmed baseline (`s.exportBaseline`) or loads it on demand via `s.ctx.localTimetable(date)` (same pattern as the screen export), validates it with `canUseBaseline`, and passes it with `{hideAbsenceReasons:true, includeClassPov:true}`. Without a usable baseline it falls back to the standalone relief layout. The success message says "Teacher Summary" when the Stapler layout is used, "All-teacher" only for the fallback.
- Deliberate calls: A2 stays empty in the Stapler layout (matches the screenshot; the revision/allocation line is preserved in the Class POV subtitle). The "selected date only" scope means the relief content is for the selected date only; the workbook itself shows the full week (all 5 days), scrolled to the selected day, exactly as the screenshot does. The Drive daily file is unchanged (daily renderer, one sheet).
- Tests: `tests/roster-assign-relief-export-day.mjs` rewritten for the Stapler layout (baseline built from the fixture day, `canUseBaseline` asserted true; filename, sheet names, A1, A2 empty, weekday row AJ3 'Wednesday', A4 'Start / End', AJ4 '07:00\n07:30', A5 'Teacher', AJ5 '0', AK5 '1', AL5 '2', teachers A6/A10/A14/A18/A22, overlay cells AL6/AL10/AM18 with fills, pane ySplit=5/B6, Class POV A1 and privacy in both sheets). `tests/roster714-export-ui.cjs` updated (filename 'Stapler…', 2 sheets, sheet1 carries 'Current Stapler plan', Class POV subtitle carries 'Local snapshot'/'not saved'). Drive assertions unchanged in both.
- Negative control: the rewritten test FAILS on the unmodified q exporter (filename '2026 Oct 14 Relief current saved - …' instead of '2026 Oct 14 Stapler - …'), verified by stashing the two source files and running the new test against the old code. The stash was restored and the test passes again.

## Verification
Exact command, tested commit, outcome and evidence. Explicitly list checks not run.

- Targeted export tests (10 Nov, uncommitted working tree, TZ=Asia/Singapore, GSIS_BROWSER_EXECUTABLE=~/.cache/ms-playwright/chromium-1234/chrome-linux64/chrome): all 7 PASS — tests/roster-assign-relief-export-day.mjs ("PASS Stapler download: Teacher Summary + Class POV, baseline + ad hoc teachers only, frozen panes, privacy and duty tags; Drive file unchanged"), tests/roster714-export-ui.cjs ("PASS v0.8.2 all three offline exports create real XLSX from the unsaved local projection with snapshot labels and no network calls."), tests/roster714-teacher-export.cjs, tests/roster098j-exports.cjs, tests/stapler098h-standalone-export.cjs, tests/roster-assign-relief-export-privacy-import.cjs, tests/roster098g-export-headers.cjs.
- Negative control: the rewritten roster-assign-relief-export-day.mjs FAILS on the unmodified q exporter (stashed source files, old code): AssertionError at the filename — actual '2026 Oct 14 Relief current saved - Teachers TTb saved 2026 Oct 14 0905h.xlsx', expected '2026 Oct 14 Stapler - …'. Stash restored; test passes again.
- Canonical build and full local suite: not yet run (next step).
- Full CI: not yet run (draft PR only after CI is green at the exact head).
- Not tested: a live Assign Relief export (no live data or settings touched); the fallback path when no baseline is available is exercised only by the existing standalone tests (roster-assign-relief-export-privacy-import, stapler098h), not by a UI click without a baseline.

## Review
Reviewer/model, reviewed SHA, findings, resolution. Advisory review is not human approval.

## Deployment
Not deployed unless supported by explicit environment/version/time evidence. State staging and production separately.

## Handoff
- Relief instructions "being checked" (separate question, same message from the owner, 10 Nov 18:28 SGT): 7 absence reports for 10 Nov show instructionState 'pending' ("Absence saved. Relief instructions are being checked.") and sit in "Needs attention". The intake pipeline validates each instruction against the current timetable scope (expectedInstructionScopes: timetableId/parity/staplerRevision must match what the teacher saw) before saving/forwarding it via saveInstructions; if the timetable changed, the instruction goes to SMC review ('needsReview'). The pipeline runs in budgeted batches (max 4 steps or 25 s per run) and resumes on the next wake, so 'pending' means the instruction phase has not finished for those jobs yet. The owner says the instructions are for-info and should simply be forwarded to the teacher receiving the duty. Removing or bypassing the scope check is a policy/behaviour change to the intake pipeline (lane R) and is NOT part of this hotfix; it needs the owner's explicit go-ahead as its own task (substantial work: Codex codes, Muse reviews, per the work-split rule).
- Remaining work: implement the hotfix, verify per the acceptance checks, open a draft PR naming Codex at the exact head.
