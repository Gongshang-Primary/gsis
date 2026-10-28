# GSiS 0.9.8p operating guide

This current guide replaces duplicated historical manuals in the full-suite delivery. It covers the existing school deployment. Server-side permissions still decide which actions each signed-in user can perform.

## Daily work

| Product | Main purpose | Operating boundary |
| --- | --- | --- |
| Contacts | Maintain staff identity, roles and the school contact catalogue. | Keep stable staff IDs; check the deployed source version when a bridge returns old data. |
| Deploy | Plan class, teacher and curriculum allocations; publish the school's reference deployment. | Complete temporary undefined class rows before saving. Preserve the existing authority and save/conflict protocol. |
| Layout | View the campus and maintain authorised physical venue metadata. | Shares the Deploy backend. Room identity and school geometry remain separate from booking policy. |
| Roster | Report absence, assign relief, manage Stapler plans and inspect effective timetables. | A received absence has a receipt; saved means it has actually been applied. Keep the request identity when recovering an uncertain response. |
| Calendar | Maintain school events, glossary, school days/parity and sync events to designated Google calendars. | Event save and Google Calendar sync are separate steps. Check saved, queued, blocked and provider outcomes separately. |
| LORD | School device bookings, collection and return. | Shared backend with OVERLORD and STARLORD. A saved booking and a successful secondary task are distinct outcomes. |
| OVERLORD | Administrator controls and background-work management for the LORD family. | Retiring held work cannot recall a submitted message. Preserve recipient outcomes and original history. |
| STARLORD | Authorised operational workflows for the LORD family. | Uses the same booking/custody authority and backend as LORD; this release changes its label only. |
| Venues | Venue catalogue, policies and authorised booking workflows. | A catalogue match is not proof a room is free. Roster occupancy export remains paused in the recovery pipeline. |

## Roster: absence and relief

Teachers use Report Absence and keep the displayed receipt if the response is uncertain. SMC reviews Received reports when a report needs intervention. Do not create a second submission merely to test whether an earlier report was saved.

Auto-allocate can reconsider unstarted blanks and unpublished automatic assignments on eligible current/future dates. Auto-fill blanks preserves existing assignments. Started duties, published work and protected human choices remain protected. The manual controls work at any hour; scheduled allocation keeps its existing cadence and school-time rules.

Suspended days skip the ordinary workload formula, not configured business rules. Daily/consecutive limits, applicable employment caps and cumulative relief accounting remain. Confirmed Stapler intent is independent of later baseline changes. Baseline comparison is a view, not ownership of the intended plan.

Let teachers see controls saved-work visibility. WhatsApp notification is separate; the combined button first publishes, then retains a separate notification intent. Provider acceptance does not prove delivery. System Health is administrator-only and reports processing evidence rather than Cloudflare CPU metrics.

Learn about Auto Allocation contains calculations, the safe currently effective rules, audit-folder access and the approved explanatory prompt. Excel exports retain teacher/class views, period timing rows and frozen headings.

## Calendar: large syncs

P keeps five-record requests and per-calendar write pacing while removing the mandatory one-minute gap after successful batches. Genuine quota errors still wait. Progress is durable and resumption uses the same run identity and provider identities.

An unresolved event save blocks that event. An unresolved year publication remains a whole-year fence. A completed processing pass with errors or blocked events is reported as partial. A new explicit sync can retry eligible earlier errors after that pass ends.

Keep the tab open unless the optional continuation service is configured. Glossary edits update in place. Venue lookup accepts partial validated names and custom text; a selected catalogue ID prepares an integration but does not create a venue booking.

## Timetable preparation

An administrator downloads a private snapshot through System Health. The P exporter produces an untouched file accepted by the O preparation Worker. The preparation module stays isolated and stores a checked 31-date window of baseline candidates and confirmed suspended plans.

This does not verify live odd/even parity, current staff identity mappings or future source freshness. It is not a replacement absence backend. Read the handover status before any production switch.

## Errors and recovery

Keep the safe reference, operation and timestamp. Use original receipts for uncertain responses. Refresh status before treating old failure history as current work. Never clear live journal rows to make a status appear healthy.

Current architecture: `GSiS_v0.9.8p_Architecture.html`. Installation and rollback: `START_HERE.html` in the full suite. The source-review companion records test evidence and remaining limits. No packaged test establishes live delivery or completed migration.
