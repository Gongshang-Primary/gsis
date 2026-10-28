# v0.7.12 performance evidence

Measurements below are controlled fixtures. They are not production latency or simultaneous-user throughput guarantees.

## Baseline timetable reuse

The verified browser fixture contains 150 teachers and a 469,279 byte baseline. A cold load fetches one baseline model. A verified warm reload fetches none. IndexedDB failure, account changes, permission changes and a forced refresh preserve a safe server fallback. Views reuse the local timetable instead of downloading it for each selected date.

## Single cell without assigned cover

The 150 teacher, 120 demand fixture reduced the No Relief Needed acknowledgement from 232,805 bytes to 1,367 bytes, approximately 170 times smaller. Quota, full reconciliation, accounting and health projections are omitted only when no covering teacher is added or removed. Current authority, Calendar, baseline, lesson and confirmed Stapler source checks remain. A stale lesson or a period that starts during a slow read rejects the write.

The saved action still performs one protected state read and one durable Drive replacement. A smaller response does not make Drive or Apps Script 170 times faster. Cancelling actual cover uses the full validation and notice path.

## Concurrent requests

The deterministic 30-user fixture submits independent new reports from the same starting revision through the protected adapter. It retains all 30 reports, audit entries and receipts with 30 durable writes. The old revision rule would reject 29; exact replay adds zero writes. This simulates competing commands in their serialized order and is not a live 30-request load test.

A 34-teacher fixture reduced the report acknowledgement from 23,676 to 12,351 bytes by reusing the compact report projection. When the report context intentionally omits quota, it skips a health calculation whose result was previously discarded, avoiding two full teacher-context grids. Authoritative reconciliation and saved lesson validation remain.

Stapler lease renewal uses dated Script Properties and does not read or rewrite the operational Drive document or increment its revision. The backend test verifies zero operational document reads and writes for renewal; network and authorization calls still take time.

## Remaining service costs

Contacts and Calendar verification, Apps Script startup, Drive I/O and external provider calls remain outside local rendering timings. The release does not claim measured production response targets until installed-service traces are available.

Google documents per-user execution and Properties service limits in [Apps Script quotas](https://developers.google.com/apps-script/guides/services/quotas), checked on 19 October 2026. The shared service account and protected document write remain capacity constraints. Local tests do not override these installed-service limits.
