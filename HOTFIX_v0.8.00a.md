# GSiS Roster v0.8.00a

Frontend patch for item 049, based on the complete v0.8.0 release.

## Install

1. Upload Roster_Frontend_v0.8.00a.zip to the existing Roster Cloudflare Pages project.
2. Reload Roster and check that its header shows v0.8.00a.

Keep the v0.8.0 backends, other frontends and notification Worker. No Apps Script deployment is needed. Keep existing environment settings and bindings.

The Roster ZIP contains the complete frontend directory because a Pages upload replaces that deployment. Only two runtime files differ from v0.8.0: roster-operations-ui.js for behavior and guidance, and index.html for the frontend version and updated script URL. The gateway Worker is unchanged, so /api/config still reports its v0.8.0 version; the Roster header identifies this frontend patch as v0.8.00a.

## Item 049: save on click

The user clarified that “No relief instructions” should save immediately. The earlier interpretation that it was an unintended submission was incorrect.

After selecting periods and reviewing the lessons, choosing “No relief instructions” now uses the existing Submit absence save path immediately. It retains the selected teacher, dates, periods and whether relief is required. It does not require a second click on the bottom Submit absence button.

For an existing absence, changing this choice uses the existing Save instructions path immediately. The toggle can still be cleared to enable instruction editing. Text remains intact; the existing confirmation remains when marking entered instructions as not applicable. Written instructions can still be saved with the bottom button. The period-review step remains local and instructions remain visible.

Validation, busy-state protection and uncertain-response retry use the existing save mechanisms. If a save is rejected, correct the report and use Submit absence to retry without changing the instruction choice. If confirmation is uncertain, use Retry the same save.

The patch does not introduce a new backend API, change notification rules or change whether relief is required. Normal absence-save processing still applies.

## Source and verification

The changed-items package contains the Roster frontend, changed source, Git patch, incremental history, validation notes and checksums. Its Git bundle requires v0.8.0 commit 567ddeacf164cd3aedf1fbfdecdc964818eeb298. RELEASE.json records the patch commit.

Merge item 049 into the next full package. No live deployment or staff message was performed while preparing this patch.
