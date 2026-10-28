# GSiS Roster v0.7.018e

Frontend layout patch based on v0.7.018d.

Deploy `Roster_Frontend_v0.7.018e.zip` to the existing Roster Cloudflare Pages project, then reload. The header and `/api/config` should show `0.7.018e`. Keep the installed v0.7.018c Deploy backend; no Apps Script update is required.

Start date and End date now sit close beside each other. No relief instructions now sits beside the Absence date selector above the instruction table. On narrow screens the controls wrap within the page.

The review button and No relief instructions choice still make no write. Instructions stay visible, and the final Submit absence action remains at the bottom. The patch retains the earlier Stapler and absence-flow fixes.

Local Chromium checks passed for placement, phone fit, dated notes, final submission and exact retry without duplicate records. No live deployment or production report was performed. Merge this patch into v0.7.19.

The source package contains changed source, the Git patch, incremental repository history, validation notes and checksums. Its bundle requires v0.7.018d commit `c32a7bb38478d6dac6974360678c3b9d0af42b40`; the new commit is recorded in `RELEASE.json`.
