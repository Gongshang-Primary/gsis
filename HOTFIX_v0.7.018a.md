# GSiS Roster v0.7.018a

Surgical patch based on v0.7.18. The requested version spelling is retained. Merge this patch into the planned v0.7.19 full package.

## Install two items

1. Replace the code in the existing Deploy Apps Script project with `Deploy_Backend_v0.7.018a.gs`. Update its existing web app deployment to the new version, retaining the same `/exec` URL.
2. Deploy `Roster_Frontend_v0.7.018a.zip` to the existing Roster Cloudflare Pages project and reload Roster.

The backend change recognises imported absence labels for workload and relief-demand calculations. Install both items. Retain all existing settings, data, URLs and business rules. Other components need no deployment.

## Import the final offline timetable

Open the matching date in Stapler, choose **Import Offline JSON**, resolve any uncertain names, review, then **Save** and **Confirm**.

The importer now flattens the offline Relief output over its planning tiles. It retains absence labels, covering teachers' final lessons and swaps, including the dropped lesson annotation. The Plan or Relief save label does not restrict import. Saved Name Bridge links are used; fuzzy matches require a verified selection.

Each represented teacher's whole day replaces the current day, including blanks. Teachers entirely missing from the file retain their online baseline. The original recurring baseline remains intact. Confirm makes the result available to online allocation, summaries and Excel.

This is a final timetable overlay. It does not create online absence reports, relief-history credit, notification jobs or a queue of unfinished offline relief decisions. Absence and dropped-lesson labels reserve availability without counting as teaching workload or creating duplicate relief demands. Existing online operational records remain separate. Conflicting placements or stale saved relief decisions are rejected before the draft changes.

## Assign Relief readability

The page adopts the offline Relief module's larger text and colours: white timetable cells, pale green candidate headings, yellow selected periods, red affected periods, teal resolved markers and orange relief tags. Dark-panel hints have readable contrast. The allocation rules and controls are unchanged.

## Recovery and merge

The package includes the two installation items, changed source, an exact Git patch, an incremental repository bundle, validation notes and checksums. The incremental history requires baseline commit `32d2c2d17621319ba1d57aea34046229544f5513`, included in the v0.7.18 full package.

Build v0.7.19 from this patched source and synchronise its three changed shared Roster models. No production deployment, school-data mutation or staff message was performed while preparing this patch.
