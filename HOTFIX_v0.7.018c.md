# GSiS Roster v0.7.018c

Surgical Stapler patch based on v0.7.018b. The two deployment items include the earlier final Offline JSON overlay, Assign Relief readability and Save recovery fixes. Merge this history into the planned v0.7.19 full package.

## Install two items

1. Replace the code in the existing Deploy Apps Script project with `Deploy_Backend_v0.7.018c.gs`. Update its existing web app deployment to the new version, retaining the same `/exec` URL.
2. Deploy `Roster_Frontend_v0.7.018c.zip` to the existing Roster Cloudflare Pages project, then reload Roster. The header and `/api/config` should show `0.7.018c`.

Keep existing configuration and saved school data. No other component needs deployment. The shared Deploy backend remains compatible with the installed frontends.

## Imported lessons can be saved and confirmed

An imported final offline timetable can now be saved and confirmed when a teacher's weekly workload cap cannot be verified or is exceeded. The lessons remain in their intended slots. Planning notes show the affected teachers and the known workload/cap figures. These warnings are saved with the dated plan and remain visible after reopening.

The exception also covers later edits to the imported teacher's own lesson cards, including subject, class, venue and period. The server checks the cards' original import provenance. It does not accept a client-supplied bypass flag. Workload warnings refresh on Save or Confirm and clear when the underlying cap data is resolved.

Teachers entirely missing from the JSON retain their online baseline and presence. Ordinary baseline edits retain their existing non-increasing workload behaviour. New manual or transferred-in lessons use the existing workload checks. New online relief allocations still use the configured caps and daily/consecutive limits, counting the imported timetable as occupied work.

Name matching, structural validity, signatures, access, revisions, dated editor ownership and published allocation checks remain enforced. The patch addresses the weekly-cap rejection shown in the supplied screenshot. It does not alter unrelated import integrity checks or make a live performance claim.

## Check the saved date

Open the saved draft, choose Start editing if needed, Save and Confirm. For a fresh import, resolve uncertain names before saving. Expand Planning notes to review any workload warnings. Reopen the date and check the teacher rows; then make an intended edit, Save and Confirm again.

The effective confirmed schedule supplies teacher summaries, Excel and online relief availability. Imported attendance and assignments do not replay online absence records, relief credit or notifications. The Pit contains replaced baseline cards, so its count is not a count of lost imported lessons.

If Save has an uncertain outcome, keep the editor and source JSON available and use the existing pending-request recovery. Do not delete the plan to retry. A workload warning does not release an editing lock held by another user.

## Validation and source recovery

Local checks passed for unknown and exceeded caps through Save, Confirm, fresh-runtime reload and subsequent edits. The supplied JSON's final cells match the offline export oracle. Chromium checks also cover import, retained drafts after backend rejection, exact retries, lost acknowledgements and reopening. No live deployment or production save was performed.

The package includes two deployment items, changed source, an exact Git patch, an incremental repository bundle, validation notes and checksums. The bundle requires v0.7.018b commit `977713961ad7f2885ca008b4fa77724dfeb18c82`. Restore the previous full repository and incremental patches first if needed. The new commit is recorded in `RELEASE.json`.
