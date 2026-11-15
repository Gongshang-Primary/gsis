# Owner change log — 14 November 2026

Owner ended recording-only hold: “work and build. clear changelog item by item.” Implementation is on `codex/v1-admin-account-create`, PR145; independent reviewer Claude. Main claim `2b44f12`; bounded integration scope updates `f8c401cd525610ed9d20c3264e3d70b948df7d2b`. No deployment, provider activation, live backup or deletion is authorised by this build request.

| Item | Owner requirement | Implementation / evidence |
| --- | --- | --- |
| 1 | Add accounts and additional Admins | Existing PR145 at 34dafbc, full CI green; retain verified subject and explicit grant. New consolidated head requires review. |
| 2 | 3×3 equal rounded-square home icons, reuse graphics | Implemented; `v1-product-navigation.mjs` verifies order, equal squares, assets and desktop/narrow layout. |
| 3 | Compact smaller-font breadcrumbs with app home/current tab, no top feature shortcuts | Implemented; native-tab navigation, dirty guards and panel drafts covered by navigation/browser tests. |
| 4 | Canonical Core table spec across viewports, not reduced custom controls | Implemented for the explicit owner contracts below, including real D1 atomicity, revision, recovery and scale tests. Exceptions remain explicit. |
| 5 | v0.9 signature graphics and scrolling for expanded configuration instructions | Implemented; existing graphics preserved and expanded guide scrolling verified in `v1-product-contacts-ui.mjs`. |
| 6 | v0.9 Deploy UI parity, all navigation visible, version control under Versions | Implemented; empty-version navigation stays visible with explained unavailable states, publication/receipts under Versions. Tables and actual browser tests. |
| 7 | v0.9 Stapler bulk across/down modes; grid/pit and card-list resizing | Implemented; actual built Stapler tests retain both bulk modes/Undo and verify mouse/keyboard resizing without tile mutation or saves. |
| 8 | Calendar PDF/Excel exports, including unavailable-state explanation | Implemented; original PDF renderer preserved; full-year readable XLSX added with literal text, frozen headings and wrapping. Calendar UI tests. |
| 9 | Compact Calendar Setup, accurate v1 language, diagnostics/recovery/danger grouping | Implemented and visually checked; local diagnostics do not claim a live Google write test. |
| 10 | Existing Telegram identity/token retained externally to deployed material | Existing backend-secret contract retained and explained in OVERLORD settings; no credential copied, rotated or activated. Build isolation checks. |
| 11 | Relocate injected top/bottom features into native settings/views across all viewports | Implemented across nine viewports. Contacts Power User/Teacher visibility covered; legacy browser tests updated to navigate the relocated controls. |
| 12 | OVERLORD editable reference tables replacing manual spreadsheet edits | Implemented; typed reference tables, atomic resource batch, reservation/cart/period guards and import-preview tests. Staff remain Contacts projections. |
| 13 | Human-readable Drive backups, one logical file/day, asynchronous catch-up and 23:50 SGT freshness | Implemented and tested with canonical dataset adapters, durable jobs, verified daily files and System Health. Synthetic Google only; configuration remains off. |
| 14 | REIGN Wrapped recap + verified Google archive + explicit cleanup summary/confirmation | Implemented within explicit archive bounds. Actual local D1/R2 plus synthetic Google tests cover restart, corrupt archives, retained obligations and interrupted cleanup. No live deletion. |

## Exact home order and descriptions

1. Roster — Report absences, assign relief, plan suspended timetables.
2. Contacts — Staff directory, contact details, self-service updates and signature creation.
3. Calendar — School events, weekly views and publication.
4. Venues — Book venues.
5. Layout — Campus map, class allocation and 3D virtual campus.
6. Deploy — Deployment planning tool. For SMC only.
7. LORD — Equipment booking, collection and return.
8. STARLORD — Restricted equipment signage.
9. OVERLORD — Equipment administration and recovery.

Deploy wording is display copy, not a permission-policy change. Administrative access and approved read/edit/publish policy remain authoritative.

## Backup and retention decisions

Google Drive root: `1HJDMM-_88cuKwL7-HyQO08pgeAdEtb3k`. Owner folders: Calendar, Contacts, Deploy, Layout and Venues, LORD, Roster. Readable workbooks preserve IDs/revisions and use the existing owner's import validation, preview and commit contracts where supported. Example name: `2026 11Nov 14 — Contacts — Staff.xlsx`; add hhmmss only when necessary. One logical dataset file per SGT day, updated in place. Jobs catch up asynchronously; operational writes must not depend on Google availability. At 23:50 SGT compare current source revisions and verify actual file integrity; age alone never means stale. Admin System Health only; no notification.

Drive historical retention is owner-managed deletion. Never recreate deliberately removed historical daily files. Cloudflare cleanup needs dependency-aware preview and a separately settled retention policy. No automatic general history purge is approved. REIGN cleanup is a specific exception: archive a selected closed period, verify its entire recovery package and files, retain recap and receipts, show exact deletion/preservation summary and require explicit confirmation. Active/future bookings, unresolved custody/incidents, settings and dependencies of retained work survive. Invalid/stale/incomplete/uncertain archive evidence blocks cleanup.

