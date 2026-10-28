# Install GSiS v0.8.5c

This patch applies to v0.8.5 and updates only the Roster frontend and standalone Roster backend. It integrates the requested a, b and c changes in one deployment. No intermediate patch is needed.

1. Open the existing standalone Roster Apps Script project.
2. Replace its complete backend code with `Roster_Backend_v0.8.5c.gs` and save.
3. Keep all existing Script Properties, data pointers, owner settings, permissions and secrets.
4. Choose Deploy, Manage deployments, Edit, New version, then Deploy. Keep the existing Roster web app URL.
5. Upload `Roster_Frontend_v0.8.5c.zip` to the existing Roster Cloudflare Pages project and deploy it. Keep its current settings and bindings.
6. Reload Roster and confirm the header shows v0.8.5c.
7. As Admin, open System Config, Automatic Allocation, Same relief teacher for consecutive periods. Subject is now a dropdown. Check the listed subjects and save any intended rule changes.

Install the backend first. If the frontend cannot obtain the new subject list, it explains that the backend needs updating and prevents an unvalidated settings save.

Subjects come from the current active baseline and saved confirmed suspension snapshots for today or later, with their baseline binding checked. Later unconfirmed edits do not change the list. Past, archived, deleted and unconfirmed suspensions do not contribute subjects. An existing rule whose subject is no longer available stays visible until Admin replaces or removes it. No custom subject can be saved.

Deploy, Layout, Contacts, Calendar and the separate notification Worker retain v0.8.5. No new backend split, data migration, reset, scheduled trigger or permission is required. The package does not perform a live deployment or send notifications.


## Other included changes

Custom Notifications now lists ongoing rules with an On/Off control. Existing undeleted rules are On across school dates; switch any unwanted rule Off to keep its settings without applying it. There is no date selector on this page. Existing publication and acknowledgement rules still apply to instruction updates.

Assign Relief defaults to the next Calendar school day when opened from 2 pm Singapore time. An explicit date or pending/local work remains selected. If Calendar cannot confirm the next school day, use the displayed Retry or choose a date explicitly. The patch uses the existing Calendar connection and requires no Calendar backend replacement.
