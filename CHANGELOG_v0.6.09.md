# GSiS v0.6.09

Baseline: v0.6.08, product commit `89136b8`. Release authorized on 14 October 2026, Singapore time. This full suite release includes the previously tested Roster storage repair and Calendar publication draft.

## Roster

Q220: new imports default to last normal period 16. The value remains editable and cannot exceed the source's last period. Existing saved timetables keep their stored settings.

Q223: Baseline Timetable has Saved timetables and Baseline upload subpages. Saved timetables opens first. Upload retains the existing local conversion, preview, validity dates and confirmed save flow. It adds editable recess definitions for P1 through P6. With the default 07:00 period zero and 30 minute periods, the defaults are:

| Level | Period | Time |
| --- | --- | --- |
| P1 | 3 | 08:30 to 09:00 |
| P2 | 4 | 09:00 to 09:30 |
| P3 | 5 | 09:30 to 10:00 |
| P4 | 6 | 10:00 to 10:30 |
| P5 | 7 | 10:30 to 11:00 |
| P6 | 8 | 11:00 to 11:30 |

View Timetable has Teacher, Class and Export subpages. Teacher opens first. Teacher and class selectors support partial text search. One last displayed period preference is shared across all three subpages and retained for that account in the browser. PDF and Excel output use the same selected period range and timetable layout. Export provides a format selector plus All teachers and All classes actions.

Roster prepares the current timetable in browser memory during loading. When no timetable is current, it prepares the next upcoming timetable and identifies it as upcoming. This preview does not change validity dates or make a future timetable active. Refresh and authoritative register checks detect changes. Current Contacts permissions remain checked on backend requests.

The included storage repair uses Drive v3 operations that support Shared Drives. It keeps the existing folders, immutable model and XLSX files, request receipts, revision checks, lock and final register visibility boundary. Diagnostics identify the operation, HTTP status and safe failure reason. Missing Drive OAuth consent is reported separately from folder write capability. The user confirmed that Roster saved after the authorization repair on 14 October 2026. This does not establish acceptance of the new views or exports.

## Calendar

Q221: individually Published events can sync to the Staff calendar while their year is still in planning. Publish version releases the selected year, changes its live Hidden events to Published, then starts the existing Staff sync flow. The operation uses a durable receipt so retrying it does not publish events added after the original operation. Parent calendar publication remains a separate explicit action. The user confirmed Staff calendar sync worked before this release.

Q222: ordinary Staff and Parent synchronization uses the Advanced Calendar API. Event content is sent together instead of through several CalendarApp setters. Explicit API event IDs and ownership data support safe recovery of uncertain creates and detection of external edits. Existing saved CalendarApp event identifiers remain intact; migration resolves them as iCalUID values instead of treating them as API IDs. Durable link records reuse the existing MutationLog. Enable Calendar API v3 in the existing Calendar Apps Script project alongside Sheets API v4.

The Calendar workbook remains schema `v2 RC1.9`. Incremental sync tokens and background bidirectional import are not introduced. Existing explicit calendar cleanup tools retain their established behavior. See API_CONTRACTS_v0.6.09.md and DEPLOYMENT.md for boundaries and installation.

## Layout

Q224: 2D PDF and Excel exports bold the room name or primary assignment on the top line of each virtual cell. Remaining room details, assignments and layout are preserved.

## Suite

All five frontends and all three complete backend sources use release label 0.6.09. Contacts authority, Deploy write protocol 500, relief schema 3, whole-week-v3 calculations, staff identities and storage locations are retained. The complete offline Deploy manual remains in the full deployment package. Earlier changes are documented in their existing release files.
