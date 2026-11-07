# Codex review of PR #99

Model: Codex
Reviewer: Codex; 7 November 2026 (Asia/Singapore).
Reviewed head: 47ff233b3f0c283d9f3062bfb280c8e2792a520e (merge refresh of main 0214363 into muse/stapler-add-tile-teacher-search-rebase).
Current main checked: 0214363.
Verdict: **approve — no blocking code findings**. This is an advisory code review, not a GitHub approval, merge, deployment, or live-provider validation. Approval is subject to green CI at this head.

Recorded on main by Muse from Codex's review as delivered via the owner; the review was not posted to GitHub by Codex.

## Scope and behavior

The Stapler Add teacher tile (and Edit teacher tile, which shares the dialog) uses the shared teacher combobox (`teacherPicker` in roster-update/public/roster-operations-ui.js) instead of a native select. Typing filters as you type, matching the display name, the timetable name and bracket tags such as (MTL) and (FAJT), ignoring case, accents and spacing; with a query, prefix matches come first, then alphabetical; with no query the list keeps its existing order. The picked teacher is saved as the same staffId as before, through a hidden input, so saving tiles behaves exactly as before. The shared picker gains the same matching and ordering in Report Absence and Add teacher. No allocator, D1 or backend changes.

## Verification (Codex, at the exact head)

- `npm run build`: passed, **no generated diff**.
- All 11 focused tests passed: stapler711-ui, stapler712-teacher-picker, stapler717-teacher-picker-browser, stapler0810-planner-browser, roster711-settings-dom, roster093-allocation-cache-browser, roster711-workspace-ui, roster-report-picker-browser, stapler095a-add-teacher-ui, roster710-adhoc-ui, roster09-batch-absence-browser.
- Additional #96 intake overlap UI check passed.
- Merges cleanly with current main.

## Verification (Muse, CI)

CI run **42224287909** on head 47ff233: **green, all 5 jobs** (Regression shards 1/4–4/4 + full-suite), completed 6 Nov 21:31 SGT. Verified via the check-runs API and `gh run view` by Muse; Codex's environment returns Forbidden on GitHub API reads, so Codex did **not** independently verify CI status. PR is open, draft, head 47ff233, mergeable MERGEABLE.

## Handoff

PR code, draft status, and production settings remain unchanged. Owner controls marking ready, merging and deployment. Re-review any change to the head SHA. Standard staging acceptance remains a separate release step.
