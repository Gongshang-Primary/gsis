# Install GSiS v0.9.8b

Baseline: the Google-authoritative 0.9.8/0.9.8a Roster recovery installation. This is not a rollback for an installation that has already activated D1 ownership.

1. Save the current Apps Script and Worker code for rollback.
2. Replace the existing Roster Apps Script code with Roster_Backend_v0.9.8b.gs. Save, then update the existing web app deployment to a new version. Keep its URL and Script Properties.
3. Replace the code in gsis-roster-notifications with Roster_Notification_Worker_v0.9.8b.txt and deploy. Preserve existing secrets, bindings, cron triggers and notification settings.
4. Upload Roster_Frontend_v0.9.8b.zip to the existing Roster Pages project as a production deployment.
5. Refresh Roster and confirm v0.9.8b. Check System Health and the source labels in Assign Relief.

Do not upload this outer ZIP as a Pages site. No new Worker, Queue, secret, bucket, database or migration is required. Existing GSIS_JOBS binding supplies compact status; unavailable storage is shown as unavailable. System Health does not send notifications or restore data.

## Behaviour

Assignment source labels distinguish Automatic, SMC and Peer approved. Pending proposals remain unconfirmed. Existing timetable/shared supervision may have a separate source label; unidentified old records are not falsely called automatic.

Background revision checks continue. While local relief edits exist, online changes are offered for explicit review. Unchanged future dates are not redrawn simply because a minute passed. A warm Google version probe reuses a compact projection for no more than 30 seconds; caches do not permit stale saves.

System Health is available to SMC and Admin. Its saved-report counts cover Google receipts across dates and explicitly exclude unforwarded transport. Use Assign Relief → Received reports for the combined operational view.

Last successful notification processing is not WhatsApp delivery confirmation. Use Daily Notify/delivery details for individual recipients. No success timestamp means no recorded evidence, not proof of a failure.

Receipt retry identities, pending-attendance gates, publication controls and uncertain-send protection remain in place. No attendance, relief or queued message is automatically removed by installation.

## Acceptance

Verify a controlled absence receipt reaches Saved, a relief edit survives refresh, a second browser's change prompts review when local edits exist, and intended notification delivery is visible. Local tests do not certify production settings or provider delivery.

## Rollback

Restore the previously installed 098a Roster frontend and 098 Roster backend/notification Worker together. Preserve all existing data, receipts, bindings and secrets. The automatically managed ROSTER_VERSION_HINT property is only a cache hint; do not edit it manually. Code rollback does not undo saved records or messages.
