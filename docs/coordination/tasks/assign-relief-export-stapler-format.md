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

## Verification
Exact command, tested commit, outcome and evidence. Explicitly list checks not run.

## Review
Reviewer/model, reviewed SHA, findings, resolution. Advisory review is not human approval.

## Deployment
Not deployed unless supported by explicit environment/version/time evidence. State staging and production separately.

## Handoff
- Relief instructions "being checked" (separate question, same message from the owner, 10 Nov 18:28 SGT): 7 absence reports for 10 Nov show instructionState 'pending' ("Absence saved. Relief instructions are being checked.") and sit in "Needs attention". The intake pipeline validates each instruction against the current timetable scope (expectedInstructionScopes: timetableId/parity/staplerRevision must match what the teacher saw) before saving/forwarding it via saveInstructions; if the timetable changed, the instruction goes to SMC review ('needsReview'). The pipeline runs in budgeted batches (max 4 steps or 25 s per run) and resumes on the next wake, so 'pending' means the instruction phase has not finished for those jobs yet. The owner says the instructions are for-info and should simply be forwarded to the teacher receiving the duty. Removing or bypassing the scope check is a policy/behaviour change to the intake pipeline (lane R) and is NOT part of this hotfix; it needs the owner's explicit go-ahead as its own task (substantial work: Codex codes, Muse reviews, per the work-split rule).
- Remaining work: implement the hotfix, verify per the acceptance checks, open a draft PR naming Codex at the exact head.
