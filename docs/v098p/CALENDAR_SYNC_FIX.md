# Calendar synchronization in revision P

Revision P removes a fixed one-minute wait after each successful five-event sync batch. The five-event request cap remains. Healthy sync batches yield for one second, and each provider write still uses the existing per-calendar spacing of at least 500 milliseconds. Genuine source throttles, Calendar rate limits, `Retry-After` deadlines, permission failures and manual-review stops retain their existing behavior. Calendar wipe retains its previous one-minute between-batch pacing.

This patch does not activate the Advanced Sheets API, change the Google source of truth, create infrastructure, start a live sync or change incoming absence reporting. It retains revision O's missing-schema preflight, per-event isolation of unknown saves and global year-publication protection.

## Cause and evidence

In O, `effectiveSyncBatchSize_()` capped the batch at five and `calendarProviderSettleBatch_()` unconditionally scheduled `BATCH_YIELD` 60 seconds ahead after success. A 505-event run therefore had 100 minutes of deliberate between-batch waiting before network and service time. This was an application throttle, not evidence of a Google quota response.

Existing large-year tests advanced a mock clock by at least 60 seconds between batches. They proved resumability and record identity, but did not expose that latency. The new test follows the actual returned retry deadline and rejects a healthy delay over 1500 milliseconds.

Local 505-create evidence:

| Measurement | Result |
| --- | --- |
| Backend batches | 101 |
| Healthy between-batch waiting | 100 seconds |
| Simulated elapsed time, including provider write spacing | 302.5 seconds including the incremental follow-up |
| Live provider events in the fixture | 505 unique events |
| Incremental edit |One update, same provider ID, no duplicate |

The harness simulates Google and Spreadsheet services. Its elapsed value excludes real network, Apps Script startup, locking and Sheet service latency. It is not a promise of a five-minute live sync. Source reads remain substantial; reducing concurrent authorization/source checks needs separate evidence and is not attempted here.

## Failure-heavy runs retain bounded checkpoints

O serialized the full error list and failed IDs into one Script Property. Around 30 long errors can exceed the 9 KB per-value limit. P keeps small sessions in the existing plain-JSON property and stores larger sessions as gzip/base64 chunks with a small head pointer.

- Each chunk is at most 8,000 ASCII bytes. The head includes encoded and raw lengths, hashes, generation and run identity.
- Chunk writes and readback finish before the head is replaced. A lost head response is checked against the stored head.
- A failed staging write leaves the previous checkpoint current. Missing or corrupt referenced data raises `SYNC_CHECKPOINT_UNREADABLE`; it never silently becomes a new session.
- The current checkpoint remains until the new head is verified. Provider outcomes are saved in a bounded settlement checkpoint before source acknowledgement; an interrupted acknowledgement resumes that settlement without replaying provider operations. Cleanup removes only unreachable keys in the exact owned checkpoint-key format. Unrelated properties, receipts, event data and retained history are preserved.
- Limits are 1,000,000 raw UTF-8 bytes, 160,000 encoded bytes and a conservative 400,000-byte aggregate property-store budget. Google documents 9 KB per value and 500 KB per property store.
- Before provider dispatch, capacity is checked with room for the next five retained errors and IDs, including additional allowance for poorly compressing text. `SYNC_CHECKPOINT_CAPACITY` stops before that batch if recovery storage is too full.

These are bounded safeguards, not unlimited storage. A capacity error requires an administrator to inspect the active session and unrelated Script Properties. Do not clear the session or delete journal records to make the warning disappear. If the first attempt to persist provider outcomes fails, no source acknowledgement is applied; the claim remains for ordinary identity-based recovery. Once the settlement checkpoint is durable, recovery preserves those saved outcomes without calling the provider again. Recovery still obeys source-read deadlines and unresolved year-publication fences under the existing writer lock.

## Large completion histories

An oversized error list can also exceed the Google Sheets per-cell text limit. P writes large error and blocked-event evidence into bounded `SYNC_DETAIL` records in the existing AuditLog. One SyncLog summary retains the full numeric error count and a digest-bearing reference to those records. Small histories keep their existing format.

Detail rows and completion records have stable identities. If an acknowledgement is lost, retry verifies the existing record instead of appending a duplicate. The completion checkpoint is retained until history is saved. An interrupted completion is finished before any newly eligible event is dispatched. A subsequent explicit Sync starts a new run for remaining work.

No history is deleted by this change. The ephemeral checkpoint chunks are removed only after the completion records are saved or an already-authorised force-clear passes the existing running-claim check.

## Installation and rollback

Install the matched P Calendar backend/frontend using the suite guide and retain current URLs, secrets, permissions and service settings. Google Sheets uses native `SpreadsheetApp`; the Google Calendar API service remains required.

Keep the Calendar page open while its browser drives a sync. The separately packaged Calendar job Worker can continue an existing session only if its dedicated installation and `CALENDAR_SYNC_CONTINUE=true` were already configured. P does not assume that optional service is active.

If O's earlier failed session resumes, let the processing pass finish. Its earlier errors remain in that run. A later explicit **Sync Staff** retries unresolved error rows under a new run while preserving provider IDs.

P reads old plain-JSON checkpoints. O cannot read a P chunked checkpoint. Before rolling Calendar back to O or earlier, finish the active P sync or have a maintainer preserve and reconcile it. Do not delete its chunks or merely restore the old code while a chunked run is active.

## Verification

`tests/calendar098p-throughput-checkpoints.cjs` covers 505 creates and an incremental update; 500 Unicode errors with cold read; interrupted chunk/head writes; missing/corrupt chunks and unsupported schemas; capacity refusal before provider work; interrupted final detail/summary writes; multiple incompressible chunks and unrelated-property preservation; interrupted source acknowledgement with retained error evidence; source cooldown and year-publication recovery guards; 125 mixed events with validation failures, a lost create response and an actual rate limit.

`tests/calendar093-provider-cooldown.cjs` retains all quota and provider pacing checks. Only its obsolete expectation of a 60-second successful sync yield changes to one second. Wipe pacing, actual 60-second quota escalation, account cooldowns, `Retry-After`, provider attempts and cold continuation stay covered.

Raw local output and benchmark values are in `verification/v098p/`. These checks do not establish that a live year has completed. The two previously unresolved source-save receipts remain unchanged.

Reference: [Google Apps Script quotas](https://developers.google.com/apps-script/guides/services/quotas).
