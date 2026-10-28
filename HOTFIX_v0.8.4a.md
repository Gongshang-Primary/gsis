# Install GSiS v0.8.4a

This patch updates only Roster. It fixes Relief Health reporting “R not verified” when a suspended timetable contains SENOs or other supplemental staff outside the main relief pool. Missing R for an eligible main-pool teacher remains unverified.

## Files to install

1. `Roster_Backend_v0.8.4a.gs` goes into the separate Roster Apps Script project created for v0.8.4.
2. `Roster_Frontend_v0.8.4a.zip` goes into the existing Roster Cloudflare Pages project.

Deploy, Layout, Contacts, Calendar and the separate notification Worker retain their existing v0.8.4 code. No second backend split or new data store is required.

## Installation

1. Ask SMC users to save their work and pause edits while updating Roster.
2. Open the existing standalone Roster Apps Script project.
3. Replace the complete contents of its backend code file with `Roster_Backend_v0.8.4a.gs` and save.
4. Preserve all Script Properties, original file/folder pointers, owner settings, permissions and secrets.
5. Click Deploy, Manage deployments, then Edit on the current Roster web app.
6. Select New version and click Deploy. Keep the existing Roster `/exec` URL.
7. In Cloudflare, open the existing Roster Pages project and create a Production deployment.
8. Upload the inner `Roster_Frontend_v0.8.4a.zip`, then deploy it.
9. Keep the existing Production settings, including `APPS_SCRIPT_URL`, Calendar connections, secrets and R2 binding.
10. Refresh Roster, confirm the displayed version is v0.8.4a, select 22 October, and click Refresh records.
11. Check Relief Health, the suspended timetable, saved allocations and normal teacher availability before resuming SMC edits.

If the v0.8.4 split is still incomplete, finish its documented sole-owner cutover before enabling the new Roster backend. Do not paste this Roster build into the Deploy project, run setup/reset helpers, or change the original school data pointers.

## Expected result

Staff explicitly excluded by Contacts, and staff added only to a suspended timetable, do not make the main relief pool unverified. They remain visible in the timetable. They are excluded from ordinary automatic relief, including the recess-duty path. Genuine missing R for a main-pool teacher still prevents a verified capacity claim. Existing SMC allocations and history are retained.

A deliberate ad hoc relief activation for an eligible teacher remains a separate manual workflow. A timetable row alone does not activate someone for relief.

The package includes the source patch and, in the committed release, an incremental Git bundle based on v0.8.4. Building this package does not deploy production code or send a staff notification.
