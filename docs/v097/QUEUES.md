# v0.9.7 bounded background work

The notification Worker consumes `gsis-background-jobs`. The private operations Worker and notification Worker both produce through `GSIS_BACKGROUND_QUEUE`. Both use the same `GSIS_JOBS` database. A message contains only `purpose`, `kind` and a random `id`; staff records, timetable parts and message contents stay out of the queue.

Create `gsis-background-jobs` and `gsis-background-jobs-dlq` in **Workers & Pages → Queues**. For the main queue, add `gsis-roster-notifications` as its Worker consumer and set:

| Setting | Value |
|---|---:|
| Batch size | 1 |
| Batch timeout | 5 seconds |
| Maximum concurrency | 1 |
| Maximum retries | 3 |
| Retry delay | 60 seconds |
| Dead-letter queue | `gsis-background-jobs-dlq` |

The equivalent Wrangler entries are commented in `notification-worker.example.toml`. Copy the producer entry to the private operations Worker. Retain the existing D1, private R2, Calendar, Google adapters, WhatsApp settings and service secrets. Configure `GSIS_BACKEND`, `GSIS_BACKEND_REQUIRED=true` and the matching `GSIS_BACKEND_SECRET` as described by the operations Worker installation guide. Set `GSIS_BACKGROUND_JOBS=true` on both Workers only after these bindings and the consumer are installed. Leave the legacy notification wake endpoint available during rollout; its signed requests become durable background intents when the flag is enabled.

The minute cron retains allocation timing, references, human inbox/webhook processing, delivery review, employment reports, Calendar continuation and Deploy handoffs. Received-report forwarding, proposal processing, peer mail, notification dispatch, timetable preparation and audit export run through queued jobs. The minute cron checks compact due-work metadata to repair a missed enqueue and recover expired claims; it does not load full timetables to decide whether they need preparation. Daily R2 cleanup remains isolated at `15 18 * * *` UTC.

There are three coalesced D1 jobs: `notifications`, `timetables` and `audit`. Repeated saves advance a generation; finishing an older generation cannot erase a newer save. Each notification run forwards at most two captured reports with a 45-second budget, processes at most three proposals, dispatches notifications with a 60-second budget and defaults to four parallel sends/four launches per second, then runs the existing peer-mail batch of at most six. Timetable runs prepare at most two stages; audit runs export at most one date. Domain claims, manual-allocation protections and uncertain-send handling remain authoritative. Remaining due work resumes at the next minute tick.

Application failures and killed claims have at most three attempts, with 60/120-second delays between failures. Three queue wake attempts without a claim also stop automatically. A parked row stays parked even if new saves arrive. An administrator uses **System Health → Retry** after resolving the cause; retry changes only the background intent and never resets a provider's sent or uncertain state. A claim holds the job for sixteen minutes, exceeding the platform's fifteen-minute Queue invocation lifetime. Each wake reservation lasts sixteen minutes. Three wake attempts allow forty-eight minutes for all three kinds behind a slow single consumer before parking; a queue send that immediately fails is retried after one minute. Cron does not send a new wake every tick.

Keep the DLQ without an automatic replay consumer. Set its retention to 14 days in Queue settings and inspect it when a consumer/configuration failure is reported. Cloudflare's delivery retries and the application's durable retry cap are separate: delivery failure may place a wake in the DLQ, while the D1 row retains the work and ultimately parks if it cannot be claimed. Deleting or expiring a DLQ wake does not delete operational data. Resolve the cause and retry the D1 job from System Health; do not replay uncertain provider messages.

For recovery, set `GSIS_RECOVERY_MODE=true`, pause queue delivery and disable cron as instructed in `docs/v097/RECOVERY.md`; drain old invocations before restoring. The runtime gate blocks enqueue, claims, sends and cleanup. D1 intents survive a paused or retried wake. Resume only after completing the recovery checklist.

Configuration reference: [Cloudflare Queue configuration](https://developers.cloudflare.com/queues/configuration/configure-queues/), [Wrangler queue settings](https://developers.cloudflare.com/workers/wrangler/configuration/#queues), [dead-letter queues](https://developers.cloudflare.com/queues/configuration/dead-letter-queues/).
