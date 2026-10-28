# GSiS v0.8.0

Baseline: v0.7.19 at `2a0fffc`. This full release implements queued items 043–047, including the clarification to item 045. The user authorised the next full version, review and commit on 20 October 2026. All previous v0.7.19 features and surgical patches remain included.

## Faster Stapler dates

Stapler reuses the last verified date list for the same signed-in session while checking current records. A small status shows that the list is refreshing. New management changes remain disabled until it is verified; recovery of an existing uncertain request stays available even if refresh fails.

The backend requests only the caller and eligible sponsors from Contacts for this read. It skips unrelated staff preparation and avoids repeated scans of saved metadata. Fresh permissions, directory coherence, baseline and editing-lock checks remain. The complete saved plans are not unpacked merely to list dates.

## Resolve each imported name

Each unresolved Offline JSON name has its own Contacts selector and Add new contact action. A new contact starts with that source name and returns to the same row using its exact identity. Other mappings stay in place. A delayed contact result cannot attach itself to another row or another draft.

The complete import remains a separate local action, followed by Save and Confirm. Existing category exclusions and Contacts permissions remain. Import does not rewrite the recurring baseline or replay offline absence reports, relief accounting or notices.

## Show the published suspended day

Timetable shows the available baseline immediately with an inline checking indicator. When a suspended timetable has been published for the selected date, it displays that complete day, including unchanged teachers and intentional blank periods. Screen, PDF and Excel use the same result.

A published suspended day can be read without waiting for Calendar. Later refreshes retain the last verified same-date view and selection while checking. A failed first check leaves the baseline visible; a failed later refresh keeps that last verified view. Both show a clear Retry state. Calendar not requested, checking and unavailable are shown separately. Recognized offline absence labels are shown simply as Absent in the public timetable; private reasons and instructions are not exposed.

Confirm still makes a plan available for relief allocation. Publish makes it visible to ordinary teachers. Later draft edits stay private until republished.

## Edit relief while drafts save

Assign, reassign, Clear assignment and No relief required update the page immediately. A small inline status distinguishes pending work from a confirmed save. Short ordered batches save in the background without blurring the whole page. The server validates and commits each complete batch atomically; a failed command cannot leave part of that batch saved.

Edits made while a batch saves remain queued separately. Uncertain responses retain the same request for exact retry. Conflicts preserve the choices and offer Review latest before applying them against current records. Session recovery retains pending commands where browser storage is available; storage failure warns the user to keep the page open.

Publishing, saved-state exports, navigation, date changes, refresh and sign-out first resolve outstanding work. Changing an already published arrangement creates draft changes; the released timetable stays unchanged until Publish. Started or completed work and other protected history retain their existing restrictions.

## Allow advance publishing

Admin System Config gains **Allow advance publishing**, initially Off. Enabling it permits **Publish Only** for a valid future school date. SMC can view the setting. The saved value survives ordinary frontend/backend updates.

Future Publish & Notify remains disabled and is rejected by the server. This toggle does not send early messages or schedule automatic publication. Current-day notification policy remains unchanged. Switching it off does not withdraw an already published future day.

## Installation and evidence

For the complete Roster improvement, install **Contacts_Backend_v0.8.0.gs**, then **Deploy_Backend_v0.8.0.gs**, then **Roster_Frontend_v0.8.0.zip**, using the existing deployments. Older compatible Contacts responses still work, but do not provide the new smaller date-list response. The full package includes all five frontends, three backends, source, documentation and the separate notification Worker.

Keep deployment URLs, secrets, operational stores, saved business rules, private media binding and cron. Other frontends, Calendar and the existing compatible notification Worker need no functional update for these Roster changes. See `DEPLOYMENT.md` for the installation sequence and checks.

`VALIDATION.md` and `RELEASE_SUMMARY.json` record the checks actually completed. `PERFORMANCE_v0.8.0.md` records local work reductions and their limits. These checks do not establish production response time or simultaneous school-user throughput. The retained saved-plan and baseline-switch incidents still require installed readback. Preparing this package performs no live deployment, school-data reset, timetable publication or staff messaging.
