# GSiS v0.8.11

23 October 2026. Full release based on v0.8.10 and the v0.8.10a Calendar patch.

- Roster timetable caches serialize and write only missing tagged content. Atomic generation checks prevent an older refresh overwriting newer cached timetables; timestamps describe the generation actually checked.
- Timetable status checks preserve the rendered grid and typed search. Changed suspended content still refreshes the view.
- Relief comparisons reuse an assignment index. The existing conflict dialog can save explicit per-cell choices directly while checking for another concurrent edit.
- Manage school-wide absences has inclusive Start date / End date filters, defaulting to today / tomorrow in Singapore. Select all matching records across pages and delete the exact editable selection. Selected-record tokens protect concurrent changes; deletion remains atomic, replay-safe and subject to past-record protection.
- Urgent Message now forwards through the WhatsApp Inbox route to all verified SMC on duty. The previous route created an alert but skipped forwarding jobs. The original text is retained; long messages use numbered template-safe parts with stable duplicate protection.
- Timetable WhatsApp notices replace the crowded period list with: “Your timetable arrangements have been updated. Please check View Detail for your latest lessons and duties.” The existing approved template and both buttons are retained; the private timetable still contains full details.
- Calendar gCode removes eight retired upgrade routines and consolidates all 31 health checks. Current setup, schema compatibility, atomic writes and journals remain.

Local measurements: 122 cell comparisons over 1,923 assignments require one assignment-history scan instead of 122; opening the baseline timetable renders one grid instead of four; changing one cached plan causes no unchanged baseline payload serialization or writes. These are fixture work counts, not measured production latency.

No new dependencies, Script Properties or data migration. Install the matching full release components and retain existing URLs, secrets, template routes and transport records. No live deployment, data changes or WhatsApp test sends were performed.

Still queued: new-absence emergency alerts after first publication and before 14:00 Singapore, their targeted publication action, and expanded Calendar rate-limit pacing/resumable cooldown. Urgent Message forwarding is a separate feature.
