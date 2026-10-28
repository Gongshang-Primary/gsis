# GSiS v0.7.08 speed and reliability evidence

This release preserves local timetable interactions and removes concrete duplicate work. Counts below come from local synthetic tests, not live service timings.

| Path | Observed result | Evidence |
| --- | --- | --- |
| Thirty concurrent cold sign-ins into each of four actual Worker modules | One certificate fetch per Worker instance, previously thirty | suite708-signing-keys.mjs |
| Thirty concurrent callers after Google signing-key rotation | One shared refresh; failures release the pending request for recovery | suite708-signing-keys.mjs |
| Calendar bootstrap with fresh authority and metadata tokens | Three batched data reads and no write lock | calendar708-concurrency.cjs |
| Assign Relief filtering | One rank computation reused across five filter states, no added API reads | roster701-operations-speed-browser.cjs |
| Warm Check Availability | Name search and baseline selection work before the operational response returns | roster706-cache-browser.js |
| Import conflict review | Choices run locally with no API call; resolved save retry retains identical payload | import708-browser.cjs |

The browser keeps loaded immutable timetable models in memory. Current absences, identities, permissions, accounting and write revisions remain separately verified. Uncapped teachers do not acquire the new capped-week model reads. Capped workload reads reuse each distinct immutable model within the request and account for baseline changes during a week.

Writes retain the existing atomic document or Sheets batch boundary, role checks and applicable retry receipts. Calendar metadata uses source-bound optimistic conflict checks rather than silently overwriting another admin's edit. The broader release gates cover Contacts recovery, Deploy distinct-field writes, Layout cache isolation, Roster atomic saves and notification lease handling.

Apps Script still serializes affected writes through existing locks, and Roster uses a global operational revision. Concurrent writes can require a refresh. This package does not promise instant remote saves, a measured production response time, or unlimited simultaneous writers. Further lock/storage changes should follow deployed timing evidence. See VALIDATION.md for the final executed suite counts.
