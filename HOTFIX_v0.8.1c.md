GSiS v0.8.1c: updated deployment components only
Required installed baseline: GSiS v0.8.1b.

Install these two complete components in order:

1. Deploy_Backend_v0.8.1c.gs: replace the complete code in the EXISTING Deploy Apps Script project, save, then update its existing web app deployment to a new version. Keep its URL, properties, workbook, triggers and stored records.
2. Roster_Frontend_v0.8.1c.zip: upload this ZIP to the EXISTING Roster Cloudflare Pages project. Reload Roster after deployment.

Keep the v0.8.1b notification Worker. This patch does not change that Worker, Calendar, Contacts, Deploy frontend or Layout. If v0.8.1b has not been installed, install its three components first; v0.8.1c alone does not include its updated Worker.

Refresh Daily Notify for the published date. Eligibility is recalculated from the existing publication; no timetable edit, republishing or direct Drive/Sheet repair is needed. A teacher whose timetable equals baseline is excluded unless a correction to an earlier notification is owed. Existing queued unnecessary notices are rejected at dispatch, retaining their audit record.

An explicit individual Notify, Notify All or Publish & Notify bypasses quiet hours for eligible published timetable notices. Publish Only sends nothing. Automatic schedules remain as configured; this patch does not create a new automatic morning teacher batch. Use Notify All after checking the published affected list when the whole affected set should be notified.

Status distinguishes a queued request, sending, provider acceptance, delivered/read receipts, failure and uncertainty. Provider acceptance does not establish delivery, and neither delivery nor a WhatsApp read receipt establishes timetable acknowledgement. Do not blindly resend an uncertain attempt. The UI guards the same durable request against duplicate clicks.

After installation, use one authorised affected test recipient. Click Notify during quiet hours, verify the provider outcome and actual WhatsApp receipt, open the signed private link without school sign-in, acknowledge it, then refresh Daily Notify. An unchanged teacher is intentionally not a valid routine-notification test case. Check the affected count and any separately displayed corrections before Notify All.

This package was prepared and tested locally. No production deployment, live data change or WhatsApp message was performed. CHANGELOG.md records this patch; SUITE_MERGE.md carries the wider release integration notes.
