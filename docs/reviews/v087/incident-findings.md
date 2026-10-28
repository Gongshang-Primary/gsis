# v0.8.7 read-only incident review

Read-only Drive snapshot: 22 October 2026, 09:09:56 Singapore time. Operations revision 324; review revision 2. No live message, email, acknowledgement, repair or data write was performed during this release work.

## The 44 delivery alerts

All 44 active delivery issues have status uncertain, no recorded Meta error code, one prepared attempt, and no recorded completion timestamp or message ID. Each records a prepared-send lease expiry and requests reconciliation before retry. These records do not establish that WhatsApp accepted, delivered or rejected the messages. The matching Admin report has five sent email jobs and one uncertain submission. Automatic closure cannot safely claim that all Admin reporting completed.

Source inspection found ordinary publication dispatch using Pages HTTP waitUntil for the send lifecycle. Its short post-response lifetime can expire before preparation, provider submission and settlement complete. The roughly one-per-minute live sequence also allows other explanations, including a scheduled invocation or settlement failure. Without execution logs, the precise cause of all 44 incidents remains unproven.

The release removes actual sending from HTTP waitUntil. A signed wake request enqueues durable Queue work when configured; a scheduled Worker remains the fallback. Bounded batches prepare once, send within configured provider limits, and settle exact results with replay protection. Transport writes use a separate document and lock. Ambiguous existing prepared attempts remain uncertain and are never blindly resent.

## Unconfirmed absence or Roster save

The supplied diagnostic reference 76e1ad8f-23a9-4fdd-bdf8-440c95ca2c19 is not present in the snapshot's durable receipts or audit data. A diagnostic reference is not the command request ID, so absence from those records does not prove the save failed. Production Apps Script execution logs were unavailable to this review.

Source inspection confirms that the old save path held the allocation lock during slow reference reads. The new absence path prepares immutable reference data before locking, then checks and applies against fresh authoritative attendance under one writer. The exact request ID, compact receipt and same-command retry are retained. Concurrent reports and ambiguous commit responses are tested with a durable-state simulation; no production latency claim is made.

## Alert closure

New Admin email jobs freeze exact issue fingerprints. An active review alert closes only after all current Admin recipients have matching sent receipts. Delivery outcomes and attempt history remain unchanged. An uncertain email or changed failure stays open. Legacy email jobs without issue bindings are not retroactively treated as proof. A new failed attempt or recurring configuration issue opens a new review.


## Later live cleanup request

A second read-only snapshot at 09:48:28 Singapore time had operations revision 325, zero queued/sending WhatsApp jobs, 54 uncertain outcomes and 51 active delivery issues. Admin reports included two queued jobs and one sending job. The user explicitly requested cancellation/dismissal. Available connectors cannot run the Apps Script owner function or conditionally update under its lock. No direct Drive replacement was made. The release includes guarded editor-only inspect/clear functions, plus a compatible standalone helper for v0.8.6a. Manual dismissal is explicitly labelled and does not fabricate an email-sent or WhatsApp-delivered receipt. Production execution and readback remain outstanding.


The browser fallback reached the active Roster project. NotificationMaintenance.gs was saved separately and its exact editor text matched the tested 7,610-byte helper. Running the read-only inspection requested Google authorisation; the transition did not complete. The inspection was stopped at 10:03:55 Singapore time with a visible Execution cancelled result. No clear function was run. Completing Google authorisation is the remaining live execution blocker.
