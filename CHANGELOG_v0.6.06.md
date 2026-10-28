# GSiS v0.6.06

Q209: include the supplied existing Calendar Apps Script source and connect Roster through a small authenticated read-only date API. Preserve Calendar's workbook schema, roles, mutations, parent publishing and sync behavior. Calendar reports release 0.6.06 while retaining its existing schema marker.

Roster uses term-week parity for common availability. Vacations, published holiday events and weekends show a no-school notice while retaining the timetable. Missing/conflicting weeks and outages do not invent parity or free periods. Timetable view continues showing both patterns. Released Calendar years only; unpublished planning years remain private.

Calendar reads run in parallel with timetable reads. Existing batched year reads are reused without DayNotes or directory bootstrap. No data writes, new Apps Script project, OAuth client or midnight trigger. All five frontend release labels align to 0.6.06. Deployment instructions include the two additional Roster worker settings.

No workload, relief, PAL, timetable storage or garden geometry changes in this release.
