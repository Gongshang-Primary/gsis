# GSiS v0.8.9c Roster frontend patch

Fix overlapping Absent Periods and Reason cells in Statistics / Absence Summary. Let table columns fit their full content. Remove filter input intrinsic width inflation so short columns remain compact. Wide tables scroll within their own container on mobile. All Statistics tables share this correction.

This cumulative Roster frontend includes patches a and b. Upload only Roster_Frontend_v0.8.9c.zip to the existing Roster Pages project. No Apps Script or Worker update is needed.

Verification: Chromium Statistics regression passes with all 17 period labels and a long reason contained in their cells on desktop and mobile, compact number/day columns, local filtering and sorting, all seven Excel exports, restricted access and stale-response handling. Header contrast regression passes. Package parity and whitespace checks are required before delivery.

Merge this CSS correction and regression coverage into the next full suite. No live data or deployment changes.
