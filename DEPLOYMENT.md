# Install GSiS Suite v0.9

Use the matching v0.9 package on the existing school projects. Preserve deployment URLs, workbooks, Staff IDs, Drive pointers, booking peppers, secrets, custom domains, bindings and owner settings. The [maintainer guide](docs/GSiS-v0.9-Maintainer-Guide.md) contains the full setup, backup, cold start and recovery instructions.

## Check the package

Extract `GSiS_v0.9_Deployment.zip`. It contains eight frontend ZIPs, five complete backend code files, the Roster notification Worker text and current documents. Upload only the matching inner frontend ZIP to a Pages project. Do not upload the outer deployment ZIP or source archive to Pages.

| App | Frontend package | Backend owner |
| --- | --- | --- |
| Contacts | `Contacts_Frontend_v0.9.zip` | Contacts |
| Calendar | `Calendar_Frontend_v0.9.zip` | Calendar |
| Deploy | `Deploy_Frontend_v0.9.zip` | Deploy/Layout |
| Layout | `Layout_Frontend_v0.9.zip` | Deploy/Layout |
| Roster | `Roster_Frontend_v0.9.zip` | Roster |
| LORD | `LORD_Frontend_v0.9.zip` | LORD |
| OVERLORD | `OVERLORD_Frontend_v0.9.zip` | LORD |
| STARLORD | `STARLORD_Frontend_v0.9.zip` | LORD |

The complete backend files are `Contacts_Backend_v0.9.gs`, `Calendar_Backend_v0.9.gs`, `Deploy_Backend_v0.9.gs`, `Roster_Backend_v0.9.gs` and `LORD_Backend_v0.9.gs`. Paste each into its matching project without leaving duplicate module definitions.

## Upgrade the existing installation

1. Back up source, workbooks, private Drive data, Script Properties, Cloudflare settings and current deployments.
2. Retain unresolved request IDs and local drafts. Do not clear browser storage for the upgrade.
3. Pause scheduled notification sends and any existing Queue consumer while replacing the sending code.
4. Install and publish the matching Contacts, Calendar, Deploy and Roster backends at their existing `/exec` URLs.
5. Preserve the Roster sole-writer settings and original data pointers. Do not repeat an already completed backend split.
6. Configure `LORD_Backend_v0.9.gs` with the existing LORD private values before installing it. Keep all existing transaction sheets and booking peppers.
7. Configure the `LORD_BACKEND_URL` and `LORD_PROXY_SECRET` constants in all three LORD Workers before uploading them. Preserve LORD and OVERLORD's `GOOGLE_CLIENT_ID` and `LORD_SESSION_SECRET` settings.
8. Add the dedicated LORD bridge properties described below after the Contacts and Deploy endpoints are published.
9. Run `enableLORDGSiSBridge` in the LORD editor. Require a successful initial snapshot and one `syncLORDGSiSReferences` trigger before relying on shared references.
10. Publish a new version of the existing LORD web-app deployment.
11. Upload all eight matching frontend ZIPs to their own Pages projects.
12. Replace the notification Worker with `Roster_Notification_Worker_v0.9.txt` and preserve its configured bindings and intended flags.
13. Restore the existing minute cron and intended Queue consumer. Follow the guide's drain instructions only if a legacy notification store still needs its first migration.
14. Refresh the apps, verify v0.9 and complete the acceptance checks in the guide.

Saving Apps Script editor code alone does not update its published web app. Use **Deploy → Manage deployments → Edit → New version → Deploy**. Update an existing deployment to preserve its URL.

The LORD release source uses placeholders for private configuration. A placeholder frontend or backend is not ready for live use. Existing operational settings must be copied into a private configured build before upload. Do not run first-time setup against existing school data.

## Connect LORD to the school references

| Project | Script Property |
| --- | --- |
| Contacts | `LORD_BRIDGE_SECRET` |
| Deploy | `LORD_BRIDGE_SECRET` |
| LORD | `LORD_BRIDGE_SECRET` |
| LORD | `LORD_CONTACTS_APPS_SCRIPT_URL` |
| LORD | `LORD_DEPLOY_APPS_SCRIPT_URL` |
| LORD | `LORD_GSIS_SNAPSHOT_FOLDER_ID` |

Use one dedicated random secret of at least 32 characters across the three projects. Keep it separate from existing browser and proxy secrets. Point the Deploy property at Deploy, not Roster. Use a private snapshot folder accessible to the LORD execution account.

`LORD_GSIS_LOCAL_ACTIVITIES` is an optional reviewed JSON array for first adoption. Do not create blank `LORD_GSIS_ENABLED`, `LORD_GSIS_SNAPSHOT`, `LORD_GSIS_CHECK` or `LORD_GSIS_SYNC_LEASE` properties; the bridge manages them.

The full [LORD setup guide](docs/LORD_SETUP_v0.9.md) explains authorisation, trigger creation, stale-source behaviour, acceptance and rollback. Failed or older-than-five-minute Contacts verification defers new WhatsApp sends until a successful check.

## Preserve the school menu and delivery configuration

Use [WHATSAPP_PARAMETERS.md](docs/WHATSAPP_PARAMETERS.md) for exact settings and ownership. Set the Roster Pages `WHATSAPP_CURRENT_RELIEF_URL` to `https://roster.gsps.edu.sg/` for the Report Absence menu reply. Uploading frontend code alone does not update an environment variable. This ordinary menu reply change does not alter an approved template.

Keep existing provider accounts, recipients, template routes, acknowledgement secrets and uncertain delivery outcomes. Local release checks do not establish live provider delivery. Use an authorised test recipient for any delivery test.

## Venue storage

No venue sheet migration is required. The separate `Venues` register and Layout's `layout_venues` rows remain authoritative for their existing purposes. The future [venues booking pipeline](docs/VENUES_PIPELINE_v0.9.md) is recorded for later implementation and is not activated by this package.
