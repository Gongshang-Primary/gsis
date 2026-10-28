# GSiS Roster v0.7.018b

Surgical Roster/Stapler patch, based on v0.7.018a. Both deployment items include the earlier final Offline JSON overlay and Assign Relief readability changes. Merge into the planned v0.7.19 full package.

## Install two items

1. Replace the code in the existing Deploy Apps Script project with `Deploy_Backend_v0.7.018b.gs`. Update its existing web app deployment to the new version, retaining the same `/exec` URL.
2. Deploy `Roster_Frontend_v0.7.018b.zip` to the existing Roster Cloudflare Pages project, then reload Roster. The header and `/api/config` should show `0.7.018b`.

Keep existing configuration and saved school data. No other component needs deployment. The shared Deploy backend remains compatible with the installed frontends.

## What changed

Stapler Save and saved-command receipt requests use an ASCII-escaped JSON representation before signing. The backend explicitly verifies HMAC with UTF-8. Decoding restores every original character; names, absence annotations and lesson text are unchanged. Existing model limits still apply to the decoded plan, with the outer request limit retained. Other operations keep their existing signed representation.

A backend authentication rejection now appears as a service error with a reference. It no longer signs the teacher out or removes the imported draft. The pending Save retains its original request ID and input for an exact retry. Genuine browser session expiry still requires sign-in.

Signature failures on Roster operations now carry the backend version and a safe failure stage. `showRosterDiagnostics()` reports diagnostic build `0.7.018b-roster-diag3`; it still reports cached history, not a live success guarantee.

## Verify the suspended timetable

Import the Offline JSON, resolve uncertain names, review, Save and Confirm. Reopen the saved date and verify the final rows. Use Start editing, make an intended edit, Save and Confirm, then reopen again.

Represented teachers retain their final offline rows, including blanks; teachers entirely missing from the JSON retain the online baseline and remain present. Confirmation supplies the effective suspended timetable for online allocation, summaries and Excel. Imported attendance and assignments do not replay online absence records, relief credit or notifications.

If a connection error remains, keep the editor open and the source JSON available. Do not delete the plan. Share the reference and run `showRosterDiagnostics()` immediately after the failure. Check the actual deployed versions and the matching backend connection configuration. Use Retry pending only after the connection is corrected; an identical request is protected against a duplicate write if an earlier response was lost.

## Evidence and limits

Local real-browser checks passed with the supplied Offline JSON: import, backend rejection without draft loss, exact Save retry, lost-response recovery, Confirm, reload, reopen/edit and reconfirmation. All 722 final cells match the independent offline export oracle. Signature tests reject altered payloads and incorrect keys.

The source-level cause of draft loss is proven. The production cause of the original signature mismatch is not established; encoding is a hardened boundary, not a claimed live diagnosis. No production deployment or live save was performed. Date-list performance remains queued: its existing metadata read avoids plan decompression, but live Contacts/Drive latency still needs measurement.

## Source recovery

This package includes the two deployment items, changed source, exact Git patch, incremental repository bundle, validation notes and checksums. The incremental bundle requires v0.7.018a commit `7ef1b2b69fef8d6853afcd5fb7511d8eafc680e2`; restore the v0.7.18 full repository and v0.7.018a incremental bundle first if necessary. Build v0.7.19 from this patched history. The commit is recorded in `RELEASE.json`.
