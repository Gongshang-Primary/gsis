# GSiS Stapler Excel export change

## 2026-10-19: Replace Stapler timetable shortcut with Excel export

Status: queued for the next authorised build. No implementation, commit, deployment or release build performed here.

On Roster > Stapler's editing page, replace the toolbar button "My timetable today" with "Export Excel" in the same position, after "Load legacy plan", as marked in the user's screenshot image(20261018-163124).png.

Export the Stapler plan for the selected date. Use the actual offline Stapler tool's Excel export format as the reference, including its applicable workbook structure and visual formatting. Inspect that exporter before implementation; this logging task has not examined the offline workbook/exporter, so no exact sheet schema or format match is claimed.

This change concerns the shortcut on Stapler's editing toolbar. It does not remove the teacher's personalised timetable elsewhere. It is separate from the already requested Excel export on Assign Relief.

## Completed source disposition: v0.7.12

The Stapler editing toolbar now exports the selected date using the offline Stapler Plan workbook format. The former toolbar shortcut is replaced, while personal timetable access elsewhere remains. Export and browser checks are included in v0.7.12 validation.

The original request above is retained for traceability; its queued wording is historical. No deployment or live school-data change was performed.

