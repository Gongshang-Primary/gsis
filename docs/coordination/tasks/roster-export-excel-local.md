# roster-export-excel-local: Export Excel must work when the backend is unreachable ("local WAN-denied mode")

- Status: changelog (owner 5 Nov: "i need export excel to work in local WAN-denied mode"); lane R; Codex when authorised
- Reviewer/model: Claude

## Current behaviour (code)
`roster-update/public/roster-operations-ui.js` `exportRelief` (about line 1533) builds the workbook in the browser from `localExportSnapshot(s)` (about line 1514), which requires `s.data.exportContext` for the same date AND the same revision as `s.data.revision`; otherwise it throws "The complete export data for this date has not loaded. Refresh records once while online, then export locally." The all-teacher export also needs a cached baseline model (`s.exportBaseline` or `cachedTimetable`). The exporter scripts (`roster-export.js`, `roster-stapler-export.js`) load with the page (no service worker).
When the backend times out (as on 4-5 Nov), the page keeps "previous records" whose exportContext may be missing, stale for the current revision, or lost on reload, so export fails exactly when it is needed.

## Requirement
1. Keep the last complete exportContext and baseline model per date in durable local storage (IndexedDB), refreshed on every successful online load; survive a page reload while the backend is unreachable.
2. Export from the latest local data even when the revision differs: apply the local draft (unsaved cells) on top of the cached context and label the file clearly ("Local snapshot … last confirmed online revision N … local changes not saved").
3. Make the exporter scripts and fonts available offline (cache them, or bundle with the page) so Export works with no network after the page has loaded once.
4. Never call the backend on Export. If no cached context exists for that date, say so in plain words.
5. Tests: backend unreachable after one online load → Export Excel, Export relief excel and Class POV produce files; reload while offline → still exports from IndexedDB; revision mismatch → labelled local snapshot; no network calls during export.