## Evidence boundaries

### Table and import inventory

The shared controls provide partial-text filters, sorting, column visibility, resizing that survives redraw, Compact, frozen headings/identity columns and visible-report XLSX. Owner-hidden content remains hidden and is excluded from visible reports. Timetable/calendar matrices retain their chronological geometry and native exports. Imports use a scrollable preview with a blurred backdrop, marked invalid cells, corrected-file replacement and explicit confirmation; unknown outcomes retain the original operation identity.

| Owner/view | Canonical import boundary |
| --- | --- |
| Contacts Edit Info | Existing Staff IDs; at most 64 changed cells across 16 staff in one owner transaction. No creation, deletion or authority acceptance from the workbook. |
| Contacts DIY | The signed-in person's permitted statutory-name/mobile fields through the existing self-service save. |
| Deploy canonical scopes | IP, TG, Dept, Teachers, Exclusions, Offload and Span of Control retain their versioned owner contracts. Membership/HR Terms remain reference exports. |
| Deploy settings | Load/Subject Type/Fortnight, organisation definitions and memberships, Duty, Workload Settings and ASC settings use explicit existing-structure schemas and the same version revision/lease/atomic change boundary. Additions/deletions remain in owning editors. At most 32 changed workbook rows; backend delta separately bounded to 8,192 records/1 MiB UTF-8. |
| Calendar Columns/Glossary | At most 128 exported records/256 KiB and 12 changed existing records per atomic import; no implicit additions/deletions. Preview binds actor/school/source and expires after 15 minutes. At most eight released-year sync jobs. |
| Layout | Existing five-table canonical workbook; published/source fields remain protected, local annotations use current owner revisions. |
| OVERLORD | Devices/trolleys, classes/groups, subjects/activities and period timings. Resource changes commit atomically, bounded to 200 changed rows; inventory IDs/history and reservations are preserved. |
| Roster opening balances | Full Staff-ID-bound snapshot feeds native validation/preview, reason and one save. Existing fresh-start configuration is required. Real Contacts directory limit: 512 staff; local mutation tests also cover 2,000 without claiming directory support. |

Core account/role changes, Contacts authority acceptance, Versions/year lifecycle, immutable audit/history and visual planning boards retain dedicated operations. Roster name bridges/custom/recess records retain native per-record editors; their lists support reports, not a newly invented bulk-write contract. No disabled import or reporting-only workbook is labelled import-compatible. Calendar Weekly XLSX is a readable report; its PDF uses the preserved v0.9 print path.

Version-owned Subject Type editing follows the already approved Revision 49 PG01/PG02 Deploy capability matrix in both native and workbook UI. The old frontend-only Admin restriction is superseded for this view; no new backend permission rule or independently editable Power User list is introduced.

### Backup and recovery inventory

Daily canonical workbooks cover Contacts staff, Calendar Columns/Glossary, LORD reference tables, editable Deploy scopes and Layout. Complete Deploy version recovery JSON preserves settings outside the canonical worksheets. Roster recovery also contains the actual verified R2 baseline/publication content, not just object keys. Calendar event/year metadata, Roster operational records, Venues records and additional LORD history remain explicitly labelled recovery/reporting exports; these files cannot bypass their owning application's import or acceptance rules.

Daily jobs bound source snapshots to 4 MiB, individual artifacts to 8 MiB, workbook cells to 30,000 and ordinary source tables to 2,000 rows. Oversized snapshots fail visibly without truncation or false freshness. Two datasets are processed per minute; the nightly sweep can finish after 23:50 and health shows which checks remain due. Drive history is manually managed; no general Cloudflare pruning is enabled.

REIGN limits are 2,000 bookings, 12,000 rows per dependent table, 32 photographs/4 MiB combined photo bytes, 8 MiB per file and 30,000 workbook cells. Larger archives retain all data. Google permissions, quota, live uploads and hosted restoration have not been demonstrated.

### Integration and scale corrections

The table work exposed existing per-record SQL and source-request fan-out. Opening balances now use set-based owner writes and the correct configuration revision; Deploy deltas preserve individual row revisions/absence checks through set-based guard/delete/upsert statements. Contacts acquisition/release batches retain all individual staff pins and source-writer guards. Uncertain members are persisted before dispatch, exact reply membership is verified, and released tombstones fence delayed acquires. No aggregate authority copy, schema or permission-policy change is involved.

Actual isolated Contacts→Roster tests cover 200 and 512 staff with 41 destination SQL statements including callbacks and eight Contacts statements. The Calendar maximum batch uses 42 local statements; a 40-row Deploy Duty edit uses 29. These measured tests do not substitute for hosted performance or runtime UAT.

F5 OPEN. Official T1B-01/T1B-02 and unperformed runtime UAT Not tested. Synthetic tests do not prove live Google permissions, external-provider outcomes, deployed UI acceptance or durable hosted recovery. PR145 records the exact final head, commands, full-suite CI, file inventory and Q01–Q08 status. The consolidated working-tree run passed 62/62 product programs, and the unchanged LORD suite passed 40/40; these development results are not substituted for final-head evidence. Claude review and owner release approval remain gates.
