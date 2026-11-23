# Local Excel export recovery on v0.9.9y

Model: Codex. Owner-requested urgent hotfix extending PR #182. Owner merges/deploys; Claude review is waived for this v0.9 hotfix. No deployment by Codex.

Export Excel, Export relief excel and Class POV use the current local allocation, absences and timetable. A global revision difference no longer discards a complete matching local export plan. If the old export context is absent or belongs to another timetable, a complete loaded local timetable is used to construct the plan through the existing renderer. An incomplete timetable remains an explicit error; missing periods are never treated as free.

Export starts no API or timetable request. The optional comparison baseline is used only when already cached; the current local workbook layout handles its absence. A complete owner/date-scoped local view survives ordinary online cache invalidation and can be restored after a failed online read. Restored data is marked unverified for online writes. Explicit access denial removes the retained view.

## Owner installation and checks

Publish the supplied `Roster_Frontend.zip` to the existing Roster Pages project and reload the browser. This extension changes the frontend only. If the preceding PR #182 hotfixes are not yet deployed, also use the bundled matching notification and operations Worker scripts; those contain the previous Combine, memory and received-report fixes. No Apps Script upload, configuration, cron, database or Meta template change is required.

1. Open the selected date while online once to load its timetable/allocations. Existing local copies remain usable; no new online read is required when Export is clicked.
2. Make a local assignment, then temporarily disconnect the browser network. Each of the three export actions must create its workbook with the unsaved assignment and a Local snapshot label. This is a browser download, not an online save or publication.
3. Reload/reopen the already-loaded app with online records unavailable. Its cached local view must remain exportable and marked unverified for online saving. Cold loading the entire website without cached app assets is outside this patch.
4. Confirm only the selected date appears; current absences/assignments are reflected; removed absences are not restored from old export context; absence reasons/instructions remain excluded from Excel.
5. When local timetable content genuinely is missing, the page must report incomplete local data without creating an empty workbook.

Keep the previous Roster Pages deployment for rollback. Restore it if needed; preserve browser drafts and D1 data. Previously saved server records and already downloaded files are not undone by rollback. Earlier included hotfix deployment checks remain in the other notes within the package.

## Verification

Final exact head, build, full local v0.9/LORD, CI and package checksums are recorded in the PR and package verification file. Synthetic browser tests exercise actual XLSX output and local IndexedDB recovery. No live record, provider or deployment checks are claimed.
