# GSiS v0.7.12

Baseline: v0.7.11. Release authorised on 19 October 2026, Asia/Singapore.

Status: implemented, reviewed and verified for the v0.7.12 source release.

## Roster speed and concurrent use

1. Cache the verified baseline timetable in IndexedDB and reuse the loaded model for date changes, search and local views. Account, permission and source checks govern reuse.
2. Save an unassigned cell as No Relief Needed with a compact authoritative response. Preserve fresh lesson checks, durable acknowledgement, audit and exact retries.
3. Accept independent new absence reports against current protected state. Keep conflicts for competing edits and shared allocation changes.
4. Keep No relief instructions needed visible in Report Absence and isolate each teacher's draft. Lock the report while an uncertain save is resolved.
5. Rename the absence management pages to Manage my absences and Manage school-wide absences. Exclude the requested staff categories from new absence reporting.

## Relief planning

1. Add the default Form shared lesson rule, configurable by Admin for additional baseline subjects. Combine with a present timetabled colleague or leave one automatic vacancy when the whole unresolved group is absent.
2. Put wildcard relief exclusions first, specific remaining subject choices second, and the resulting excluded subjects third.
3. Grow Relief Health bars upward from a common period axis. Retain baseline green opportunities and pair red assigned markers by teacher.
4. Add named current and upcoming SMC duty lists with start/end dates, Edit, Activate and Delete.

## Stapler

1. Protect each dated planning session with one editor's renewable server lease; show who is editing, release on successful Confirm and support recovery after disconnection.
2. Move aligned level recesses as complete Canteen blocks. Swap adjacent periods; return displaced conflicts to Card Pit and support Undo.
3. Replace the editing toolbar's My timetable shortcut with Export Excel, using the offline Stapler Plan workbook format.

## WhatsApp and Layout

1. Add the SMC/Admin mobile Inbox with text, private voice playback, replies, assignment, handled status and reply history. Only current duty SMC receive new-message alerts.
2. Add the first WhatsApp menu option Report Absence, linking to the school's current relief system. This does not import Dive absence records into GSiS.
3. Retain safe Meta error-code diagnostics and regenerate the complete scheduled Worker from canonical sources.
4. Correct the hall courtyard roof geometry and System Config gear icon while retaining approved buildings, shelter and exposed bridge.

Publication, sending and installed-service activation remain separate from this source release. See VALIDATION.md and PROJECT_RECONCILIATION_v0.7.12.md for actual checks and operational follow-up.
