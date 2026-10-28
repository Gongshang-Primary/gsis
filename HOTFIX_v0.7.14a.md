# GSiS v0.7.14a

This patch uses v0.7.14 as its baseline. It changes only the Roster frontend and the shared Deploy backend. Other components remain at v0.7.14. No data reset is required.

## Install two items

1. Replace the code in the existing Deploy Apps Script project with `Deploy_Backend_v0.7.14a.gs`. Update its existing web app deployment to the new version and retain its URL.
2. Deploy `Roster_Frontend_v0.7.14a.zip` to the existing Roster Cloudflare Pages project, then reload Roster.

Keep the existing project settings, spreadsheet IDs, permissions, URLs, notification settings and saved allocator rules. The shared backend continues to serve the unchanged v0.7.14 frontends with write protocol 500.

## Import a suspended day

Open the matching date in Stapler and choose **Import Offline JSON**. Resolve any uncertain name matches, review the timetable, then Save and Confirm. Confirmation makes that day available to the relief allocator. Publication remains a separate action.

The import uses final placed tiles for the selected day. Original lesson differences between the offline file and online baseline no longer block it. The embedded workbook supplies the teacher list, including teachers with no final tiles.

| Teacher in the file | Result for that date |
| --- | --- |
| Matched teacher with placed tiles | Replace the whole day, including blanks |
| Teacher in the roster with no placed tiles | Blank day |
| Online teacher entirely missing from the JSON | Retain baseline timetable and default to present |
| Uncertain name | Ask for an explicit verified match |

Separately recorded online absences still apply. Summaries, Excel and relief allocation use the same confirmed working timetable. The recurring odd/even timetable stays intact. Import does not create relief usage merely because final tiles differ from the baseline.

The patch supports the five supplied offline files. Those files have no saved absence decisions. Files with nonempty `reliefAbsences`, including saved swaps, are rejected before changing the draft. Importing those attendance decisions safely remains work for a later release. Unplaced offline Card Pit tiles are excluded; original online baseline cards remain internally recoverable in the online Card Pit.

## Recovery and next full package

The package includes changed source files, an exact Git patch and an incremental repository bundle. They apply to the recorded v0.7.14 baseline. The release does not contain replacement packages for unchanged components.

Carry this patch and its regression checks into the eventual v0.7.15 full package. Do not rebuild v0.7.15 from the unpatched v0.7.14 source. No production deployment, timetable publication or staff message was performed while creating this patch.
