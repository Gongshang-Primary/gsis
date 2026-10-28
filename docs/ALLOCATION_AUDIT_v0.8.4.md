# Daily allocation and SMC change trail

This v0.8.4 guide retains the v0.8.3 setup and service behavior unless a change is stated below. Packaging is not evidence of live installation, current Meta approval or message delivery.

The notification Worker invokes the authenticated allocationAuditExport service independently of its planning and messaging work. Complete the v0.8.4 [Roster owner cutover](ROSTER_BACKEND_CUTOVER_v0.8.4.md) before routing the notification Worker to the standalone Roster backend. Preserve the cron, ROSTER_SERVICE_SECRET, Drive authority and original configured ROSTER_ROOT. No new folder ID or credential is required.

## Files

One UTF-8 human-readable file is kept for each verified school day at:

`GSiS/Roster/Allocation Audit/YYYY/MM/YYYY-MM-DD.txt`

This path is relative to the installation's existing GSiS/Roster root; the code reuses configured identities and creates subfolders as needed. Structured evidence for that same date is stored in `Evidence/YYYY-MM-DD.json` beneath the month folder. Folder permissions remain those of the existing school-controlled hierarchy.

The school date and displayed times use Singapore time. Evening work for tomorrow belongs in tomorrow's file. Later corrections update the same dated file. When existing scheduled automation is enabled, a scheduler tick with a verified school-day Calendar result and an active timetable creates a no-activity record when necessary; an unavailable Calendar or inactive timetable does not invent a verified school day.

## What is recorded

Accepted automatic runs include captured source/policy revisions, eligible and excluded candidates, workload facts, configured preference order, manual protections, uncovered reasons and the whole-plan result. The text states whether coverage/preference optimality was proved or a search bound stopped. It does not claim that every selected teacher individually outranked all alternatives.

Confirmed SMC online changes record actor, time, before/after choice, manual/automatic ownership and durable request/event references. Save to online, Let teachers see and Send WhatsApp are distinct events. A local unsaved click is not an accepted online change, sending is not delivery, and publication is not evidence that relief was actually performed. Repeated request receipts do not duplicate accepted changes.

Older facts without captured decision inputs are labelled limited historical evidence. The exporter does not reconstruct a rationale from today's mutable staff data. The report excludes mobile numbers, private capability URLs and notification bodies.

## Recovery and retention

Accepted evidence and export intent commit with the allocation. The exporter writes the dated evidence archive, renders the text, then records matching export/archive watermarks under a short operations lock. A separate exporter lock prevents older concurrent exporters overwriting a newer file. Normal SMC saves use a different lock and can continue during Drive transfer.

If Drive transfer or the final watermark confirmation fails, the export remains pending and a later tick retries. The response lists exported dates, pending count and failures. Do not delete the saved file IDs or evidence to clear a pending state. A successful save remains successful even while its readable audit export is behind.

For past dates, only facts covered by both durable archive and text watermarks can leave the hot operations document. Newer corrections stay pending, and later export reads merge the archive with new facts. Actual-duty/accounting records are not removed by this automatic evidence compaction. Private links expiring after seven days do not delete the audit trail.

## Installation check

After installation, inspect the first scheduled export response and the corresponding dated TXT. Check the source school date, generation time and latest included revision. Use an authorised ordinary SMC save, then confirm its before/after entry appears once. This release's regression tests simulate Drive, failures and concurrent corrections; they do not certify the live folder permissions or a real export.
