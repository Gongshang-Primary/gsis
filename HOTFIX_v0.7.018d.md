# GSiS Roster v0.7.018d

Focused Report Absence flow patch based on v0.7.018c. Merge this patch and the earlier Stapler patches into v0.7.19.

## Install one item

Deploy `Roster_Frontend_v0.7.018d.zip` to the existing Roster Cloudflare Pages project, then reload Roster. The header and `/api/config` should show `0.7.018d`.

Keep the v0.7.018c Deploy backend already supplied. This patch requires no new Apps Script deployment, URL change, configuration change or data reset. If v0.7.018c has not yet been installed, install its backend first to retain the imported Stapler workload-warning fix.

## Corrected absence flow

1. Choose the teacher, dates, reason and unavailable periods.
2. Select **I'm not available in these selected periods** to review the lesson periods and relief instructions. Nothing is saved yet.
3. Enter instructions, or select **No relief instructions** below the lesson rows. This choice does not save.
4. Select **Submit absence** at the bottom to save the absence and instructions together.

The relief instructions remain visible after the review step and after submission. There is no expand/hide control. Choosing no instructions preserves any entered text and can be reversed before saving. Relief is still required where specified on the form.

Own arrangements become available after the final submission, when there is a saved absence to attach them to. Opening that option no longer creates an absence implicitly.

Existing date and individual period controls, timetable/rule checks, pending-request recovery and duplicate-write protection remain in place. The earlier Stapler fixes remain included in this frontend.

## Verification and recovery

The package includes validation notes, changed source, an exact Git patch, an incremental repository bundle and checksums. The bundle requires v0.7.018c commit `91f3d03e078352356975ca777bcde96079d755fe`. The new commit is recorded in `RELEASE.json`.

No live deployment or production absence report was made while preparing this patch. After installing, check that the first button and the no-instructions choice make no saved record; only the bottom Submit absence action should save.
