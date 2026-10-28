# v0.7.18 build scope

Baseline: v0.7.17 at `2ba81ff1a09d8e146da1987139b5a5980ab74ab1`. Authorised on 20 October 2026, Singapore time.

| Request | Release scope |
| --- | --- |
| Restore the previous absence form | Visible Start/End dates, individual timed period selectors, Select All/Clear, explicit initial selection |
| Shortest path means load time | Combined authenticated own-report bootstrap, deferred unused Home reads, in-flight deduplication and coalesced freshness checks |
| Roster is slow across multiple users | Fresh Contacts directory reads with less metadata work, reliable immutable baseline cache, smaller receipt confirmation path, shorter guarded write work and concurrency regression checks |
| Stapler rename means both name and date | Separate name edit and date move, content preservation, destination checks and protected history |
| Stapler delete | Explicit recoverable deletion and supported restoration, with current authority, revision and ownership checks |
| Earlier baseline and saved-plan incidents | Preserve records and exact retry identities; retain diagnostics and require matching installed readback |

The targeted installation changes Contacts backend, Deploy backend and Roster frontend. The complete package includes five frontend ZIPs, three complete Apps Script sources, the notification Worker, documentation, source and verification evidence. The final component inventory and package checks determine whether any additional runtime deployment is required; do not infer a requirement from a version label alone.

Write protocol remains 500. The operations document and Stapler plans retain schema 1. Existing Staff IDs, URLs, properties, saved business rules, receipts and records remain in use. New lifecycle history is additive. Opening a saved plan does not migrate it or replace it with baseline data.

Current Contacts authority remains mandatory. Cached immutable timetable content does not authorise a write. Source, date, revision, permission, overlap, publication and editing-lease boundaries remain enforced. No production deployment, configuration change, data reset, timetable publication or staff message is part of preparing this release.
