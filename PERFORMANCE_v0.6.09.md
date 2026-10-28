# Performance and reliability v0.6.09

Ponytail and pstack review keep the existing Roster parser, workbook writer, verified Contacts authority, revision checks, request receipts and storage folders. Calendar keeps its existing workbook, MutationLog, publication receipt and batched progress flow. No separate server, trigger, database or permission cache is introduced.

## Roster

Loading a profile with preload reads the register once and the chosen current or next model once. The browser reuses that parsed model when switching between teacher, class and export views. It does not fetch or parse the original XLSX during those switches. Only the selected model is prepared; archived models are not loaded as a collection. A future model remains explicitly upcoming.

PDF and XLSX share a timetable projection, including the selected final period. Bulk export builds from the loaded model. It does not request one timetable for each teacher or class. Display preferences are small local settings and do not require backend writes.

Refresh, date changes and register revisions keep selection current. Cached data cannot substitute for current authorization. Failed refresh must not present unverified data as a fresh server result. These bounds describe service calls and data reuse, not a measured production latency guarantee.

Shared Drive storage retains one final register update after immutable file writes. Precise phase and Drive failure diagnostics distinguish missing OAuth scope from insufficient folder capabilities. Retrying an unconfirmed save reuses the same request rather than creating a new timetable.

## Calendar

The Advanced Calendar API can update related event fields in one provider mutation. Reads needed to resolve legacy iCalUID values, verify ownership or detect conflicts still count as service calls. Fewer field setter calls do not establish a faster first load of the Calendar viewport, whose source remains Sheets.

Durable API link records and deterministic create identity protect recovery from uncertain event creation. The existing sync batch size and progress contract remain. Reconciliation reports external changes. On an ETag conflict, sync rereads the latest provider event, preserves unrelated writable fields and applies the authoritative GSiS fields. External edits are not imported into GSiS. No background sync token store or new polling loop is added in this release.

Publication and external synchronization have separate outcomes. The atomic Sheet batch covers publication records and their receipt. It cannot make a later Google Calendar request part of the same atomic transaction. The interface reports retained publication and unfinished sync separately.

## Evidence and limits

Release verification is recorded in VALIDATION.md and the `609-*` evidence files. Synthetic workbooks and provider harnesses check boundaries and recovery. A Chromium 138 check at 1366 by 768 pixels exercised partial name search, shared period 12, PDF and actual XLSX downloads, reload persistence and a 390 pixel mobile viewport. View changes and exports made no timetable read after the initial profile preload. The dense two-group class fixture printed two physical landscape pages for two week patterns; four teachers printed eight pages. Workbook sheets opened with openpyxl and matched the same period range. These checks do not establish Google quotas, live latency, other browsers, Excel desktop rendering or school-device screen fit.

Before this release, the user confirmed both Staff calendar sync and a Roster save after Drive authorization. Those confirmations validate the earlier repair paths only. The new Roster views, bulk exports and Advanced Calendar API require acceptance with the matching release and authorized execution account.
